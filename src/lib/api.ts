export interface PublicUser {
  id?: number;
  username: string;
  fullName: string;
}
export interface Receipt {
  reference: string;
  kind: "transfer" | "demo_credit";
  direction: "sent" | "received";
  amount: number;
  fee: number;
  note: string | null;
  channel: "username" | "nfc" | "qr" | "link" | "system";
  createdAt: string;
  counterparty: PublicUser | null;
  sender: PublicUser | null;
  recipient: PublicUser;
  deviceLabel: string | null;
}
export interface Me {
  user: PublicUser;
  wallet: { balance: number; currency: string; isDemo: boolean };
  unreadNotifications: number;
}
export interface Device {
  id: number;
  code: string;
  label: string;
  kind: "nfc_tag" | "swipe_device";
  status: "pending" | "active" | "disabled";
  activatedAt: string | null;
  createdAt: string;
  payments: number;
}
export interface PayLink {
  recipient: PublicUser;
  device: { label: string; status: string } | null;
  deviceValid: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Static hosting (GitHub Pages): the API runs in the browser instead of on a server. */
export const STATIC_MODE = import.meta.env.VITE_STATIC === "1";

/** App base path, e.g. "/" on Netlify or "/swipe-pay-test/" on GitHub Pages. */
export const BASE = import.meta.env.BASE_URL;

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit = {
      method,
      credentials: "same-origin",
      headers: {
        "x-swipe-client": "web",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    res = STATIC_MODE ? await (await import("./localBackend")).localFetch(path, init) : await fetch(path, init);
  } catch {
    throw new ApiError(0, "network", "You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } }).error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Something went wrong.", e as Record<string, unknown>);
  }
  return data as T;
}

/** Absolute payment link for a user (optionally bound to an NFC device code). */
export function payLink(username: string, deviceCode?: string): string {
  const url = new URL(`${BASE}pay/@${username}`, window.location.origin);
  if (deviceCode) url.searchParams.set("d", deviceCode);
  return url.toString();
}
