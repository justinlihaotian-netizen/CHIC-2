"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/Shell";
import { IconSearch } from "@/components/Icons";
import { Notice, StatusPill, TechTag, maskPhone, techOf } from "@/components/ui";
import { getJSON } from "@/lib/clientFetch";
import { shortDateLabel, todayString } from "@/lib/time";
import type { Appointment, Client } from "@/lib/types";

type ListResponse = { clients: Client[]; total: number; hasMore: boolean };

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "") // ignore anything in brackets
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export default function Clients() {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const requestId = useRef(0);

  // Search as you type (after a short pause).
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const r = await getJSON<ListResponse>(`/api/clients?q=${encodeURIComponent(query)}&page=1`);
      if (id !== requestId.current) return;
      if (r.ok) {
        setClients(r.data.clients);
        setTotal(r.data.total);
        setHasMore(r.data.hasMore);
        setPage(1);
        setError(null);
      } else setError(r.error);
    }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  async function loadMore() {
    const next = page + 1;
    const r = await getJSON<ListResponse>(`/api/clients?q=${encodeURIComponent(query)}&page=${next}`);
    if (r.ok) {
      setClients((c) => [...(c ?? []), ...r.data.clients]);
      setHasMore(r.data.hasMore);
      setPage(next);
    } else setError(r.error);
  }

  return (
    <div className="page">
      <PageHeader title="Clients">
        <span className="muted">{clients ? `${total} client${total === 1 ? "" : "s"}` : ""}</span>
      </PageHeader>
      <div className="page-body">
        <label className="search">
          <IconSearch size={18} />
          <input
            type="search"
            placeholder="Search by name, phone or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        {error && <Notice kind="error">⚠️ {error}</Notice>}
        {clients === null ? (
          <p className="muted">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="empty-note">No clients found.</p>
        ) : (
          <ul className="client-list">
            {clients.map((c) => (
              <li key={c.id}>
                <button className="client-row" onClick={() => setOpenId(c.id)}>
                  <span className="avatar">{initials(c.name)}</span>
                  <span className="client-main">
                    <span className="client-title">{c.name}</span>
                    <span className="muted">
                      {maskPhone(c.phone)}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                  <span className="muted client-since">
                    {c.dateAdded ? `Since ${shortDateLabel(todayString(Date.parse(c.dateAdded)))}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button className="load-more" onClick={loadMore}>
            Show more
          </button>
        )}
      </div>
      {openId && <ClientPanel id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClientPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ client: Client; events: Appointment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJSON<{ client: Client; events: Appointment[] }>(`/api/clients/${id}`).then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
  }, [id]);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const past = data.events.filter((e) => e.start < now && e.status !== "cancelled");
    const upcoming = data.events.filter((e) => e.start >= now && e.status !== "cancelled").reverse();
    const counts = new Map<string, number>();
    for (const e of past) counts.set(e.techId, (counts.get(e.techId) ?? 0) + 1);
    const fav = [...counts].sort((a, b) => b[1] - a[1])[0];
    return {
      visits: past.filter((e) => e.status !== "noshow").length,
      noShows: data.events.filter((e) => e.status === "noshow").length,
      cancelled: data.events.filter((e) => e.status === "cancelled").length,
      lastVisit: past.find((e) => e.status !== "noshow"),
      upcoming,
      favourite: fav ? techOf(fav[0]) : null,
    };
  }, [data]);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="panel client-panel" style={{ ["--c" as string]: "#5b6b82" }}>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        {error && <Notice kind="error">⚠️ {error}</Notice>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && stats && (
          <>
            <h2>{data.client.name}</h2>
            <dl>
              <dt>Phone</dt>
              <dd>{data.client.phone ? <a href={`tel:${data.client.phone}`}>{data.client.phone}</a> : "—"}</dd>
              <dt>Email</dt>
              <dd className="break">{data.client.email ?? "—"}</dd>
              {data.client.tags.length > 0 && (
                <>
                  <dt>Tags</dt>
                  <dd className="tags">{data.client.tags.map((t) => <span key={t} className="tag">{t}</span>)}</dd>
                </>
              )}
            </dl>

            <div className="mini-stats">
              <div><b>{stats.visits}</b><span>Visits</span></div>
              <div><b>{stats.noShows}</b><span>No-shows</span></div>
              <div><b>{stats.cancelled}</b><span>Cancelled</span></div>
            </div>
            <p className="muted small">
              {stats.lastVisit ? `Last visit ${shortDateLabel(stats.lastVisit.date)}` : "No visits yet"}
              {stats.favourite ? ` · Usually sees ${stats.favourite.name}` : ""}
            </p>

            {stats.upcoming.length > 0 && (
              <>
                <h3>Upcoming</h3>
                <ul className="visit-list">
                  {stats.upcoming.map((e) => (
                    <li key={e.id}>
                      <Link href={`/?date=${e.date}`} className="visit">
                        <span className="visit-date">{shortDateLabel(e.date)}</span>
                        <span className="visit-main">
                          {e.service || "—"}
                          <span className="muted"> · {e.timeLabel}</span>
                        </span>
                        <TechTag id={e.techId} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3>History</h3>
            {data.events.filter((e) => e.start < Date.now()).length === 0 ? (
              <p className="empty-note">No past bookings.</p>
            ) : (
              <ul className="visit-list">
                {data.events
                  .filter((e) => e.start < Date.now())
                  .map((e) => (
                    <li key={e.id} className="visit">
                      <span className="visit-date">{shortDateLabel(e.date)}</span>
                      <span className="visit-main">
                        {e.service || "—"}
                        {e.requested && <span className="heart">♥</span>}
                      </span>
                      <span className="visit-side">
                        <TechTag id={e.techId} />
                        <StatusPill status={e.status} />
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </aside>
    </>
  );
}
