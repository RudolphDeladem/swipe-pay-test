import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { api, ApiError, payLink, type Device, type PayLink } from "../lib/api";
import { useAuth } from "../lib/auth";
import { NavBar, Spinner, copyText, useToast } from "../components/ui";
import { PayFlow, RecipientHead } from "../components/PayFlow";
import { Check, Copy, Info, Nfc, Share, Tag } from "../components/icons";

/**
 * /pay/@username[?d=deviceCode][&src=qr][&amount=12.50]
 * Target of NFC tags and QR codes. Goes straight to amount entry. Signed-out visitors are
 * sent to sign in and returned here with their amount intact.
 */
export function PayPage() {
  const { handle = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { me, loading } = useAuth();
  const username = handle.replace(/^@+/, "").toLowerCase();
  const deviceCode = params.get("d");
  const src = params.get("src");
  const [link, setLink] = useState<PayLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = deviceCode ? `?d=${encodeURIComponent(deviceCode)}` : "";
    api<PayLink>("GET", `/api/pay/${encodeURIComponent(username)}${qs}`)
      .then(setLink)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't open this payment link."));
  }, [username, deviceCode]);

  if (error)
    return (
      <div className="screen">
        <NavBar title="Pay" back="/" />
        <div className="error">{error}</div>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: 16 }}>Go to Swipe Pay</Link>
      </div>
    );
  if (!link || loading) return <div className="screen"><NavBar title="Pay" back="/" /><Spinner /></div>;

  if (me && me.user.username === link.recipient.username)
    return <OwnLink link={link} deviceCode={deviceCode} />;

  const channel = deviceCode && link.device ? "nfc" : src === "qr" ? "qr" : "link";
  const returnTo = (amount: string) => {
    const p = new URLSearchParams(params);
    if (amount) p.set("amount", amount);
    else p.delete("amount");
    return `/pay/@${link.recipient.username}?${p}`;
  };

  return (
    <>
      {deviceCode && !link.deviceValid && (
        <div className="warn" style={{ margin: "12px 20px 0" }}>
          This NFC device isn't active on Swipe. You can still pay @{link.recipient.username} directly. Check the name before paying.
        </div>
      )}
      <PayFlow
        title={`Paying @${link.recipient.username}`}
        recipient={link.recipient}
        channel={channel}
        deviceCode={channel === "nfc" ? deviceCode : null}
        deviceLabel={link.device?.label}
        initialAmount={params.get("amount") ?? ""}
        onExit={() => navigate(me ? "/" : "/welcome")}
        onNeedsAuth={(amount) => navigate(`/login?next=${encodeURIComponent(returnTo(amount))}`)}
      />
    </>
  );
}

/** The owner opened their own link: typically while testing a freshly written NFC tag. */
function OwnLink({ link, deviceCode }: { link: PayLink; deviceCode: string | null }) {
  const [status, setStatus] = useState(link.device?.status ?? null);
  const [err, setErr] = useState<string | null>(null);
  const activate = async () => {
    try {
      const { device } = await api<{ device: Device }>("POST", "/api/devices/activate", { code: deviceCode });
      setStatus(device.status);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't activate device.");
    }
  };
  return (
    <div className="screen">
      <NavBar title="Your payment page" back="/" />
      <RecipientHead recipient={link.recipient} />
      {deviceCode && link.device ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="circle c-green" style={{ width: 44, height: 44 }}><Tag size={22} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{link.device.label}</div>
              <div className="muted" style={{ fontSize: 14 }}>This tag opens your payment page ✓</div>
            </div>
          </div>
          {status === "active" ? (
            <div className="status-pill active" style={{ marginTop: 14 }}><Check size={14} /> Active. Customers can tap to pay you.</div>
          ) : (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={activate}>Activate this device</button>
          )}
          {err && <div className="error">{err}</div>}
        </div>
      ) : deviceCode ? (
        <div className="warn" style={{ marginTop: 24 }}>This device isn't linked to your account, or it was removed.</div>
      ) : (
        <div className="info" style={{ marginTop: 24 }}>
          This is your payment link. When customers open it, they go straight to entering an amount for you.
        </div>
      )}
      <div className="spacer" />
      <div className="stack">
        <Link to="/receive" className="btn btn-secondary">Show my QR code</Link>
        <Link to="/profile/devices" className="btn btn-outline">Manage devices</Link>
      </div>
    </div>
  );
}

export function Receive() {
  const { me } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const link = me ? payLink(me.user.username) : "";
  const qrLink = link ? `${link}?src=qr` : "";

  useEffect(() => {
    if (qrLink) QRCode.toDataURL(qrLink, { margin: 1, width: 600, color: { dark: "#0b3d26", light: "#ffffff" } }).then(setQr);
  }, [qrLink]);

  if (!me) return null;
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Pay me on Swipe", text: `Pay @${me.user.username} on Swipe Pay`, url: link }).catch(() => {});
    } else if (await copyText(link)) showToast("Payment link copied");
  };

  return (
    <div className="screen">
      <NavBar title="Receive Money" back="/" />
      <p className="center muted" style={{ marginBottom: 8 }}>Customers scan this code to pay you</p>
      <div className="qr-box">{qr ? <img src={qr} alt={`QR code for paying @${me.user.username}`} /> : <div className="skeleton" style={{ width: 240, height: 240 }} />}</div>
      <div className="center" style={{ margin: "12px 0 18px" }}>
        <div style={{ fontWeight: 800, fontSize: 20 }}>@{me.user.username}</div>
        <div className="muted">{me.user.fullName}</div>
      </div>
      <div className="link-box">
        <code>{link.replace(/^https?:\/\//, "")}</code>
        <button className="btn btn-sm btn-secondary" onClick={async () => (await copyText(link)) && showToast("Payment link copied")}>
          <Copy size={16} /> Copy
        </button>
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={share}><Share size={20} /> Share payment link</button>
        <Link to="/profile/devices" className="btn btn-outline"><Nfc size={20} /> Set up an NFC device</Link>
      </div>
      <p className="footer-note">Other Swipe users can also send to your username: @{me.user.username}</p>
      {toast}
    </div>
  );
}

/** Extract an in-app path from a scanned/tapped URL if it's a Swipe payment link. */
export function payPathFrom(raw: string, src: "qr" | "nfc"): string | null {
  try {
    const url = new URL(raw.trim(), window.location.origin);
    const m = url.pathname.match(/\/pay\/@?([a-z0-9._]{3,20})\/?$/i);
    if (!m) return null;
    const p = new URLSearchParams(url.search);
    if (src === "qr" && !p.get("d")) p.set("src", "qr");
    const qs = p.toString();
    return `/pay/@${m[1].toLowerCase()}${qs ? `?${qs}` : ""}`;
  } catch {
    return null;
  }
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function Scan() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

    const found = (text: string) => {
      const path = payPathFrom(text, "qr");
      if (path) {
        stopped = true;
        navigate(path, { replace: true });
      } else setError("That QR code isn't a Swipe payment code.");
    };

    const loop = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]) found(codes[0].rawValue);
          } else if (ctx) {
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
            if (code?.data) found(code.data);
          }
        } catch {
          /* keep scanning */
        }
      }
      raf = window.setTimeout(() => requestAnimationFrame(loop), 180) as unknown as number;
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        void loop();
      } catch {
        setError("Camera unavailable. Allow camera access, or paste the payment link below.");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [navigate]);

  return (
    <div className="screen">
      <NavBar title="Scan to Pay" back="/send" />
      <div className="video-wrap">
        <video ref={videoRef} playsInline muted />
        <div className="frame" />
      </div>
      <p className="center muted" style={{ margin: "14px 0" }}>Point your camera at a vendor's Swipe QR code</p>
      {error && <div className="error">{error}</div>}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const path = payPathFrom(manual, "qr") ?? (/^@?[a-z0-9._]{3,20}$/i.test(manual.trim()) ? `/pay/@${manual.trim().replace(/^@/, "").toLowerCase()}?src=qr` : null);
          if (path) navigate(path);
          else setError("Enter a Swipe payment link or @username.");
        }}
      >
        <input className="note-input" style={{ maxWidth: "none", borderRadius: 14, height: 50 }} placeholder="…or paste a payment link / @username" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="none" />
        <button className="btn btn-secondary" disabled={!manual.trim()}>Open</button>
      </form>
    </div>
  );
}

type NdefReading = { message: { records: { recordType: string; data?: DataView }[] } };
interface NdefReaderLike {
  scan(o?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(t: "reading", cb: (e: NdefReading) => void): void;
  addEventListener(t: "readingerror", cb: () => void): void;
}

export function Tap() {
  const navigate = useNavigate();
  const supported = typeof window !== "undefined" && "NDEFReader" in window;
  const [state, setState] = useState<"idle" | "scanning" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefReaderLike }).NDEFReader;
      const reader = new Reader();
      abortRef.current = new AbortController();
      await reader.scan({ signal: abortRef.current.signal });
      setState("scanning");
      reader.addEventListener("reading", ({ message }) => {
        for (const r of message.records) {
          if ((r.recordType === "url" || r.recordType === "absolute-url") && r.data) {
            const path = payPathFrom(new TextDecoder().decode(r.data), "nfc");
            if (path) {
              abortRef.current?.abort();
              return navigate(path, { replace: true });
            }
          }
        }
        setMsg("That tag isn't a Swipe payment device.");
      });
      reader.addEventListener("readingerror", () => setMsg("Couldn't read that tag. Try holding it still."));
    } catch {
      setState("error");
      setMsg("NFC permission was denied or NFC is turned off.");
    }
  };

  return (
    <div className="screen">
      <NavBar title="Tap to Pay" back="/send" />
      <div className="pulse"><Nfc size={64} /></div>
      <h2 className="center" style={{ fontSize: 22 }}>{state === "scanning" ? "Ready, hold near the device" : "Tap a vendor's Swipe device"}</h2>
      <p className="center muted" style={{ margin: "8px 8px 20px", lineHeight: 1.5 }}>
        Hold the top of your phone near the vendor's Swipe NFC tag. Swipe Pay opens with the vendor already selected, so you just enter the amount.
      </p>
      {msg && <div className={state === "error" ? "error" : "info"}>{msg}</div>}
      {supported && state !== "scanning" && (
        <button className="btn btn-primary" onClick={start}><Nfc size={20} /> Start NFC reader</button>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Info size={20} style={{ flexShrink: 0, color: "var(--blue)" }} />
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
            {supported
              ? "Most phones also open Swipe tags automatically when unlocked. No need to open this screen first."
              : "Your browser can't read NFC directly, but your phone can: unlock it and hold it near the tag. The payment link opens automatically (iPhone XS+ and most Android phones)."}
          </div>
        </div>
      </div>
      <div className="spacer" />
      <Link to="/scan" className="btn btn-outline">Scan a QR code instead</Link>
    </div>
  );
}
