// ─── Salon settings ─────────────────────────────────────────────
// Edit this file to change the salon name, hours, or technicians.

export const SALON_NAME = "CHIC 2 Wasaga";
export const TIME_ZONE = "America/Toronto";

// Opening hours (24-hour clock). The board shows the full day; hours outside these are shaded.
export const OPEN_HOUR = 9; // 9:00 AM
export const CLOSE_HOUR = 20; // 8:00 PM

// GoHighLevel account ids (not secret — the token lives in .env.local).
export const GHL_LOCATION_ID = "yAamMXgYk4PvWUmljkox";
export const GHL_GROUP_ID = "FJO2ux0X4NhP2FuATCQD";

export type Technician = { id: string; name: string; color: string };

// To add a technician: copy one line, change the name, GHL user id and colour.
export const TECHNICIANS: Technician[] = [
  { id: "aqlD0AF0sWWaHRNaAtnc", name: "Iko", color: "#8E24AA" },
  { id: "5E74a8yx9ctSySomHXJ8", name: "Kathy", color: "#F4511E" },
  { id: "BF3hofVjav81nr3Ez9wF", name: "Vicky", color: "#3F51B5" },
  { id: "SfAT0DCBJICbwhVQu4ZA", name: "Yuna", color: "#33B679" },
];

// Anything with an unknown or empty technician goes here (always the last column).
export const UNASSIGNED: Technician = { id: "unassigned", name: "Unassigned", color: "#757575" };

// ─── Booking colours by service type ────────────────────────────
// A booking gets the colour of the first type whose keyword appears in its service name.
// "Mani" + "Pedi" in one booking (or "combo") shows half manicure / half pedicure colour.
// These 4 colours are checked to stay distinguishable for colour-blind staff; adding more makes them blur.
export type ServiceType = { id: string; name: string; color: string; keywords: string[] };
export const SERVICE_TYPES: ServiceType[] = [
  { id: "lash", name: "Lashes, brows & waxing", color: "#1baf7a", keywords: ["lash", "brow", "tint", "wax"] },
  {
    id: "enhance",
    name: "Gel-X, BIAB & enhancements",
    color: "#4a3aa7",
    keywords: ["gel-x", "gelx", "gel x", "apres", "biab", "builder", "solar", "powder", "dip", "acrylic", "extension", "full set", "fill", "ombr"],
  },
  { id: "pedi", name: "Pedicure", color: "#eb6834", keywords: ["pedi"] },
  { id: "mani", name: "Manicure", color: "#2a78d6", keywords: ["mani", "polish", "shellac", "repair", "nail"] },
];
export const SERVICE_OTHER: ServiceType = { id: "other", name: "Other", color: "#8a94a6", keywords: [] };
