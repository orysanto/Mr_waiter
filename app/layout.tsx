// app/layout.tsx — Root layout, wraps every page.
// ChatWidget is imported here so it appears on ALL routes automatically.

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ChatWidget from "@/components/ChatWidget";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bella Vista — Fine Dining in San Francisco",
  description:
    "Experience exceptional cuisine at Bella Vista. Book a table or ask our AI waiter anything.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.className} antialiased`}>
        {/* Page content */}
        {children}

        {/* Floating chat widget — renders on every page */}
        <ChatWidget />
      </body>
    </html>
  );
}
