// The clean appointment shape our API routes send to the pages.
export type Status = "held" | "confirmed" | "showed" | "noshow" | "cancelled";

export type Appointment = {
  id: string;
  date: string; // salon date "YYYY-MM-DD"
  techId: string; // a technician id from config/salon.ts, or "unassigned"
  contactId: string | null;
  clientName: string;
  service: string;
  groupOf: string | null; // "Jane Doe" when the title has "(group of Jane Doe)"
  partySize: number; // how many people came together (1 = on their own)
  requested: boolean; // client asked for this technician (♥)
  start: number; // epoch ms
  end: number; // epoch ms
  timeLabel: string; // "10:00 AM – 11:15 AM"
  status: Status;
  rawTitle: string;
};

export const STATUS_LABEL: Record<Status, string> = {
  held: "On hold",
  confirmed: "Confirmed",
  showed: "Checked in",
  noshow: "No-show",
  cancelled: "Cancelled",
};

export type EventsResponse = { events: Appointment[]; fetchedAt: number } | { error: string };

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  dateAdded: string | null;
};

/** Time a technician isn't available (off, outside shift, break). Stored as blocked time in the booking system. */
export type Block = {
  id: string;
  techId: string;
  start: number; // epoch ms
  end: number; // epoch ms
  title: string; // "Off", "Off shift", "Lunch", …
};

export const OFF_DAY_TITLE = "Off";
export const OFF_SHIFT_TITLE = "Off shift";
