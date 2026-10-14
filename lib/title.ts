// Booking titles carry extra details the booking system has no field for:
//   "Ava - Shellac Mani (group of Jane Doe) ♥"
//    │      │             │                  └ client asked for this technician
//    │      │             └ part of Jane Doe's party
//    │      └ service
//    └ client

const HEART = /\s*(?:♥|❤️?|\(requested\))\s*/gi;

/** "Ava - Shellac Mani (group of Jane Doe) ♥" → client, service, groupOf, requested */
export function parseTitle(title: string) {
  let rest = title.trim();
  const requested = HEART.test(rest);
  HEART.lastIndex = 0;
  rest = rest.replace(HEART, " ").trim();

  let groupOf: string | null = null;
  const group = rest.match(/\(\s*group of\s+([^)]+?)\s*\)/i);
  if (group) {
    groupOf = group[1];
    rest = rest.replace(group[0], "").trim();
  }
  const dash = rest.indexOf(" - ");
  if (dash === -1) return { clientName: rest || "(no name)", service: "", groupOf, requested };
  return {
    clientName: rest.slice(0, dash).trim() || "(no name)",
    service: rest.slice(dash + 3).trim(),
    groupOf,
    requested,
  };
}

/** The reverse: ("Ava", "Shellac Mani", "Jane Doe", true) → "Ava - Shellac Mani (group of Jane Doe) ♥" */
export function buildTitle(clientName: string, service: string, groupOf: string | null, requested = false) {
  let title = service ? `${clientName} - ${service}` : clientName;
  if (groupOf) title += ` (group of ${groupOf})`;
  if (requested) title += " ♥";
  return title;
}

/** Party size for each booking of one day: the group members plus the person who booked for the group. */
export function partySizes(bookings: { id: string; clientName: string; groupOf: string | null }[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const members = new Map<string, number>();
  for (const b of bookings) if (b.groupOf) members.set(norm(b.groupOf), (members.get(norm(b.groupOf)) ?? 0) + 1);

  // The organiser's own booking has no "(group of …)" but their name matches the group name (full or first name).
  const leaders = new Map<string, string>(); // group key → organiser booking id
  for (const b of bookings) {
    if (b.groupOf) continue;
    const name = norm(b.clientName);
    for (const key of members.keys()) {
      if (!leaders.has(key) && (name === key || name === key.split(/\s+/)[0])) leaders.set(key, b.id);
    }
  }

  const sizes = new Map<string, number>();
  for (const b of bookings) {
    const key = b.groupOf ? norm(b.groupOf) : [...leaders].find(([, id]) => id === b.id)?.[0];
    sizes.set(b.id, key ? (members.get(key) ?? 0) + (leaders.has(key) ? 1 : 0) : 1);
  }
  return sizes;
}
