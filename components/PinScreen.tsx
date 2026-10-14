"use client";

import { FormEvent, useState } from "react";
import { SALON_NAME } from "@/config/salon";

export default function PinScreen() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
      setPin("");
    } catch {
      setError("Can't reach the board. Check the internet connection.");
    }
    setBusy(false);
  }

  return (
    <main className="pin-page">
      <form className="pin-card" onSubmit={submit}>
        <h1>{SALON_NAME}</h1>
        <p>Enter the PIN to open the board</p>
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label="PIN"
          placeholder="PIN"
        />
        {error && <div className="pin-error">{error}</div>}
        <button type="submit" disabled={!pin || busy}>
          {busy ? "Checking…" : "Open board"}
        </button>
      </form>
    </main>
  );
}
