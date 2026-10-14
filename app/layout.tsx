import type { Metadata, Viewport } from "next";
import { SALON_NAME } from "@/config/salon";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SALON_NAME} · Salon Board`,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Salon Board", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
