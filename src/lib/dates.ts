export type ExpiryLevel = "none" | "ok" | "soon" | "urgent" | "expired";

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function expiryLevel(date: string | null): ExpiryLevel {
  const days = daysUntil(date);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 1) return "urgent";
  if (days <= 3) return "soon";
  return "ok";
}

export function expiryLabel(date: string | null): string | null {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < -1) return `périmé depuis ${Math.abs(days)} j`;
  if (days === -1) return "périmé d'hier";
  if (days === 0) return "à consommer aujourd'hui";
  if (days === 1) return "à consommer demain";
  return `encore ${days} jours`;
}

export const EXPIRY_STYLES: Record<ExpiryLevel, string> = {
  none: "",
  ok: "bg-emerald-500",
  soon: "bg-amber-500",
  urgent: "bg-orange-600",
  expired: "bg-rose-600",
};
