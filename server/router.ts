import * as svc from "./service.js";
import { ApiError, type Pool } from "./service.js";

export const SESSION_COOKIE = "swipe_session";

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function sessionCookie(req: Request, token: string, maxAge: number): string {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be JSON.");
  }
}

type Handler = (ctx: {
  req: Request;
  pool: Pool;
  params: Record<string, string>;
  url: URL;
  user: svc.PublicUser | null;
  token: string | undefined;
}) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  auth: boolean;
  handler: Handler;
}

const routes: Route[] = [];
function route(method: string, path: string, auth: boolean, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$",
  );
  routes.push({ method, pattern, keys, auth, handler });
}

const requireUser = (u: svc.PublicUser | null): svc.PublicUser => {
  if (!u) throw new ApiError(401, "unauthorized", "Please sign in.");
  return u;
};

// ---- auth
route("POST", "/api/auth/signup", false, async ({ req, pool }) => {
  const { user, token } = await svc.signup(pool, await body(req));
  return json({ user }, 201, { "set-cookie": sessionCookie(req, token, svc.SESSION_DAYS * 86400) });
});
route("POST", "/api/auth/login", false, async ({ req, pool }) => {
  const { user, token } = await svc.login(pool, await body(req));
  return json({ user }, 200, { "set-cookie": sessionCookie(req, token, svc.SESSION_DAYS * 86400) });
});
route("POST", "/api/auth/logout", false, async ({ req, pool, token }) => {
  await svc.logout(pool, token);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
});

// ---- wallet
// Session probe for the client: 200 with `null` when signed out (avoids noisy 401s on app load).
route("GET", "/api/session", false, async ({ pool, user }) => json(user ? await svc.getMe(pool, user.id) : { user: null }));
route("GET", "/api/me", true, async ({ pool, user }) => json(await svc.getMe(pool, requireUser(user).id)));
route("GET", "/api/users/search", true, async ({ pool, user, url }) =>
  json({ users: await svc.searchUsers(pool, requireUser(user).id, url.searchParams.get("q") ?? "") }),
);
route("GET", "/api/users/recent", true, async ({ pool, user }) =>
  json({ users: await svc.recentRecipients(pool, requireUser(user).id) }),
);
route("GET", "/api/users/:username", true, async ({ pool, params }) => {
  const found = await svc.findUser(pool, params.username);
  if (!found) throw new ApiError(404, "recipient_not_found", `No Swipe account found for @${svc.normalizeUsername(params.username)}.`);
  return json({ user: { username: found.username, fullName: found.fullName } });
});
route("POST", "/api/transfers", true, async ({ req, pool, user }) =>
  json({ receipt: await svc.transfer(pool, requireUser(user).id, await body(req)) }, 201),
);
route("GET", "/api/transactions", true, async ({ pool, user, url }) =>
  json({ transactions: await svc.listActivity(pool, requireUser(user).id, Number(url.searchParams.get("limit") ?? 50)) }),
);
route("GET", "/api/transactions/:reference", true, async ({ pool, user, params }) => {
  const receipt = await svc.getReceipt(pool, requireUser(user).id, params.reference);
  if (!receipt) throw new ApiError(404, "not_found", "Transaction not found.");
  return json({ receipt });
});
route("GET", "/api/notifications", true, async ({ pool, user }) =>
  json({ notifications: await svc.listNotifications(pool, requireUser(user).id) }),
);
route("POST", "/api/notifications/seen", true, async ({ pool, user }) => {
  await svc.markNotificationsSeen(pool, requireUser(user).id);
  return json({ ok: true });
});

// ---- devices
route("GET", "/api/devices", true, async ({ pool, user }) => json({ devices: await svc.listDevices(pool, requireUser(user).id) }));
route("POST", "/api/devices", true, async ({ req, pool, user }) =>
  json({ device: await svc.createDevice(pool, requireUser(user).id, await body(req)) }, 201),
);
route("POST", "/api/devices/activate", true, async ({ req, pool, user }) => {
  const { code } = await body(req);
  return json({ device: await svc.activateDeviceByCode(pool, requireUser(user).id, String(code ?? "")) });
});
route("PATCH", "/api/devices/:id", true, async ({ req, pool, user, params }) =>
  json({ device: await svc.updateDevice(pool, requireUser(user).id, Number(params.id), await body(req)) }),
);

// ---- public payment links
route("GET", "/api/pay/:username", false, async ({ pool, params, url }) =>
  json(await svc.resolvePayLink(pool, params.username, url.searchParams.get("d"))),
);

export async function handle(req: Request, pool: Pool): Promise<Response> {
  const url = new URL(req.url);
  try {
    // CSRF guard: state-changing requests must be same-origin JSON requests from our client.
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (req.headers.get("x-swipe-client") !== "web")
        throw new ApiError(403, "forbidden", "Missing client header.");
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) throw new ApiError(403, "forbidden", "Cross-origin request blocked.");
    }

    const path = decodeURIComponent(url.pathname);
    const matching = routes.filter((r) => r.pattern.test(path));
    if (matching.length === 0) throw new ApiError(404, "not_found", "Not found.");
    const r = matching.find((m) => m.method === req.method);
    if (!r) throw new ApiError(405, "method_not_allowed", "Method not allowed.");

    const m = path.match(r.pattern)!;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    const token = getCookie(req, SESSION_COOKIE);
    const user = r.auth || token ? await svc.getSessionUser(pool, token) : null;
    if (r.auth && !user) throw new ApiError(401, "unauthorized", "Please sign in.");
    return await r.handler({ req, pool, params, url, user, token });
  } catch (err) {
    if (err instanceof ApiError) return json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status);
    console.error("Unhandled API error", err);
    return json({ error: { code: "server_error", message: "Something went wrong. Please try again." } }, 500);
  }
}
