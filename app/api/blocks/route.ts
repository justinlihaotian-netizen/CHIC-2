import { NextRequest, NextResponse } from "next/server";
import { fail, requirePin } from "@/lib/apiAuth";
import { GHL_LOCATION_ID, TECHNICIANS } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { dateAndMinutesToMs, isValidDateString, toZonedIso } from "@/lib/time";

export const dynamic = "force-dynamic";
const knownTechIds = new Set(TECHNICIANS.map((t) => t.id));

/** POST /api/blocks {techId, date, startMin, endMin, title} — block time for a technician (also stops online booking). */
export async function POST(request: NextRequest) {
  const denied = await requirePin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail("This change didn't come from the board.", 403);

  const input = await request.json().catch(() => null);
  const techId = input?.techId;
  const date = input?.date;
  const startMin = Number(input?.startMin);
  const endMin = Number(input?.endMin);
  const title = String(input?.title ?? "").trim().slice(0, 40) || "Blocked";
  if (typeof techId !== "string" || !knownTechIds.has(techId)) return fail("Please pick a technician.", 400);
  if (!isValidDateString(date)) return fail("That date doesn't look right.", 400);
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || startMin < 0 || endMin > 1440 || endMin <= startMin) {
    return fail("That time doesn't look right.", 400);
  }

  const result = await ghlRequest<{ id?: string }>("/calendars/events/block-slots", {
    method: "POST",
    body: {
      locationId: GHL_LOCATION_ID,
      assignedUserId: techId,
      startTime: toZonedIso(dateAndMinutesToMs(date, startMin)),
      endTime: toZonedIso(dateAndMinutesToMs(date, endMin)),
      title,
    },
  });
  if (!result.ok) return fail(result.error, 502);
  return NextResponse.json({ ok: true, id: result.data?.id ?? null });
}
