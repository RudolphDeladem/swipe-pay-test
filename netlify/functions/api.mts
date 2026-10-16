import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { handle } from "../../server/router.js";
import type { Pool } from "../../server/service.js";

let pool: Pool | undefined;

export default async (req: Request) => {
  pool ??= getDatabase().pool as unknown as Pool;
  return handle(req, pool);
};

export const config: Config = {
  path: "/api/*",
};
