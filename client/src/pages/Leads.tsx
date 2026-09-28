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
export default function Leads() {
  const [status, setStatus] = useState("");
  const { data, error, refresh } = useData(
    `/leads${status ? `?status=${status}` : ""}`,
  );
  const [selected, setSelected] = useState<Row | null>(null);
  const [err, setErr] = useState("");
  const statuses = [
    "NEW",
    "QUALIFYING",
    "QUALIFIED",
    "VIEWING_REQUESTED",
    "FOLLOW_UP",
    "WON",
    "LOST",
  ];
  return (
    <div className="page">
      <Heading
        title="Your lead pipeline"
        sub="From first enquiry to the next chapter."
      />
      <ErrorBox error={error || err} />
      <div className="tabs">
        {["", ...statuses].map((s) => (
          <button
            className={status === s ? "active" : ""}
            onClick={() => setStatus(s)}
            key={s}
          >
            {s ? label(s) : "All leads"}
          </button>
        ))}
      </div>
      <section className="panel">
        <LeadTable rows={data || []} />
        {data?.map((l: Row) => (
          <div className="lead-actions" key={l.id}>
            <span>
              {l.name || l.phone} · {l.purpose || "Purpose pending"} ·{" "}
              {l.preferredArea || "—"} {l.areaUnit} · Last contact{" "}
              {new Date(l.conversation.lastMessageAt).toLocaleDateString()} ·
              Created {new Date(l.createdAt).toLocaleDateString()}
            </span>
            <button className="secondary" onClick={() => setSelected({ ...l })}>
              Update lead
            </button>
          </div>
        ))}
      </section>
      {selected && (
        <div className="modal">
          <form
            className="modal-card small-modal"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/leads/${selected.id}`, "PATCH", {
                  status: selected.status,
                  notes: selected.notes || "",
                });
                setSelected(null);
                refresh();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <h2>{selected.name || selected.phone}</h2>
            <label>
              Status
              <select
                value={selected.status}
                onChange={(e) =>
                  setSelected({ ...selected, status: e.target.value })
                }
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Internal notes
              <textarea
                value={selected.notes || ""}
                onChange={(e) =>
                  setSelected({ ...selected, notes: e.target.value })
                }
              />
            </label>
            <div className="actions">
              <button>Save lead</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
