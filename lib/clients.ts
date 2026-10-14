import type { Client } from "@/lib/types";

export type GhlContact = {
  id: string;
  contactName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  tags?: string[];
  dateAdded?: string | null;
};


export function toClient(c: GhlContact): Client {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.contactName?.trim() || "(no name)";
  return {
    id: c.id,
    name,
    phone: c.phone || null,
    email: c.email || null,
    tags: c.tags ?? [],
    dateAdded: c.dateAdded ?? null,
  };
}
