// Web Crypto only, so the same code runs in Node (Netlify Functions) and in the browser build.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const ITERATIONS = 210_000;

function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number, bits = 256): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, bits));
}

/** Hash a secret (password or PIN) as `pbkdf2$<iterations>$<salt>$<hash>`. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await pbkdf2(secret, salt, ITERATIONS))}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = stored.split("$");
  const iterations = Number(iter);
  if (algo !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) return false;
  const expected = fromB64(hashB64);
  const actual = await pbkdf2(secret, fromB64(saltB64), iterations, expected.length * 8);
  // Constant-time comparison.
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** A well-formed hash of a random secret, for spending equal time on unknown usernames. */
export const DUMMY_HASH = `pbkdf2$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

export function newSessionToken(): string {
  return toB64Url(randomBytes(32));
}

export async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", enc.encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Human-friendly transaction reference, e.g. SWP-7K3M9Q2XHD. */
export function newReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const b of randomBytes(10)) out += alphabet[b % alphabet.length];
  return `SWP-${out}`;
}

/** Short public code embedded in an NFC tag link to identify the device. */
export function newDeviceCode(): string {
  return toB64Url(randomBytes(6));
}
