import type { Pool } from "./service.js";

/**
 * Applies migrations that haven't run yet (used outside Netlify, where Netlify Database would
 * otherwise apply them). Safe to call from many cold starts at once.
 */
export async function migrate(pool: Pool, migrations: [name: string, sql: string][]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query("CREATE TABLE IF NOT EXISTS _swipe_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())");
    for (const [name, sql] of migrations) {
      const { rows } = await client.query("SELECT 1 FROM _swipe_migrations WHERE name = $1", [name]);
      if (rows.length) continue;
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _swipe_migrations (name) VALUES ($1)", [name]);
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
