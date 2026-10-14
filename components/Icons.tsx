// Simple line icons (24×24, drawn with the current text colour).
type P = { size?: number };
const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconAppointments = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v3M16 2.5v3M7.5 13h3M7.5 16.5h3M13.5 13h3" /></svg>
);
export const IconCheckIn = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16.2 9.5" /></svg>
);
export const IconCalendar = ({ size }: P) => (
  <svg {...base(size)}><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v3M16 2.5v3" /><circle cx="8" cy="13.5" r=".6" fill="currentColor" /><circle cx="12" cy="13.5" r=".6" fill="currentColor" /><circle cx="16" cy="13.5" r=".6" fill="currentColor" /><circle cx="8" cy="17" r=".6" fill="currentColor" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>
);
export const IconClients = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c1.8.6 3 2.3 3.4 5.2" /></svg>
);
export const IconHistory = ({ size }: P) => (
  <svg {...base(size)}><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconReports = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6M20 16V6" /></svg>
);
export const IconSettings = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const IconMenu = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
);
export const IconLock = ({ size }: P) => (
  <svg {...base(size)}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
export const IconSearch = ({ size }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
);
