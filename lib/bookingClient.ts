import type { Appointment } from "@/lib/types";

// Browser-side helpers shared by the side panel and drag-and-drop.

/** Send a change for one booking to our server (which passes it to GHL). Returns an error message, or null on success. */
export async function patchBooking(id: string, changes: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (res.status === 401) {
      window.location.reload(); // PIN cookie expired → show the PIN screen
      return "Please enter the PIN again.";
    }
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? "The change didn't go through. Please try again.";
  } catch {
    return "Can't reach the board's server. Check the internet connection and try again.";
  }
}

/** Other bookings for the same technician that would overlap the given time. */
export function findClashes(events: Appointment[], id: string, techId: string, start: number, end: number) {
  return events.filter((e) => e.id !== id && e.techId === techId && e.start < end && e.end > start);
}

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      window.location.reload();
      return "Please enter the PIN again.";
    }
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? "The change didn't go through. Please try again.";
  } catch {
    return "Can't reach the board's server. Check the internet connection and try again.";
  }
}

/** Block time for a technician (minutes after midnight). Returns an error message or null. */
export const createBlock = (b: { techId: string; date: string; startMin: number; endMin: number; title: string }) =>
  send("/api/blocks", "POST", b);

export const deleteBlock = (id: string, techId: string, date: string) =>
  send(`/api/blocks/${encodeURIComponent(id)}?techId=${encodeURIComponent(techId)}&date=${date}`, "DELETE");
