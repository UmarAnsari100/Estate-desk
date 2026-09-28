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
export default function Dashboard() {
  const { data: d, error } = useData("/dashboard", 10000);
  const { data: config } = useData("/settings/whatsapp");
  return (
    <div className="page">
      <Heading
        title="Your business, at a glance"
        sub="Keep conversations moving. Turn property enquiries into possibilities."
        action={
          <span className="date">
            {new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        }
      />
      <ErrorBox error={error} />
      <div className="hero">
        <div>
          <Badge>CONNECTED OPERATIONS</Badge>
          <h2>
            Good conversations.
            <br />
            Great opportunities.
          </h2>
          <p>Give every enquiry the attention it deserves.</p>
          <NavLink className="button light" to="/conversations">
            Open inbox <ArrowUpRight size={17} />
          </NavLink>
        </div>
        <div className="hero-art">
          <Building2 size={160} strokeWidth={0.6} />
          <div className="art-pill">
            <span className="dot" /> Your team, in control
          </div>
        </div>
      </div>
      <div className="metrics">
        {[
          ["Total leads", "totalLeads", Users],
          ["Qualified leads", "qualifiedLeads", Sparkles],
          ["Available properties", "availableProperties", Building2],
          ["Viewing requests", "viewingRequests", CalendarDays],
          ["New leads", "newLeads", Plus],
          ["Active conversations", "activeConversations", MessagesSquare],
          ["AI conversations", "aiConversations", Sparkles],
          ["Human takeovers", "humanTakeovers", Users],
        ].map(([name, key, Icon]: any) => (
          <div className="metric" key={key}>
            <div>
              <span>{name}</span>
              <Icon size={19} />
            </div>
            <strong>{d?.[key] ?? "—"}</strong>
            <small>Current workspace total</small>
          </div>
        ))}
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-title">
            <h3>Recent enquiries</h3>
            <NavLink to="/leads">View all ↗</NavLink>
          </div>
          <LeadTable rows={d?.recentLeads || []} />
        </section>
        <section className="panel health">
          <Sparkles />
          <h3>Your assistant’s workspace</h3>
          <p>
            AI handles the first conversation. Your team handles the moments
            that matter.
          </p>
          <div>
            <span>WhatsApp</span>
            <Badge>
              {config?.whatsappConfigured
                ? "Configured · verify live delivery"
                : "Not configured"}
            </Badge>
          </div>
          <div>
            <span>Gemini</span>
            <Badge>
              {config?.geminiConfigured
                ? `Configured · ${config.model}`
                : "Mock responses only"}
            </Badge>
          </div>
          <div>
            <span>Simulation</span>
            <Badge>{config?.mockMode ? "Enabled" : "Disabled"}</Badge>
          </div>
        </section>
      </div>
      {d?.failedJobs?.length > 0 && (
        <section className="panel">
          <h3>Needs attention</h3>
          {d.failedJobs.map((j: Row) => (
            <p key={j.id}>
              {j.error} <NavLink to="/conversations">Review inbox →</NavLink>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
