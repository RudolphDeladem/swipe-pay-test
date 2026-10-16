import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type PublicUser, type Receipt } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cedis, displayAmount, pressAmountKey, toPesewas } from "../lib/money";
import { channelLabel } from "../lib/format";
import { Avatar, Keypad, NavBar } from "./ui";
import { Lock, Nfc, Pencil, ScanQr } from "./icons";

type Channel = "username" | "nfc" | "qr" | "link";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RecipientHead({ recipient, badge }: { recipient: PublicUser; badge?: ReactNode }) {
  return (
    <div className="recipient-head">
      <Avatar name={recipient.fullName} username={recipient.username} size="lg" />
      <div className="handle">@{recipient.username}</div>
      <div className="name">{recipient.fullName}</div>
      {badge}
    </div>
  );
}

export function ChannelBadge({ channel, deviceLabel }: { channel: Channel; deviceLabel?: string | null }) {
  if (channel === "username") return null;
  const Icon = channel === "qr" ? ScanQr : Nfc;
  return (
    <span className="status-pill active" style={{ marginTop: 6 }}>
      <Icon size={14} /> {channel === "nfc" && deviceLabel ? `Tapped · ${deviceLabel}` : channelLabel[channel]}
    </span>
  );
}

/**
 * Amount entry → review → PIN, for a known recipient.
 * When the viewer isn't signed in, `onNeedsAuth` is called with the entered amount instead of proceeding.
 */
export function PayFlow({
  recipient,
  channel,
  deviceCode,
  deviceLabel,
  initialAmount = "",
  title = "Send Money",
  onNeedsAuth,
  onExit,
}: {
  recipient: PublicUser;
  channel: Channel;
  deviceCode?: string | null;
  deviceLabel?: string | null;
  initialAmount?: string;
  title?: string;
  onNeedsAuth?: (amount: string) => void;
  onExit?: () => void;
}) {
  const navigate = useNavigate();
  const { me, refresh } = useAuth();
  const [step, setStep] = useState<"amount" | "confirm" | "pin">("amount");
  const [amount, setAmount] = useState(/^\d*(\.\d{0,2})?$/.test(initialAmount) ? initialAmount : "");
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  // One key per review session, so a retried submit can never charge twice.
  const [idemKey, setIdemKey] = useState(newKey);

  const pesewas = toPesewas(amount);
  const balance = me?.wallet.balance ?? 0;

  const toConfirm = () => {
    setError(null);
    if (!me && onNeedsAuth) return onNeedsAuth(amount);
    if (pesewas <= 0) return setError("Enter an amount to send.");
    if (pesewas > balance) return setError(`Insufficient demo balance. You have ${cedis(balance)}.`);
    if (pesewas > 500_000) return setError("Demo transfers are limited to GH₵5,000.00 each.");
    setIdemKey(newKey());
    setStep("confirm");
  };

  const submit = async (fullPin: string) => {
    setBusy(true);
    setError(null);
    try {
      const { receipt } = await api<{ receipt: Receipt }>("POST", "/api/transfers", {
        recipient: recipient.username,
        amount: pesewas,
        note: note.trim() || null,
        pin: fullPin,
        channel,
        deviceCode: deviceCode ?? undefined,
        idempotencyKey: idemKey,
      });
      void refresh();
      navigate(`/receipt/${receipt.reference}`, { replace: true, state: { fresh: true } });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong.");
      setPin("");
      if (err.code === "incorrect_pin") {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        const left = Number(err.data.attemptsLeft);
        setError(`Incorrect PIN.${Number.isFinite(left) ? ` ${left} attempt${left === 1 ? "" : "s"} left.` : ""}`);
      } else if (err.code === "pin_locked") {
        setError(err.message);
      } else {
        setStep("confirm");
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPinKey = (k: string) => {
    if (busy) return;
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 6) void submit(next);
  };

  if (step === "amount")
    return (
      <div className="screen">
        <NavBar title={title} back={onExit} />
        <RecipientHead recipient={recipient} badge={<ChannelBadge channel={channel} deviceLabel={deviceLabel} />} />
        <div className="amount-display" aria-live="polite">
          <span className="cur">GH₵</span>
          <span className="caret" />
          <span className={`val ${amount ? "" : "empty"}`}>{displayAmount(amount)}</span>
        </div>
        {editingNote ? (
          <input
            className="note-input"
            autoFocus
            maxLength={120}
            placeholder="What's it for?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setEditingNote(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingNote(false)}
          />
        ) : (
          <button className="note-pill" onClick={() => setEditingNote(true)}>
            <Pencil size={16} /> {note ? note : "Add a note (optional)"}
          </button>
        )}
        {me && <p className="center muted" style={{ fontSize: 13, marginTop: 10 }}>Demo balance: {cedis(balance)}</p>}
        {error && <div className="error">{error}</div>}
        <div className="spacer" />
        <Keypad decimal onKey={(k) => setAmount((a) => pressAmountKey(a, k))} />
        <button className="btn btn-primary" disabled={pesewas <= 0} onClick={toConfirm}>
          {me || !onNeedsAuth ? "Continue" : "Sign in to pay"}
        </button>
      </div>
    );

  if (step === "confirm")
    return (
      <div className="screen">
        <NavBar title="Confirm Payment" back={() => setStep("amount")} />
        <RecipientHead recipient={recipient} badge={<ChannelBadge channel={channel} deviceLabel={deviceLabel} />} />
        <div className="summary">
          <div className="row"><span className="k">Amount</span><span className="v">{cedis(pesewas)}</span></div>
          <div className="row"><span className="k">Fee</span><span className="v">{cedis(0)}</span></div>
          <div className="row total"><span className="k">Total</span><span className="v">{cedis(pesewas)}</span></div>
        </div>
        <div className="summary" style={{ marginTop: 12 }}>
          <div className="row"><span className="k">Note</span><span className="v">{note.trim() || "No note"}</span></div>
          <div className="row"><span className="k">Paying with</span><span className="v">Swipe demo wallet</span></div>
        </div>
        <p className="center muted" style={{ fontSize: 13, marginTop: 14 }}>
          Check the username before you pay. This moves simulated demo funds only.
        </p>
        {error && <div className="error">{error}</div>}
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => { setError(null); setPin(""); setStep("pin"); }}>
          Confirm and Send
        </button>
      </div>
    );

  return (
    <div className="screen">
      <NavBar title="Enter PIN" back={() => { setError(null); setStep("confirm"); }} />
      <div className="pin-head">
        <div className="circle c-green"><Lock size={40} /></div>
        <h2>Enter your PIN</h2>
        <p>Confirm this payment of {cedis(pesewas)} to @{recipient.username} with your Swipe Pay PIN.</p>
      </div>
      <div className={`pin-dots ${shake ? "shake" : ""}`} aria-label={`${pin.length} of 6 digits entered`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      {busy && <p className="center muted">Processing payment…</p>}
      {error && <div className="error center">{error}</div>}
      <div className="spacer" />
      <Keypad onKey={onPinKey} />
    </div>
  );
}
