import { NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE_SECONDS, authToken, isPinCorrect } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = authToken();
  if (!token) {
    return NextResponse.json({ error: "The board has no PIN set up yet (BOARD_PIN is missing)." }, { status: 500 });
  }

  let pin: unknown;
  try {
    pin = (await request.json())?.pin;
  } catch {
    pin = undefined;
  }

  if (!isPinCorrect(pin)) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong PIN. Please try again." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    // Safari refuses "secure" cookies on plain http://localhost, so only require HTTPS when deployed.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  return res;
}
