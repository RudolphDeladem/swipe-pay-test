import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "./service.js";

/**
 * Applies netlify/database/migrations/*.sql that haven't run yet (used outside Netlify, where
 * Netlify Database would otherwise apply them). Safe to call from many cold starts at once.
 */
export async function migrate(pool: Pool, dir: string): Promise<void> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query("CREATE TABLE IF NOT EXISTS _swipe_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");
    for (const f of files) {
      const { rows } = await client.query("SELECT 1 FROM _swipe_migrations WHERE name = $1", [f]);
      if (rows.length) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("INSERT INTO _swipe_migrations (name) VALUES ($1)", [f]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
}
