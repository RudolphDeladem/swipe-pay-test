// Local preview: serves the production build plus the API against any Postgres database.
// Usage: DATABASE_URL=postgres://... npx tsx scripts/serve-local.ts   (applies migrations on start)
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import pg from "pg";
import { handle } from "../server/router.js";
import type { Pool } from "../server/service.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");
const pool = new pg.Pool({ connectionString: url });
const dir = "netlify/database/migrations";
await pool.query("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  const done = await pool.query("SELECT 1 FROM _local_migrations WHERE name = $1", [f]);
  if (done.rowCount) continue;
  await pool.query(readFileSync(join(dir, f), "utf8"));
  await pool.query("INSERT INTO _local_migrations VALUES ($1)", [f]);
}

const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const port = Number(process.env.PORT ?? 8888);

createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (u.pathname.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await handle(
      new Request(u, { method: req.method, headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks) : undefined }),
      pool as unknown as Pool,
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let file = join("dist", u.pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) file = "dist/index.html";
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`Swipe Pay on http://localhost:${port}`));
