"use client";

import { useMemo, useState } from "react";
import { CLOSE_HOUR, OPEN_HOUR, type Technician } from "@/config/salon";
import { createBlock, deleteBlock } from "@/lib/bookingClient";
import { longDateLabel, minutesIntoDay, minutesLabel } from "@/lib/time";
import { OFF_DAY_TITLE, OFF_SHIFT_TITLE, type Appointment, type Block } from "@/lib/types";

type Props = {
  tech: Technician;
  date: string;
  blocks: Block[]; // this technician's blocked time on `date`
  bookings: Appointment[]; // this technician's bookings on `date`
  hidden: boolean;
  onToggleHidden: () => void;
  onClose: () => void;
  onChanged: (message: string) => void;
};

const TIMES = Array.from({ length: (23 - 6) * 4 + 1 }, (_, i) => 6 * 60 + i * 15); // 6:00 AM … 11:00 PM
const LENGTHS = [15, 30, 45, 60, 90, 120, 180];
const BREAK_LABELS = ["Lunch", "Break", "Personal", "Training", "Appointment"];
const DAY_END = 1439; // 11:59 PM

/** The ⚙ panel for one technician: off today, shift hours, breaks, and device-only options. */
export default function StaffPanel({ tech, date, blocks, bookings, hidden, onToggleHidden, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mins = (ms: number) => minutesIntoDay(ms, date);
  const offDay = blocks.find((b) => b.title === OFF_DAY_TITLE);
  const shiftBlocks = blocks.filter((b) => b.title === OFF_SHIFT_TITLE);
  const otherBlocks = blocks.filter((b) => b.title !== OFF_DAY_TITLE && b.title !== OFF_SHIFT_TITLE);

  // Current shift, worked out from the "Off shift" blocks before and after it.
  const currentShift = useMemo(() => {
    let start = OPEN_HOUR * 60;
    let end = CLOSE_HOUR * 60;
    for (const b of shiftBlocks) {
      if (mins(b.start) <= 0) start = mins(b.end);
      if (mins(b.end) >= DAY_END) end = mins(b.start);
    }
    return { start, end, custom: shiftBlocks.length > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftBlocks.map((b) => b.id).join()]);

  const [shiftStart, setShiftStart] = useState(currentShift.start);
  const [shiftEnd, setShiftEnd] = useState(currentShift.end);
  const [breakStart, setBreakStart] = useState(12 * 60);
  const [breakLength, setBreakLength] = useState(30);
  const [breakLabel, setBreakLabel] = useState("Lunch");

  const booked = bookings.filter((b) => b.status !== "cancelled");
  const hours = Math.round(booked.reduce((s, b) => s + (b.end - b.start) / 60000, 0) / 6) / 10;
  const clashes = booked.filter((b) => blocks.some((k) => b.start < k.end && b.end > k.start));

  /** Run several changes in a row, stopping at the first problem. */
  async function run(steps: (() => Promise<string | null>)[], message: string) {
    setBusy(true);
    setError(null);
    for (const step of steps) {
      const problem = await step();
      if (problem) {
        setError(problem);
        setBusy(false);
        onChanged(""); // refresh to show whatever did get saved
        return;
      }
    }
    setBusy(false);
    onChanged(message);
  }

  const toggleOffDay = () =>
    offDay
      ? run([() => deleteBlock(offDay.id, tech.id, date)], `${tech.name} is working again.`)
      : run(
          [() => createBlock({ techId: tech.id, date, startMin: 0, endMin: DAY_END, title: OFF_DAY_TITLE })],
          `${tech.name} is marked off for the day.`,
        );

  const saveShift = () => {
    if (shiftEnd <= shiftStart) return setError("The shift has to end after it starts.");
    const steps = shiftBlocks.map((b) => () => deleteBlock(b.id, tech.id, date));
    if (shiftStart > 0) steps.push(() => createBlock({ techId: tech.id, date, startMin: 0, endMin: shiftStart, title: OFF_SHIFT_TITLE }));
    if (shiftEnd < DAY_END) steps.push(() => createBlock({ techId: tech.id, date, startMin: shiftEnd, endMin: DAY_END, title: OFF_SHIFT_TITLE }));
    run(steps, `${tech.name} works ${minutesLabel(shiftStart)} – ${minutesLabel(shiftEnd)}.`);
  };

  const clearShift = () =>
    run(shiftBlocks.map((b) => () => deleteBlock(b.id, tech.id, date)), `${tech.name}'s shift is back to normal hours.`);

  const addBreak = () =>
    run(
      [() => createBlock({ techId: tech.id, date, startMin: breakStart, endMin: Math.min(DAY_END, breakStart + breakLength), title: breakLabel })],
      `Added ${breakLabel.toLowerCase()} for ${tech.name} at ${minutesLabel(breakStart)}.`,
    );

  return (
    <>
      <div className="backdrop" onClick={busy ? undefined : onClose} />
      <aside className="panel staff-panel" style={{ ["--c" as string]: tech.color }}>
        <button className="close" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        <h2>
          <span className="dot big" style={{ background: tech.color }} /> {tech.name}
        </h2>
        <p className="muted small">{longDateLabel(date)}</p>

        <div className="mini-stats">
          <div><b>{booked.length}</b><span>Bookings</span></div>
          <div><b>{hours}</b><span>Hours</span></div>
          <div>
            <b className="small-b">{booked.length ? minutesLabel(mins(booked[0].start)) : "—"}</b>
            <span>First</span>
          </div>
        </div>

        {error && <div className="panel-error">{error}</div>}
        {clashes.length > 0 && (
          <div className="panel-warn">
            ⚠️ Booked during blocked time: {clashes.map((c) => `${c.clientName} (${c.timeLabel})`).join(", ")}. Move them or tell the client.
          </div>
        )}

        <h3>Availability this day</h3>
        <div className="staff-row">
          <span>
            <b>{offDay ? "Off all day" : "Working"}</b>
            <span className="muted small block">{offDay ? "No bookings can be made online." : "Marking off blocks online booking for the day."}</span>
          </span>
          <button className={`btn${offDay ? "" : " danger"}`} onClick={toggleOffDay} disabled={busy}>
            {offDay ? "Back to work" : "Mark off"}
          </button>
        </div>

        {!offDay && (
          <>
            <div className="staff-form">
              <span className="staff-label">Shift</span>
              <select value={shiftStart} onChange={(e) => setShiftStart(Number(e.target.value))} aria-label="Shift starts">
                {TIMES.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
              </select>
              <span className="muted">to</span>
              <select value={shiftEnd} onChange={(e) => setShiftEnd(Number(e.target.value))} aria-label="Shift ends">
                {TIMES.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
              </select>
              <button className="btn" onClick={saveShift} disabled={busy}>Set shift</button>
              {currentShift.custom && (
                <button className="btn link" onClick={clearShift} disabled={busy}>Normal hours</button>
              )}
            </div>
            <p className="muted small">
              {currentShift.custom
                ? `Working ${minutesLabel(currentShift.start)} – ${minutesLabel(currentShift.end)} today.`
                : `Normal hours (${minutesLabel(OPEN_HOUR * 60)} – ${minutesLabel(CLOSE_HOUR * 60)}).`}
            </p>

            <div className="staff-form">
              <span className="staff-label">Add</span>
              <select value={breakLabel} onChange={(e) => setBreakLabel(e.target.value)} aria-label="Type">
                {BREAK_LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <span className="muted">at</span>
              <select value={breakStart} onChange={(e) => setBreakStart(Number(e.target.value))} aria-label="Starts">
                {TIMES.map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
              </select>
              <select value={breakLength} onChange={(e) => setBreakLength(Number(e.target.value))} aria-label="Length">
                {LENGTHS.map((l) => <option key={l} value={l}>{l < 60 ? `${l} min` : `${l / 60} hr`}</option>)}
              </select>
              <button className="btn" onClick={addBreak} disabled={busy}>Add</button>
            </div>
          </>
        )}

        {otherBlocks.length > 0 && (
          <>
            <h3>Blocked time</h3>
            <ul className="block-list">
              {otherBlocks.map((b) => (
                <li key={b.id}>
                  <span>
                    <b>{b.title}</b>
                    <span className="muted"> · {minutesLabel(mins(b.start))} – {minutesLabel(Math.min(DAY_END, mins(b.end)))}</span>
                  </span>
                  <button className="btn link" disabled={busy} onClick={() => run([() => deleteBlock(b.id, tech.id, date)], `Removed ${b.title.toLowerCase()}.`)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small">Blocked time also stops clients booking {tech.name} online at those times.</p>

        <h3>On this device</h3>
        <label className="staff-check">
          <input type="checkbox" checked={hidden} onChange={onToggleHidden} />
          Hide {tech.name}&rsquo;s column on this screen
        </label>
        {busy && <p className="muted small">Saving…</p>}
      </aside>
    </>
  );
}
