import { SERVICE_OTHER, SERVICE_TYPES, type ServiceType } from "@/config/salon";

export type ServiceLook = { id: string; name: string; colors: string[] }; // 2 colours = combo

const mani = SERVICE_TYPES.find((t) => t.id === "mani")!;
const pedi = SERVICE_TYPES.find((t) => t.id === "pedi")!;
export const COMBO_LOOK: ServiceLook = { id: "combo", name: "Mani + pedi combo", colors: [mani.color, pedi.color] };

/** Which colour group a service belongs to, from its name. */
export function serviceLook(service: string): ServiceLook {
  const s = service.toLowerCase();
  if (s.includes("combo") || (s.includes("mani") && s.includes("pedi"))) return COMBO_LOOK;
  const t: ServiceType = SERVICE_TYPES.find((type) => type.keywords.some((k) => s.includes(k))) ?? SERVICE_OTHER;
  return { id: t.id, name: t.name, colors: [t.color] };
}

/** Every look, in legend order. */
export const ALL_LOOKS: ServiceLook[] = [
  { id: mani.id, name: mani.name, colors: [mani.color] },
  { id: pedi.id, name: pedi.name, colors: [pedi.color] },
  COMBO_LOOK,
  ...SERVICE_TYPES.filter((t) => t !== mani && t !== pedi).map((t) => ({ id: t.id, name: t.name, colors: [t.color] })),
  { id: SERVICE_OTHER.id, name: SERVICE_OTHER.name, colors: [SERVICE_OTHER.color] },
];

export const COLOR_BY_KEY = "salonBoardColorBy"; // "service" (default) or "technician"
