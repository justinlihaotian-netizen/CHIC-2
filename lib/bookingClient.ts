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
