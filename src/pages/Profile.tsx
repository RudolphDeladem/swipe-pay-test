import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, payLink, type Device } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cedis } from "../lib/money";
import { dateTime } from "../lib/format";
import { isIOS, isStandalone, useInstallPrompt } from "../lib/install";
import { Avatar, NavBar, Spinner, TabBar, copyText, useToast } from "../components/ui";
import { Check, ChevronRight, Copy, Info, LogOut, Nfc, Plus, ScanQr, Smartphone, Tag, Trash, Wallet } from "../components/icons";

export function Profile() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  const items = [
    { to: "/profile/devices", icon: Nfc, cls: "c-green", t1: "Devices", t2: "Link NFC tags to your payment page" },
    { to: "/receive", icon: ScanQr, cls: "c-blue", t1: "My payment link & QR", t2: `${window.location.host}/pay/@${me.user.username}` },
    { to: "/install", icon: Smartphone, cls: "c-purple", t1: "Install the app", t2: isStandalone() ? "Installed ✓" : "Open taps straight in Swipe Pay" },
    { to: "/about", icon: Info, cls: "c-amber", t1: "About this demo", t2: "How Swipe Pay works" },
  ];
  return (
    <div className="screen with-tabs">
      <header className="navbar" style={{ gridTemplateColumns: "1fr" }}><h1>Profile</h1></header>
      <div className="card center" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <Avatar name={me.user.fullName} username={me.user.username} size="lg" />
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>{me.user.fullName}</div>
        <div className="muted">@{me.user.username}</div>
        <div className="status-pill active" style={{ marginTop: 6 }}><Wallet size={14} /> {cedis(me.wallet.balance)} demo balance</div>
      </div>
      <div className="list" style={{ marginTop: 16 }}>
        {items.map(({ to, icon: Icon, cls, t1, t2 }) => (
          <Link key={to} to={to} className="list-item">
            <div className={`circle ${cls}`} style={{ width: 44, height: 44 }}><Icon size={22} /></div>
            <div className="grow"><div className="t1">{t1}</div><div className="t2">{t2}</div></div>
            <ChevronRight className="chev" />
          </Link>
        ))}
      </div>
      <button className="btn btn-danger" style={{ marginTop: 20 }} onClick={async () => { await logout(); navigate("/welcome", { replace: true }); }}>
        <LogOut size={20} /> Sign out
      </button>
      <p className="footer-note">Account verification isn't required in this prototype.<br />Swipe.ltd · Spark Point Technology</p>
      <TabBar />
    </div>
  );
}

export function Devices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  useEffect(() => {
    api<{ devices: Device[] }>("GET", "/api/devices").then((r) => setDevices(r.devices)).catch(() => setDevices([]));
  }, []);

  return (
    <div className="screen">
      <NavBar title="Devices" back="/profile" />
      <p className="muted" style={{ marginBottom: 14, lineHeight: 1.5 }}>
        A Swipe device is an NFC tag that opens your payment page with one tap. Link your own tag, no vendor registration needed.
      </p>
      {devices === null ? (
        <Spinner />
      ) : devices.length === 0 ? (
        <div className="card center" style={{ padding: 28 }}>
          <div className="pulse" style={{ width: 96, height: 96, margin: "4px auto 16px" }}><Nfc size={44} /></div>
          <div style={{ fontWeight: 700 }}>No devices yet</div>
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Add an NFC tag so customers can tap to pay you.</div>
        </div>
      ) : (
        <div className="list">
          {devices.map((d) => (
            <Link key={d.id} to={`/profile/devices/${d.id}`} className="list-item">
              <div className="circle c-green" style={{ width: 44, height: 44 }}><Tag size={22} /></div>
              <div className="grow">
                <div className="t1">{d.label}</div>
                <div className="t2">{d.payments} payment{d.payments === 1 ? "" : "s"} · added {new Date(d.createdAt).toLocaleDateString("en-GB")}</div>
              </div>
              <span className={`status-pill ${d.status}`}>{d.status === "active" ? "Active" : "Not tested"}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="spacer" />
      <Link to="/profile/devices/new" className="btn btn-primary" style={{ marginTop: 20 }}><Plus size={20} /> Add a Device</Link>
    </div>
  );
}

export function AddDevice() {
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"nfc_tag" | "swipe_device">("nfc_tag");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { device } = await api<{ device: Device }>("POST", "/api/devices", { label, kind });
      navigate(`/profile/devices/${device.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add device.");
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <NavBar title="Add a Device" back="/profile/devices" />
      <form onSubmit={submit} style={{ display: "contents" }}>
        <div className="field">
          <label htmlFor="label">Device name</label>
          <input id="label" placeholder="e.g. Shop counter" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          <span className="hint">Shown to customers when they tap, and on your receipts.</span>
        </div>
        <div className="section-title" style={{ marginTop: 4 }}>Type</div>
        <div className="list">
          {([
            ["nfc_tag", "My own NFC tag", "Any writable NTAG213/215/216 sticker, card or keyfob", Tag],
            ["swipe_device", "Swipe-branded device", "Supplied by Swipe; may arrive preconfigured", Smartphone],
          ] as const).map(([k, t1, t2, Icon]) => (
            <button type="button" key={k} className="list-item" onClick={() => setKind(k)} aria-pressed={kind === k}>
              <div className={`circle ${kind === k ? "c-green" : ""}`} style={{ width: 44, height: 44, background: kind === k ? undefined : "var(--key)" }}><Icon size={22} /></div>
              <div className="grow"><div className="t1">{t1}</div><div className="t2" style={{ whiteSpace: "normal" }}>{t2}</div></div>
              {kind === k && <Check style={{ color: "var(--green)" }} />}
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
        <div className="spacer" />
        <button className="btn btn-primary" disabled={busy} style={{ marginTop: 20 }}>{busy ? "Creating link…" : "Generate payment link"}</button>
      </form>
    </div>
  );
}

type NdefWriter = { write: (msg: { records: { recordType: string; data: string }[] }) => Promise<void> };

export function DeviceSetup() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writeState, setWriteState] = useState<"idle" | "waiting" | "done" | "error">("idle");
  const [toast, showToast] = useToast();
  const { me } = useAuth();
  const nfcSupported = typeof window !== "undefined" && "NDEFReader" in window;

  useEffect(() => {
    api<{ devices: Device[] }>("GET", "/api/devices")
      .then((r) => {
        const d = r.devices.find((x) => String(x.id) === id);
        if (d) setDevice(d);
        else setError("Device not found.");
      })
      .catch(() => setError("Couldn't load device."));
  }, [id]);

  if (error) return <div className="screen"><NavBar title="Device" back="/profile/devices" /><div className="error">{error}</div></div>;
  if (!device || !me) return <div className="screen"><NavBar title="Device" back="/profile/devices" /><Spinner /></div>;

  const link = payLink(me.user.username, device.code);

  const write = async () => {
    setWriteState("waiting");
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
      await new Reader().write({ records: [{ recordType: "url", data: link }] });
      setWriteState("done");
    } catch {
      setWriteState("error");
    }
  };

  const update = async (body: object) => {
    try {
      const r = await api<{ device: Device }>("PATCH", `/api/devices/${device.id}`, body);
      return r.device;
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Update failed");
      return null;
    }
  };

  return (
    <div className="screen">
      <NavBar title={device.label} back="/profile/devices" />
      <div className="center" style={{ marginBottom: 16 }}>
        <span className={`status-pill ${device.status}`}>
          {device.status === "active" ? <><Check size={14} /> Active{device.activatedAt ? ` since ${dateTime(device.activatedAt)}` : ""}</> : "Not tested yet"}
        </span>
      </div>

      <div className="section-title" style={{ marginTop: 0 }}>1 · Your device's payment link</div>
      <div className="link-box">
        <code>{link.replace(/^https?:\/\//, "")}</code>
        <button className="btn btn-sm btn-secondary" onClick={async () => (await copyText(link)) && showToast("Link copied")}><Copy size={16} /> Copy</button>
      </div>

      <div className="section-title">2 · Write it to your NFC tag</div>
      {nfcSupported ? (
        <div className="card">
          <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>Tap <b>Write link</b>, then hold your tag against the back of your phone until it confirms.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={write} disabled={writeState === "waiting"}>
            <Nfc size={20} /> {writeState === "waiting" ? "Hold tag near phone…" : writeState === "done" ? "Write again" : "Write link"}
          </button>
          {writeState === "done" && <div className="info" style={{ marginTop: 10 }}>Link written ✓ Now test it below.</div>}
          {writeState === "error" && <div className="error">Couldn't write the tag. Make sure NFC is on and the tag is writable (not locked).</div>}
        </div>
      ) : (
        <div className="card">
          <ol className="steps">
            <li>Install a free NFC writer app such as “NFC Tools” on an NFC-enabled phone (this browser can't write tags directly; Chrome on Android can).</li>
            <li>Choose <b>Write → Add a record → URL/URI</b> and paste the link above.</li>
            <li>Tap <b>Write</b> and hold your tag against the phone until it confirms.</li>
          </ol>
        </div>
      )}

      <div className="section-title">3 · Test and activate</div>
      <div className="card">
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Lock and unlock your phone, then tap the tag. It should open <b>your</b> payment page (@{me.user.username}), where you can activate it. Or confirm here once tested.
        </p>
        {device.status !== "active" ? (
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={async () => { const d = await update({ status: "active" }); if (d) { setDevice(d); showToast("Device activated"); } }}>
            <Check size={20} /> I tested it. Mark as Active
          </button>
        ) : (
          <div className="status-pill active" style={{ marginTop: 12 }}><Check size={14} /> Customers can tap to pay you</div>
        )}
      </div>

      <div className="info" style={{ marginTop: 16, fontSize: 13 }}>
        The link only identifies you as the recipient. It can never authorise a payment by itself. Every payment needs the payer's PIN.
      </div>

      <button
        className="btn btn-ghost"
        style={{ marginTop: 12, color: "var(--red)" }}
        onClick={async () => {
          if (!window.confirm(`Remove “${device.label}”? Tapping it will no longer be linked to this device.`)) return;
          if (await update({ status: "disabled" })) navigate("/profile/devices", { replace: true });
        }}
      >
        <Trash size={18} /> Remove device
      </button>
      {toast}
    </div>
  );
}

export function ComingSoon({ kind }: { kind: "add" | "withdraw" }) {
  const add = kind === "add";
  return (
    <div className="screen">
      <NavBar title={add ? "Add Money" : "Withdraw Money"} back="/" />
      <div className="pin-head">
        <div className={`circle ${add ? "c-amber" : "c-red"}`}>{add ? <Plus size={40} /> : <Wallet size={40} />}</div>
        <h2>Coming soon</h2>
        <p style={{ maxWidth: 320 }}>
          {add
            ? "Funding your wallet from MTN MoMo, Telecel Cash and AirtelTigo Money will arrive once payment infrastructure and regulatory approvals are in place."
            : "Withdrawals to Mobile Money will arrive once payment infrastructure and regulatory approvals are in place."}
        </p>
      </div>
      <div className="warn" style={{ marginTop: 24 }}>
        This prototype uses <b>demo funds only</b>. Your GH₵ balance is simulated and can't be withdrawn or exchanged for cash.
      </div>
      <div className="spacer" />
      <Link to="/" className="btn btn-primary">Back to wallet</Link>
    </div>
  );
}

export function About() {
  return (
    <div className="screen">
      <NavBar title="About Swipe Pay" back="/profile" />
      <div className="card">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>How it works</h2>
        <ol className="steps">
          <li><b>Create an account</b> and get a unique @username plus GH₵1,000 in demo funds.</li>
          <li><b>Find the recipient</b> by username, by tapping their NFC device, or by scanning their QR code.</li>
          <li><b>Enter the amount.</b> The recipient's username is shown prominently with their real name underneath.</li>
          <li><b>Review and authorise</b> with your 6-digit Swipe PIN.</li>
          <li><b>Money moves instantly</b> between Swipe wallets. Both of you get a receipt and reference.</li>
        </ol>
      </div>
      <div className="warn" style={{ marginTop: 16 }}>
        This is a prototype. All balances and transfers are simulated demo funds. They are not real money, can't be withdrawn to Mobile Money, and have no cash value.
        Real-money transfers, Mobile Money deposits and withdrawals require payment infrastructure and regulatory arrangements before launch.
      </div>
      <p className="footer-note">Swipe.ltd · A product of Spark Point Technology</p>
    </div>
  );
}

export function InstallApp() {
  const { canInstall, install } = useInstallPrompt();
  const [toast, showToast] = useToast();
  const installed = isStandalone();
  const ios = isIOS();
  return (
    <div className="screen">
      <NavBar title="Install the app" back="/profile" />
      <div className="pin-head">
        <div className="circle c-green"><Smartphone size={40} /></div>
        <h2>{installed ? "Swipe Pay is installed" : "Get Swipe Pay on your home screen"}</h2>
        <p style={{ maxWidth: 320 }}>
          {ios
            ? "Adds Swipe Pay to your home screen so it opens full-screen like an app."
            : "Once installed, tapping a Swipe NFC device or opening a payment link opens Swipe Pay directly instead of Chrome."}
        </p>
      </div>
      <div className="spacer" />
      {installed ? (
        <div className="info center">You're using the installed app ✓</div>
      ) : canInstall ? (
        <button className="btn btn-primary" onClick={async () => (await install()) && showToast("Installed! Find Swipe Pay on your home screen")}>
          <Smartphone size={20} /> Install Swipe Pay
        </button>
      ) : ios ? (
        <div className="card">
          <ol className="steps">
            <li>Open this page in <b>Safari</b>.</li>
            <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          </ol>
          <div className="warn" style={{ fontSize: 13 }}>On iPhone, tapping an NFC tag still opens Safari first. Apple only lets App Store apps open directly.</div>
        </div>
      ) : (
        <div className="card">
          <ol className="steps">
            <li>Open this page in <b>Chrome</b> on your Android phone.</li>
            <li>Tap the <b>⋮</b> menu, then <b>Install app</b> (or <b>Add to Home screen → Install</b>).</li>
            <li>Tap a Swipe tag. If Android asks, choose <b>Swipe Pay</b> and <b>Always</b>.</li>
          </ol>
        </div>
      )}
      {toast}
    </div>
  );
}
