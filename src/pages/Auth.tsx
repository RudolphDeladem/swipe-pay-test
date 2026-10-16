import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type PublicUser } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Keypad, Logo, NavBar } from "../components/ui";
import { Gift, Lock, Nfc, Send, ShieldCheck } from "../components/icons";

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function Welcome() {
  const [params] = useSearchParams();
  const qs = params.toString() ? `?${params}` : "";
  return (
    <div className="screen">
      <div className="hero">
        <Logo suffix="Pay" />
        <h1>Tap. Pay. Done.</h1>
        <p>Send and receive money with a username, a QR code or a tap on a Swipe NFC device. Built for everyday payments across Ghana.</p>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="feature">
          <div className="circle c-amber"><Gift size={20} /></div>
          <div><div className="t1">GH₵1,000 in demo funds</div><div className="t2">Every new account starts with a simulated balance to try things out.</div></div>
        </div>
        <div className="feature">
          <div className="circle c-green"><Send size={20} /></div>
          <div><div className="t1">Send by username</div><div className="t2">Pay anyone on Swipe by their @username.</div></div>
        </div>
        <div className="feature">
          <div className="circle c-blue"><Nfc size={20} /></div>
          <div><div className="t1">Tap or scan to pay</div><div className="t2">Link an NFC tag or share a QR code. Customers tap and pay in seconds.</div></div>
        </div>
        <div className="feature">
          <div className="circle c-purple"><ShieldCheck size={20} /></div>
          <div><div className="t1">PIN-protected</div><div className="t2">Every payment is confirmed with your 6-digit Swipe PIN.</div></div>
        </div>
      </div>
      <div className="spacer" />
      <div className="stack" style={{ marginTop: 24 }}>
        <Link to={`/signup${qs}`} className="btn btn-primary">Create a free account</Link>
        <Link to={`/login${qs}`} className="btn btn-outline">I already have an account</Link>
      </div>
      <p className="footer-note">
        Prototype: all balances and transfers are simulated demo funds. They are not real money and can't be withdrawn.
        <br />Swipe.ltd · A product of Spark Point Technology
      </p>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/login", { username, password });
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <NavBar title="Sign in" back={next !== "/" ? next : "/welcome"} />
      {next.startsWith("/pay/") && <div className="info" style={{ marginBottom: 16 }}>Sign in to finish your payment. We'll bring you right back.</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="u">Username</label>
          <div className="prefix-input">
            <span>@</span>
            <input id="u" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !username || !password} style={{ marginTop: 8 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="center muted" style={{ marginTop: 20 }}>
        New to Swipe? <Link to={`/signup?next=${encodeURIComponent(next)}`} style={{ color: "var(--green)", fontWeight: 700 }}>Create an account</Link>
      </p>
    </div>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const { refresh } = useAuth();
  const [step, setStep] = useState<"details" | "pin" | "confirm">("details");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cleanUsername = username.trim().replace(/^@+/, "").toLowerCase();
  const usernameOk = /^[a-z0-9._]{3,20}$/.test(cleanUsername);

  const details = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (!usernameOk) return setError("Username must be 3–20 characters: letters, numbers, dots or underscores.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setStep("pin");
  };

  const create = async (finalPin: string) => {
    setBusy(true);
    setError(null);
    try {
      await api<{ user: PublicUser }>("POST", "/api/auth/signup", { fullName, username: cleanUsername, password, pin: finalPin });
      await refresh();
      navigate(next, { replace: true, state: { welcome: true } });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, "error", "Couldn't create your account.");
      setPin("");
      setPin2("");
      setError(e.message);
      setStep(e.code === "invalid_pin" || e.code === "weak_pin" ? "pin" : "details");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (k: string) => {
    if (busy) return;
    const [val, set] = step === "pin" ? [pin, setPin] : [pin2, setPin2];
    if (k === "back") return set(val.slice(0, -1));
    if (val.length >= 6) return;
    const v = val + k;
    set(v);
    if (v.length < 6) return;
    if (step === "pin") {
      if (/^(\d)\1{5}$/.test(v) || v === "123456" || v === "654321") {
        setError("Choose a PIN that's harder to guess.");
        setTimeout(() => setPin(""), 250);
        return;
      }
      setError(null);
      setTimeout(() => setStep("confirm"), 150);
    } else if (v !== pin) {
      setError("PINs didn't match. Try again.");
      setTimeout(() => { setPin(""); setPin2(""); setStep("pin"); }, 300);
    } else {
      void create(v);
    }
  };

  if (step !== "details") {
    const val = step === "pin" ? pin : pin2;
    return (
      <div className="screen">
        <NavBar title="Create PIN" back={() => { setPin(""); setPin2(""); setError(null); setStep("details"); }} />
        <div className="pin-head">
          <div className="circle c-green"><Lock size={40} /></div>
          <h2>{step === "pin" ? "Create your Swipe PIN" : "Confirm your PIN"}</h2>
          <p>{step === "pin" ? "You'll use this 6-digit PIN to authorise every payment." : "Enter the same 6 digits again."}</p>
        </div>
        <div className="pin-dots">{Array.from({ length: 6 }, (_, i) => <span key={i} className={i < val.length ? "on" : ""} />)}</div>
        {busy && <p className="center muted">Creating your account…</p>}
        {error && <div className="error center">{error}</div>}
        <div className="spacer" />
        <Keypad onKey={onKey} />
      </div>
    );
  }

  return (
    <div className="screen">
      <NavBar title="Create account" back={next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/welcome"} />
      <div className="warn" style={{ marginBottom: 16 }}>
        You'll get <b>GH₵1,000.00 in demo funds</b>. This is simulated money for testing, not real cash.
      </div>
      <form onSubmit={details}>
        <div className="field">
          <label htmlFor="n">Full name</label>
          <input id="n" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ama Mensah" required />
        </div>
        <div className="field">
          <label htmlFor="u">Username</label>
          <div className="prefix-input">
            <span>@</span>
            <input id="u" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="ama.mensah" required />
          </div>
          <span className="hint">Others pay you using this. Letters, numbers, dots and underscores.</span>
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          <span className="hint">At least 8 characters.</span>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" style={{ marginTop: 8 }}>Continue</button>
      </form>
      <p className="center muted" style={{ marginTop: 20 }}>
        Already on Swipe? <Link to={`/login?next=${encodeURIComponent(next)}`} style={{ color: "var(--green)", fontWeight: 700 }}>Sign in</Link>
      </p>
    </div>
  );
}
