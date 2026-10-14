"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Shell";
import { ALL_TECHS, ClientName, Notice, StatusPill, TechTag } from "@/components/ui";
import { getJSON } from "@/lib/clientFetch";
import { addDays, addMonths, daysBetween, longDateLabel, todayString } from "@/lib/time";
import { STATUS_LABEL, type Appointment, type Status } from "@/lib/types";

const MAX_DAYS = 62;

function presetRange(preset: string, today: string): [string, string] {
  const month = today.slice(0, 7);
  switch (preset) {
    case "30":
      return [addDays(today, -29), today];
    case "this-month":
      return [`${month}-01`, today];
    case "last-month": {
      const last = addMonths(month, -1);
      return [`${last}-01`, addDays(`${month}-01`, -1)];
    }
    default:
      return [addDays(today, -6), today];
  }
}

/** Past bookings for a date range, newest first, with technician and status filters. */
export default function History() {
  const today = todayString();
  const [preset, setPreset] = useState("7");
  const [range, setRange] = useState<[string, string]>(() => presetRange("7", today));
  const [tech, setTech] = useState("all");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [events, setEvents] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [from, to] = range;
  const tooLong = daysBetween(from, to) + 1 > MAX_DAYS;

  useEffect(() => {
    if (from > to || tooLong) return;
    let alive = true;
    setEvents(null);
    getJSON<{ events: Appointment[] }>(`/api/events?start=${from}&end=${to}&all=1`).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setEvents(r.data.events);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [from, to, tooLong]);

  const filtered = useMemo(
    () =>
      (events ?? [])
        .filter((e) => (tech === "all" || e.techId === tech) && (status === "all" || e.status === status))
        .sort((a, b) => b.start - a.start),
    [events, tech, status],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const e of filtered) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map];
  }, [filtered]);

  const count = (s: Status) => filtered.filter((e) => e.status === s).length;

  return (
    <div className="page">
      <PageHeader title="History" />
      <div className="page-body">
        <div className="filters">
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              if (e.target.value !== "custom") setRange(presetRange(e.target.value, today));
            }}
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="custom">Custom dates…</option>
          </select>
          {preset === "custom" && (
            <span className="date-pair">
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} aria-label="From" />
              <span className="muted">to</span>
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} aria-label="To" />
            </span>
          )}
          <select value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Technician">
            <option value="all">All technicians</option>
            {ALL_TECHS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)} aria-label="Status">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {tooLong && <Notice>Please choose {MAX_DAYS} days or fewer.</Notice>}
        {error && <Notice kind="error">⚠️ {error}</Notice>}

        {events === null && !tooLong ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="chips">
              <span className="chip"><b>{filtered.length}</b> bookings</span>
              <span className="chip good">Checked in <b>{count("showed")}</b></span>
              <span className="chip bad">No-show <b>{count("noshow")}</b></span>
              <span className="chip">Cancelled <b>{count("cancelled")}</b></span>
            </div>
            {groups.length === 0 && <p className="empty-note">No bookings match.</p>}
            {groups.map(([day, list]) => (
              <section key={day} className="hist-day">
                <h2>
                  <Link href={`/?date=${day}`}>{longDateLabel(day)}</Link>
                  <span className="muted"> · {list.length}</span>
                </h2>
                <div className="hist-table" role="table">
                  {list.map((e) => (
                    <div key={e.id} className={`hist-row${e.status === "cancelled" ? " cancelled" : ""}`} role="row">
                      <span className="hist-time" role="cell">{e.timeLabel}</span>
                      <span className="hist-client" role="cell">
                        <ClientName name={e.clientName} partySize={e.partySize} requested={e.requested} />
                        <span className="hist-service">{e.service || "—"}</span>
                      </span>
                      <span role="cell"><TechTag id={e.techId} /></span>
                      <span role="cell"><StatusPill status={e.status} /></span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
