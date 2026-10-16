import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError, type Receipt as ReceiptT } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cedis } from "../lib/money";
import { channelLabel, dateTime, dayLabel, timeOnly } from "../lib/format";
import { Avatar, NavBar, Spinner, TabBar, copyText, useToast } from "../components/ui";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Gift } from "../components/icons";
import { useLiveRefresh } from "./Home";

function TxRow({ t }: { t: ReceiptT }) {
  const cp = t.counterparty;
  const incoming = t.direction === "received";
  return (
    <Link to={`/receipt/${t.reference}`} className="list-item">
      {t.kind === "demo_credit" || !cp ? (
        <div className="avatar c-amber"><Gift size={22} /></div>
      ) : (
        <Avatar name={cp.fullName} username={cp.username} />
      )}
      <div className="grow">
        <div className="t1">{t.kind === "demo_credit" ? "Demo welcome balance" : `@${cp?.username}`}</div>
        <div className="t2">
          {incoming ? "Received" : "Sent"} · {timeOnly(t.createdAt)}
          {t.channel === "nfc" ? " · Tap" : t.channel === "qr" ? " · QR" : ""}
          {t.note ? ` · ${t.note}` : ""}
        </div>
      </div>
      <div className={`amt ${incoming ? "in" : ""}`}>{incoming ? "+" : "−"}{cedis(t.amount)}</div>
    </Link>
  );
}

function grouped(items: ReceiptT[]) {
  const groups: { label: string; items: ReceiptT[] }[] = [];
  for (const t of items) {
    const label = dayLabel(t.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

export function Activity() {
  const { me } = useAuth();
  const [items, setItems] = useState<ReceiptT[] | null>(null);
  const balance = me?.wallet.balance;
  useLiveRefresh();

  useEffect(() => {
    api<{ transactions: ReceiptT[] }>("GET", "/api/transactions").then((r) => setItems(r.transactions)).catch(() => setItems([]));
  }, [balance]);

  return (
    <div className="screen with-tabs">
      <header className="navbar" style={{ gridTemplateColumns: "1fr" }}><h1>Activity</h1></header>
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="empty">No transactions yet.</div>
      ) : (
        grouped(items).map((g) => (
          <section key={g.label}>
            <div className="date-head">{g.label}</div>
            <div className="list">{g.items.map((t) => <TxRow key={t.reference} t={t} />)}</div>
          </section>
        ))
      )}
      <TabBar />
    </div>
  );
}

export function Receipt() {
  const { reference = "" } = useParams();
  const location = useLocation();
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh;
  const [r, setR] = useState<ReceiptT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    api<{ receipt: ReceiptT }>("GET", `/api/transactions/${encodeURIComponent(reference)}`)
      .then((d) => setR(d.receipt))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load receipt."));
  }, [reference]);

  if (error) return <div className="screen"><NavBar title="Receipt" back="/activity" /><div className="error">{error}</div></div>;
  if (!r) return <div className="screen"><NavBar title="Receipt" back="/activity" /><Spinner /></div>;

  const incoming = r.direction === "received";
  const cp = r.counterparty;
  return (
    <div className="screen">
      <NavBar title={fresh ? "Payment sent" : "Receipt"} back={fresh ? "/" : "/activity"} />
      <div className={fresh ? "success-mark" : `success-mark`} style={fresh ? undefined : { width: 72, height: 72, boxShadow: "0 0 0 8px var(--green-soft)" }}>
        {incoming ? <ArrowDownLeft size={fresh ? 48 : 34} /> : fresh ? <Check size={48} /> : <ArrowUpRight size={34} />}
      </div>
      <div className="center">
        <div className="muted" style={{ fontWeight: 600 }}>
          {r.kind === "demo_credit" ? "Demo funds added" : incoming ? `Received from @${cp?.username}` : `Sent to @${cp?.username}`}
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", margin: "6px 0" }}>{cedis(r.amount)}</div>
        <span className="status-pill active"><Check size={14} /> Completed</span>
      </div>
      <div className="summary">
        {cp && <div className="row"><span className="k">{incoming ? "From" : "To"}</span><span className="v">{cp.fullName}<br /><span className="muted" style={{ fontWeight: 500 }}>@{cp.username}</span></span></div>}
        <div className="row"><span className="k">Amount</span><span className="v">{cedis(r.amount)}</span></div>
        <div className="row"><span className="k">Fee</span><span className="v">{cedis(r.fee)}</span></div>
        {r.note && <div className="row"><span className="k">Note</span><span className="v">{r.note}</span></div>}
        <div className="row"><span className="k">Method</span><span className="v">{channelLabel[r.channel]}{r.deviceLabel ? ` · ${r.deviceLabel}` : ""}</span></div>
        <div className="row"><span className="k">Date</span><span className="v">{dateTime(r.createdAt)}</span></div>
        <div className="row">
          <span className="k">Reference</span>
          <button className="v" style={{ display: "inline-flex", gap: 6, alignItems: "center" }} onClick={async () => (await copyText(r.reference)) && showToast("Reference copied")}>
            {r.reference} <Copy size={15} />
          </button>
        </div>
      </div>
      <p className="footer-note">Demo transaction. Simulated funds with no cash value.</p>
      <div className="spacer" />
      <div className="stack">
        <Link to="/" className="btn btn-primary">Done</Link>
        {fresh && cp && <Link to={`/send/${cp.username}`} className="btn btn-ghost">Send again</Link>}
      </div>
      {toast}
    </div>
  );
}

export function Notifications() {
  const { refresh } = useAuth();
  const [items, setItems] = useState<ReceiptT[] | null>(null);
  useEffect(() => {
    api<{ notifications: ReceiptT[] }>("GET", "/api/notifications")
      .then((r) => setItems(r.notifications))
      .catch(() => setItems([]))
      .finally(() => api("POST", "/api/notifications/seen").then(() => refresh()).catch(() => {}));
  }, [refresh]);

  return (
    <div className="screen">
      <NavBar title="Notifications" back="/" />
      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="empty">No notifications yet. Payments you receive will show up here.</div>
      ) : (
        <div className="list">
          {items.map((t) => (
            <Link key={t.reference} to={`/receipt/${t.reference}`} className="list-item">
              <div className="avatar c-green"><ArrowDownLeft size={22} /></div>
              <div className="grow">
                <div className="t1" style={{ whiteSpace: "normal" }}>@{t.counterparty?.username} sent you {cedis(t.amount)}</div>
                <div className="t2">{dateTime(t.createdAt)}{t.note ? ` · “${t.note}”` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
