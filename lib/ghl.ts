// Server-only: talks to GoHighLevel with the secret token. Never import this from a "use client" file.

const GHL_BASE = "https://services.leadconnectorhq.com";

export type GhlResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function ghlRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<GhlResult<T>> {
  const token = process.env.GHL_TOKEN;
  if (!token) {
    return { ok: false, error: "The GHL token is missing. Add GHL_TOKEN to .env.local and restart." };
  }

  let res: Response;
  try {
    res = await fetch(`${GHL_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-04-15",
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, error: "Can't reach GoHighLevel right now. Check the internet connection and try again." };
  }

  const data = await res.json().catch(() => null);

  if (res.ok) return { ok: true, data: data as T };
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error:
        init.method && init.method !== "GET"
          ? "GoHighLevel didn't allow this change. The GHL token needs the “Edit Calendar Events” (calendars/events.write) permission."
          : "GoHighLevel refused the token. The GHL_TOKEN may be wrong, expired, or missing calendar permissions.",
    };
  }
  if (res.status === 429) return { ok: false, error: "GoHighLevel says we're asking too often. Wait a moment and try again." };

  // GHL usually explains validation problems in "message".
  const msg = data && (Array.isArray(data.message) ? data.message.join(", ") : data.message);
  if (res.status >= 400 && res.status < 500 && typeof msg === "string" && msg) {
    return { ok: false, error: `GoHighLevel said: ${msg}` };
  }
  return { ok: false, error: `GoHighLevel is having trouble (error ${res.status}). Please try again.` };
}
