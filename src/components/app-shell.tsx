"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAV_GROUPS, APP_PRIMARY_NAV_ITEMS } from "@/lib/fixtures";
import type { AppNavItem } from "@/lib/domain";

export function AppHeader({ title, backHref }: { title?: string; backHref?: string }) {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const isFlow = pathname === "/flow/today" || pathname === "/flow/month";
  const shellTitle = title ?? (
    pathname === "/flow/month"
      ? "이번 달의 흐름"
      : pathname === "/flow/today"
        ? "오늘의 흐름"
        : undefined
  );
  const shellBackHref = backHref ?? (isFlow ? "/home" : undefined);

  return (
    <header className={`journey-header app-header signal-atlas-header${isHome ? " signal-atlas-home-header" : ""}${isFlow ? " signal-atlas-flow-header" : ""}`}>
      {shellBackHref && (
        <Link className="back-button signal-atlas-header-back" href={shellBackHref} aria-label="이전 화면으로 돌아가기">
          ‹
        </Link>
      )}
      <Link className="wordmark app-wordmark signal-atlas-wordmark" href="/home">
        <span>{shellTitle ?? "사주리움"}</span>
      </Link>
      {!shellTitle && !isHome && <Link className="header-settings-link signal-atlas-settings-link" href="/settings">설정</Link>}
    </header>
  );
}

function isActive(pathname: string, item: AppNavItem) {
  if (item.href === "/home") return pathname === "/home";
  if (item.href === "/products") return pathname === "/products" || (pathname.startsWith("/products/") && !pathname.startsWith("/products/credits"));
  if (item.href === "/share" || item.href === "/notifications" || item.href === "/admin") return pathname === item.href;
  if (item.href === "/settings") return pathname === "/settings" || (pathname.startsWith("/settings/") && !pathname.startsWith("/settings/feedback"));
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-navigation signal-atlas-mobile-navigation" aria-label="주요 메뉴">
      {APP_PRIMARY_NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        const label = item.href === "/report" ? "내 사주" : item.shortLabel;
        return (
          <Link
            key={item.href}
            className={`signal-atlas-mobile-nav-item${active ? " active" : ""}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="nav-short-label signal-atlas-nav-label">{label}</span>
            <span className="nav-long-label signal-atlas-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function PlatformNavigation() {
  const pathname = usePathname();

  return (
    <nav className="platform-navigation signal-atlas-route-navigation" aria-label="전체 서비스">
      {APP_NAV_GROUPS.map((group) => (
        <section key={group.label} className="platform-nav-group signal-atlas-route-group" aria-labelledby={`nav-${group.label}`}>
          <h2 id={`nav-${group.label}`}>{group.label}</h2>
          {group.items.map((item) => {
            const active = isActive(pathname, item);
            return <Link key={item.href} href={item.href} className={`signal-atlas-route-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </section>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <div className={`app-shell signal-atlas-shell${isLogin ? " signal-atlas-auth-shell" : ""}`}>
      <div className={`phone-screen app-frame signal-atlas-frame${isLogin ? " signal-atlas-auth-frame" : ""}`}>
        <AppHeader title={isLogin ? "로그인" : undefined} backHref={isLogin ? "/" : undefined} />
        <div className="app-content signal-atlas-content">{children}</div>
        {!isLogin && <MobileNavigation />}
        {!isLogin && <PlatformNavigation />}
      </div>
    </div>
  );
}
