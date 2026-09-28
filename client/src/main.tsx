import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import {
  Building2,
  LayoutDashboard,
  MessagesSquare,
  Users,
  CalendarDays,
  Sparkles,
  Settings,
  Phone,
  ArrowUpRight,
  Plus,
  Send,
  LogOut,
  Search,
  Menu,
  X,
} from "lucide-react";
import { api } from "./api";
import "./style.css";
import { Row, Badge, ErrorBox } from "./shared";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import Conversations from "./pages/Conversations";
import Leads from "./pages/Leads";
import Viewings from "./pages/Viewings";
import SettingsPage from "./pages/SettingsPage";
function App() {
  const [user, setUser] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  if (loading) return <div className="loading">Opening Estate Desk…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return (
    <div className="shell">
      <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand">
          <Building2 />
          <span>
            estate<span className="brand-light">desk</span>
            <small>YOUR PROPERTY WORKSPACE</small>
          </span>
        </div>
        <button
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        >
          <X size={21} />
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {[
            ["/", "Overview", LayoutDashboard],
            ["/conversations", "Conversations", MessagesSquare],
            ["/properties", "Properties", Building2],
            ["/leads", "Leads", Users],
            ["/viewings", "Viewing Requests", CalendarDays],
          ].map(([path, title, Icon]: any) => (
            <NavLink
              end
              to={path}
              key={path}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={19} />
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="workspace-label">CONFIGURATION</div>
        <nav>
          {[
            ["ai", "AI Settings", Sparkles],
            ["business", "Business Settings", Settings],
            ["whatsapp", "WhatsApp Settings", Phone],
          ].map(([path, title, Icon]: any) => (
            <NavLink
              to={`/settings/${path}`}
              key={path}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={19} />
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name?.[0]}</div>
          <div>
            <b>{user.name}</b>
            <small>Administrator</small>
          </div>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={() =>
              api("/auth/logout", "POST").then(() => setUser(null))
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main>
        <header>
          <button
            className="menu-toggle"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <span>
            Company workspace <span className="slash">/</span> Management
            console
          </span>
          <Badge>Private workspace</Badge>
        </header>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/viewings" element={<Viewings />} />
          <Route path="/settings/:type" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: Row) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<boolean | null>(null);
  useEffect(() => {
    api("/auth/setup-status")
      .then((data) => setSetup(data.setupRequired))
      .catch(() =>
        setError(
          "Cannot reach the server. Check the VS Code terminal for startup errors.",
        ),
      );
  }, []);
  return (
    <div className="login">
      <div className="login-story">
        <Building2 size={42} />
        <h1>
          A better home for
          <br />
          every conversation.
        </h1>
        <p>
          Your properties, leads and WhatsApp conversations.
          <br />
          One private workspace for your team.
        </p>
        <span>ESTATE DESK · REAL ESTATE OPERATIONS</span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const fields = Object.fromEntries(new FormData(e.currentTarget));
            if (setup) {
              if (fields.password !== fields.confirmPassword)
                throw new Error("Passwords do not match");
              await api("/auth/setup", "POST", fields);
              setSetup(false);
            }
            onLogin(
              await api("/auth/login", "POST", {
                email: fields.email,
                password: fields.password,
              }),
            );
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">
          {setup ? "FIRST-TIME SETUP" : "WELCOME BACK"}
        </span>
        <h2>
          {setup
            ? "Create your administrator account"
            : "Sign in to your workspace"}
        </h2>
        <p className="muted">
          {setup
            ? "Choose your own email and password. This account stays saved when you restart."
            : "Use the account you created for this workspace. Preview credentials only work in the temporary preview."}
        </p>
        {setup && (
          <label>
            Your name
            <input name="name" autoComplete="name" required maxLength={100} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={setup ? 14 : undefined}
            maxLength={72}
            autoComplete={setup ? "new-password" : "current-password"}
          />
        </label>
        {setup && (
          <>
            <small>Use a password of at least 14 characters.</small>
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={72}
              />
            </label>
          </>
        )}
        <ErrorBox error={error} />
        <button disabled={busy || setup === null}>
          {busy
            ? "Please wait…"
            : setup
              ? "Create account & sign in"
              : "Sign in"}{" "}
          <ArrowUpRight size={17} />
        </button>
      </form>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
