import { NetlifyDB } from "@netlify/database-dev";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handle } from "../server/router.js";
import type { Pool } from "../server/service.js";

let db: NetlifyDB | undefined;
let pool: pg.Pool;
const ORIGIN = "https://swipe.test";

// Set TEST_DATABASE_URL to an empty Postgres database to run against real Postgres (true
// concurrency). Otherwise the in-process Netlify DB emulator is used; it multiplexes all
// connections onto one session, so transactions are run one at a time there.
beforeAll(async () => {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    pool = new pg.Pool({ connectionString: external, max: 10 });
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const dir = "./netlify/database/migrations";
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort())
      await pool.query(readFileSync(join(dir, f), "utf8"));
  } else {
    db = new NetlifyDB({ logger: () => {} });
    const connectionString = await db.start();
    await db.applyMigrations("./netlify/database/migrations");
    pool = new pg.Pool({ connectionString, max: 1 });
  }
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await db?.stop();
});

/** Tiny client that keeps its own session cookie, like a separate browser. */
function client() {
  let cookie = "";
  return async function call(method: string, path: string, data?: unknown) {
    const headers: Record<string, string> = { "x-swipe-client": "web", origin: ORIGIN };
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) headers["content-type"] = "application/json";
    const res = await handle(
      new Request(ORIGIN + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) }),
      pool as unknown as Pool,
    );
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: res.status, body: (await res.json()) as any };
  };
}

async function newUser(username: string, pin = "482915") {
  const call = client();
  const res = await call("POST", "/api/auth/signup", {
    username,
    fullName: username.replace(/[._]/g, " "),
    password: "correct horse battery",
    pin,
  });
  expect(res.status).toBe(201);
  return call;
}

describe("accounts", () => {
  test("signup grants GH₵1,000 demo balance and a ledger entry", async () => {
    const kofi = await newUser("kofi.owusu");
    const me = await kofi("GET", "/api/me");
    expect(me.body.wallet).toEqual({ balance: 100_000, currency: "GHS", isDemo: true });
    const tx = await kofi("GET", "/api/transactions");
    expect(tx.body.transactions).toHaveLength(1);
    expect(tx.body.transactions[0]).toMatchObject({ kind: "demo_credit", amount: 100_000, direction: "received" });
  });

  test("rejects duplicate usernames (case/@ insensitive) and bad input", async () => {
    const call = client();
    const dup = await call("POST", "/api/auth/signup", {
      username: "@Kofi.Owusu",
      fullName: "Someone",
      password: "password123",
      pin: "482915",
    });
    expect(dup.status).toBe(409);
    const badPin = await call("POST", "/api/auth/signup", { username: "newbie", fullName: "N B", password: "password123", pin: "1234" });
    expect(badPin.body.error.code).toBe("invalid_pin");
    const weakPin = await call("POST", "/api/auth/signup", { username: "newbie", fullName: "N B", password: "password123", pin: "111111" });
    expect(weakPin.body.error.code).toBe("weak_pin");
  });

  test("login from a second session, logout invalidates it", async () => {
    const other = client();
    expect((await other("POST", "/api/auth/login", { username: "kofi.owusu", password: "nope nope" })).status).toBe(401);
    const ok = await other("POST", "/api/auth/login", { username: "@KOFI.OWUSU", password: "correct horse battery" });
    expect(ok.status).toBe(200);
    expect((await other("GET", "/api/me")).body.user.username).toBe("kofi.owusu");
    await other("POST", "/api/auth/logout");
    expect((await other("GET", "/api/me")).status).toBe(401);
  });

  test("protected routes require a session; mutations require the client header", async () => {
    expect((await client()("GET", "/api/me")).status).toBe(401);
    const res = await handle(
      new Request(ORIGIN + "/api/auth/login", { method: "POST", body: "{}" }),
      pool as unknown as Pool,
    );
    expect(res.status).toBe(403);
  });
});

describe("transfers", () => {
  test("moves demo funds between two accounts", async () => {
    const ama = await newUser("ama.mensah");
    const nana = await newUser("nana.adjei");

    const sent = await ama("POST", "/api/transfers", { recipient: "@nana.adjei", amount: 5_000, pin: "482915", note: "Lunch" });
    expect(sent.status).toBe(201);
    expect(sent.body.receipt).toMatchObject({ amount: 5_000, fee: 0, direction: "sent", note: "Lunch" });
    expect(sent.body.receipt.reference).toMatch(/^SWP-/);

    expect((await ama("GET", "/api/me")).body.wallet.balance).toBe(95_000);
    const nanaMe = await nana("GET", "/api/me");
    expect(nanaMe.body.wallet.balance).toBe(105_000);
    expect(nanaMe.body.unreadNotifications).toBe(1);

    // Recipient sees the same receipt, as "received".
    const r = await nana("GET", `/api/transactions/${sent.body.receipt.reference}`);
    expect(r.body.receipt).toMatchObject({ direction: "received", counterparty: { username: "ama.mensah" } });
    await nana("POST", "/api/notifications/seen");
    expect((await nana("GET", "/api/me")).body.unreadNotifications).toBe(0);

    // Recent recipients
    expect((await ama("GET", "/api/users/recent")).body.users.map((u: any) => u.username)).toEqual(["nana.adjei"]);
  });

  test("rejects wrong PIN, insufficient funds, self-transfer, unknown recipient", async () => {
    const efua = await newUser("efua.fynn");
    await newUser("prince.kofi");
    const bad = await efua("POST", "/api/transfers", { recipient: "prince.kofi", amount: 100, pin: "000001" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.attemptsLeft).toBe(4);

    const tooMuch = await efua("POST", "/api/transfers", { recipient: "prince.kofi", amount: 100_001, pin: "482915" });
    expect(tooMuch.body.error.code).toBe("insufficient_funds");
    const self = await efua("POST", "/api/transfers", { recipient: "efua.fynn", amount: 100, pin: "482915" });
    expect(self.body.error.code).toBe("self_transfer");
    const ghost = await efua("POST", "/api/transfers", { recipient: "ghost", amount: 100, pin: "482915" });
    expect(ghost.status).toBe(404);
    const frac = await efua("POST", "/api/transfers", { recipient: "prince.kofi", amount: 10.5, pin: "482915" });
    expect(frac.body.error.code).toBe("invalid_amount");

    expect((await efua("GET", "/api/me")).body.wallet.balance).toBe(100_000);
  });

  test("locks the PIN after 5 wrong attempts", async () => {
    const yaw = await newUser("yaw.boateng");
    await newUser("abena.osei");
    for (let i = 0; i < 4; i++)
      expect((await yaw("POST", "/api/transfers", { recipient: "abena.osei", amount: 100, pin: "999998" })).status).toBe(401);
    const fifth = await yaw("POST", "/api/transfers", { recipient: "abena.osei", amount: 100, pin: "999998" });
    expect(fifth.status).toBe(423);
    const correct = await yaw("POST", "/api/transfers", { recipient: "abena.osei", amount: 100, pin: "482915" });
    expect(correct.body.error.code).toBe("pin_locked");
  });

  test("idempotency key prevents double charges", async () => {
    const kwame = await newUser("kwame.asante");
    await newUser("akosua.dede");
    const payload = { recipient: "akosua.dede", amount: 2_500, pin: "482915", idempotencyKey: "abc-123" };
    const a = await kwame("POST", "/api/transfers", payload);
    const b = await kwame("POST", "/api/transfers", payload);
    expect(a.body.receipt.reference).toBe(b.body.receipt.reference);
    expect((await kwame("GET", "/api/me")).body.wallet.balance).toBe(97_500);
  });

  test("concurrent transfers never overdraw", async () => {
    const esi = await newUser("esi.ampofo");
    await newUser("kojo.mensah");
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () => esi("POST", "/api/transfers", { recipient: "kojo.mensah", amount: 30_000, pin: "482915" })),
    );
    expect(attempts.filter((a) => a.status === 201)).toHaveLength(3);
    expect((await esi("GET", "/api/me")).body.wallet.balance).toBe(10_000);
  });
});

describe("devices and payment links", () => {
  test("NFC device flow: create, resolve link, activate, pay via device", async () => {
    const store = await newUser("kofisstore");
    const customer = await newUser("customer.one");

    const created = await store("POST", "/api/devices", { label: "Counter tag" });
    expect(created.status).toBe(201);
    const device = created.body.device;
    expect(device.status).toBe("pending");

    // Anyone (even signed out) can resolve the link printed on the tag.
    const resolved = await client()("GET", `/api/pay/kofisstore?d=${device.code}`);
    expect(resolved.body).toMatchObject({ recipient: { username: "kofisstore" }, device: { label: "Counter tag" }, deviceValid: true });
    expect(resolved.body.recipient.id).toBeUndefined();

    // Someone else's device code doesn't validate for this account.
    expect((await client()("GET", `/api/pay/customer.one?d=${device.code}`)).body.deviceValid).toBe(false);

    // Only the owner can activate.
    expect((await customer("POST", "/api/devices/activate", { code: device.code })).status).toBe(404);
    const act = await store("POST", "/api/devices/activate", { code: device.code });
    expect(act.body.device.status).toBe("active");

    const paid = await customer("POST", "/api/transfers", {
      recipient: "kofisstore",
      amount: 1_200,
      pin: "482915",
      channel: "nfc",
      deviceCode: device.code,
    });
    expect(paid.status).toBe(201);
    expect(paid.body.receipt).toMatchObject({ channel: "nfc", deviceLabel: "Counter tag" });

    const list = await store("GET", "/api/devices");
    expect(list.body.devices[0]).toMatchObject({ payments: 1, status: "active" });

    // Disable removes it from the list and invalidates the link's device code.
    await store("PATCH", `/api/devices/${device.id}`, { status: "disabled" });
    expect((await store("GET", "/api/devices")).body.devices).toHaveLength(0);
    const again = await customer("POST", "/api/transfers", {
      recipient: "kofisstore", amount: 100, pin: "482915", channel: "nfc", deviceCode: device.code,
    });
    expect(again.body.error.code).toBe("invalid_device");
  });

  test("unknown payment link returns 404", async () => {
    expect((await client()("GET", "/api/pay/nobody.here")).status).toBe(404);
  });

  test("user search finds by username prefix and name, excluding self", async () => {
    const kofi = client();
    await kofi("POST", "/api/auth/login", { username: "kofi.owusu", password: "correct horse battery" });
    const res = await kofi("GET", "/api/users/search?q=ama");
    expect(res.body.users.map((u: any) => u.username)).toContain("ama.mensah");
    const self = await kofi("GET", "/api/users/search?q=kofi.o");
    expect(self.body.users.map((u: any) => u.username)).not.toContain("kofi.owusu");
  });
});

describe("session probe", () => {
  test("returns null when signed out and wallet data when signed in", async () => {
    expect((await client()("GET", "/api/session")).body).toEqual({ user: null });
    const k = client();
    await k("POST", "/api/auth/login", { username: "kofi.owusu", password: "correct horse battery" });
    expect((await k("GET", "/api/session")).body.user.username).toBe("kofi.owusu");
  });
});
