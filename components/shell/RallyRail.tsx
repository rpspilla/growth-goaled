"use client";

import { ChevronDown, MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NavLink } from "./NavLink";
import type { NavItem } from "./UseCaseSidebar";

/**
 * The founder's rail in Rally (Rally Beta, Nov 24, 2026): New conversation, recent conversations,
 * then the company pages under one "Your company" heading (open while one of them is showing) and
 * Share feedback. The conversation is the product; everything else is one click away.
 */
export function RallyRail({ recent, company }: { recent: { id: string; title: string }[]; company: NavItem[] }) {
  const pathname = usePathname();
  const inCompany = company.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const [open, setOpen] = useState(inCompany);
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5" aria-label="Menu">
      <Link href="/whats-next" className="btn btn-primary w-full inline-flex items-center justify-center gap-2 text-sm py-2">
        <MessageSquarePlus size={16} aria-hidden /> New conversation
      </Link>

      {recent.length > 0 && (
        <div>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8FA3B8" }}>Recent</div>
          <ul aria-label="Rally conversations" className="space-y-0.5">
            {recent.map((c) => (
              <li key={c.id}>
                <NavLink href={`/chat/${c.id}`}>{(active) => <span className="truncate" style={{ color: active ? "#fff" : undefined }}>{c.title}</span>}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto space-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="rail-company"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/5"
          style={{ color: "#fff" }}
        >
          Your company
          <ChevronDown size={16} aria-hidden className="transition-transform" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", color: "#8FA3B8" }} />
        </button>
        <div id="rail-company" className="space-y-0.5 pl-2" hidden={!open}>
          {company.map((item) => (
            <NavLink key={item.href} href={item.href} match={item.match} exact={item.exact}>
              {(active) => <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>{item.label}</span>}
            </NavLink>
          ))}
        </div>
        <NavLink href="/feedback">{(active) => <span className="font-medium" style={{ color: active ? "#fff" : undefined }}>Share feedback</span>}</NavLink>
      </div>
    </nav>
  );
}
