import type { Metadata } from "next";
import { Press_Start_2P, VT323 } from "next/font/google";
import "./globals.css";

// Pixel fonts cover Latin only; Thai text falls back to the bundled "GTS Thai" font from globals.css.
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-pixel", display: "swap" });
const terminal = VT323({ weight: "400", subsets: ["latin"], variable: "--font-terminal", display: "swap" });

export const metadata: Metadata = {
  title: "Game Translation Studio",
  description: "Local-first game translation workspace with exact title adapters.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pixel.variable} ${terminal.variable}`}>
      <body>{children}</body>
    </html>
  );
}
