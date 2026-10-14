import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, isAuthed } from "@/lib/auth";

// Server-only helpers shared by the API routes.

export const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** null when the request carries a valid PIN cookie, otherwise a ready "please log in" response. */
export async function requirePin() {
  return isAuthed((await cookies()).get(AUTH_COOKIE)?.value) ? null : fail("Please enter the PIN first.", 401);
}
