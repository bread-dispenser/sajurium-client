"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { LibraryItem, LibraryItemType } from "@/lib/domain";
import { inspectCurrentBirth, libraryStore, resetBirthSource } from "@/lib/storage";
import { APP_NAV_GROUPS, getDailyFlow, getMonthlyFlow, INITIAL_BIRTH, INITIAL_LIBRARY_ITEMS } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";

function localDate(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function shiftMonth(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1, 12);
  return localDate(date).slice(0, 7);
}

export function HomeScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="사주리움 플랫폼을 준비하고 있어요" />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const today = localDate();
  const flow = getDailyFlow(today);
  const serviceGroups = APP_NAV_GROUPS.filter((group) => group.label !== "개요");

  return (
    <main className="screen-content home-content platform-home" aria-labelledby="home-title">
      <div className="platform-hero">
        <p className="section-kicker">사주리움 플랫폼</p>
        <h1 id="home-title">{birth.nickname}님의 사주와 고민을<br />한곳에서 이어보세요</h1>
        <p className="supporting">내 사주, 기간별 흐름, 상담, 관계, 기록과 상품을 하나의 작업 공간에서 오갈 수 있어요.</p>
      </div>
      <section className="platform-scope" aria-label="현재 제공 범위">
        <strong>현재 제공 범위</strong>
        <span>브라우저 체험</span>
        <p>기기 저장 기능은 동작하지만 실제 사주 계산·계정 동기화·결제는 아직 연결되지 않았습니다.</p>
      </section>
      <section className="home-summary" aria-labelledby="today-summary-title">
        <small>{today} · 오늘의 흐름</small>
        <h2 id="today-summary-title">{flow.headline}</h2>
        <p>{flow.suggestion}</p>
        <Link className="text-link" href="/flow/today">오늘의 흐름 자세히 보기 →</Link>
      </section>
      <section className="service-group home-recent-actions" aria-labelledby="recent-actions-title">
        <div className="platform-section-heading">
          <p className="section-kicker">최근 행동</p>
          <h2 id="recent-actions-title">하던 일을 이어보세요</h2>
        </div>
        <nav aria-label="최근 행동 이어보기">
          <Link href="/consult"><strong>최근 상담 이어보기</strong><small>브라우저에 남은 상담 세션과 질문을 다시 확인</small><span aria-hidden="true">→</span></Link>
          <Link href="/library"><strong>최근 저장 결과 열기</strong><small>리포트·상담·관계 결과를 통합 보관함에서 확인</small><span aria-hidden="true">→</span></Link>
        </nav>
      </section>
      <div id="platform-services" className="platform-services">
        <div className="platform-section-heading">
          <p className="section-kicker">전체 서비스</p>
          <h2>필요한 일을 바로 시작하세요</h2>
        </div>
        {serviceGroups.map((group) => (
          <section className="service-group" key={group.label} aria-labelledby={`service-${group.label}`}>
            <h3 id={`service-${group.label}`}>{group.label}</h3>
            <nav aria-label={`${group.label} 서비스`}>
              {group.items.map((item) => (
                <Link href={item.href} key={item.href}>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
      </div>
    </main>
  );
}

export function FlowScreen({ mode }: { mode: "today" | "month" }) {
  const hydrated = useHydrated();
  const [period, setPeriod] = useState(() => mode === "today" ? localDate() : localDate().slice(0, 7));
  if (!hydrated) return <LoadingState title="기간별 흐름을 준비하고 있어요" />;
  const reading = mode === "today" ? getDailyFlow(period) : getMonthlyFlow(period);
  const previous = () => setPeriod((current) => mode === "today" ? shiftDate(current, -1) : shiftMonth(current, -1));
  const next = () => setPeriod((current) => mode === "today" ? shiftDate(current, 1) : shiftMonth(current, 1));

  return (
    <main className="screen-content flow-content" aria-labelledby="flow-title">
      <div className="editorial-hero">
        <p className="section-kicker">{mode === "today" ? "오늘의 흐름" : "이번 달 흐름"}</p>
        <h1 id="flow-title">{reading.headline}</h1>
        <p className="supporting">{reading.summary}</p>
      </div>
      <div className="period-control">
        <button type="button" onClick={previous} aria-label="이전 기간">‹</button>
        <label><span className="sr-only">조회 기간</span><input type={mode === "today" ? "date" : "month"} value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <button type="button" onClick={next} aria-label="다음 기간">›</button>
      </div>
      <div className="flow-sections">
        <article><small>관계</small><p>{reading.relationship}</p></article>
        <article><small>일</small><p>{reading.career}</p></article>
        <article><small>재물</small><p>{reading.money}</p></article>
        <article><small>점검할 부분</small><p>{reading.caution}</p></article>
        <article><small>추천 행동</small><p>{reading.suggestion}</p></article>
      </div>
      <nav className="flow-switch" aria-label="기간별 흐름 전환">
        <Link className={mode === "today" ? "active" : undefined} href="/flow/today">오늘</Link>
        <Link className={mode === "month" ? "active" : undefined} href="/flow/month">이번 달</Link>
      </nav>
    </main>
  );
}

const TYPE_LABELS: Record<LibraryItemType, string> = {
  report: "리포트",
  consultation: "상담",
  compatibility: "궁합",
};

export function LibraryScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(libraryStore.subscribe, libraryStore.rawSnapshot, () => null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | LibraryItemType>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [dateRange, setDateRange] = useState<"all" | "latest" | "recent">("all");
  const [profileScope, setProfileScope] = useState<"all" | "self" | "relationship">("all");
  const [topic, setTopic] = useState<"all" | "relationship" | "career">("all");
  const [access, setAccess] = useState<"all" | "free" | "purchased">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const inspection = hydrated ? libraryStore.inspect() : { status: "unavailable" as const };
  void raw;
  if (!hydrated) return <LoadingState title="보관함을 확인하고 있어요" />;
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="보관함 데이터를 읽을 수 없어요" description="손상된 보관함을 확인 없이 체험용 예시로 바꾸거나 수정하지 않습니다." unavailable={inspection.status === "unavailable"} onReset={libraryStore.remove} />;
  const source = inspection.status === "ok" ? inspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  const latestDate = source.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, "").slice(0, 10);
  const recentThreshold = latestDate ? new Date(`${latestDate}T00:00:00.000Z`).getTime() - 6 * 86_400_000 : 0;
  const items = source
    .filter((item) => (showHidden || !item.hidden) && (type === "all" || item.type === type))
    .filter((item) => dateRange === "all" || (dateRange === "latest" ? item.createdAt.startsWith(latestDate) : new Date(item.createdAt).getTime() >= recentThreshold))
    .filter((item) => profileScope === "all" || (profileScope === "relationship" ? item.type === "compatibility" : item.type !== "compatibility"))
    .filter((item) => topic === "all" || (topic === "career" ? /일|커리어/.test(`${item.title} ${item.subtitle}`) : /연애|관계|궁합/.test(`${item.title} ${item.subtitle}`)))
    .filter((item) => access === "all" || (access === "purchased" ? item.title.includes("심층") : !item.title.includes("심층")))
    .filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => sort === "newest" ? right.createdAt.localeCompare(left.createdAt) : left.createdAt.localeCompare(right.createdAt));

  function updateItem(id: string, update: (item: LibraryItem) => LibraryItem) {
    if (!libraryStore.write({ version: 1, items: source.map((item) => item.id === id ? update(item) : item) })) setError("보관함 항목을 변경할 수 없어요.");
  }

  function deleteItem(id: string) {
    if (!libraryStore.write({ version: 1, items: source.filter((item) => item.id !== id) })) {
      setError("보관함 항목을 삭제할 수 없어요.");
      return;
    }
    setPendingDeleteId(null);
    setError("");
  }

  return (
    <main className="screen-content library-content" aria-labelledby="library-title">
      <div className="editorial-hero">
        <p className="section-kicker">기기 보관함</p>
        <h1 id="library-title">저장한 내용을<br />한곳에서 살펴보세요</h1>
        <p className="supporting">다른 기기와 공유되지 않고 이 브라우저에만 저장됩니다.</p>
      </div>
      <div className="library-controls">
        <label><span>검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 설명" /></label>
        <label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">전체</option><option value="report">리포트</option><option value="consultation">상담</option><option value="compatibility">궁합</option></select></label>
        <label><span>정렬</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label>
        <label><span>생성 날짜</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)}><option value="all">전체</option><option value="latest">가장 최근 날짜</option><option value="recent">최근 7일</option></select></label>
        <label><span>프로필</span><select value={profileScope} onChange={(event) => setProfileScope(event.target.value as typeof profileScope)}><option value="all">전체</option><option value="self">내 프로필</option><option value="relationship">관계 프로필</option></select></label>
        <label><span>주제</span><select value={topic} onChange={(event) => setTopic(event.target.value as typeof topic)}><option value="all">전체</option><option value="relationship">연애·관계</option><option value="career">일·커리어</option></select></label>
        <label><span>구매 여부</span><select value={access} onChange={(event) => setAccess(event.target.value as typeof access)}><option value="all">전체</option><option value="free">무료·로컬</option><option value="purchased">구매 리포트</option></select></label>
        <label className="show-hidden"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /> 숨긴 항목 보기</label>
      </div>
      {items.length === 0 ? (
        <EmptyState title="조건에 맞는 항목이 없어요" description="검색어나 필터를 바꿔보세요." />
      ) : (
        <div className="library-list">{items.map((item) => {
          const purchased = item.title.includes("심층");
          return <article key={item.id} className={item.hidden ? "hidden-item" : undefined}>
            <div><small>{TYPE_LABELS[item.type]}{purchased ? " · 구매" : ""}</small><h2><Link href={item.href}>{item.title}</Link></h2><p>{item.subtitle}</p><time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div>
            <div className="library-item-actions">
              <button type="button" onClick={() => updateItem(item.id, (current) => ({ ...current, hidden: !current.hidden }))}>{item.hidden ? "보이기" : "숨기기"}</button>
              {purchased ? <small>구매 리포트는 삭제 대신 숨길 수 있어요.</small> : pendingDeleteId === item.id ? <div className="danger-confirm library-delete-confirm"><p>{item.title}을 기기에서 삭제할까요?</p><button type="button" onClick={() => deleteItem(item.id)}>보관함 항목 삭제 확정</button><button type="button" onClick={() => setPendingDeleteId(null)}>취소</button></div> : <button type="button" onClick={() => setPendingDeleteId(item.id)}>삭제</button>}
            </div>
          </article>;
        })}</div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
