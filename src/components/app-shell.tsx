"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAV_GROUPS, APP_PRIMARY_NAV_ITEMS } from "@/lib/fixtures";
import type { AppNavItem } from "@/lib/domain";

export function AppHeader({ title, backHref }: { title?: string; backHref?: string }) {
  return (
    <header className="journey-header app-header">
      {backHref && (
        <Link className="back-button" href={backHref} aria-label="이전 화면으로 돌아가기">
          ‹
        </Link>
      )}
      <Link className="wordmark app-wordmark" href="/home">
        <span>{title ?? "사주리움"}</span>
        {!title && <small>사주·상담·관계를 잇는 라이프 리딩 플랫폼</small>}
      </Link>
      {!title && <Link className="header-settings-link" href="/settings">설정</Link>}
    </header>
  );
}

function isActive(pathname: string, item: AppNavItem) {
  if (item.href === "/home") return pathname === "/home";
  if (item.href === "/products") return pathname === "/products" || (pathname.startsWith("/products/") && !pathname.startsWith("/products/credits"));
  if (item.href === "/settings") return pathname === "/settings" || (pathname.startsWith("/settings/") && !pathname.startsWith("/settings/feedback"));
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      {APP_PRIMARY_NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            className={active ? "active" : undefined}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={`${item.shortLabel} · ${item.label}`}
          >
            <span className="nav-short-label" aria-hidden="true">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PlatformNavigation() {
  const pathname = usePathname();

  return (
    <nav className="platform-navigation" aria-label="전체 서비스">
      {APP_NAV_GROUPS.map((group) => (
        <section key={group.label} className="platform-nav-group" aria-labelledby={`nav-${group.label}`}>
          <h2 id={`nav-${group.label}`}>{group.label}</h2>
          {group.items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </Link>
            );
          })}
        </section>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="phone-screen app-frame">
        <AppHeader />
        <div className="app-content">{children}</div>
        <MobileNavigation />
        <PlatformNavigation />
      </div>
    </div>
  );
}
