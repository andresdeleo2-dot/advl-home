import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Andres",
  description: "Home dashboard",
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
