"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAV_ITEMS } from "@/lib/fixtures";

export function AppHeader({ title, backHref }: { title?: string; backHref?: string }) {
  return (
    <header className="journey-header app-header">
      {backHref && (
        <Link className="back-button" href={backHref} aria-label="이전 화면으로 돌아가기">
          ‹
        </Link>
      )}
      <Link className="wordmark app-wordmark" href="/home">
        <span>{title ?? "결"}</span>
        {!title && <small>오늘의 마음을 읽는 시간</small>}
      </Link>
    </header>
  );
}

function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      {APP_NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            className={active ? "active" : undefined}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={`${item.shortLabel} · ${item.label}`}
          >
            <span className="nav-short-label" aria-hidden="true">{item.shortLabel}</span>
            <span className="nav-long-label" aria-hidden="true">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="phone-screen app-frame">
        <AppHeader />
        <div className="app-content">{children}</div>
        <BottomNavigation />
      </div>
    </div>
  );
}
