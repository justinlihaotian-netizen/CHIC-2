import { NextRequest, NextResponse } from "next/server";
import { fail, requirePin } from "@/lib/apiAuth";
import { fetchAppointments } from "@/lib/appointments";
import { fetchBlocks } from "@/lib/blocks";
import { isValidDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_DAYS = 62;

/**
 * GET /api/events?date=YYYY-MM-DD                      one day (cancelled hidden) + blocked time
 * GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD&all=1  a range; all=1 also includes cancelled
 */
export async function GET(request: NextRequest) {
  const denied = await requirePin();
  if (denied) return denied;

  const q = request.nextUrl.searchParams;
  const start = q.get("date") ?? q.get("start");
  const end = q.get("date") ?? q.get("end");
  if (!isValidDateString(start) || !isValidDateString(end) || end < start) {
    return fail("That date doesn't look right. Use YYYY-MM-DD.", 400);
  }
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days > MAX_DAYS) return fail(`Please choose ${MAX_DAYS} days or fewer.`, 400);

  // For a single day, also send each technician's blocked time (off, shift, breaks).
  const single = q.get("date") !== null;
  const [result, blocks] = await Promise.all([
    fetchAppointments(start, end, q.get("all") === "1"),
    single ? fetchBlocks(start) : Promise.resolve(null),
  ]);
  if (!result.ok) return fail(result.error, 502);
  return NextResponse.json(
    { events: result.events, blocks: blocks?.ok ? blocks.blocks : [], fetchedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
