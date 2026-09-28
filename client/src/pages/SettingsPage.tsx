import React, { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  Building2,
  Users,
  CalendarDays,
  Sparkles,
  MessagesSquare,
  ArrowUpRight,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { api } from "../api";
import {
  Row,
  money,
  label,
  Badge,
  ErrorBox,
  Heading,
  LeadTable,
  useData,
} from "../shared";
export default function SettingsPage() {
  const path = useParams().type || "ai";
  const { data, error } = useData(`/settings/${path}`);
  const [form, setForm] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setForm(data);
    setMessage("");
  }, [data]);
  return (
    <div className="page">
      <Heading
        title={`${path === "ai" ? "AI" : path[0].toUpperCase() + path.slice(1)} settings`}
        sub="Configure your private workspace with confidence."
      />
      <ErrorBox error={error} />
      {path === "whatsapp" ? (
        <section className="panel settings-form">
          <h3>Integration status</h3>
          {data &&
            Object.entries(data).map(([k, v]) => (
              <div className="setting-row" key={k}>
                <span>{k}</span>
                <b>{String(v)}</b>
              </div>
            ))}
          <p>
            Credentials are managed in the server’s environment. A configured
            status does not verify a live connection.
          </p>
          <p>Webhook URL: your public API origin + /api/whatsapp/webhook</p>
        </section>
      ) : (
        form && (
          <form
            className="panel settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/settings/${path}`, "PUT", form);
                setMessage("Settings saved.");
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            {Object.entries(form)
              .filter(([k]) => k !== "id")
              .map(([k, v]) => (
                <label key={k}>
                  {k.replace(/([A-Z])/g, " $1")}
                  {typeof v === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={v}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.checked })
                      }
                    />
                  ) : typeof v === "number" ? (
                    <input
                      type="number"
                      step={k === "temperature" ? ".1" : "1"}
                      value={v}
                      onChange={(e) =>
                        setForm({ ...form, [k]: Number(e.target.value) })
                      }
                    />
                  ) : (
                    <textarea
                      rows={k.toLowerCase().includes("instructions") ? 4 : 2}
                      value={Array.isArray(v) ? v.join(", ") : v}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [k]: Array.isArray(v)
                            ? e.target.value.split(",").map((x) => x.trim())
                            : e.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ))}
            <p className="muted">
              Security rules and database-only property facts remain enforced
              independently of these preferences.
            </p>
            <div role="status">{message}</div>
            <button>Save settings</button>
          </form>
        )
      )}
    </div>
  );
}
