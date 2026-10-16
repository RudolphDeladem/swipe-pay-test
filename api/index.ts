// Vercel entry point. vercel.json rewrites /api/<path> here as /api?__path=<path>.
// Needs a Postgres connection string, e.g. from Vercel Storage → Neon (sets DATABASE_URL).
import pg from "pg";
import { handle } from "../server/router.js";
import { migrate } from "../server/migrate.js";
import { MIGRATIONS } from "../server/migrations.gen.js";
import type { Pool } from "../server/service.js";

class SetupError extends Error {
  constructor(public stage: string, message: string) {
    super(message);
  }
}

/** Finds the database URL, including prefixed names from Vercel's storage integrations. */
export function findDatabaseUrl(env: NodeJS.ProcessEnv): { name: string; url: string } | null {
  const preferred = ["DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "STORAGE_URL"];
  const names = [
    ...preferred,
    ...Object.keys(env).filter((k) => /(DATABASE|POSTGRES)_URL$/.test(k) && !preferred.includes(k)).sort(),
  ];
  for (const name of names) {
    const url = env[name];
    if (url && /^postgres(ql)?:\/\//.test(url)) return { name, url };
  }
  return null;
}

let ready: Promise<Pool> | undefined;

function getPool(): Promise<Pool> {
  ready ??= (async () => {
    const found = findDatabaseUrl(process.env);
    if (!found)
      throw new SetupError(
        "missing_database_url",
        "No database connected. In Vercel: Storage → Create Database → Neon, connect it to this project, then redeploy.",
      );
    const pool = new pg.Pool({ connectionString: found.url, max: 3, connectionTimeoutMillis: 10_000 }) as unknown as Pool;
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      throw new SetupError("database_unreachable", `Couldn't connect to the database in ${found.name}: ${(e as Error).message}`);
    }
    try {
      await migrate(pool, MIGRATIONS);
    } catch (e) {
      throw new SetupError("migration_failed", `Database setup failed: ${(e as Error).message}`);
    }
    return pool;
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

async function entry(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    url.searchParams.delete("path"); // Vercel also appends the captured segment as ?path=
    url.pathname = `/api/${path}`;
    request = new Request(url, request);
  }
  let pool: Pool;
  try {
    pool = await getPool();
  } catch (e) {
    console.error("Swipe Pay setup error:", e);
    const stage = e instanceof SetupError ? e.stage : "server_error";
    const message = e instanceof SetupError ? e.message : "Server is misconfigured.";
    return Response.json({ error: { code: stage, message } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (url.pathname === "/api/health") return Response.json({ ok: true, database: "connected" });
  return handle(request, pool);
}

export const GET = entry;
export const POST = entry;
export const PATCH = entry;
export const DELETE = entry;
