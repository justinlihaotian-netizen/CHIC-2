// The clean appointment shape our /api/events route sends to the page.
export type Appointment = {
  id: string;
  techId: string; // a technician id from config/salon.ts, or "unassigned"
  clientName: string;
  service: string;
  groupOf: string | null; // "Jane Doe" when the title has "(group of Jane Doe)"
  start: number; // epoch ms
  end: number; // epoch ms
  timeLabel: string; // "10:00 AM – 11:15 AM"
  status: "confirmed" | "held" | string;
  rawTitle: string;
};

export type EventsResponse = { date: string; events: Appointment[]; fetchedAt: number } | { error: string };
