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
export default function Viewings() {
  const { data, error, refresh } = useData("/viewings");
  const [err, setErr] = useState("");
  return (
    <div className="page">
      <Heading
        title="Viewing requests"
        sub="Customer requests stay unconfirmed until your team reviews them."
      />
      <ErrorBox error={error || err} />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Property</th>
                <th>Preferred date / time</th>
                <th>Status</th>
                <th>Update</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((v: Row) => (
                <tr key={v.id}>
                  <td>
                    {v.customerName || v.conversation.customer.name}
                    <small>{v.conversation.customer.whatsappNumber}</small>
                  </td>
                  <td>{v.property?.title || "Property needs clarification"}</td>
                  <td>
                    {v.requestedDate || "Date needed"}
                    <small>{v.preferredTime || "Time needed"}</small>
                  </td>
                  <td>
                    <Badge>{label(v.status)}</Badge>
                  </td>
                  <td>
                    <select
                      aria-label="Viewing status"
                      value={v.status}
                      onChange={async (e) => {
                        try {
                          await api(`/viewings/${v.id}`, "PATCH", {
                            status: e.target.value,
                          });
                          refresh();
                        } catch (e: any) {
                          setErr(e.message);
                        }
                      }}
                    >
                      {["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.length === 0 && (
          <div className="empty">No viewing requests yet.</div>
        )}
        <p className="muted notice">
          Status changes are internal. Take over the conversation to notify the
          customer.
        </p>
      </section>
    </div>
  );
}
