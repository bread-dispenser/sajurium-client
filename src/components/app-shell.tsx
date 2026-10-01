"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { ArchiveIcon, BackIcon, BellIcon, ChartIcon, ConsultIcon, HomeIcon, PairIcon, SettingsIcon } from "./ui/icons";

type Tab = { href: string; label: string; Icon: ComponentType<{ size?: number }>; match: (path: string) => boolean };

const TABS: readonly Tab[] = [
  { href: "/home", label: "홈", Icon: HomeIcon, match: (path) => path === "/home" || path.startsWith("/flow/") || path === "/calendar" },
  { href: "/report", label: "명식", Icon: ChartIcon, match: (path) => path === "/report" || path.startsWith("/report/") || path.startsWith("/reports/") },
  { href: "/consult", label: "상담", Icon: ConsultIcon, match: (path) => path === "/consult" || path.startsWith("/consult/") },
  { href: "/compatibility", label: "궁합", Icon: PairIcon, match: (path) => path === "/compatibility" || path.startsWith("/compatibility/") || path.startsWith("/people") },
  { href: "/library", label: "보관함", Icon: ArchiveIcon, match: (path) => path === "/library" || path === "/products" || path.startsWith("/products/") || path.startsWith("/orders/") || path.startsWith("/checkout/") || path === "/billing" },
];

/** Tab roots show the tab bar and the wordmark header; everything else is a sub screen with a back header. */
const TAB_ROOTS = new Set(["/home", "/report", "/consult", "/compatibility", "/library", "/products"]);

type SubRoute = { pattern: RegExp; title: string; back: string };

const SUB_ROUTES: readonly SubRoute[] = [
  { pattern: /^\/flow\/today$/, title: "오늘의 흐름", back: "/home" },
  { pattern: /^\/flow\/month$/, title: "이번 달 흐름", back: "/home" },
  { pattern: /^\/calendar$/, title: "시기 캘린더", back: "/home" },
  { pattern: /^\/reports\/year$/, title: "올해 흐름", back: "/home" },
  { pattern: /^\/reports\/decade$/, title: "10년 흐름", back: "/report" },
  { pattern: /^\/reports\/[^/]+$/, title: "흐름 리포트", back: "/report" },
  { pattern: /^\/report\/topics$/, title: "주제별 리포트", back: "/report" },
  { pattern: /^\/report\/topics\/[^/]+$/, title: "주제 리포트", back: "/report/topics" },
  { pattern: /^\/report\/feedback$/, title: "피드백 남기기", back: "/report" },
  { pattern: /^\/report\/save$/, title: "보관함에 저장", back: "/report" },
  { pattern: /^\/consult\/new$/, title: "새 상담", back: "/consult" },
  { pattern: /^\/consult\/session\/[^/]+$/, title: "상담", back: "/consult" },
  { pattern: /^\/people$/, title: "사람 보관함", back: "/compatibility" },
  { pattern: /^\/people\/new$/, title: "사람 추가", back: "/people" },
  { pattern: /^\/people\/[^/]+\/edit$/, title: "출생 정보 수정", back: "/people" },
  { pattern: /^\/compatibility\/result\/[^/]+$/, title: "궁합 결과", back: "/compatibility" },
  { pattern: /^\/products\/credits$/, title: "이용권 내역", back: "/products" },
  { pattern: /^\/products\/[^/]+$/, title: "상품 상세", back: "/products" },
  { pattern: /^\/checkout\/[^/]+$/, title: "결제하기", back: "/products" },
  { pattern: /^\/orders\/[^/]+$/, title: "주문 상세", back: "/billing" },
  { pattern: /^\/billing$/, title: "주문과 환불 내역", back: "/settings" },
  { pattern: /^\/share$/, title: "공유 카드 만들기", back: "/report" },
  { pattern: /^\/share\/links$/, title: "공유 링크 관리", back: "/settings" },
  { pattern: /^\/notifications$/, title: "알림", back: "/home" },
  { pattern: /^\/notifications\/policy$/, title: "알림 정책", back: "/settings" },
  { pattern: /^\/settings$/, title: "설정", back: "/home" },
  { pattern: /^\/settings\/feedback$/, title: "피드백과 신고", back: "/settings" },
  { pattern: /^\/settings\/feedback\/[^/]+$/, title: "피드백 상세", back: "/settings/feedback" },
  { pattern: /^\/settings\/privacy$/, title: "개인정보", back: "/settings" },
  { pattern: /^\/settings\/about-ai$/, title: "AI 해석 안내", back: "/settings" },
  { pattern: /^\/settings\/safety$/, title: "안전한 이용 안내", back: "/settings" },
  { pattern: /^\/settings\/terms$/, title: "이용약관과 처리방침", back: "/settings" },
  { pattern: /^\/account$/, title: "계정", back: "/settings" },
  { pattern: /^\/profile$/, title: "출생 정보 수정", back: "/settings" },
  { pattern: /^\/login$/, title: "로그인", back: "/" },
];

function subRoute(pathname: string) {
  return SUB_ROUTES.find((route) => route.pattern.test(pathname)) ?? { title: "사주리움", back: "/home" };
}

function HeaderActions() {
  return (
    <>
      <Link className="sj-icon-button" href="/notifications" aria-label="알림"><BellIcon size={21} /></Link>
      <Link className="sj-icon-button" href="/settings" aria-label="설정"><SettingsIcon size={21} /></Link>
    </>
  );
}

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav className="sj-topnav" aria-label="주요 메뉴">
      {TABS.map((tab) => (
        <Link key={tab.href} className="sj-topnav-link" href={tab.href} aria-current={tab.match(pathname) ? "page" : undefined}>{tab.label}</Link>
      ))}
    </nav>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="sj-tabbar" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} className="sj-tab" href={href} aria-current={active ? "page" : undefined}>
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTabRoot = TAB_ROOTS.has(pathname);
  const route = subRoute(pathname);

  return (
    <div className="sj-shell">
      <header className="sj-topbar">
        <div className="sj-topbar-inner">
          {isTabRoot ? (
            <Link className="sj-wordmark" href="/home">사주리움</Link>
          ) : (
            <>
              <Link className="sj-icon-button sj-mobile-only" href={route.back} aria-label="이전 화면으로 돌아가기" style={{ marginLeft: -16 }}><BackIcon /></Link>
              <p className="sj-topbar-title sj-mobile-only">{route.title}</p>
              <Link className="sj-wordmark sj-desktop-only" href="/home">사주리움</Link>
            </>
          )}
          <DesktopNav pathname={pathname} />
          <span className="sj-topbar-spacer" />
          {(isTabRoot || pathname === "/notifications" || pathname === "/settings") && <span className="sj-desktop-only" style={{ display: "contents" }}><HeaderActions /></span>}
          {isTabRoot && <span className="sj-mobile-only" style={{ display: "contents" }}><HeaderActions /></span>}
        </div>
      </header>
      <div className={`sj-content${isTabRoot ? " sj-content-with-tabs sj-content-wide" : ""}`}>{children}</div>
      {isTabRoot && <TabBar pathname={pathname} />}
    </div>
  );
}
