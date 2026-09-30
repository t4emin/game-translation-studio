import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
