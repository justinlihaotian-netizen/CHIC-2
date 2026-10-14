"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  IconAppointments,
  IconCalendar,
  IconCheckIn,
  IconClients,
  IconHistory,
  IconLock,
  IconMenu,
  IconReports,
  IconSettings,
} from "@/components/Icons";

const NAV = [
  { href: "/", label: "Appointments", Icon: IconAppointments },
  { href: "/checked-in", label: "Checked-in", Icon: IconCheckIn },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/clients", label: "Clients", Icon: IconClients },
  { href: "/history", label: "History", Icon: IconHistory },
  { href: "/reports", label: "Reports", Icon: IconReports },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];
const NAV_KEY = "salonBoardNavCollapsed";
const isDesktop = () => window.matchMedia("(min-width: 1200px)").matches;

const NavContext = createContext<{ toggle: () => void }>({ toggle: () => {} });

/** The ☰ button every page puts at the start of its header. */
export function MenuButton() {
  const { toggle } = useContext(NavContext);
  return (
    <button className="menu-btn" onClick={toggle} aria-label="Menu">
      <IconMenu size={22} />
    </button>
  );
}

export async function lockDevice() {
  await fetch("/api/logout", { method: "POST" }).catch(() => null);
  window.location.href = "/";
}

/**
 * Sidebar + page area.
 * Desktop: full sidebar; ☰ shrinks it to icons (remembered).
 * iPad: icon rail; ☰ slides the full sidebar over the page.
 * Phone: hidden; ☰ slides it in.
 */
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [toggled, setToggled] = useState(false);

  useEffect(() => {
    try {
      if (isDesktop() && localStorage.getItem(NAV_KEY) === "1") setToggled(true);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setToggled((t) => {
      if (isDesktop()) {
        try {
          localStorage.setItem(NAV_KEY, t ? "0" : "1");
        } catch {}
      }
      return !t;
    });
  }, []);

  // On iPad/phone the slide-over closes after picking a page.
  useEffect(() => {
    if (!isDesktop()) setToggled(false);
  }, [pathname]);

  return (
    <NavContext.Provider value={{ toggle }}>
      <div className={`shell${toggled ? " nav-toggled" : ""}`}>
        <aside className="sidebar" aria-label="Main menu">
          <Link href="/" className="logo" aria-label="CHIC 2 Wasaga — Appointments">
            <span className="logo-mark">C2</span>
            <span className="logo-text">
              <span className="logo-name">CHIC 2</span>
              <span className="logo-sub">WASAGA</span>
            </span>
          </Link>
          <nav className="nav">
            {NAV.map(({ href, label, Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} title={label}>
                  <Icon />
                  <span className="nav-label">{label}</span>
                </Link>
              );
            })}
          </nav>
          <button className="nav-item nav-lock" onClick={lockDevice} title="Lock this device">
            <IconLock />
            <span className="nav-label">Lock</span>
          </button>
        </aside>
        <div className="nav-backdrop" onClick={() => setToggled(false)} />
        <main className="main">{children}</main>
      </div>
    </NavContext.Provider>
  );
}

/** Standard header for the non-board pages. */
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <MenuButton />
      <h1>{title}</h1>
      <div className="page-head-actions">{children}</div>
    </header>
  );
}
