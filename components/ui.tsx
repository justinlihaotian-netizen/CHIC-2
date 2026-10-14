import { TECHNICIANS, UNASSIGNED } from "@/config/salon";
import { STATUS_LABEL, type Status } from "@/lib/types";

export const ALL_TECHS = [...TECHNICIANS, UNASSIGNED];
export const techOf = (id: string) => ALL_TECHS.find((t) => t.id === id) ?? UNASSIGNED;

export function TechTag({ id }: { id: string }) {
  const t = techOf(id);
  return (
    <span className="tech-tag">
      <span className="dot" style={{ background: t.color }} />
      {t.name}
    </span>
  );
}

export function StatusPill({ status }: { status: Status }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function ClientName({ name, partySize, requested }: { name: string; partySize: number; requested: boolean }) {
  return (
    <span className="client-name">
      <span className="party">{partySize}</span>
      {name}
      {requested && <span className="heart">♥</span>}
    </span>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error"; children: React.ReactNode }) {
  return <div className={`notice ${kind}`}>{children}</div>;
}

/** "(555) 123-4567" → "••• 123-4567" so screens don't show full numbers. */
export function maskPhone(phone: string | null) {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? `••• ${digits.slice(-7, -4)}-${digits.slice(-4)}` : phone;
}
