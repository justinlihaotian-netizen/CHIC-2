"use client";

import { useEffect, useState } from "react";
import { PageHeader, lockDevice } from "@/components/Shell";
import { CLOSE_HOUR, OPEN_HOUR, SALON_NAME, TECHNICIANS, TIME_ZONE } from "@/config/salon";
import { getJSON } from "@/lib/clientFetch";
import { clockLabel, hourLabel } from "@/lib/time";

type Check = { ok: boolean; error?: string };
type StatusResponse = { appointments: Check; clients: Check; checkedAt: number };

export default function Settings() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    const r = await getJSON<StatusResponse>("/api/status");
    setChecking(false);
    if (r.ok) {
      setStatus(r.data);
      setStatusError(null);
    } else setStatusError(r.error);
  }

  useEffect(() => {
    check();
    try {
      setZoom(localStorage.getItem("salonBoardZoom"));
    } catch {}
  }, []);

  const row = (label: string, c: Check | undefined) => (
    <div className="set-row">
      <span>{label}</span>
      {!c ? (
        <span className="muted">Checking…</span>
      ) : c.ok ? (
        <span className="status showed">✓ Connected</span>
      ) : (
        <span className="status noshow" title={c.error}>Not working</span>
      )}
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Settings" />
      <div className="page-body">
        <section className="card">
          <h2>Salon</h2>
          <div className="set-row"><span>Name</span><b>{SALON_NAME}</b></div>
          <div className="set-row"><span>Opening hours</span><b>{hourLabel(OPEN_HOUR)} – {hourLabel(CLOSE_HOUR)}</b></div>
          <div className="set-row"><span>Board shows</span><b>Full day (12 AM – 12 AM), closed hours shaded</b></div>
          <div className="set-row"><span>Time zone</span><b>{TIME_ZONE.replace("America/", "").replace("_", " ")} (Eastern)</b></div>
        </section>

        <section className="card">
          <h2>Technicians</h2>
          {TECHNICIANS.map((t) => (
            <div key={t.id} className="set-row">
              <span className="tech-tag">
                <span className="swatch" style={{ background: t.color }} />
                {t.name}
              </span>
              <span className="muted mono">{t.color}</span>
            </div>
          ))}
          <p className="muted small">To add a technician or change a colour, ask Claude to update the technician list.</p>
        </section>

        <section className="card">
          <h2>Connection</h2>
          {statusError && <p className="muted">⚠️ {statusError}</p>}
          {row("Appointments", status?.appointments)}
          {row("Clients", status?.clients)}
          <div className="set-row">
            <span className="muted small">{status ? `Checked at ${clockLabel(status.checkedAt)}` : ""}</span>
            <button className="btn" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check again"}</button>
          </div>
        </section>

        <section className="card">
          <h2>This device</h2>
          <div className="set-row">
            <span>Board zoom</span>
            <span>
              <b>{Math.round(Number(zoom || 1) * 100)}%</b>{" "}
              <button
                className="btn"
                onClick={() => {
                  try {
                    localStorage.setItem("salonBoardZoom", "1");
                  } catch {}
                  setZoom("1");
                }}
              >
                Reset
              </button>
            </span>
          </div>
          <div className="set-row">
            <span>
              Lock this device
              <span className="muted small block">Asks for the PIN again next time.</span>
            </span>
            <button className="btn danger" onClick={lockDevice}>Lock</button>
          </div>
        </section>
      </div>
    </div>
  );
}
