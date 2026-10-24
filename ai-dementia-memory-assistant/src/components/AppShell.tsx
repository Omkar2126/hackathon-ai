"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Live" },
  { href: "/people", label: "People" },
  { href: "/memories", label: "Memories" },
  { href: "/caregiver", label: "Caregiver" },
];

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span
        className={`grid place-items-center rounded-full border border-[#e0b56a]/50 bg-[#e0b56a]/10 ${
          large ? "h-11 w-11" : "h-8 w-8"
        }`}
      >
        <span className={`rounded-full bg-[#e0b56a] ${large ? "h-3 w-3" : "h-2 w-2"}`} />
      </span>
      <span>
        <span className={`display block leading-none tracking-wide ${large ? "text-2xl" : "text-lg"}`}>Lumen</span>
        {large ? <span className="text-[11px] uppercase tracking-[0.22em] text-[#cfc3b2]">Memory companion</span> : null}
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  tone = "page",
}: {
  children: ReactNode;
  tone?: "page" | "live";
}) {
  const pathname = usePathname();

  return (
    <div className={tone === "live" ? "min-h-screen" : "min-h-screen bg-[#0c0a08]"}>
      <header
        className={`z-30 flex items-center justify-between px-5 py-4 md:px-8 ${
          tone === "live" ? "pointer-events-none absolute inset-x-0 top-0" : "relative"
        }`}
      >
        <div className={tone === "live" ? "pointer-events-auto" : ""}>
          <BrandMark />
        </div>
        <nav
          className={`flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 backdrop-blur-xl ${
            tone === "live" ? "pointer-events-auto" : ""
          }`}
        >
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active ? "bg-[#f4eee4] text-[#1a1612]" : "text-[#f4eee4]/80 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
