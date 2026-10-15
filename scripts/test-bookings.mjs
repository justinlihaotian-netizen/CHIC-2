// Creates (or removes) a full day of TEST bookings so the board can be checked.
//   node scripts/test-bookings.mjs create     → makes the bookings on TEST_DATE
//   node scripts/test-bookings.mjs cleanup    → cancels every booking this script made
// Only uses the demo clients (no phone/email) and never sends notifications.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TEST_DATE = "2026-10-16";
const OFFSET = "-04:00"; // Toronto daylight time on that date
const HERE = dirname(fileURLToPath(import.meta.url));
const LOG = join(HERE, ".test-bookings.json"); // ids of what we created (for cleanup)

const env = Object.fromEntries(
  readFileSync(join(HERE, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const LOCATION = "yAamMXgYk4PvWUmljkox";
const API = "https://services.leadconnectorhq.com";
const headers = {
  Authorization: `Bearer ${env.GHL_TOKEN}`,
  Version: "2021-04-15",
  Accept: "application/json",
  "Content-Type": "application/json",
};

const TECH = { Iko: "aqlD0AF0sWWaHRNaAtnc", Kathy: "5E74a8yx9ctSySomHXJ8", Vicky: "BF3hofVjav81nr3Ez9wF", Yuna: "SfAT0DCBJICbwhVQu4ZA" };
const CAL = {
  30: "oPiQcslctM1P1YJhOZNC",
  45: "IayhVSetPSzcoPgfYYFr",
  60: "WWH16QNZ5VvfrRKWoEGG",
  75: "I9ORRJJiFe4x8fCr7EHs",
  90: "kKZb1lc4emORuK3bbEmY",
  120: "bwMaHA0twzVK7RJaJcws",
  lash60: "xK7J9frAEVp32DFAiayG",
  lash120: "XwivkHXYAAna31Q606SE",
};
// Demo clients only — none has a phone number or email.
const CLIENT = {
  Mila: "bm0aenBW5YKtoC9mpQIe", Leah: "hRABZQatxT7Y75g5ErJL", Nora: "ARWfbbL89698qnLT9jNg", Ruby: "SIzqjC8WUcUCLcpfdkYz",
  Hannah: "Sr4LhwtxTDafzDvMJzhL", Zoe: "80YhOzh6oLgyZZB3XRi8", Lily: "6PRxS9c3aElRKWq7p1Rj", Grace: "QjDjYlatmOUnm3ja0lGG",
  Isabella: "GVyskiMBrErQAfJYLAJY", Ava: "qvSfgGKKdDZQ2RYD9B9i", Mia: "VvFV2zm13Yb2Tnj2RBpY", Sophia: "zE8a0W0h2ZSaagW4iHoK",
  Olivia: "OjPvLoa9hPd60QkBAxfA", Emma: "LwmFWLlzPnPac8eVeRED",
};

// [client, tech, start, end, service, calendar, { group, heart, status }]
const BOOKINGS = [
  // Group of 5 at 10:00 — Sophia booked for herself + 4 friends
  ["Sophia", "Iko", "10:00", "11:00", "Deluxe Pedicure with Gel Polish", 60, {}],
  ["Ava", "Kathy", "10:00", "11:00", "Deluxe Pedicure with Gel Polish", 60, { group: "Sophia Demo" }],
  ["Mia", "Vicky", "10:00", "10:45", "Shellac Manicure", 45, { group: "Sophia Demo" }],
  ["Isabella", "Yuna", "10:00", "11:00", "Spa Pedicure", 60, { group: "Sophia Demo" }],
  ["Grace", "Iko", "11:00", "11:45", "Shellac Manicure", 45, { group: "Sophia Demo" }],

  // Back-to-back for Kathy 11:00 → 13:00 (then the 13:00 group)
  ["Nora", "Kathy", "11:00", "11:30", "Polish Change - Hands", 30, {}],
  ["Ruby", "Kathy", "11:30", "12:15", "Shellac Manicure", 45, {}],
  ["Hannah", "Kathy", "12:15", "13:00", "Express Pedicure", 45, {}],

  // Group of 4 at 13:00 — three asked for their technician (♥)
  ["Olivia", "Yuna", "13:00", "14:15", "Gel-X Full Set", 75, { heart: true }],
  ["Emma", "Iko", "13:00", "14:00", "BIAB Gel Refill", 60, { group: "Olivia Demo", heart: true }],
  ["Zoe", "Kathy", "13:00", "13:45", "Shellac Manicure", 45, { group: "Olivia Demo", heart: true }],
  ["Lily", "Vicky", "13:00", "14:00", "Basic Pedicure", 60, { group: "Olivia Demo" }],

  // Statuses
  ["Leah", "Vicky", "11:00", "12:00", "Lash Lift & Tint", "lash60", { status: "showed" }],
  ["Mila", "Iko", "12:00", "12:45", "Shellac Manicure", 45, { status: "noshow" }],
  ["Zoe", "Yuna", "11:30", "12:30", "Spa Pedicure", 60, { status: "cancelled" }],
  ["Ava", "Vicky", "16:00", "16:45", "Gel Polish Change", 45, { status: "new" }],

  // Double-booked: two overlapping bookings for Iko
  ["Leah", "Iko", "14:30", "15:30", "Solar Powder Refill", 60, {}],
  ["Mila", "Iko", "15:00", "15:30", "Kid Shellac Manicure", 30, {}],

  // Very short and very long
  ["Ruby", "Vicky", "14:15", "14:30", "Nail Repair (1 nail)", 30, {}],
  ["Nora", "Yuna", "15:00", "17:00", "Lash Extension Full Set", "lash120", {}],

  // Solo client who asked for her technician
  ["Lily", "Vicky", "17:00", "18:00", "Gel-X Refill", 60, { heart: true }],

  // Group of 2 in the evening
  ["Hannah", "Iko", "18:00", "18:30", "Basic Manicure", 30, {}],
  ["Lily", "Kathy", "18:00", "18:30", "Basic Manicure", 30, { group: "Hannah Demo" }],

  // Outside opening hours (shaded on the board)
  ["Olivia", "Yuna", "08:00", "08:45", "Express Manicure", 45, {}],
  ["Emma", "Kathy", "20:00", "21:00", "Deluxe Pedicure", 60, {}],
];

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)?.slice(0, 200)}`);
  return data;
}

async function create() {
  if (existsSync(LOG) && JSON.parse(readFileSync(LOG, "utf8")).length) {
    console.log("Test bookings already exist — run cleanup first.");
    return;
  }
  const made = [];
  try {
    for (const [client, tech, start, end, service, cal, opt] of BOOKINGS) {
      let title = `${client} - ${service}`;
      if (opt.group) title += ` (group of ${opt.group})`;
      if (opt.heart) title += " ♥";
      const created = await call("POST", "/calendars/events/appointments", {
        calendarId: CAL[cal],
        locationId: LOCATION,
        contactId: CLIENT[client],
        assignedUserId: TECH[tech],
        startTime: `${TEST_DATE}T${start}:00${OFFSET}`,
        endTime: `${TEST_DATE}T${end}:00${OFFSET}`,
        title,
        appointmentStatus: opt.status === "new" ? "new" : "confirmed",
        ignoreFreeSlotValidation: true,
        ignoreDateRange: true,
        toNotify: false,
      });
      const id = created.id ?? created.appointment?.id;
      made.push(id);
      writeFileSync(LOG, JSON.stringify(made, null, 2));
      if (opt.status && opt.status !== "new") {
        await call("PUT", `/calendars/events/appointments/${id}`, { appointmentStatus: opt.status, toNotify: false });
      }
      console.log(`✓ ${start}–${end}  ${tech.padEnd(5)}  ${title}${opt.status ? `  [${opt.status}]` : ""}`);
    }
  } finally {
    writeFileSync(LOG, JSON.stringify(made, null, 2));
    console.log(`\n${made.length} of ${BOOKINGS.length} test bookings created on ${TEST_DATE}.`);
  }
}

async function cleanup() {
  const ids = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  const left = [];
  for (const id of ids) {
    try {
      await call("PUT", `/calendars/events/appointments/${id}`, { appointmentStatus: "cancelled", toNotify: false });
      console.log(`✓ cancelled ${id}`);
    } catch (e) {
      console.log(`✗ ${id}: ${e.message}`);
      left.push(id);
    }
  }
  writeFileSync(LOG, JSON.stringify(left, null, 2));
  console.log(`\nCancelled ${ids.length - left.length} test bookings.${left.length ? ` ${left.length} could not be cancelled.` : ""}`);
}

const mode = process.argv[2];
if (mode === "create") await create();
else if (mode === "cleanup") await cleanup();
else console.log("Use: node scripts/test-bookings.mjs create | cleanup");
