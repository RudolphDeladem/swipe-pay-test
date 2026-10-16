// Vercel entry point. vercel.json rewrites /api/<path> here as /api?__path=<path>.
import { join } from "node:path";
import pg from "pg";
import { handle } from "../server/router.js";
import { migrate } from "../server/migrate.js";
import type { Pool } from "../server/service.js";

let ready: Promise<Pool> | undefined;

function getPool(): Promise<Pool> {
  ready ??= (async () => {
    const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set. Add a Neon (Postgres) database to this Vercel project.");
    const pool = new pg.Pool({ connectionString, max: 3 }) as unknown as Pool;
    await migrate(pool, join(process.cwd(), "netlify/database/migrations"));
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
  try {
    return await handle(request, await getPool());
  } catch (e) {
    console.error(e);
    return Response.json({ error: { code: "server_error", message: "Server is starting up or misconfigured." } }, { status: 500 });
  }
}

export const GET = entry;
export const POST = entry;
export const PATCH = entry;
export const DELETE = entry;
