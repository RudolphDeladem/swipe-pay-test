import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type PublicUser } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, NavBar, Spinner } from "../components/ui";
import { PayFlow } from "../components/PayFlow";
import { ChevronRight, Nfc, ScanQr, Search } from "../components/icons";

function UserRow({ u }: { u: PublicUser }) {
  return (
    <Link to={`/send/${u.username}`} className="list-item">
      <Avatar name={u.fullName} username={u.username} />
      <div className="grow">
        <div className="t1">@{u.username}</div>
        <div className="t2">{u.fullName}</div>
      </div>
      <ChevronRight className="chev" />
    </Link>
  );
}

export function SendMoney() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[] | null>(null);
  const [recent, setRecent] = useState<PublicUser[] | null>(null);

  useEffect(() => {
    api<{ users: PublicUser[] }>("GET", "/api/users/recent").then((r) => setRecent(r.users)).catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/^@+/, "");
    if (term.length < 2) return setResults(null);
    const t = setTimeout(() => {
      api<{ users: PublicUser[] }>("GET", `/api/users/search?q=${encodeURIComponent(term)}`)
        .then((r) => setResults(r.users))
        .catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const list = results ?? recent;
  return (
    <div className="screen">
      <NavBar title="Send Money" back="/" />
      <label className="search">
        <Search size={22} />
        <input
          placeholder="Enter username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="search"
          aria-label="Search by username or name"
        />
      </label>

      <div className="section-title">{results ? "Results" : "Recent"}</div>
      {list === null ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="list"><div className="empty" style={{ padding: 24 }}>
          {results ? "No Swipe users match that search." : "No recent recipients yet. Search for a username above."}
        </div></div>
      ) : (
        <div className="list">{list.map((u) => <UserRow key={u.username} u={u} />)}</div>
      )}

      <Link to="/tap" className="pay-card green">
        <div className="circle c-green" style={{ width: 44, height: 44, background: "#fff" }}><Nfc size={24} /></div>
        <div className="grow"><div className="t1">Tap to Pay</div><div className="t2">Tap a vendor's NFC device</div></div>
        <ChevronRight />
      </Link>
      <Link to="/scan" className="pay-card blue">
        <div className="circle c-blue" style={{ width: 44, height: 44, background: "#fff" }}><ScanQr size={24} /></div>
        <div className="grow"><div className="t1">Scan to Pay</div><div className="t2">Scan a vendor's QR code</div></div>
        <ChevronRight />
      </Link>
    </div>
  );
}

export function SendTo() {
  const { username = "" } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: PublicUser }>("GET", `/api/users/${encodeURIComponent(username)}`)
      .then((r) => setRecipient(r.user))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load recipient."));
  }, [username]);

  if (error)
    return (
      <div className="screen">
        <NavBar title="Send Money" back="/send" />
        <div className="error">{error}</div>
      </div>
    );
  if (!recipient) return <div className="screen"><NavBar title="Send Money" back="/send" /><Spinner /></div>;
  if (recipient.username === me?.user.username)
    return (
      <div className="screen">
        <NavBar title="Send Money" back="/send" />
        <div className="info">You can't send money to yourself. Share your payment link from Receive Money instead.</div>
      </div>
    );
  return <PayFlow recipient={recipient} channel="username" onExit={() => navigate("/send")} />;
}
