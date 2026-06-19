import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Cormorant_Garamond } from 'next/font/google'
import "./globals.css";

const ui = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
})

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Panel Andres",
  description: "Home dashboard",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ADVL", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#16365f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${ui.variable} ${serif.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
