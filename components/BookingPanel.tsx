"use client";

import { useMemo, useState } from "react";
import { TECHNICIANS, UNASSIGNED, type Technician } from "@/config/salon";
import { dateAndMinutesToMs, longDateLabel, minutesIntoDay, minutesLabel, todayString } from "@/lib/time";
import type { Appointment } from "@/lib/types";
import { findClashes, patchBooking } from "@/lib/bookingClient";

type Mode = "view" | "edit" | "confirm-cancel";

type Props = {
  appt: Appointment;
  tech: Technician;
  boardDate: string;
  dayEvents: Appointment[]; // everything on the board's current day, for clash warnings
  onClose: () => void;
  onSaved: (message: string) => void;
};

const STEP = 15;
const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 210, 240, 300, 360];

function durationLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

export default function BookingPanel({ appt, tech, boardDate, dayEvents, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clashOk, setClashOk] = useState(false);

  // The form starts with the booking's current values.
  const original = useMemo(() => {
    const date = todayString(appt.start);
    return {
      date,
      startMin: minutesIntoDay(appt.start, date),
      duration: Math.round((appt.end - appt.start) / 60000),
      techId: tech.id === UNASSIGNED.id ? "" : tech.id,
      service: appt.service,
      status: appt.status === "held" ? "held" : "confirmed",
    };
  }, [appt, tech]);
  const [form, setForm] = useState(original);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setClashOk(false);
    setError(null);
  };

  const startOptions = useMemo(() => {
    const opts = new Set<number>();
    for (let m = 6 * 60; m <= 22 * 60 + 45; m += STEP) opts.add(m);
    opts.add(original.startMin);
    return [...opts].sort((a, b) => a - b);
  }, [original.startMin]);
  const durationOptions = useMemo(
    () => [...new Set([...DURATIONS, original.duration])].sort((a, b) => a - b),
    [original.duration],
  );

  const newStart = dateAndMinutesToMs(form.date, form.startMin);
  const newEnd = newStart + form.duration * 60000;

  // Warn if the new time overlaps another booking for the same technician.
  const clashes = useMemo(() => {
    if (!form.techId || form.date !== boardDate) return [];
    return findClashes(dayEvents, appt.id, form.techId, newStart, newEnd);
  }, [form.techId, form.date, boardDate, dayEvents, appt.id, newStart, newEnd]);

  async function send(changes: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    const problem = await patchBooking(appt.id, changes);
    setBusy(false);
    if (problem) setError(problem);
    else onSaved(message);
  }

  function save() {
    const changes: Record<string, unknown> = {};
    if (form.date !== original.date || form.startMin !== original.startMin || form.duration !== original.duration) {
      changes.start = newStart;
      changes.end = newEnd;
    }
    if (form.techId !== original.techId) {
      if (!form.techId) return setError("Please pick a technician.");
      changes.techId = form.techId;
    }
    if (form.service.trim() !== original.service) {
      Object.assign(changes, { service: form.service.trim(), clientName: appt.clientName, groupOf: appt.groupOf });
    }
    if (form.status !== original.status) changes.status = form.status;

    if (Object.keys(changes).length === 0) return setMode("view");
    if (clashes.length && !clashOk) return setClashOk(true); // first tap shows the warning

    const moved = form.date !== original.date ? ` to ${longDateLabel(form.date)}` : "";
    send(changes, `Saved ${appt.clientName}'s booking${moved}.`);
  }

  return (
    <>
      <div className="backdrop" onClick={busy ? undefined : onClose} />
      <aside className="panel" style={{ ["--c" as string]: tech.color }}>
        <button className="close" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        <h2>{appt.clientName}</h2>

        {mode !== "edit" && (
          <>
            <dl>
              <dt>Service</dt>
              <dd>{appt.service || "—"}</dd>
              <dt>Time</dt>
              <dd>{appt.timeLabel}</dd>
              <dt>Technician</dt>
              <dd>
                <span className="dot" style={{ background: tech.color }} /> {tech.name}
              </dd>
              <dt>Status</dt>
              <dd>
                <span className={`status ${appt.status === "held" ? "held" : ""}`}>
                  {appt.status === "held" ? "On hold (new)" : appt.status}
                </span>
              </dd>
              {appt.groupOf && (
                <>
                  <dt>Group</dt>
                  <dd>Group of {appt.groupOf}</dd>
                </>
              )}
            </dl>

            {error && <div className="panel-error">{error}</div>}

            {mode === "view" && (
              <div className="actions">
                <button className="primary" onClick={() => setMode("edit")}>Edit / Reschedule</button>
                {appt.status === "held" && (
                  <button disabled={busy} onClick={() => send({ status: "confirmed" }, `Confirmed ${appt.clientName}'s booking.`)}>
                    {busy ? "Saving…" : "✓ Confirm booking"}
                  </button>
                )}
                <button className="danger-outline" onClick={() => { setError(null); setMode("confirm-cancel"); }}>
                  Cancel booking
                </button>
              </div>
            )}

            {mode === "confirm-cancel" && (
              <div className="confirm-box">
                <p>
                  Cancel <b>{appt.clientName}</b>&rsquo;s booking at {appt.timeLabel}? GoHighLevel will notify the client.
                </p>
                <div className="actions row">
                  <button className="danger" disabled={busy} onClick={() => send({ status: "cancelled" }, `Cancelled ${appt.clientName}'s booking.`)}>
                    {busy ? "Cancelling…" : "Yes, cancel it"}
                  </button>
                  <button disabled={busy} onClick={() => setMode("view")}>Keep booking</button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "edit" && (
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              Date
              <input type="date" value={form.date} required onChange={(e) => e.target.value && set("date", e.target.value)} />
            </label>
            <div className="two">
              <label>
                Start
                <select value={form.startMin} onChange={(e) => set("startMin", Number(e.target.value))}>
                  {startOptions.map((m) => (
                    <option key={m} value={m}>{minutesLabel(m)}</option>
                  ))}
                </select>
              </label>
              <label>
                Length
                <select value={form.duration} onChange={(e) => set("duration", Number(e.target.value))}>
                  {durationOptions.map((m) => (
                    <option key={m} value={m}>{durationLabel(m)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="hint">Ends at {minutesLabel((form.startMin + form.duration) % 1440)}</div>
            <label>
              Technician
              <select value={form.techId} onChange={(e) => set("techId", e.target.value)}>
                {!form.techId && <option value="">— pick one —</option>}
                {TECHNICIANS.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              Service
              <input type="text" value={form.service} maxLength={200} onChange={(e) => set("service", e.target.value)} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="confirmed">Confirmed</option>
                <option value="held">On hold (new)</option>
              </select>
            </label>

            {clashOk && clashes.length > 0 && (
              <div className="panel-warn">
                ⚠️ This overlaps{" "}
                {clashes.map((c) => `${c.clientName} (${c.timeLabel})`).join(", ")}. Tap “Save anyway” to book it regardless.
              </div>
            )}
            {error && <div className="panel-error">{error}</div>}
            <p className="hint">GoHighLevel will notify the client about time changes.</p>

            <div className="actions row">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : clashOk && clashes.length ? "Save anyway" : "Save changes"}
              </button>
              <button type="button" disabled={busy} onClick={() => { setForm(original); setError(null); setClashOk(false); setMode("view"); }}>
                Back
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );
}
