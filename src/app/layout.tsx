import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Andres",
  description: "Home dashboard",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ADVL", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#16365f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
