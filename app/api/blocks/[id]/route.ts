import { NextRequest, NextResponse } from "next/server";
import { fail, requirePin } from "@/lib/apiAuth";
import { fetchBlocks } from "@/lib/blocks";
import { ghlRequest } from "@/lib/ghl";
import { isValidDateString } from "@/lib/time";
import { TECHNICIANS } from "@/config/salon";

export const dynamic = "force-dynamic";
const knownTechIds = new Set(TECHNICIANS.map((t) => t.id));

/** DELETE /api/blocks/:id?techId=…&date=… — remove blocked time (only ever a block, never a booking). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePin();
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail("This change didn't come from the board.", 403);

  const { id } = await params;
  const techId = request.nextUrl.searchParams.get("techId") ?? "";
  const date = request.nextUrl.searchParams.get("date");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !knownTechIds.has(techId) || !isValidDateString(date)) {
    return fail("Unknown blocked time.", 400);
  }
  // Safety: make sure this id really is one of that technician's blocks on that day.
  const blocks = await fetchBlocks(date, [techId]);
  if (!blocks.ok) return fail(blocks.error, 502);
  if (!blocks.blocks.some((b) => b.id === id)) return fail("That blocked time no longer exists.", 404);

  const result = await ghlRequest(`/calendars/events/${id}`, { method: "DELETE" });
  if (!result.ok) return fail(result.error, 502);
  return NextResponse.json({ ok: true });
}
