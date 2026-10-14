import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";
import { TECHNICIANS } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { buildTitle } from "@/lib/title";
import { toZonedIso } from "@/lib/time";

export const dynamic = "force-dynamic";

// Ask the booking system to send the client its usual reschedule / cancel messages.
const NOTIFY_CLIENTS = true;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const knownTechIds = new Set(TECHNICIANS.map((t) => t.id));
const STATUS_TO_GHL: Record<string, string> = {
  held: "new",
  confirmed: "confirmed",
  showed: "showed",
  noshow: "noshow",
  cancelled: "cancelled",
};

/** Change one booking: reschedule, change technician/service/status, check in, or cancel. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed((await cookies()).get(AUTH_COOKIE)?.value)) {
    return fail("Please enter the PIN first.", 401);
  }
  // Only accept changes coming from the board's own page.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return fail("This change didn't come from the board.", 403);
  }

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return fail("Unknown booking.", 400);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return fail("The change couldn't be read. Please try again.", 400);
  }

  const body: Record<string, unknown> = {
    toNotify: NOTIFY_CLIENTS,
    // Staff can book outside the online-booking availability rules.
    ignoreFreeSlotValidation: true,
    ignoreDateRange: true,
  };

  if (input.status !== undefined) {
    const s = STATUS_TO_GHL[String(input.status)];
    if (!s) return fail("Unknown status.", 400);
    body.appointmentStatus = s;
  }

  if (input.start !== undefined || input.end !== undefined) {
    const start = Number(input.start);
    const end = Number(input.end);
    const minutes = (end - start) / 60000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || minutes < 5 || minutes > 12 * 60) {
      return fail("That time doesn't look right.", 400);
    }
    body.startTime = toZonedIso(start);
    body.endTime = toZonedIso(end);
  }

  if (input.techId !== undefined) {
    if (typeof input.techId !== "string" || !knownTechIds.has(input.techId)) {
      return fail("Please pick a technician.", 400);
    }
    body.assignedUserId = input.techId;
  }

  if (input.service !== undefined || input.requested !== undefined) {
    const clientName = String(input.clientName ?? "").trim();
    const service = String(input.service ?? "").trim();
    const groupOf = input.groupOf ? String(input.groupOf).trim() : null;
    if (!clientName || clientName.length > 100 || service.length > 200 || (groupOf?.length ?? 0) > 100) {
      return fail("The name or service is too long or empty.", 400);
    }
    body.title = buildTitle(clientName, service, groupOf, input.requested === true);
  }

  const result = await ghlRequest(`/calendars/events/appointments/${id}`, { method: "PUT", body });
  if (!result.ok) return fail(result.error, 502);
  return NextResponse.json({ ok: true });
}
