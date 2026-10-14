import { NextRequest, NextResponse } from "next/server";
import { fail, requirePin } from "@/lib/apiAuth";
import { ghlRequest } from "@/lib/ghl";
import { toAppointments, type GhlEvent } from "@/lib/appointments";
import { toClient, type GhlContact } from "@/lib/clients";

export const dynamic = "force-dynamic";

/** GET /api/clients/:id — one client plus all their bookings. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePin();
  if (denied) return denied;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return fail("Unknown client.", 400);

  const [contact, bookings] = await Promise.all([
    ghlRequest<{ contact?: GhlContact }>(`/contacts/${id}`, { version: "2021-07-28" }),
    ghlRequest<{ events?: GhlEvent[] }>(`/contacts/${id}/appointments`, { version: "2021-07-28" }),
  ]);
  if (!contact.ok) return fail(contact.error, 502);
  if (!bookings.ok) return fail(bookings.error, 502);
  if (!contact.data?.contact) return fail("Client not found.", 404);

  return NextResponse.json({
    client: toClient(contact.data.contact),
    events: toAppointments(bookings.data?.events ?? [], true).reverse(), // newest first
  });
}
