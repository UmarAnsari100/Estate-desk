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
const initialProperty = {
  propertyCode: "",
  title: "",
  purpose: "SALE",
  propertyType: "HOUSE",
  location: "",
  city: "",
  area: 5,
  areaUnit: "MARLA",
  price: 0,
  bedrooms: 3,
  bathrooms: 3,
  description: "",
  amenities: [],
  images: [],
  status: "AVAILABLE",
  featured: false,
  currency: "PKR",
};
export default function Properties() {
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, error, refresh } = useData(
    `/properties?${new URLSearchParams({ page: String(page), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), ...(query ? { q: query } : {}), ...(purpose ? { purpose } : {}), ...(status ? { status } : {}) })}`,
  );
  const [editing, setEditing] = useState<Row | null>(null);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="page">
      <Heading
        title="Property portfolio"
        sub="A reliable source of truth for every property conversation."
        action={
          <button onClick={() => setEditing({ ...initialProperty })}>
            <Plus size={17} /> Add property
          </button>
        }
      />
      <ErrorBox error={error || saveError} />
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search title or property code"
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
          />
        </div>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          <option value="">All purposes</option>
          <option>SALE</option>
          <option>RENT</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <details className="advanced-filters panel">
        <summary>More filters · location, budget and size</summary>
        <div className="form-grid">
          {[
            "city",
            "location",
            "minimumPrice",
            "maximumPrice",
            "area",
            "bedrooms",
          ].map((key) => (
            <label key={key}>
              {key.replace(/([A-Z])/g, " $1")}
              <input
                type={["city", "location"].includes(key) ? "text" : "number"}
                min="0"
                value={filters[key] || ""}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, [key]: e.target.value });
                }}
              />
            </label>
          ))}
          {Object.entries({
            propertyType: ["HOUSE", "APARTMENT", "PLOT", "COMMERCIAL"],
            areaUnit: ["MARLA", "KANAL", "SQ_FT"],
          }).map(([key, options]) => (
            <label key={key}>
              {key}
              <select
                value={filters[key] || ""}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, [key]: e.target.value });
                }}
              >
                <option value="">Any</option>
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      <div className="property-grid">
        {data?.map((p: Row) => (
          <article className="property-card" key={p.id}>
            <div className="property-cover">
              {p.images?.[0] ? (
                <img src={p.images[0]} alt={p.title} />
              ) : (
                <Building2 size={75} strokeWidth={0.8} />
              )}
              <Badge>
                {p.demo ? "DEMO · " : ""}
                {p.requiresReview ? "REVIEW REQUIRED · " : ""}
                {label(p.status)}
              </Badge>
              <span className="purpose">
                For {p.purpose === "SALE" ? "sale" : "rent"}
              </span>
            </div>
            <div className="property-body">
              <small>
                {p.propertyCode} · {p.city}
              </small>
              <h3>{p.title}</h3>
              <p>{p.location}</p>
              <strong>{money(p.price)}</strong>
              <div className="property-details">
                {p.area} {p.areaUnit} <span>·</span> {p.bedrooms ?? "—"} beds{" "}
                <span>·</span> {p.bathrooms ?? "—"} baths
              </div>
              <button
                className="secondary"
                onClick={() =>
                  setEditing({
                    ...p,
                    price: Number(p.price),
                    area: Number(p.area),
                  })
                }
              >
                Manage property <ArrowUpRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {data?.length === 0 && (
        <div className="empty panel">
          No properties match these filters. Add your inventory to get started.
        </div>
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="secondary"
          disabled={!data || data.length < 30}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      {editing && (
        <div className="modal">
          <form
            className="modal-card"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(
                  `/properties${editing.id ? `/${editing.id}` : ""}`,
                  editing.id ? "PATCH" : "POST",
                  editing,
                );
                setEditing(null);
                refresh();
              } catch (e: any) {
                setSaveError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{editing.id ? "Edit property" : "New property"}</h2>
            <ErrorBox error={saveError} />
            <div className="form-grid">
              {[
                "propertyCode",
                "title",
                "location",
                "city",
                "area",
                "price",
                "bedrooms",
                "bathrooms",
              ].map((k) => (
                <label key={k}>
                  {k.replace(/([A-Z])/g, " $1")}
                  <input
                    required
                    value={editing[k] ?? ""}
                    type={
                      ["area", "price", "bedrooms", "bathrooms"].includes(k)
                        ? "number"
                        : "text"
                    }
                    min={0}
                    step={k === "area" || k === "price" ? ".01" : "1"}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [k]: [
                          "area",
                          "price",
                          "bedrooms",
                          "bathrooms",
                        ].includes(k)
                          ? Number(e.target.value)
                          : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              {Object.entries({
                purpose: ["SALE", "RENT"],
                propertyType: ["HOUSE", "APARTMENT", "PLOT", "COMMERCIAL"],
                areaUnit: ["MARLA", "KANAL", "SQ_FT"],
                status: ["AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE"],
              }).map(([key, values]) => (
                <label key={key}>
                  {key}
                  <select
                    value={editing[key]}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value })
                    }
                  >
                    {values.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label>
              Description
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            {editing.sourceUrl && (
              <div className="source-review">
                <strong>Imported source</strong>
                <p>{editing.sourceReference}</p>
                <a href={editing.sourceUrl} target="_blank" rel="noreferrer">
                  Open published price table
                </a>
                {editing.pricingDetails && (
                  <dl>
                    {Object.entries(editing.pricingDetails)
                      .filter(([key]) => key !== "sourceAvailability")
                      .map(([key, value]) => (
                        <React.Fragment key={key}>
                          <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                          <dd>
                            {key.endsWith("Installments")
                              ? String(value)
                              : money(value)}
                          </dd>
                        </React.Fragment>
                      ))}
                  </dl>
                )}
                {editing.requiresReview && (
                  <small>
                    Confirm current availability and prices before selecting
                    Available. Saving as Available clears the review flag.
                  </small>
                )}
              </div>
            )}
            <label>
              Amenities (one per line)
              <textarea
                value={editing.amenities.join("\n")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    amenities: e.target.value.split("\n"),
                  })
                }
              />
            </label>
            <label>
              HTTPS image URLs (one per line)
              <textarea
                value={editing.images.join("\n")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    images: e.target.value ? e.target.value.split("\n") : [],
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.featured}
                onChange={(e) =>
                  setEditing({ ...editing, featured: e.target.checked })
                }
              />{" "}
              Featured property
            </label>
            <div className="actions">
              <button disabled={busy}>Save property</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              {editing.id && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    try {
                      await api(`/properties/${editing.id}`, "DELETE");
                      setEditing(null);
                      refresh();
                    } catch (e: any) {
                      setSaveError(e.message);
                    }
                  }}
                >
                  Deactivate
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
