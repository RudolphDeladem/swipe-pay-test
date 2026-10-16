import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { BASE } from "./lib/api";
import { DemoRibbon, Spinner } from "./components/ui";
import Home from "./pages/Home";
import { Login, Signup, Welcome } from "./pages/Auth";
import { SendMoney, SendTo } from "./pages/Send";
import { PayPage, Receive, Scan, Tap } from "./pages/Pay";
import { Activity, Notifications, Receipt } from "./pages/Activity";
import { About, AddDevice, ComingSoon, DeviceSetup, Devices, InstallApp, Profile } from "./pages/Profile";

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={next === "/" ? "/welcome" : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (me) {
    const next = new URLSearchParams(location.search).get("next");
    return <Navigate to={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} replace />;
  }
  return <>{children}</>;
}

const authed = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter basename={BASE.replace(/\/$/, "") || "/"}>
      <AuthProvider>
        <div className="app">
          <DemoRibbon />
          <Routes>
            <Route path="/welcome" element={<GuestOnly><Welcome /></GuestOnly>} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
            <Route path="/pay/:handle" element={<PayPage />} />
            <Route path="/" element={authed(<Home />)} />
            <Route path="/send" element={authed(<SendMoney />)} />
            <Route path="/send/:username" element={authed(<SendTo />)} />
            <Route path="/receive" element={authed(<Receive />)} />
            <Route path="/scan" element={authed(<Scan />)} />
            <Route path="/tap" element={authed(<Tap />)} />
            <Route path="/add-money" element={authed(<ComingSoon kind="add" />)} />
            <Route path="/withdraw" element={authed(<ComingSoon kind="withdraw" />)} />
            <Route path="/activity" element={authed(<Activity />)} />
            <Route path="/receipt/:reference" element={authed(<Receipt />)} />
            <Route path="/notifications" element={authed(<Notifications />)} />
            <Route path="/profile" element={authed(<Profile />)} />
            <Route path="/profile/devices" element={authed(<Devices />)} />
            <Route path="/profile/devices/new" element={authed(<AddDevice />)} />
            <Route path="/profile/devices/:id" element={authed(<DeviceSetup />)} />
            <Route path="/about" element={<About />} />
            <Route path="/install" element={<InstallApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
