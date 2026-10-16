// Static-hosting mode (GitHub Pages): runs the real API router against PGlite (Postgres in
// WebAssembly) persisted in this browser's IndexedDB. Data stays on this device.
import { PGlite } from "@electric-sql/pglite";
import initSql from "../../netlify/database/migrations/20261016000000_init.sql?raw";
import { handle } from "../../server/router";
import type { Pool, PoolClient } from "../../server/service";

const MIGRATIONS: [string, string][] = [["20261016000000_init", initSql]];
const TOKEN_KEY = "swipe.localSession";

/** PGlite has a single connection, so transactions are serialised with a simple mutex. */
function makePool(db: PGlite): Pool {
  let chain: Promise<void> = Promise.resolve();
  const acquire = () => {
    let release!: () => void;
    const prev = chain;
    chain = new Promise<void>((r) => (release = r));
    return prev.then(() => release);
  };
  const run = <T,>(text: string, params?: unknown[]) =>
    db.query<T>(text, params as unknown[] | undefined).then((r) => ({ rows: r.rows }));
  return {
    async query(text, params) {
      const release = await acquire();
      try {
        return await run(text, params);
      } finally {
        release();
      }
    },
    async connect(): Promise<PoolClient> {
      const release = await acquire();
      return { query: run, release };
    },
  } as Pool;
}

let ready: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  ready ??= (async () => {
    const db = new PGlite("idb://swipe-pay");
    await db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
    for (const [name, sql] of MIGRATIONS) {
      const done = await db.query("SELECT 1 FROM _migrations WHERE name = $1", [name]);
      if (done.rows.length) continue;
      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query("INSERT INTO _migrations VALUES ($1)", [name]);
      });
    }
    return makePool(db);
  })();
  return ready;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Drop-in replacement for fetch() against /api/*. The session token is kept in localStorage. */
export async function localFetch(path: string, init: RequestInit): Promise<Response> {
  const pool = await getPool();
  // Browsers drop Cookie/Set-Cookie on script-built requests, so the token is passed directly.
  const req = new Request(new URL(path, window.location.origin), init);
  const res = await handle(req, pool, { sessionToken: readToken(), onSession: writeToken });
  return res;
}
