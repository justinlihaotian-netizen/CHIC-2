"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CLOSE_HOUR, OPEN_HOUR, TECHNICIANS, UNASSIGNED, type Technician } from "@/config/salon";
import {
  addDays,
  clockLabel,
  dateAndMinutesToMs,
  hourLabel,
  longDateLabel,
  minutesIntoDay,
  minutesLabel,
  shortDateLabel,
  todayString,
} from "@/lib/time";
import type { Appointment } from "@/lib/types";
import { findClashes, patchBooking } from "@/lib/bookingClient";
import BookingPanel from "@/components/BookingPanel";
import { MenuButton } from "@/components/Shell";

const BASE_PX_PER_MIN = 2; // at 100% zoom, 15 minutes = 30px tall
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const ZOOM_KEY = "salonBoardZoom";
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
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
function layoutColumn(items: Appointment[], date: string, rangeStartMin: number, px: number): Placed[] {
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
      top: (startMin - rangeStartMin) * px,
      height: Math.max(minutes * px - 2, 18),
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
  const [zoom, setZoom] = useState(1);
  const px = BASE_PX_PER_MIN * zoom; // pixels per minute at the current zoom
  const colScale = Math.min(1.6, Math.max(0.8, zoom)); // columns widen/narrow less than time does

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

  // The board always shows the whole day, midnight to midnight.
  const startHour = 0;
  const endHour = 24;

  const rangeStartMin = startHour * 60;
  const rangeEndMin = endHour * 60;
  const bodyHeight = (rangeEndMin - rangeStartMin) * px;

  const byColumn = useMemo(() => {
    const map = new Map<string, Placed[]>();
    for (const col of COLUMNS) {
      map.set(col.id, layoutColumn(shown.filter((a) => a.techId === col.id), date, rangeStartMin, px));
    }
    return map;
  }, [shown, date, rangeStartMin, px]);

  const nowMin = minutesIntoDay(now, date);
  const nowTop = (nowMin - rangeStartMin) * px;
  const showNow = isToday && nowTop >= 0 && nowTop <= bodyHeight;

  // When opening a day, scroll to the current time (today), or to opening time / the first booking.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loadedDate !== date) return;
    const firstMin = shown.length ? minutesIntoDay(shown[0].start, date) - 30 : Infinity;
    const targetMin = Math.max(0, Math.min(OPEN_HOUR * 60, firstMin));
    el.scrollTop = showNow ? Math.max(0, nowTop - 90) : targetMin * px;
    // only when a new day finishes loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedDate]);

  // ── Drag-and-drop ─────────────────────────────────────────────
  // Values the drag handlers need, kept fresh without re-attaching listeners.
  const layout = useRef({ rangeStartMin, rangeEndMin, px });
  layout.current = { rangeStartMin, rangeEndMin, px };

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
    const { rangeStartMin: lo, rangeEndMin: hi, px: ppm } = layout.current;
    let startMin = (g.y - top) / ppm - g.grabMin + lo;
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
        grabMin: (e.clientY - rect.top) / layout.current.px,
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

  // ── Zoom: two-finger pinch, trackpad pinch, Ctrl + scroll wheel, or the − / + buttons ──
  // Each device remembers its own zoom.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(ZOOM_KEY));
      if (saved) setZoom(clampZoom(saved));
    } catch {}
  }, []);

  const zoomRef = useRef(zoom);
  const zoomAnchor = useRef<{ x: number; y: number; minutes: number; ratioX: number } | null>(null);
  const boardEdges = () => {
    const el = scrollRef.current!;
    return {
      headH: el.querySelector(".corner")?.getBoundingClientRect().height ?? 44,
      timeW: el.querySelector(".time-col")?.getBoundingClientRect().width ?? 64,
    };
  };

  /** Change the zoom, keeping the spot under (fx, fy) — the fingers or the mouse — where it is. */
  const zoomTo = useCallback((next: number, fx?: number, fy?: number) => {
    const el = scrollRef.current;
    const z = Math.round(clampZoom(next) * 100) / 100;
    if (!el || z === zoomRef.current) return;
    const r = el.getBoundingClientRect();
    const { headH, timeW } = boardEdges();
    const x = (fx ?? r.left + r.width / 2) - r.left;
    const y = (fy ?? r.top + r.height / 2) - r.top;
    zoomAnchor.current = {
      x,
      y,
      minutes: (el.scrollTop + y - headH) / (BASE_PX_PER_MIN * zoomRef.current),
      ratioX: (el.scrollLeft + x - timeW) / Math.max(1, el.scrollWidth - timeW),
    };
    zoomRef.current = z;
    setZoom(z);
    try {
      localStorage.setItem(ZOOM_KEY, String(z));
    } catch {}
  }, []);

  // After the board is redrawn at the new zoom, scroll so the anchored spot stays put.
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const el = scrollRef.current;
    const a = zoomAnchor.current;
    if (!el || !a) return;
    zoomAnchor.current = null;
    const { headH, timeW } = boardEdges();
    el.scrollTop = a.minutes * BASE_PX_PER_MIN * zoom + headH - a.y;
    el.scrollLeft = a.ratioX * (el.scrollWidth - timeW) + timeW - a.x;
  }, [zoom]);

  const cancelDrag = useCallback(() => {
    endGesture();
    setDrag(null);
  }, [endGesture, setDrag]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinch: { dist: number; zoom: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    // iPhone / iPad: two fingers
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      cancelDrag(); // a second finger means zoom, not drag
      pinch = { dist: spread(e.touches), zoom: zoomRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo((pinch.zoom * spread(e.touches)) / pinch.dist, mx, my);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    // Laptop trackpad pinch (Chrome, Edge, Firefox) or Ctrl + mouse wheel
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const step = Math.max(-25, Math.min(25, e.deltaY)); // a mouse-wheel click is much bigger than a trackpad tick
      zoomTo(zoomRef.current * Math.exp(-step * 0.01), e.clientX, e.clientY);
    };
    // Safari's own pinch events: zoom the board on a Mac trackpad; on iPhone/iPad the touch code above does it.
    let gestureZoom = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureZoom = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (pinch) return;
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomTo(gestureZoom * g.scale, g.clientX, g.clientY);
    };
    // Never zoom the whole page instead of the board.
    const stopPageZoom = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    document.addEventListener("gesturestart", stopPageZoom);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      document.removeEventListener("gesturestart", stopPageZoom);
    };
  }, [zoomTo, cancelDrag]);

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
        <MenuButton />
        <div className="brand">
          <div className="salon">Appointments</div>
          <div className="date-label">
            <span className="wide">{longDateLabel(date)}</span>
            <span className="narrow">{shortDateLabel(date)}</span>
          </div>
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
        <div className="zoom-ctl" role="group" aria-label="Zoom">
          <button onClick={() => zoomTo(zoomRef.current / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
          <button onClick={() => zoomTo(1)} className="zoom-level" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button onClick={() => zoomTo(zoomRef.current * 1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
        </div>
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
            gridTemplateColumns: `var(--time-col) repeat(${COLUMNS.length}, minmax(calc(var(--col-min) * ${colScale}), 1fr))`,
            gridTemplateRows: `var(--head-h) ${bodyHeight}px`,
            ["--slot" as string]: `${15 * px}px`,
            ["--hour" as string]: `${60 * px}px`,
          }}
        >
          <div className="corner" style={{ gridRow: 1, gridColumn: 1 }} />
          {COLUMNS.map((t, i) => (
            <div key={t.id} className="col-head" style={{ borderBottomColor: t.color, gridRow: 1, gridColumn: i + 2 }}>
              <span className="dot" style={{ background: t.color }} />
              <span className="name">{t.name}</span>
              <span className="count">{byColumn.get(t.id)?.length || ""}</span>
            </div>
          ))}

          <div className="time-col">
            {hours.map((h) => (
              <div key={h} className="hour-label" style={{ top: (h - startHour) * 60 * px }}>
                {hourLabel(h)}
              </div>
            ))}
            {showNow && (
              <div className="now-label" style={{ top: nowTop }}>
                {clockLabel(now)}
              </div>
            )}
          </div>

          {COLUMNS.map((t, i) => (
            <div
              key={t.id}
              className={`col${ghost?.techId === t.id ? " drop-target" : ""}`}
              style={{ gridColumn: i + 2 }}
              ref={(el) => {
                if (el) colRefs.current.set(t.id, el);
                else colRefs.current.delete(t.id);
              }}
            >
              {byColumn.get(t.id)!.map((a) => {
                const compact = a.height < 46;
                const tiny = a.height < 26;
                const held = a.status === "held";
                const statusClass = a.status === "showed" ? " showed" : a.status === "noshow" ? " noshow" : "";
                const moving = ghost?.appt.id === a.id;
                return (
                  <button
                    key={a.id}
                    className={`appt${compact ? " compact" : ""}${tiny ? " tiny" : ""}${held ? " held" : ""}${statusClass}${moving ? " moving" : ""}`}
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
                    {a.status === "noshow" && <span className="held-tag">no-show</span>}
                    {compact ? (
                      <span className="line">
                        <span className="party">{a.partySize}</span>
                        <b>{a.clientName}</b>
                        {a.requested && <span className="heart">♥</span>} {a.service}
                      </span>
                    ) : (
                      <>
                        <span className="line name">
                          <span className="party">{a.partySize}</span>
                          {a.clientName}
                          {a.requested && <span className="heart">♥</span>}
                          {a.status === "showed" && <span className="checked" title="Checked in">✓</span>}
                        </span>
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
                    top: (ghost.startMin - rangeStartMin) * px,
                    height: Math.max(ghost.appt.minutes * px - 2, 18),
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

          <div className="offhours-layer" aria-hidden>
            <div style={{ top: 0, height: (OPEN_HOUR * 60 - rangeStartMin) * px }} />
            <div style={{ top: (CLOSE_HOUR * 60 - rangeStartMin) * px, bottom: 0 }} />
          </div>

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
            <div className="move-hint">The client will be notified.</div>
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
