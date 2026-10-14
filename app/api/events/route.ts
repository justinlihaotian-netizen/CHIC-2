import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";
import { GHL_GROUP_ID, GHL_LOCATION_ID, TECHNICIANS, UNASSIGNED } from "@/config/salon";
import { clockLabel, dayRange, isValidDateString } from "@/lib/time";
import { ghlRequest } from "@/lib/ghl";
import type { Appointment } from "@/lib/types";
import { parseTitle, partySizes } from "@/lib/title";

export const dynamic = "force-dynamic";

type GhlEvent = {
  id?: string;
  title?: string;
  startTime?: string | number;
  endTime?: string | number;
  assignedUserId?: string | null;
  appointmentStatus?: string;
  deleted?: boolean;
};

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function toMs(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return NaN;
  if (typeof value === "number") return value;
  return /^\d+$/.test(value) ? Number(value) : Date.parse(value);
}

const knownTechIds = new Set(TECHNICIANS.map((t) => t.id));

export async function GET(request: NextRequest) {
  if (!isAuthed((await cookies()).get(AUTH_COOKIE)?.value)) {
    return fail("Please enter the PIN first.", 401);
  }

  const date = request.nextUrl.searchParams.get("date");
  if (!isValidDateString(date)) {
    return fail("That date doesn't look right. Use YYYY-MM-DD.", 400);
  }

  const { start, end } = dayRange(date);
  const query = new URLSearchParams({
    locationId: GHL_LOCATION_ID,
    groupId: GHL_GROUP_ID,
    startTime: String(start),
    endTime: String(end),
  });
  const result = await ghlRequest<{ events?: GhlEvent[] }>(`/calendars/events?${query}`);
  if (!result.ok) return fail(result.error, 502);

  const events: Appointment[] = [];
  for (const ev of result.data?.events ?? []) {
    const status = (ev.appointmentStatus ?? "").toLowerCase();
    if (status === "cancelled" || ev.deleted) continue;

    const startMs = toMs(ev.startTime);
    const endMs = toMs(ev.endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

    const assigned = ev.assignedUserId ?? "";
    const { clientName, service, groupOf, requested } = parseTitle(ev.title ?? "");
    events.push({
      id: ev.id ?? `${startMs}-${assigned}-${ev.title}`,
      techId: knownTechIds.has(assigned) ? assigned : UNASSIGNED.id,
      clientName,
      service,
      groupOf,
      requested,
      partySize: 1,
      start: startMs,
      end: Math.max(endMs, startMs + 5 * 60000),
      timeLabel: `${clockLabel(startMs)} – ${clockLabel(endMs)}`,
      status: status === "new" ? "held" : status || "confirmed",
      rawTitle: ev.title ?? "",
    });
  }
  events.sort((a, b) => a.start - b.start);
  const sizes = partySizes(events);
  for (const e of events) e.partySize = sizes.get(e.id) ?? 1;

  return NextResponse.json(
    { date, events, fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
