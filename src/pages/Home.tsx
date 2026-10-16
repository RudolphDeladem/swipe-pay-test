import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cedis } from "../lib/money";
import { Logo, TabBar, useToast } from "../components/ui";
import { Bell, ChevronRight, Eye, EyeOff, Plus, ScanQr, Send, ShieldCheck, Wallet } from "../components/icons";

function useBalanceVisibility() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("swipe.hideBalance") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setHidden((h) => {
      try {
        localStorage.setItem("swipe.hideBalance", h ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !h;
    });
  return [hidden, toggle] as const;
}

/** Re-fetch the wallet periodically and on focus so incoming transfers show up live. */
export function useLiveRefresh(intervalMs = 8000) {
  const { refresh } = useAuth();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void refresh();
    const id = setInterval(tick, intervalMs);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, intervalMs]);
}

export default function Home() {
  const { me } = useAuth();
  const [hidden, toggle] = useBalanceVisibility();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, showToast] = useToast();
  useLiveRefresh();

  useEffect(() => {
    if ((location.state as { welcome?: boolean } | null)?.welcome) {
      showToast("Welcome! GH₵1,000.00 demo funds added 🎉");
      navigate(".", { replace: true, state: null });
    }
  }, [location.state, navigate, showToast]);

  if (!me) return null;
  const unread = me.unreadNotifications;

  const actions = [
    { to: "/send", title: "Send Money", icon: Send, cls: "c-green" },
    { to: "/receive", title: "Receive Money", icon: ScanQr, cls: "c-blue" },
    { to: "/add-money", title: "Add Money", icon: Plus, cls: "c-amber", sub: "Coming soon" },
    { to: "/withdraw", title: "Withdraw Money", icon: Wallet, cls: "c-red", sub: "Coming soon" },
  ];

  return (
    <div className="screen with-tabs">
      <div className="topbar">
        <Logo />
        <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`}>
          <Bell size={28} />
          {unread > 0 && <span className="badge-dot">{unread > 9 ? "9+" : unread}</span>}
        </Link>
      </div>

      <section className="balance-card" aria-label="Wallet balance">
        <div className="label">Wallet Balance</div>
        <div className="amount">{hidden ? "GH₵ ••••••" : cedis(me.wallet.balance)}</div>
        <button className="eye" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"}>
          {hidden ? <EyeOff size={24} /> : <Eye size={24} />}
        </button>
        <div className="chips">
          <span className="chip"><ShieldCheck size={16} /> Active Account</span>
          {me.wallet.isDemo && <span className="chip demo">Demo funds</span>}
        </div>
      </section>

      <div className="actions">
        {actions.map(({ to, title, icon: Icon, cls, sub }) => (
          <Link key={to} to={to} className="action">
            <div className="row">
              <div className={`circle ${cls}`}><Icon size={28} /></div>
              <ChevronRight size={22} />
            </div>
            <div className="title">{title}</div>
            {sub && <div className="sub">{sub}</div>}
          </Link>
        ))}
      </div>

      <p className="footer-note">Signed in as @{me.user.username}. Demo balances are simulated and have no cash value.</p>
      {toast}
      <TabBar />
    </div>
  );
}
