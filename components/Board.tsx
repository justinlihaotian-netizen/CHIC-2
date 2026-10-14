"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DAY_END_HOUR, DAY_START_HOUR, SALON_NAME, TECHNICIANS, UNASSIGNED, type Technician } from "@/config/salon";
import {
  addDays,
  clockLabel,
  dateAndMinutesToMs,
  hourLabel,
  longDateLabel,
  minutesIntoDay,
  minutesLabel,
  todayString,
} from "@/lib/time";
import type { Appointment } from "@/lib/types";
import { findClashes, patchBooking } from "@/lib/bookingClient";
import BookingPanel from "@/components/BookingPanel";

const PX_PER_MIN = 2; // 15 minutes = 30px tall
const REFRESH_MS = 20_000; // re-read GoHighLevel every 20 seconds
const SNAP_MIN = 15; // dragged bookings snap to quarter hours
const LONG_PRESS_MS = 450; // touch: hold this long before a booking can be dragged
const COLUMNS: Technician[] = [...TECHNICIANS, UNASSIGNED];
const techById = new Map(COLUMNS.map((t) => [t.id, t]));

/** Mix a "#RRGGBB" colour with white; amount 0–1 of the colour. Works on older iPads. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

type Placed = Appointment & { top: number; height: number; lane: number; lanes: number; minutes: number; startMin: number };

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
      startMin,
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

/** Where a dragged booking would land. */
type Target = { appt: Placed; techId: string; startMin: number };

/** Live details of one press/drag gesture (kept outside React state so it updates instantly). */
type Gesture = {
  appt: Placed;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabMin: number; // minutes between the booking's top edge and the finger
  active: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  cleanup: () => void;
};

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

  // Drag-and-drop
  const [drag, setDragState] = useState<Target | null>(null); // while dragging
  const [pending, setPending] = useState<Target | null>(null); // dropped, waiting for "Move?"
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const requestId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const dragRef = useRef<Target | null>(null);
  const setDrag = useCallback((t: Target | null) => {
    dragRef.current = t;
    setDragState(t);
  }, []);
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
    setPending(null);
    load(date);
    const url = new URL(window.location.href);
    if (date === todayString()) url.searchParams.delete("date");
    else url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  }, [date, load]);

  // Auto-refresh, and right away when the device wakes up.
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

  // Escape closes the panel or cancels a pending move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected(null);
      if (!moveBusy) setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveBusy]);

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
  const rangeEndMin = endHour * 60;
  const bodyHeight = (rangeEndMin - rangeStartMin) * PX_PER_MIN;

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

  // When opening a day, scroll so the current time (or the morning) is near the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loadedDate !== date) return;
    el.scrollTop = showNow ? Math.max(0, nowTop - 90) : 0;
    // only when a new day finishes loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedDate]);

  // ── Drag-and-drop ─────────────────────────────────────────────
  // Values the drag handlers need, kept fresh without re-attaching listeners.
  const layout = useRef({ rangeStartMin, rangeEndMin });
  layout.current = { rangeStartMin, rangeEndMin };

  /** Work out the technician column and snapped start time under the finger/mouse. */
  const targetAt = useCallback((g: Gesture, prevTech: string): Target => {
    let techId = prevTech;
    let top = 0;
    for (const t of TECHNICIANS) {
      const el = colRefs.current.get(t.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      top = r.top;
      if (g.x >= r.left && g.x < r.right) techId = t.id;
    }
    const { rangeStartMin: lo, rangeEndMin: hi } = layout.current;
    let startMin = (g.y - top) / PX_PER_MIN - g.grabMin + lo;
    startMin = Math.round(startMin / SNAP_MIN) * SNAP_MIN;
    startMin = Math.max(lo, Math.min(hi - g.appt.minutes, startMin));
    return { appt: g.appt, techId, startMin };
  }, []);

  /** Scroll the board while a dragged booking is held near an edge. */
  const autoScroll = useCallback(() => {
    const g = gesture.current;
    const el = scrollRef.current;
    if (!g?.active || !el) return;
    const r = el.getBoundingClientRect();
    const zone = 56;
    const dy = g.y < r.top + 44 + zone ? -12 : g.y > r.bottom - zone ? 12 : 0;
    const dx = g.x < r.left + 64 + zone / 2 ? -12 : g.x > r.right - zone / 2 ? 12 : 0;
    if (dx || dy) {
      el.scrollBy(dx, dy);
      if (dragRef.current) setDrag(targetAt(g, dragRef.current.techId));
    }
    requestAnimationFrame(autoScroll);
  }, [targetAt, setDrag]);

  const endGesture = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    g.cleanup();
    gesture.current = null;
  }, []);

  const activate = useCallback(() => {
    const g = gesture.current;
    if (!g || g.active) return;
    g.active = true;
    setSelected(null);
    setDrag(targetAt(g, g.appt.techId));
    requestAnimationFrame(autoScroll);
  }, [targetAt, autoScroll, setDrag]);

  const startGesture = useCallback(
    (e: React.PointerEvent, appt: Placed) => {
      if (e.button !== 0 || gesture.current || pending || moveBusy) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const touch = e.pointerType !== "mouse";

      const onMove = (ev: PointerEvent) => {
        const g = gesture.current;
        if (!g || ev.pointerId !== g.pointerId) return;
        g.x = ev.clientX;
        g.y = ev.clientY;
        if (!g.active) {
          const dist = Math.hypot(g.x - g.startX, g.y - g.startY);
          if (!g.touch && dist > 5) activate(); // mouse: drag right away
          else if (g.touch && dist > 10) endGesture(); // finger moved before the hold: it's a scroll
          return;
        }
        ev.preventDefault();
        setDrag(targetAt(g, dragRef.current?.techId ?? g.appt.techId));
      };
      // While dragging on a touch screen, stop the page from scrolling under the finger.
      const onTouchMove = (ev: TouchEvent) => {
        if (gesture.current?.active) ev.preventDefault();
      };
      const onUp = (ev: PointerEvent) => {
        const g = gesture.current;
        if (!g || ev.pointerId !== g.pointerId) return;
        if (g.active) {
          suppressClick.current = true; // don't also open the panel
          setTimeout(() => (suppressClick.current = false), 400);
          const d = dragRef.current;
          if (d && d.techId !== UNASSIGNED.id && (d.techId !== d.appt.techId || d.startMin !== d.appt.startMin)) {
            setMoveError(null);
            setPending(d);
          }
          setDrag(null);
        }
        endGesture();
      };
      const onCancel = () => {
        setDrag(null);
        endGesture();
      };

      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
      document.addEventListener("touchmove", onTouchMove, { passive: false });

      gesture.current = {
        appt,
        pointerId: e.pointerId,
        touch,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        grabMin: (e.clientY - rect.top) / PX_PER_MIN,
        active: false,
        timer: touch ? setTimeout(activate, LONG_PRESS_MS) : null,
        cleanup: () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onCancel);
          document.removeEventListener("touchmove", onTouchMove);
        },
      };
    },
    [pending, moveBusy, activate, endGesture, targetAt, setDrag],
  );

  useEffect(() => endGesture, [endGesture]);

  const ghost = drag ?? pending;
  const ghostStart = ghost ? dateAndMinutesToMs(date, ghost.startMin) : 0;
  const ghostEnd = ghost ? ghostStart + ghost.appt.minutes * 60000 : 0;
  const pendingClashes = pending ? findClashes(shown, pending.appt.id, pending.techId, ghostStart, ghostEnd) : [];

  async function confirmMove() {
    if (!pending) return;
    setMoveBusy(true);
    setMoveError(null);
    const changes: Record<string, unknown> = { start: ghostStart, end: ghostEnd };
    if (pending.techId !== pending.appt.techId) changes.techId = pending.techId;
    const problem = await patchBooking(pending.appt.id, changes);
    setMoveBusy(false);
    if (problem) return setMoveError(problem);
    const tech = techById.get(pending.techId)!;
    setToast(`Moved ${pending.appt.clientName} to ${minutesLabel(pending.startMin)} with ${tech.name}.`);
    setPending(null);
    load(date);
  }

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
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            ‹<span className="wide"> Prev</span>
          </button>
          <button onClick={() => setDate(todayString())} className={isToday ? "active" : ""}>Today</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <span className="wide">Next </span>›
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Pick a date"
          />
        </nav>
        <div className="refresh">
          <span className="updated">
            {lastUpdated ? <>Updated {clockLabel(lastUpdated)}</> : "Loading…"}
          </span>
          <button onClick={() => load(date)} disabled={loading} aria-label="Refresh now">
            <span className={loading ? "spin" : ""}>↻</span>
            <span className="wide"> Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          ⚠️ {error}
        </div>
      )}

      <div className={`grid-scroll${drag ? " dragging" : ""}`} ref={scrollRef}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `var(--time-col) repeat(${COLUMNS.length}, minmax(var(--col-min), 1fr))`,
            gridTemplateRows: `var(--head-h) ${bodyHeight}px`,
          }}
        >
          <div className="corner" />
          {COLUMNS.map((t) => (
            <div key={t.id} className="col-head" style={{ borderBottomColor: t.color }}>
              <span className="dot" style={{ background: t.color }} />
              <span className="name">{t.name}</span>
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
            <div
              key={t.id}
              className={`col${ghost?.techId === t.id ? " drop-target" : ""}`}
              ref={(el) => {
                if (el) colRefs.current.set(t.id, el);
                else colRefs.current.delete(t.id);
              }}
            >
              {byColumn.get(t.id)!.map((a) => {
                const compact = a.minutes < 25;
                const held = a.status === "held";
                const moving = ghost?.appt.id === a.id;
                return (
                  <button
                    key={a.id}
                    className={`appt${compact ? " compact" : ""}${held ? " held" : ""}${moving ? " moving" : ""}`}
                    style={{
                      top: a.top,
                      height: a.height,
                      left: `calc(${(a.lane / a.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / a.lanes}% - 4px)`,
                      ["--c" as string]: t.color,
                      background: tint(t.color, held ? 0.07 : 0.16),
                    }}
                    onPointerDown={(e) => startGesture(e, a)}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={() => {
                      if (suppressClick.current) return;
                      setSelected(a);
                    }}
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

              {ghost?.techId === t.id && (
                <div
                  className={`appt ghost${pending ? " pending" : ""}`}
                  style={{
                    top: (ghost.startMin - rangeStartMin) * PX_PER_MIN,
                    height: Math.max(ghost.appt.minutes * PX_PER_MIN - 2, 24),
                    left: 2,
                    width: "calc(100% - 4px)",
                    ["--c" as string]: t.color,
                    background: tint(t.color, 0.3),
                  }}
                >
                  <span className="line name">{ghost.appt.clientName}</span>
                  <span className="line time">
                    {minutesLabel(ghost.startMin)} – {minutesLabel(ghost.startMin + ghost.appt.minutes)}
                  </span>
                </div>
              )}
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

      {pending && (
        <div className="move-bar" role="dialog" aria-label="Confirm move">
          <div className="move-text">
            Move <b>{pending.appt.clientName}</b> to{" "}
            <b>
              {minutesLabel(pending.startMin)} – {minutesLabel(pending.startMin + pending.appt.minutes)}
            </b>{" "}
            with <b>{techById.get(pending.techId)?.name}</b>?
            {pendingClashes.length > 0 && (
              <div className="move-warn">
                ⚠️ Overlaps {pendingClashes.map((c) => `${c.clientName} (${c.timeLabel})`).join(", ")}
              </div>
            )}
            {moveError && <div className="move-error">{moveError}</div>}
            <div className="move-hint">GoHighLevel will notify the client.</div>
          </div>
          <div className="move-actions">
            <button className="primary" onClick={confirmMove} disabled={moveBusy}>
              {moveBusy ? "Moving…" : pendingClashes.length ? "Move anyway" : "Move"}
            </button>
            <button onClick={() => setPending(null)} disabled={moveBusy}>Cancel</button>
          </div>
        </div>
      )}

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
