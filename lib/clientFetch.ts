// Browser-side: fetch JSON from our own API, with friendly errors.
export async function getJSON<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 401) {
      window.location.reload(); // PIN cookie expired → PIN screen
      return { ok: false, error: "Please enter the PIN again." };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || "error" in data) {
      return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Can't reach the board's server. Check the internet connection." };
  }
}
