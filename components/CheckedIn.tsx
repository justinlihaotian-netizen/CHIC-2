"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/Shell";
import { ClientName, Notice, TechTag } from "@/components/ui";
import { getJSON } from "@/lib/clientFetch";
import { patchBooking } from "@/lib/bookingClient";
import { clockLabel, longDateLabel, todayString } from "@/lib/time";
import type { Appointment, Status } from "@/lib/types";

const REFRESH_MS = 20_000;

/** Today's clients: who is expected, who has arrived, who didn't come. */
export default function CheckedIn() {
  const [events, setEvents] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const today = todayString(now);

  const load = useCallback(async () => {
    const r = await getJSON<{ events: Appointment[] }>(`/api/events?date=${todayString()}`);
    if (r.ok) {
      setEvents(r.data.events);
      setError(null);
    } else setError(r.error);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function setStatus(a: Appointment, status: Status) {
    setBusyId(a.id);
    const problem = await patchBooking(a.id, { status });
    setBusyId(null);
    if (problem) setError(problem);
    else load();
  }

  const list = events ?? [];
  const waiting = list.filter((a) => a.status === "confirmed" || a.status === "held");
  const arrived = list.filter((a) => a.status === "showed");
  const noShow = list.filter((a) => a.status === "noshow");

  const card = (a: Appointment) => {
    const lateMin = Math.floor((now - a.start) / 60000);
    const isWaiting = a.status === "confirmed" || a.status === "held";
    return (
      <li key={a.id} className="ci-card">
        <div className="ci-time">{clockLabel(a.start)}</div>
        <div className="ci-main">
          <ClientName name={a.clientName} partySize={a.partySize} requested={a.requested} />
          <div className="ci-service">{a.service || "—"}</div>
          <div className="ci-meta">
            <TechTag id={a.techId} />
            {isWaiting && lateMin >= 5 && <span className="late">{lateMin} min late</span>}
            {a.status === "held" && <span className="muted">on hold</span>}
          </div>
        </div>
        <div className="ci-actions">
          {isWaiting ? (
            <>
              <button className="primary" disabled={busyId === a.id} onClick={() => setStatus(a, "showed")}>
                {busyId === a.id ? "Saving…" : "Check in"}
              </button>
              {lateMin >= 0 && (
                <button disabled={busyId === a.id} onClick={() => setStatus(a, "noshow")}>No-show</button>
              )}
            </>
          ) : (
            <button disabled={busyId === a.id} onClick={() => setStatus(a, "confirmed")}>
              {busyId === a.id ? "Saving…" : "Undo"}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Checked-in">
        <span className="muted">{longDateLabel(today)}</span>
      </PageHeader>
      <div className="page-body">
        {error && <Notice kind="error">⚠️ {error}</Notice>}
        <div className="chips">
          <span className="chip">Expected today <b>{list.length}</b></span>
          <span className="chip">Waiting <b>{waiting.length}</b></span>
          <span className="chip good">Checked in <b>{arrived.length}</b></span>
          <span className="chip bad">No-show <b>{noShow.length}</b></span>
        </div>
        {events === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="ci-columns">
            <section>
              <h2>Waiting</h2>
              {waiting.length ? <ul className="ci-list">{waiting.map(card)}</ul> : <p className="empty-note">Nobody waiting.</p>}
            </section>
            <section>
              <h2>Checked in</h2>
              {arrived.length ? <ul className="ci-list">{arrived.map(card)}</ul> : <p className="empty-note">No one checked in yet.</p>}
            </section>
            <section>
              <h2>No-show</h2>
              {noShow.length ? <ul className="ci-list">{noShow.map(card)}</ul> : <p className="empty-note">No no-shows today.</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
