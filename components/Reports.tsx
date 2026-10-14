"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Shell";
import { ALL_TECHS, Notice } from "@/components/ui";
import { getJSON } from "@/lib/clientFetch";
import { CLOSE_HOUR, OPEN_HOUR } from "@/config/salon";
import { addDays, addMonths, dayOfWeek, hourLabel, minutesIntoDay, shortDateLabel, todayString } from "@/lib/time";
import type { Appointment } from "@/lib/types";

const TOTAL_COLOR = "#64748B"; // neutral slate for salon-wide totals (never a technician colour)
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function periodRange(period: string, today: string): [string, string] {
  const month = today.slice(0, 7);
  const weekStart = addDays(today, -dayOfWeek(today));
  switch (period) {
    case "last-week":
      return [addDays(weekStart, -7), addDays(weekStart, -1)];
    case "this-month":
      return [`${month}-01`, addDays(`${addMonths(month, 1)}-01`, -1)];
    case "last-month":
      return [`${addMonths(month, -1)}-01`, addDays(`${month}-01`, -1)];
    case "30":
      return [addDays(today, -29), today];
    default:
      return [weekStart, addDays(weekStart, 6)];
  }
}

const hours = (mins: number) => Math.round((mins / 60) * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export default function Reports() {
  const today = todayString();
  const [period, setPeriod] = useState("this-week");
  const [events, setEvents] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, to] = periodRange(period, today);

  useEffect(() => {
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
  }, [from, to]);

  const r = useMemo(() => {
    const all = events ?? [];
    const booked = all.filter((e) => e.status !== "cancelled");
    const mins = (list: Appointment[]) => list.reduce((s, e) => s + (e.end - e.start) / 60000, 0);

    const perTech = ALL_TECHS.map((t) => {
      const mine = all.filter((e) => e.techId === t.id);
      const b = mine.filter((e) => e.status !== "cancelled");
      return {
        tech: t,
        bookings: b.length,
        hours: hours(mins(b)),
        showed: b.filter((e) => e.status === "showed").length,
        noshow: b.filter((e) => e.status === "noshow").length,
        cancelled: mine.filter((e) => e.status === "cancelled").length,
        requested: b.filter((e) => e.requested).length,
      };
    }).filter((row) => row.bookings || row.cancelled || row.tech.id !== "unassigned");

    const byWeekday = WEEKDAYS.map((label, i) => ({ label, value: booked.filter((e) => dayOfWeek(e.date) === i).length }));

    let lo = OPEN_HOUR;
    let hi = CLOSE_HOUR - 1;
    for (const e of booked) {
      const h = Math.floor(minutesIntoDay(e.start, e.date) / 60);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    const byHour = Array.from({ length: hi - lo + 1 }, (_, i) => {
      const h = lo + i;
      return { label: hourLabel(h).replace(" ", "").toLowerCase(), value: booked.filter((e) => Math.floor(minutesIntoDay(e.start, e.date) / 60) === h).length };
    });

    // Same service typed with different capitals counts as one ("Shellac manicure" = "Shellac Manicure").
    const svc = new Map<string, { label: string; count: number }>();
    for (const e of booked) {
      const label = e.service.trim().replace(/\s+/g, " ") || "(no service)";
      const key = label.toLowerCase();
      const entry = svc.get(key) ?? { label, count: 0 };
      entry.count += 1;
      svc.set(key, entry);
    }
    const sorted: [string, number][] = [...svc.values()].map((v) => [v.label, v.count] as [string, number]).sort((a, b) => b[1] - a[1]);
    const services = sorted.slice(0, 8).map(([label, value]) => ({ label, value }));
    const rest = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
    if (rest) services.push({ label: `Other (${sorted.length - 8} services)`, value: rest });

    return {
      bookings: booked.length,
      hours: hours(mins(booked)),
      showed: booked.filter((e) => e.status === "showed").length,
      noshow: booked.filter((e) => e.status === "noshow").length,
      cancelled: all.length - booked.length,
      requested: booked.filter((e) => e.requested).length,
      groups: booked.filter((e) => e.partySize > 1).length,
      perTech,
      byWeekday,
      byHour,
      services,
    };
  }, [events]);

  return (
    <div className="page">
      <PageHeader title="Reports">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          <option value="this-week">This week</option>
          <option value="last-week">Last week</option>
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="30">Last 30 days</option>
        </select>
      </PageHeader>
      <div className="page-body wide">
        <p className="muted period-label">
          {shortDateLabel(from)} – {shortDateLabel(to)}
          {to > today ? " · includes upcoming bookings" : ""}
        </p>
        {error && <Notice kind="error">⚠️ {error}</Notice>}
        {events === null && !error ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="tiles">
              <Tile label="Bookings" value={r.bookings} />
              <Tile label="Hours booked" value={r.hours} />
              <Tile label="Checked in" value={r.showed} />
              <Tile label="No-shows" value={r.noshow} note={r.bookings ? `${pct(r.noshow, r.bookings)}% of bookings` : undefined} />
              <Tile label="Cancelled" value={r.cancelled} />
              <Tile label="Requested ♥" value={`${pct(r.requested, r.bookings)}%`} note={`${r.requested} bookings`} />
              <Tile label="Group visits" value={r.groups} note="bookings in a party of 2+" />
            </div>

            <div className="charts">
              <section className="card">
                <h2>Bookings by technician</h2>
                <HBars
                  rows={r.perTech.map((t) => ({
                    label: t.tech.name,
                    value: t.bookings,
                    color: t.tech.color,
                    tip: `${t.tech.name}: ${t.bookings} bookings · ${t.hours} h`,
                  }))}
                />
              </section>
              <section className="card">
                <h2>Busiest days</h2>
                <Columns rows={r.byWeekday} unit="bookings" />
              </section>
              <section className="card">
                <h2>Busiest start times</h2>
                <Columns rows={r.byHour} unit="bookings" />
              </section>
              <section className="card">
                <h2>Top services</h2>
                {r.services.length ? (
                  <HBars rows={r.services.map((s) => ({ ...s, color: TOTAL_COLOR, tip: `${s.label}: ${s.value}` }))} wideLabels />
                ) : (
                  <p className="empty-note">No bookings in this period.</p>
                )}
              </section>
            </div>

            <section className="card">
              <h2>Technician summary</h2>
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Technician</th>
                      <th>Bookings</th>
                      <th>Hours</th>
                      <th>Checked in</th>
                      <th>No-shows</th>
                      <th>Cancelled</th>
                      <th>Requested ♥</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.perTech.map((t) => (
                      <tr key={t.tech.id}>
                        <td>
                          <span className="tech-tag">
                            <span className="dot" style={{ background: t.tech.color }} />
                            {t.tech.name}
                          </span>
                        </td>
                        <td>{t.bookings}</td>
                        <td>{t.hours}</td>
                        <td>{t.showed}</td>
                        <td>{t.noshow}</td>
                        <td>{t.cancelled}</td>
                        <td>{t.requested}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

type BarRow = { label: string; value: number; color: string; tip: string };

/** Horizontal bars: label on the left, value at the bar's tip. */
function HBars({ rows, wideLabels }: { rows: BarRow[]; wideLabels?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={`hbars${wideLabels ? " wide-labels" : ""}`}>
      {rows.map((r) => (
        <div key={r.label} className="hbar-row">
          <span className="hbar-label" title={r.label}>{r.label}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} data-tip={r.tip} tabIndex={0} />
            <span className="hbar-value">{r.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Columns from a shared baseline, value on each cap, labels underneath. */
function Columns({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="columns" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>
      {rows.map((r) => (
        <div key={r.label} className="col-cell">
          <span className="col-plot">
            <span className="col-value">{r.value || ""}</span>
            <span
              className="col-bar"
              style={{ height: `${(r.value / max) * 100}%`, background: TOTAL_COLOR }}
              data-tip={`${r.label}: ${r.value} ${unit}`}
              tabIndex={0}
            />
          </span>
          <span className="col-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
