import { NextRequest, NextResponse } from "next/server";
import { fail, requirePin } from "@/lib/apiAuth";
import { GHL_LOCATION_ID } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { toClient, type GhlContact } from "@/lib/clients";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

/** GET /api/clients?q=jane&page=1 — search clients by name, phone or email. */
export async function GET(request: NextRequest) {
  const denied = await requirePin();
  if (denied) return denied;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(200, Number(request.nextUrl.searchParams.get("page")) || 1));
  const result = await ghlRequest<{ contacts?: GhlContact[]; total?: number }>("/contacts/search", {
    method: "POST",
    version: "2021-07-28",
    body: {
      locationId: GHL_LOCATION_ID,
      page,
      pageLimit: PAGE_SIZE,
      ...(q ? { query: q } : {}),
      sort: [{ field: "dateAdded", direction: "desc" }],
    },
  });
  if (!result.ok) return fail(result.error, 502);
  const clients = (result.data?.contacts ?? []).map(toClient);
  const total = result.data?.total ?? clients.length;
  return NextResponse.json({ clients, total, hasMore: page * PAGE_SIZE < total });
}
