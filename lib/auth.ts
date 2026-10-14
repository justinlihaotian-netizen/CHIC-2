import { createHmac, timingSafeEqual } from "crypto";

// Server-only helpers for the PIN lock. Never import this from a "use client" file.

export const AUTH_COOKIE = "salon_board_auth";
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sameText(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** The cookie value: a fingerprint of the PIN, so it can't be guessed or faked. Changing BOARD_PIN logs every device out. */
export function authToken(): string | null {
  const pin = process.env.BOARD_PIN;
  if (!pin) return null;
  return createHmac("sha256", pin).update("salon-board-session-v1").digest("hex");
}

export function isPinCorrect(pin: unknown): boolean {
  const real = process.env.BOARD_PIN;
  return typeof pin === "string" && !!real && sameText(pin.trim(), real);
}

export function isAuthed(cookieValue: string | undefined): boolean {
  const token = authToken();
  return !!token && !!cookieValue && sameText(cookieValue, token);
}
