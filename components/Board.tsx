"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY_END_HOUR, DAY_START_HOUR, SALON_NAME, TECHNICIANS, UNASSIGNED, type Technician } from "@/config/salon";
import { addDays, clockLabel, hourLabel, longDateLabel, minutesIntoDay, todayString } from "@/lib/time";
import type { Appointment } from "@/lib/types";
import BookingPanel from "@/components/BookingPanel";

const PX_PER_MIN = 2; // 15 minutes = 30px tall
const REFRESH_MS = 20_000; // re-read GoHighLevel every 20 seconds
const COLUMNS: Technician[] = [...TECHNICIANS, UNASSIGNED];
const techById = new Map(COLUMNS.map((t) => [t.id, t]));

/** Mix a "#RRGGBB" colour with white; amount 0–1 of the colour. Works on older iPads. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

type Placed = Appointment & { top: number; height: number; lane: number; lanes: number; minutes: number };

/** Side-by-side lanes for appointments that overlap within one technician's column. */
function layoutColumn(items: Appointment[], date: string, rangeStartMin: number): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const a of sorted) {
    if (a.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= a.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = a.end;
    clusterEnd = Math.max(clusterEnd, a.end);

    const startMin = minutesIntoDay(a.start, date);
    const minutes = Math.round((a.end - a.start) / 60000);
    const p: Placed = {
      ...a,
      minutes,
      top: (startMin - rangeStartMin) * PX_PER_MIN,
      height: Math.max(minutes * PX_PER_MIN - 2, 24),
      lane,
      lanes: 1,
    };
    cluster.push(p);
    placed.push(p);
  }
  closeCluster();
  return placed;
}

export default function Board({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [events, setEvents] = useState<Appointment[]>([]);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const requestId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

  const load = useCallback(async (d: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/events?date=${d}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload(); // PIN cookie expired → show the PIN screen
        return;
      }
      const data = await res.json().catch(() => null);
      if (id !== requestId.current) return; // a newer request already started
      if (!res.ok || !data || "error" in data) {
        setError(data?.error ?? "Something went wrong loading appointments. We'll keep trying.");
      } else {
        setEvents(data.events);
        setLoadedDate(d);
        setLastUpdated(data.fetchedAt);
        setError(null);
      }
    } catch {
      if (id === requestId.current) setError("Can't reach the board's server. Check the internet connection — we'll keep trying.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Load when the date changes, and keep the address bar in sync (?date=…).
  useEffect(() => {
    setSelected(null);
    load(date);
    const url = new URL(window.location.href);
    if (date === todayString()) url.searchParams.delete("date");
    else url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  }, [date, load]);

  // Auto-refresh every minute, and right away when the iPad wakes up.
  useEffect(() => {
    const timer = setInterval(() => load(dateRef.current), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load(dateRef.current);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Keep an open panel up to date after a refresh; close it if the booking left this day.
  useEffect(() => {
    if (!selected || loadedDate !== date) return;
    const fresh = events.find((e) => e.id === selected.id);
    if (!fresh) setSelected(null);
    else if (fresh !== selected) setSelected(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Hide the "Saved" message after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Move the red "now" line.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Close the side panel with the Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = loadedDate === date ? events : [];
  const isToday = date === todayString(now);

  // Visible hours: 9 AM–8 PM, stretched if an appointment falls outside.
  const { startHour, endHour } = useMemo(() => {
    let s = DAY_START_HOUR;
    let e = DAY_END_HOUR;
    for (const a of shown) {
      s = Math.min(s, Math.floor(minutesIntoDay(a.start, date) / 60));
      e = Math.max(e, Math.ceil(minutesIntoDay(a.end, date) / 60));
    }
    return { startHour: Math.max(0, s), endHour: Math.min(24, e) };
  }, [shown, date]);

  const rangeStartMin = startHour * 60;
  const bodyHeight = (endHour - startHour) * 60 * PX_PER_MIN;

  const byColumn = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const col of COLUMNS) {
      map.set(col.id, layoutColumn(shown.filter((a) => a.techId === col.id), date, rangeStartMin));
    }
    return map;
  }, [shown, date, rangeStartMin]);

  const nowMin = minutesIntoDay(now, date);
  const nowTop = (nowMin - rangeStartMin) * PX_PER_MIN;
  const showNow = isToday && nowTop >= 0 && nowTop <= bodyHeight;

  // When opening today, scroll so the current time is near the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loadedDate !== date) return;
    el.scrollTop = showNow ? Math.max(0, nowTop - 90) : 0;
    // only when a new day finishes loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedDate]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const selectedTech = selected ? techById.get(selected.techId) ?? UNASSIGNED : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="salon">{SALON_NAME}</div>
          <div className="date-label">{longDateLabel(date)}</div>
        </div>
        <nav className="controls">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹ Prev</button>
          <button onClick={() => setDate(todayString())} className={isToday ? "active" : ""}>Today</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">Next ›</button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Pick a date"
          />
        </nav>
        <div className="refresh">
          <span className="updated">
            {lastUpdated ? `Last updated ${clockLabel(lastUpdated)}` : "Loading…"}
          </span>
          <button onClick={() => load(date)} disabled={loading} aria-label="Refresh now">
            <span className={loading ? "spin" : ""}>↻</span> Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          ⚠️ {error}
        </div>
      )}

      <div className="grid-scroll" ref={scrollRef}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `var(--time-col) repeat(${COLUMNS.length}, minmax(170px, 1fr))`,
            gridTemplateRows: `var(--head-h) ${bodyHeight}px`,
          }}
        >
          <div className="corner" />
          {COLUMNS.map((t) => (
            <div key={t.id} className="col-head" style={{ borderBottomColor: t.color }}>
              <span className="dot" style={{ background: t.color }} />
              {t.name}
              <span className="count">{byColumn.get(t.id)?.length || ""}</span>
            </div>
          ))}

          <div className="time-col">
            {hours.map((h) => (
              <div key={h} className="hour-label" style={{ top: (h - startHour) * 60 * PX_PER_MIN }}>
                {hourLabel(h)}
              </div>
            ))}
            {showNow && (
              <div className="now-label" style={{ top: nowTop }}>
                {clockLabel(now)}
              </div>
            )}
          </div>

          {COLUMNS.map((t) => (
            <div key={t.id} className="col">
              {byColumn.get(t.id)!.map((a) => {
                const compact = a.minutes < 25;
                const held = a.status === "held";
                return (
                  <button
                    key={a.id}
                    className={`appt${compact ? " compact" : ""}${held ? " held" : ""}`}
                    style={{
                      top: a.top,
                      height: a.height,
                      left: `calc(${(a.lane / a.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / a.lanes}% - 4px)`,
                      ["--c" as string]: t.color,
                      background: tint(t.color, held ? 0.07 : 0.16),
                    }}
                    onClick={() => setSelected(a)}
                  >
                    {held && <span className="held-tag">held</span>}
                    {compact ? (
                      <span className="line">
                        <b>{a.clientName}</b> {a.service}
                      </span>
                    ) : (
                      <>
                        <span className="line name">{a.clientName}</span>
                        {a.service && <span className="line">{a.service}</span>}
                        <span className="line time">{a.timeLabel}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {showNow && (
            <div className="now-layer">
              <div className="now-line" style={{ top: nowTop }} />
            </div>
          )}
        </div>

        {loadedDate === date && shown.length === 0 && !error && (
          <div className="empty">No appointments on this day.</div>
        )}
      </div>

      {selected && selectedTech && (
        <BookingPanel
          key={selected.id}
          appt={selected}
          tech={selectedTech}
          boardDate={date}
          dayEvents={shown}
          onClose={() => setSelected(null)}
          onSaved={(message) => {
            setSelected(null);
            setToast(message);
            load(date);
          }}
        />
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </div>
  );
}
