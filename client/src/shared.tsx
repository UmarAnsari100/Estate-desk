import React, { useEffect, useState, useRef } from "react";
import { api } from "./api";
export type Row = Record<string, any>;
export const money = (value: any) =>
  value ? `PKR ${Number(value).toLocaleString("en-PK")}` : "Not specified";
export const label = (s: string) => s.replaceAll("_", " ").toLowerCase();
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function useData(path: string, interval = 0) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const activePath = useRef(path);
  activePath.current = path;
  const refresh = () =>
    api(path)
      .then((v) => {
        if (activePath.current !== path) return;
        setData(v);
        setError("");
      })
      .catch((e) => {
        if (activePath.current === path) setError(e.message);
      });
  useEffect(() => {
    setData(null);
    refresh();
    if (interval) {
      const t = setInterval(refresh, interval);
      return () => clearInterval(t);
    }
  }, [path]);
  return { data, error, refresh };
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;
}
export function Heading({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <span className="eyebrow">ESTATE DESK</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action}
    </div>
  );
}
export function LeadTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Requirement</th>
            <th>Budget</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>
                <b>{l.name || l.phone}</b>
                <small>
                  {l.phone}
                  {l.conversation?.simulated ? " · SIMULATED" : ""}
                </small>
              </td>
              <td>
                {l.preferredLocation || "Not specified"}
                <small>
                  {l.propertyType
                    ? label(l.propertyType)
                    : "Qualifying enquiry"}
                </small>
              </td>
              <td>{money(l.maximumBudget)}</td>
              <td>
                <Badge>{label(l.status)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">New enquiries will appear here.</div>
      )}
    </div>
  );
}
