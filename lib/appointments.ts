// Server-only: reads bookings from the booking system and turns them into clean Appointment objects.
import { GHL_GROUP_ID, GHL_LOCATION_ID, TECHNICIANS, UNASSIGNED } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { clockLabel, dayRange, todayString } from "@/lib/time";
import { parseTitle, partySizes } from "@/lib/title";
import type { Appointment, Status } from "@/lib/types";

export type GhlEvent = {
  id?: string;
  title?: string;
  startTime?: string | number;
  endTime?: string | number;
  assignedUserId?: string | null;
  appointmentStatus?: string;
  contactId?: string | null;
  deleted?: boolean;
};

const knownTechIds = new Set(TECHNICIANS.map((t) => t.id));
const STATUS: Record<string, Status> = {
  new: "held",
  confirmed: "confirmed",
  showed: "showed",
  noshow: "noshow",
  cancelled: "cancelled",
};

function toMs(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return NaN;
  if (typeof value === "number") return value;
  return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
}

/** Turn raw booking-system events into Appointments (skips deleted/invalid ones). */
export function toAppointments(raw: GhlEvent[], includeCancelled: boolean): Appointment[] {
  const out: Appointment[] = [];
  for (const ev of raw) {
    const status = STATUS[(ev.appointmentStatus ?? "confirmed").toLowerCase()];
    if (!status || ev.deleted || (status === "cancelled" && !includeCancelled)) continue;
    const startMs = toMs(ev.startTime);
    const endMs = toMs(ev.endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    const assigned = ev.assignedUserId ?? "";
    const { clientName, service, groupOf, requested } = parseTitle(ev.title ?? "");
    out.push({
      id: ev.id ?? `${startMs}-${assigned}-${ev.title}`,
      date: todayString(startMs),
      techId: knownTechIds.has(assigned) ? assigned : UNASSIGNED.id,
      contactId: ev.contactId ?? null,
      clientName,
      service,
      groupOf,
      requested,
      partySize: 1,
      start: startMs,
      end: Math.max(endMs, startMs + 5 * 60000),
      timeLabel: `${clockLabel(startMs)} – ${clockLabel(endMs)}`,
      status,
      rawTitle: ev.title ?? "",
    });
  }
  out.sort((a, b) => a.start - b.start);

  // Party sizes are worked out per day, from bookings that weren't cancelled.
  const byDay = new Map<string, Appointment[]>();
  for (const a of out) if (a.status !== "cancelled") byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
  for (const list of byDay.values()) {
    const sizes = partySizes(list);
    for (const a of list) a.partySize = sizes.get(a.id) ?? 1;
  }
  return out;
}

/** All bookings from the first salon day to the last (inclusive), in windows of up to 31 days. */
export async function fetchAppointments(
  firstDate: string,
  lastDate: string,
  includeCancelled: boolean,
): Promise<{ ok: true; events: Appointment[] } | { ok: false; error: string }> {
  const start = dayRange(firstDate).start;
  const end = dayRange(lastDate).end;
  const WINDOW = 31 * 24 * 3600 * 1000;
  const windows: [number, number][] = [];
  for (let s = start; s <= end; s += WINDOW) windows.push([s, Math.min(end, s + WINDOW - 1)]);

  const results = await Promise.all(
    windows.map(([s, e]) => {
      const query = new URLSearchParams({
        locationId: GHL_LOCATION_ID,
        groupId: GHL_GROUP_ID,
        startTime: String(s),
        endTime: String(e),
      });
      return ghlRequest<{ events?: GhlEvent[] }>(`/calendars/events?${query}`);
    }),
  );
  const raw: GhlEvent[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.ok) return { ok: false, error: r.error };
    for (const ev of r.data?.events ?? []) {
      if (ev.id && seen.has(ev.id)) continue;
      if (ev.id) seen.add(ev.id);
      raw.push(ev);
    }
  }
  return { ok: true, events: toAppointments(raw, includeCancelled) };
}
