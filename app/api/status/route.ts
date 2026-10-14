import { NextResponse } from "next/server";
import { requirePin } from "@/lib/apiAuth";
import { GHL_LOCATION_ID } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { fetchAppointments } from "@/lib/appointments";
import { todayString } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/status — can the board read appointments and clients right now? */
export async function GET() {
  const denied = await requirePin();
  if (denied) return denied;
  const today = todayString();
  const [appts, clients] = await Promise.all([
    fetchAppointments(today, today, false),
    ghlRequest("/contacts/search", {
      method: "POST",
      version: "2021-07-28",
      body: { locationId: GHL_LOCATION_ID, page: 1, pageLimit: 1 },
    }),
  ]);
  return NextResponse.json({
    appointments: appts.ok ? { ok: true } : { ok: false, error: appts.error },
    clients: clients.ok ? { ok: true } : { ok: false, error: clients.error },
    checkedAt: Date.now(),
  });
}
