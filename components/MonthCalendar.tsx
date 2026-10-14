"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/Shell";
import { ALL_TECHS, Notice } from "@/components/ui";
import { getJSON } from "@/lib/clientFetch";
import { addDays, addMonths, dayOfWeek, monthLabel, todayString } from "@/lib/time";
import type { Appointment } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month view: how busy each day is, per technician. Tap a day to open it on the board. */
export default function MonthCalendar() {
  const today = todayString();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [events, setEvents] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 6 weeks, starting on the Sunday before the 1st.
  const days = useMemo(() => {
    const first = `${month}-01`;
    const start = addDays(first, -dayOfWeek(first));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  useEffect(() => {
    let alive = true;
    setEvents(null);
    getJSON<{ events: Appointment[] }>(`/api/events?start=${days[0]}&end=${days[41]}`).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setEvents(r.data.events);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [days]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const e of events ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [events]);

  return (
    <div className="page">
      <PageHeader title="Calendar">
        <div className="seg">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
          <button onClick={() => setMonth(today.slice(0, 7))}>This month</button>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">›</button>
        </div>
      </PageHeader>
      <div className="page-body wide">
        <div className="month-title">
          <h2>{monthLabel(month)}</h2>
          {events && (
            <span className="muted">
              {events.filter((e) => e.date.startsWith(month)).length} bookings this month
            </span>
          )}
        </div>
        {error && <Notice kind="error">⚠️ {error}</Notice>}
        <div className={`month-grid${events === null ? " loading" : ""}`}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="month-dow">{d}</div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <Link
                key={d}
                href={`/?date=${d}`}
                className={`month-day${inMonth ? "" : " other"}${d === today ? " today" : ""}${d < today ? " past" : ""}`}
              >
                <span className="month-num">{Number(d.slice(8))}</span>
                {list.length > 0 && (
                  <>
                    <span className="month-count">
                      <b>{list.length}</b> <span className="wide-only">booking{list.length === 1 ? "" : "s"}</span>
                    </span>
                    <span className="month-techs">
                      {ALL_TECHS.map((t) => {
                        const n = list.filter((e) => e.techId === t.id).length;
                        return n ? (
                          <span key={t.id} className="month-tech" title={`${t.name}: ${n}`}>
                            <span className="dot" style={{ background: t.color }} />
                            <span className="wide-only">{n}</span>
                          </span>
                        ) : null;
                      })}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
        <div className="legend">
          {ALL_TECHS.map((t) => (
            <span key={t.id} className="tech-tag">
              <span className="dot" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
