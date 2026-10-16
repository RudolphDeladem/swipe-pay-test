import { hashSecret, verifySecret, newSessionToken, sha256, newReference, newDeviceCode } from "./crypto.js";

/** Minimal subset of pg.Pool used here (works with pg and @netlify/database pools). */
export interface QueryResult<T> {
  rows: T[];
}
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface PoolClient extends Queryable {
  release(): void;
}
export interface Pool extends Queryable {
  connect(): Promise<PoolClient>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Every new account receives GH₵1,000.00 in DEMO funds (stored in pesewas). */
export const DEMO_STARTING_BALANCE = 100_000;
/** Largest single demo transfer: GH₵5,000.00. */
export const MAX_TRANSFER = 500_000;
export const SESSION_DAYS = 30;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_LOCK_MINUTES = 15;

const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
const PIN_RE = /^\d{6}$/;
const CHANNELS = new Set(["username", "nfc", "qr", "link"]);

export function normalizeUsername(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

async function withTransaction<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export interface PublicUser {
  id: number;
  username: string;
  fullName: string;
}

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  password_hash: string;
  pin_hash: string;
  pin_failed_attempts: number;
  pin_locked_until: Date | null;
  login_failed_attempts: number;
  login_locked_until: Date | null;
  notifications_seen_at: Date;
}

const toPublic = (r: Pick<UserRow, "id" | "username" | "full_name">): PublicUser => ({
  id: Number(r.id),
  username: r.username,
  fullName: r.full_name,
});

// ---------------------------------------------------------------- auth

async function createSession(db: Queryable, userId: number): Promise<string> {
  const token = newSessionToken();
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_DAYS)],
  );
  return token;
}

export async function signup(
  pool: Pool,
  input: { username?: unknown; fullName?: unknown; password?: unknown; pin?: unknown },
): Promise<{ user: PublicUser; token: string }> {
  const username = normalizeUsername(input.username);
  const fullName = String(input.fullName ?? "").trim().replace(/\s+/g, " ");
  const password = String(input.password ?? "");
  const pin = String(input.pin ?? "");

  if (!USERNAME_RE.test(username))
    throw new ApiError(400, "invalid_username", "Username must be 3–20 characters: letters, numbers, dots or underscores.");
  if (fullName.length < 2 || fullName.length > 60)
    throw new ApiError(400, "invalid_name", "Enter your full name (2–60 characters).");
  if (password.length < 8 || password.length > 200)
    throw new ApiError(400, "invalid_password", "Password must be at least 8 characters.");
  if (!PIN_RE.test(pin)) throw new ApiError(400, "invalid_pin", "Your Swipe PIN must be exactly 6 digits.");
  if (/^(\d)\1{5}$/.test(pin) || pin === "123456" || pin === "654321")
    throw new ApiError(400, "weak_pin", "Choose a PIN that's harder to guess.");

  const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);

  try {
    return await withTransaction(pool, async (c) => {
      const { rows } = await c.query<UserRow>(
        `INSERT INTO users (username, full_name, password_hash, pin_hash) VALUES ($1, $2, $3, $4)
         RETURNING id, username, full_name`,
        [username, fullName, passwordHash, pinHash],
      );
      const user = toPublic(rows[0]);
      await c.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, $2)`, [user.id, DEMO_STARTING_BALANCE]);
      await c.query(
        `INSERT INTO transactions (reference, kind, sender_id, recipient_id, amount, note, channel)
         VALUES ($1, 'demo_credit', NULL, $2, $3, 'Demo welcome balance', 'system')`,
        [newReference(), user.id, DEMO_STARTING_BALANCE],
      );
      const token = await createSession(c, user.id);
      return { user, token };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ApiError(409, "username_taken", `@${username} is already taken.`);
    throw err;
  }
}

export async function login(
  pool: Pool,
  input: { username?: unknown; password?: unknown },
): Promise<{ user: PublicUser; token: string }> {
  const username = normalizeUsername(input.username);
  const password = String(input.password ?? "");
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE username = $1`, [username]);
  const row = rows[0];
  const invalid = new ApiError(401, "invalid_credentials", "Incorrect username or password.");
  if (!row) {
    // Spend comparable time so response timing doesn't reveal which usernames exist.
    await verifySecret(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    throw invalid;
  }
  if (row.login_locked_until && row.login_locked_until > new Date())
    throw new ApiError(429, "login_locked", "Too many failed attempts. Try again in a few minutes.");

  if (!(await verifySecret(password, row.password_hash))) {
    await pool.query(
      `UPDATE users SET
         login_failed_attempts = CASE WHEN login_failed_attempts + 1 >= $2 THEN 0 ELSE login_failed_attempts + 1 END,
         login_locked_until    = CASE WHEN login_failed_attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE login_locked_until END
       WHERE id = $1`,
      [row.id, MAX_LOGIN_ATTEMPTS, String(LOGIN_LOCK_MINUTES)],
    );
    throw invalid;
  }
  await pool.query(`UPDATE users SET login_failed_attempts = 0, login_locked_until = NULL WHERE id = $1`, [row.id]);
  const user = toPublic(row);
  return { user, token: await createSession(pool, user.id) };
}

export async function getSessionUser(pool: Pool, token: string | undefined): Promise<PublicUser | null> {
  if (!token) return null;
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.username, u.full_name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [sha256(token)],
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function logout(pool: Pool, token: string | undefined): Promise<void> {
  if (token) await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}

// ---------------------------------------------------------------- wallet

export async function getMe(pool: Pool, userId: number) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, w.balance, w.currency, w.is_demo,
       (SELECT COUNT(*) FROM transactions t
          WHERE t.recipient_id = u.id AND t.kind = 'transfer' AND t.created_at > u.notifications_seen_at) AS unread
     FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) throw new ApiError(404, "not_found", "Account not found.");
  return {
    user: toPublic(r),
    wallet: { balance: Number(r.balance), currency: r.currency, isDemo: r.is_demo },
    unreadNotifications: Number(r.unread),
  };
}

export async function findUser(pool: Pool, username: string): Promise<PublicUser | null> {
  const { rows } = await pool.query<UserRow>(`SELECT id, username, full_name FROM users WHERE username = $1`, [
    normalizeUsername(username),
  ]);
  return rows[0] ? toPublic(rows[0]) : null;
}

export async function searchUsers(pool: Pool, viewerId: number, q: string): Promise<PublicUser[]> {
  const term = normalizeUsername(q).replace(/[^a-z0-9._ ]/g, "");
  if (term.length < 2) return [];
  const { rows } = await pool.query<UserRow>(
    `SELECT id, username, full_name FROM users
     WHERE id <> $1 AND (username LIKE $2 OR LOWER(full_name) LIKE $3)
     ORDER BY (username = $4) DESC, username LIMIT 8`,
    [viewerId, `${term}%`, `%${term}%`, term],
  );
  return rows.map(toPublic);
}

export async function recentRecipients(pool: Pool, userId: number): Promise<PublicUser[]> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.username, u.full_name FROM (
       SELECT recipient_id, MAX(created_at) AS last FROM transactions
       WHERE sender_id = $1 AND kind = 'transfer' GROUP BY recipient_id
     ) r JOIN users u ON u.id = r.recipient_id ORDER BY r.last DESC LIMIT 6`,
    [userId],
  );
  return rows.map(toPublic);
}

export interface TransferInput {
  recipient?: unknown;
  amount?: unknown; // pesewas, integer
  note?: unknown;
  pin?: unknown;
  channel?: unknown;
  deviceCode?: unknown;
  idempotencyKey?: unknown;
}

export interface Receipt {
  reference: string;
  kind: "transfer" | "demo_credit";
  direction: "sent" | "received";
  amount: number;
  fee: number;
  note: string | null;
  channel: string;
  createdAt: string;
  counterparty: PublicUser | null;
  sender: PublicUser | null;
  recipient: PublicUser;
  deviceLabel: string | null;
}

export async function transfer(pool: Pool, senderId: number, input: TransferInput): Promise<Receipt> {
  const recipientName = normalizeUsername(input.recipient);
  const amount = Number(input.amount);
  const note = input.note == null ? null : String(input.note).trim().slice(0, 120) || null;
  const pin = String(input.pin ?? "");
  const channel = CHANNELS.has(String(input.channel)) ? String(input.channel) : "username";
  const deviceCode = input.deviceCode ? String(input.deviceCode) : null;
  const idempotencyKey = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 80) : null;

  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new ApiError(400, "invalid_amount", "Enter an amount greater than GH₵0.00.");
  if (amount > MAX_TRANSFER)
    throw new ApiError(400, "amount_too_large", "Demo transfers are limited to GH₵5,000.00 each.");
  if (!PIN_RE.test(pin)) throw new ApiError(400, "invalid_pin", "Enter your 6-digit Swipe PIN.");

  const result = await withTransaction(pool, async (c) => {
    // Lock the sender row: serialises PIN attempts and concurrent sends from this account.
    const { rows: senderRows } = await c.query<UserRow>(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [senderId]);
    const sender = senderRows[0];
    if (!sender) throw new ApiError(401, "unauthorized", "Please sign in again.");

    if (idempotencyKey) {
      const { rows } = await c.query<{ reference: string }>(
        `SELECT reference FROM transactions WHERE sender_id = $1 AND idempotency_key = $2`,
        [senderId, idempotencyKey],
      );
      if (rows[0]) return { reference: rows[0].reference } as const;
    }

    if (sender.pin_locked_until && sender.pin_locked_until > new Date())
      throw new ApiError(423, "pin_locked", "Too many incorrect PIN attempts. Try again in 15 minutes.");

    if (!(await verifySecret(pin, sender.pin_hash))) {
      const attempts = sender.pin_failed_attempts + 1;
      const locked = attempts >= MAX_PIN_ATTEMPTS;
      await c.query(
        `UPDATE users SET pin_failed_attempts = $2,
           pin_locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::interval ELSE pin_locked_until END
         WHERE id = $1`,
        [senderId, locked ? 0 : attempts, locked, String(PIN_LOCK_MINUTES)],
      );
      return {
        pinError: locked
          ? new ApiError(423, "pin_locked", "Too many incorrect PIN attempts. Try again in 15 minutes.")
          : new ApiError(401, "incorrect_pin", "Incorrect PIN.", { attemptsLeft: MAX_PIN_ATTEMPTS - attempts }),
      } as const;
    }
    if (sender.pin_failed_attempts > 0)
      await c.query(`UPDATE users SET pin_failed_attempts = 0 WHERE id = $1`, [senderId]);

    const { rows: recipRows } = await c.query<UserRow>(`SELECT id, username, full_name FROM users WHERE username = $1`, [
      recipientName,
    ]);
    const recipient = recipRows[0];
    if (!recipient) throw new ApiError(404, "recipient_not_found", `No Swipe account found for @${recipientName}.`);
    if (Number(recipient.id) === senderId) throw new ApiError(400, "self_transfer", "You can't send money to yourself.");

    let deviceId: number | null = null;
    if (deviceCode) {
      const { rows } = await c.query<{ id: string; user_id: string; status: string }>(
        `SELECT id, user_id, status FROM devices WHERE code = $1`,
        [deviceCode],
      );
      const d = rows[0];
      if (!d || Number(d.user_id) !== Number(recipient.id) || d.status === "disabled")
        throw new ApiError(400, "invalid_device", "This Swipe device is not linked to that account.");
      deviceId = Number(d.id);
    }

    // Lock both wallets in a consistent order to avoid deadlocks.
    const ids = [senderId, Number(recipient.id)].sort((a, b) => a - b);
    const { rows: wallets } = await c.query<{ user_id: string; balance: string }>(
      `SELECT user_id, balance FROM wallets WHERE user_id = ANY($1::bigint[]) ORDER BY user_id FOR UPDATE`,
      [ids],
    );
    const senderWallet = wallets.find((w) => Number(w.user_id) === senderId);
    if (!senderWallet || wallets.length !== 2) throw new ApiError(500, "wallet_missing", "Wallet not found.");
    if (Number(senderWallet.balance) < amount)
      throw new ApiError(400, "insufficient_funds", "Insufficient demo balance for this payment.");

    // Conditional debit: never overdraws even if the row locks above were somehow bypassed.
    const debit = await c.query(
      `UPDATE wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1 AND balance >= $2 RETURNING balance`,
      [senderId, amount],
    );
    if (debit.rows.length !== 1) throw new ApiError(400, "insufficient_funds", "Insufficient demo balance for this payment.");
    await c.query(`UPDATE wallets SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1`, [
      recipient.id,
      amount,
    ]);
    const reference = newReference();
    await c.query(
      `INSERT INTO transactions (reference, kind, sender_id, recipient_id, amount, fee, note, channel, device_id, idempotency_key)
       VALUES ($1, 'transfer', $2, $3, $4, 0, $5, $6, $7, $8)`,
      [reference, senderId, recipient.id, amount, note, channel, deviceId, idempotencyKey],
    );
    return { reference } as const;
  });

  // Failed PIN attempts are committed (so they count) before the error is raised.
  if ("pinError" in result) throw result.pinError;
  const receipt = await getReceipt(pool, senderId, result.reference);
  if (!receipt) throw new ApiError(500, "receipt_missing", "Payment completed but receipt is unavailable.");
  return receipt;
}

const TX_SELECT = `
  SELECT t.reference, t.kind, t.amount, t.fee, t.note, t.channel, t.created_at, t.sender_id, t.recipient_id,
         s.username AS s_username, s.full_name AS s_full_name,
         r.username AS r_username, r.full_name AS r_full_name,
         d.label AS device_label
  FROM transactions t
  LEFT JOIN users s ON s.id = t.sender_id
  JOIN users r ON r.id = t.recipient_id
  LEFT JOIN devices d ON d.id = t.device_id`;

function rowToReceipt(row: any, viewerId: number): Receipt {
  const sender = row.sender_id
    ? { id: Number(row.sender_id), username: row.s_username, fullName: row.s_full_name }
    : null;
  const recipient = { id: Number(row.recipient_id), username: row.r_username, fullName: row.r_full_name };
  const direction = Number(row.sender_id) === viewerId ? "sent" : "received";
  return {
    reference: row.reference,
    kind: row.kind,
    direction,
    amount: Number(row.amount),
    fee: Number(row.fee),
    note: row.note,
    channel: row.channel,
    createdAt: new Date(row.created_at).toISOString(),
    counterparty: direction === "sent" ? recipient : sender,
    sender,
    recipient,
    deviceLabel: row.device_label ?? null,
  };
}

export async function getReceipt(pool: Pool, viewerId: number, reference: string): Promise<Receipt | null> {
  const { rows } = await pool.query(
    `${TX_SELECT} WHERE t.reference = $1 AND (t.sender_id = $2 OR t.recipient_id = $2)`,
    [reference, viewerId],
  );
  return rows[0] ? rowToReceipt(rows[0], viewerId) : null;
}

export async function listActivity(pool: Pool, userId: number, limit = 50): Promise<Receipt[]> {
  const { rows } = await pool.query(
    `${TX_SELECT} WHERE t.sender_id = $1 OR t.recipient_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((r) => rowToReceipt(r, userId));
}

export async function listNotifications(pool: Pool, userId: number) {
  const { rows } = await pool.query(
    `${TX_SELECT} WHERE t.recipient_id = $1 AND t.kind = 'transfer' ORDER BY t.created_at DESC LIMIT 30`,
    [userId],
  );
  return rows.map((r) => rowToReceipt(r, userId));
}

export async function markNotificationsSeen(pool: Pool, userId: number): Promise<void> {
  await pool.query(`UPDATE users SET notifications_seen_at = NOW() WHERE id = $1`, [userId]);
}

// ---------------------------------------------------------------- devices

export interface Device {
  id: number;
  code: string;
  label: string;
  kind: "nfc_tag" | "swipe_device";
  status: "pending" | "active" | "disabled";
  activatedAt: string | null;
  createdAt: string;
  payments: number;
}

const toDevice = (r: any): Device => ({
  id: Number(r.id),
  code: r.code,
  label: r.label,
  kind: r.kind,
  status: r.status,
  activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
  payments: Number(r.payments ?? 0),
});

export async function listDevices(pool: Pool, userId: number): Promise<Device[]> {
  const { rows } = await pool.query(
    `SELECT d.*, (SELECT COUNT(*) FROM transactions t WHERE t.device_id = d.id) AS payments
     FROM devices d WHERE d.user_id = $1 AND d.status <> 'disabled' ORDER BY d.created_at DESC`,
    [userId],
  );
  return rows.map(toDevice);
}

export async function createDevice(
  pool: Pool,
  userId: number,
  input: { label?: unknown; kind?: unknown },
): Promise<Device> {
  const label = String(input.label ?? "").trim().slice(0, 40) || "My NFC tag";
  const kind = input.kind === "swipe_device" ? "swipe_device" : "nfc_tag";
  const { rows: count } = await pool.query(
    `SELECT COUNT(*) AS n FROM devices WHERE user_id = $1 AND status <> 'disabled'`,
    [userId],
  );
  if (Number(count[0].n) >= 10) throw new ApiError(400, "device_limit", "You can link up to 10 devices.");
  const { rows } = await pool.query(
    `INSERT INTO devices (user_id, code, label, kind) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, newDeviceCode(), label, kind],
  );
  return toDevice(rows[0]);
}

export async function updateDevice(
  pool: Pool,
  userId: number,
  deviceId: number,
  input: { label?: unknown; status?: unknown },
): Promise<Device> {
  const status = input.status === "active" || input.status === "disabled" ? input.status : null;
  const label = input.label == null ? null : String(input.label).trim().slice(0, 40) || null;
  const { rows } = await pool.query(
    `UPDATE devices SET
       label = COALESCE($3, label),
       status = COALESCE($4, status),
       activated_at = CASE WHEN $4 = 'active' AND activated_at IS NULL THEN NOW() ELSE activated_at END
     WHERE id = $1 AND user_id = $2 AND status <> 'disabled' RETURNING *`,
    [deviceId, userId, label, status],
  );
  if (!rows[0]) throw new ApiError(404, "device_not_found", "Device not found.");
  return toDevice(rows[0]);
}

/** Owner confirms a tag works (they tapped it and it opened their own page). */
export async function activateDeviceByCode(pool: Pool, userId: number, code: string): Promise<Device> {
  const { rows } = await pool.query(
    `UPDATE devices SET status = 'active', activated_at = COALESCE(activated_at, NOW())
     WHERE code = $1 AND user_id = $2 AND status <> 'disabled' RETURNING *`,
    [code, userId],
  );
  if (!rows[0]) throw new ApiError(404, "device_not_found", "This device isn't linked to your account.");
  return toDevice(rows[0]);
}

/** Public: resolve a payment link (`/pay/@username?d=code`) to its recipient. */
export async function resolvePayLink(pool: Pool, username: string, deviceCode: string | null) {
  const recipient = await findUser(pool, username);
  if (!recipient) throw new ApiError(404, "recipient_not_found", "This payment link doesn't match any Swipe account.");
  let device: { label: string; status: string } | null = null;
  if (deviceCode) {
    const { rows } = await pool.query(`SELECT id, user_id, label, status FROM devices WHERE code = $1`, [deviceCode]);
    const d = rows[0];
    if (d && Number(d.user_id) === recipient.id && d.status !== "disabled")
      device = { label: d.label, status: d.status };
  }
  return { recipient: { username: recipient.username, fullName: recipient.fullName }, device, deviceValid: !deviceCode || !!device };
}
