// Server-only: read blocked time (off / outside shift / breaks) for the technicians.
import { GHL_LOCATION_ID, TECHNICIANS } from "@/config/salon";
import { ghlRequest } from "@/lib/ghl";
import { dayRange } from "@/lib/time";
import type { Block } from "@/lib/types";

type GhlBlock = { id: string; assignedUserId?: string; startTime?: string; endTime?: string; title?: string; deleted?: boolean };

export async function fetchBlocks(
  date: string,
  techIds: string[] = TECHNICIANS.map((t) => t.id),
): Promise<{ ok: true; blocks: Block[] } | { ok: false; error: string }> {
  const { start, end } = dayRange(date);
  const results = await Promise.all(
    techIds.map((userId) =>
      ghlRequest<{ events?: GhlBlock[] }>(
        `/calendars/blocked-slots?${new URLSearchParams({ locationId: GHL_LOCATION_ID, userId, startTime: String(start), endTime: String(end) })}`,
      ).then((r) => ({ userId, r })),
    ),
  );
  const blocks: Block[] = [];
  for (const { userId, r } of results) {
    if (!r.ok) return { ok: false, error: r.error };
    for (const b of r.data?.events ?? []) {
      const s = Date.parse(b.startTime ?? "");
      const e = Date.parse(b.endTime ?? "");
      if (b.deleted || !Number.isFinite(s) || !Number.isFinite(e)) continue;
      blocks.push({ id: b.id, techId: b.assignedUserId || userId, start: s, end: e, title: (b.title || "Blocked").trim() });
    }
  }
  blocks.sort((a, b) => a.start - b.start);
  return { ok: true, blocks };
}
