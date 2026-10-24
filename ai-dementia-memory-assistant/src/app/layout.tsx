import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Lumen — Memory in the moment",
  description:
    "An AI memory companion for people living with dementia. Webcam face tracking, Whisper transcription, and Gemma context overlays.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} bg-[#0c0a08] text-[#f4eee4] antialiased`}>
        <div className="grain" />
        {children}
      </body>
    </html>
  );
}
