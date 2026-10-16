import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { avatarClass, initials } from "../lib/format";
import { Backspace, ChevronLeft, Activity, Home, User } from "./icons";

export function DemoRibbon() {
  return <div className="demo-ribbon" role="note">Demo mode · Simulated funds, not real money</div>;
}

export function Avatar({ name, username, size }: { name: string; username: string; size?: "lg" }) {
  return (
    <div className={`avatar ${avatarClass(username)} ${size ?? ""}`} aria-hidden>
      {initials(name)}
    </div>
  );
}

export function NavBar({ title, back, right }: { title: string; back?: string | (() => void); right?: ReactNode }) {
  const navigate = useNavigate();
  const onBack = () => {
    if (typeof back === "function") back();
    else if (typeof back === "string") navigate(back);
    else if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };
  return (
    <header className="navbar">
      <button className="icon-btn" onClick={onBack} aria-label="Back">
        <ChevronLeft size={26} />
      </button>
      <h1>{title}</h1>
      <div>{right}</div>
    </header>
  );
}

export function TabBar() {
  const tabs = [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/profile", label: "Profile", icon: User },
  ];
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          <Icon size={26} />
          {label}
          <span className="pip" />
        </NavLink>
      ))}
    </nav>
  );
}

export function Keypad({ onKey, decimal }: { onKey: (k: string) => void; decimal?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "", "0", "back"];
  return (
    <div className="keypad">
      {keys.map((k, i) =>
        k === "" ? (
          <div key={i} className="key blank" />
        ) : (
          <button
            key={i}
            type="button"
            className="key"
            onClick={() => onKey(k)}
            aria-label={k === "back" ? "Delete" : k === "." ? "Decimal point" : k}
          >
            {k === "back" ? <Backspace size={26} /> : k === "." ? "." : k}
          </button>
        ),
      )}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return <div className="toast" role="status">{message}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const node = msg ? <Toast message={msg} onDone={() => setMsg(null)} /> : null;
  return [node, setMsg] as const;
}

export function Logo({ suffix }: { suffix?: string }) {
  return (
    <div className="logo">
      Swipe<span className="dot">.</span>
      {suffix && <small>{suffix}</small>}
    </div>
  );
}

export function Spinner() {
  return <div className="empty">Loading…</div>;
}

/** Copy text, falling back to a hidden textarea where the Clipboard API isn't available. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
