import React, { useEffect, useState, useRef } from "react";
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
export default function Conversations() {
  const { data: list, error, refresh } = useData("/conversations", 4000);
  const [selected, setSelected] = useState("");
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [conversation, setConversation] = useState<Row | null>(null);
  const [text, setText] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [search, setSearch] = useState("");
  const { data: config } = useData("/settings/whatsapp");
  const load = () =>
    selected &&
    api(`/conversations/${selected}`)
      .then((value) => {
        if (selectedRef.current === selected) setConversation(value);
      })
      .catch((e) => setActionError(e.message));
  useEffect(() => {
    setConversation(null);
    load();
    if (selected)
      api(`/conversations/${selected}/read`, "POST").catch(() => {});
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [selected]);
  async function action(path: string) {
    try {
      await api(`/conversations/${selected}/${path}`, "POST");
      load();
      refresh();
    } catch (e: any) {
      setActionError(e.message);
    }
  }
  return (
    <div className="page">
      <Heading
        title="Conversations"
        sub="A personal response, with the right person in control."
        action={
          config?.mockMode && (
            <button onClick={() => setSimulate(!simulate)}>
              <Plus size={16} /> Simulate enquiry
            </button>
          )
        }
      />
      <ErrorBox error={error || actionError} />
      {simulate && (
        <form
          className="simulation panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const result = await api(
                "/ai/test",
                "POST",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
              setSelected(result.conversationId);
              refresh();
            } catch (e: any) {
              setActionError(e.message);
            }
          }}
        >
          <Badge>SIMULATION · No WhatsApp message is sent</Badge>
          <input
            name="phone"
            defaultValue="923001234567"
            aria-label="Simulated phone"
            required
            pattern="[0-9]{7,15}"
          />
          <input
            name="name"
            defaultValue="Demo customer"
            aria-label="Customer name"
          />
          <input
            name="text"
            placeholder="5 marla house in Bahria under 2 crore"
            aria-label="Simulated message"
            required
          />
          <button>Run pipeline</button>
        </form>
      )}
      <div className="inbox">
        <div className="conversation-list">
          <div className="inbox-search">
            <Search size={16} />
            <input
              placeholder="Search conversations"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {list
            ?.filter((c: Row) =>
              `${c.customer.name} ${c.customer.whatsappNumber}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((c: Row) => (
              <button
                className={`conversation-item ${selected === c.id ? "selected" : ""}`}
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <div className="avatar">{c.customer.name[0]}</div>
                <div>
                  <b>{c.customer.name}</b>
                  <small>{c.messages[0]?.content.slice(0, 55)}</small>
                  <span>
                    <Badge>
                      {c.humanTakeover ? "Human" : "AI"}
                      {c.simulated ? " · demo" : ""}
                    </Badge>{" "}
                    {c.lead && label(c.lead.status)}
                  </span>
                </div>
                <span className="conversation-time">
                  {new Date(c.lastMessageAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {c.unread > 0 && <i>{c.unread}</i>}
                </span>
              </button>
            ))}
          {list?.length === 0 && (
            <div className="empty">
              Your inbox is ready for its first enquiry.
            </div>
          )}
        </div>
        {conversation ? (
          <div className="chat">
            <div className="chat-header">
              <div>
                <b>{conversation.customer.name}</b>
                <small>
                  {conversation.customer.whatsappNumber} ·{" "}
                  {conversation.simulated
                    ? "Simulated conversation"
                    : "WhatsApp"}
                </small>
              </div>
              <Badge>
                {conversation.humanTakeover
                  ? "Human takeover"
                  : conversation.aiEnabled
                    ? "AI on"
                    : "AI off"}
              </Badge>
              <button
                className="secondary"
                onClick={() =>
                  action(conversation.humanTakeover ? "resume" : "takeover")
                }
              >
                {conversation.humanTakeover ? "Resume AI" : "Take over"}
              </button>
            </div>
            <div className="customer-strip">
              {money(conversation.lead?.maximumBudget)} <span>·</span>{" "}
              {conversation.lead?.preferredLocation || "Location pending"}{" "}
              <span>·</span> {conversation.lead?.preferredArea || "—"}{" "}
              {conversation.lead?.areaUnit || ""}
            </div>
            <div className="messages">
              {conversation.messages.map((m: Row) => (
                <div className={`message ${m.sender.toLowerCase()}`} key={m.id}>
                  <span>
                    {m.sender === "AI"
                      ? "✧ AI assistant"
                      : m.sender === "ADMIN"
                        ? "Your team"
                        : conversation.customer.name}
                  </span>
                  <p dir="auto">{m.content}</p>
                  <small>
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {m.status}
                  </small>
                </div>
              ))}
            </div>
            <form
              className="composer"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const result = await api("/messages", "POST", {
                    conversationId: selected,
                    content: text,
                  });
                  if (result?.status === "UNKNOWN")
                    setActionError(
                      "Delivery uncertain. Review the message before retrying.",
                    );
                  setText("");
                  load();
                } catch (e: any) {
                  setActionError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  conversation.humanTakeover
                    ? "Write a reply…"
                    : "Take over to send a personal reply"
                }
                disabled={!conversation.humanTakeover || busy}
              />
              <button
                disabled={!conversation.humanTakeover || !text.trim() || busy}
                aria-label="Send reply"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        ) : (
          <div className="empty chat-empty">
            <MessagesSquare size={48} />
            <h3>Every conversation starts here</h3>
            <p>Select an enquiry to see the full conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
