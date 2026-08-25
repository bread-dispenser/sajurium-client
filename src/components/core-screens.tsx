"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { LibraryItem, LibraryItemType } from "@/lib/domain";
import { withAllowedLibraryActions } from "@/lib/contracts";
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
  const month = getMonthlyFlow(today.slice(0, 7));
  const libraryInspection = libraryStore.inspect();
  const libraryItems = libraryInspection.status === "ok" ? libraryInspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  const latestItem = [...libraryItems].filter((item) => !item.hidden).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const purchasedItem = libraryItems.find((item) => item.purchased);
  const serviceGroups = APP_NAV_GROUPS.filter((group) => group.label !== "개요");

  return (
    <main className="screen-content home-content platform-home" aria-labelledby="home-title">
      <div className="platform-hero">
        <p className="section-kicker">사주리움 플랫폼</p>
        <h1 id="home-title">{birth.displayName}님의 사주와 고민을<br />한곳에서 이어보세요</h1>
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
        <p>{flow.suggestedQuestion}</p>
        <Link className="text-link" href="/flow/today">오늘의 흐름 자세히 보기 →</Link>
      </section>
      <section className="service-group" aria-labelledby="monthly-change-title">
        <div className="platform-section-heading"><p className="section-kicker">이번 달 변화</p><h2 id="monthly-change-title">초반부터 후반까지</h2></div>
        <div className="flow-sections">
          <article><small>초반</small><p>{month.earlyPeriod}</p></article>
          <article><small>중반</small><p>{month.middlePeriod}</p></article>
          <article><small>후반</small><p>{month.latePeriod}</p></article>
        </div>
        <Link className="text-link" href="/flow/month">이번 달 흐름 자세히 보기 →</Link>
      </section>
      <section className="service-group" aria-labelledby="home-content-title">
        <div className="platform-section-heading"><p className="section-kicker">내 콘텐츠</p><h2 id="home-content-title">구매한 내용과 추천</h2></div>
        <nav aria-label="구매 및 추천 콘텐츠">
          {purchasedItem && <Link href={purchasedItem.href}><strong>구매함 · {purchasedItem.title}</strong><small>{purchasedItem.profile.displayName} 프로필 · {purchasedItem.read ? "읽음" : "읽지 않음"}</small><span aria-hidden="true">→</span></Link>}
          <Link href="/products/career-report"><strong>추천 · 커리어 심층 리포트</strong><small>관심 주제에 맞춘 체험용 추천이며 실제 개인화 계산은 하지 않아요.</small><span aria-hidden="true">→</span></Link>
        </nav>
      </section>
      <section className="service-group home-recent-actions" aria-labelledby="recent-actions-title">
        <div className="platform-section-heading">
          <p className="section-kicker">최근 행동</p>
          <h2 id="recent-actions-title">하던 일을 이어보세요</h2>
        </div>
        <nav aria-label="최근 행동 이어보기">
          {latestItem ? <Link href={latestItem.href}><strong>{latestItem.profile.displayName} · {latestItem.title}</strong><small>{TYPE_LABELS[latestItem.type]} · {latestItem.subtitle}</small><span aria-hidden="true">→</span></Link> : <Link href="/report"><strong>{birth.displayName}님의 리포트 시작</strong><small>저장된 프로필로 체험용 요약 확인</small><span aria-hidden="true">→</span></Link>}
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
        <p className="supporting">{reading.kind === "daily" ? reading.summary : reading.overview}</p>
      </div>
      <div className="period-control">
        <button type="button" onClick={previous} aria-label="이전 기간">‹</button>
        <label><span className="sr-only">조회 기간</span><input type={mode === "today" ? "date" : "month"} value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <button type="button" onClick={next} aria-label="다음 기간">›</button>
      </div>
      <div className="flow-sections">
        {reading.kind === "daily" ? <>
          <article><small>오늘의 우선 영역</small><p>{reading.priorityArea === "relationship" ? "관계" : reading.priorityArea === "career" ? "일" : "재물"}</p></article>
          <article><small>점검할 부분</small><p>{reading.caution}</p></article>
          <article><small>추천 질문</small><p>{reading.suggestedQuestion}</p></article>
        </> : <>
          <article><small>초반</small><p>{reading.earlyPeriod}</p></article>
          <article><small>중반</small><p>{reading.middlePeriod}</p></article>
          <article><small>후반</small><p>{reading.latePeriod}</p></article>
          <article><small>관계</small><p>{reading.relationship}</p></article>
          <article><small>일</small><p>{reading.career}</p></article>
          <article><small>재물</small><p>{reading.money}</p></article>
          <article><small>기회 시기</small><p>{reading.opportunityPeriods.join(", ")}</p></article>
          <article><small>주의 시기</small><p>{reading.cautionPeriods.join(", ")}</p></article>
        </>}
      </div>
      <nav className="flow-switch" aria-label="기간별 흐름 전환">
        <Link className={mode === "today" ? "active" : undefined} href="/flow/today">오늘</Link>
        <Link className={mode === "month" ? "active" : undefined} href="/flow/month">이번 달</Link>
        <Link href="/reports/year">올해</Link>
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
    .filter((item) => profileScope === "all" || (profileScope === "relationship" ? item.profile.displayName.includes(" · ") : !item.profile.displayName.includes(" · ")))
    .filter((item) => topic === "all" || (topic === "career" ? item.topic === "career" : item.topic === "love" || item.topic === "relationships"))
    .filter((item) => access === "all" || (access === "purchased" ? item.purchased : !item.purchased))
    .filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => sort === "newest" ? right.createdAt.localeCompare(left.createdAt) : left.createdAt.localeCompare(right.createdAt));

  function updateItem(id: string, update: (item: LibraryItem) => LibraryItem) {
    if (!libraryStore.write({ version: 1, items: source.map((item) => item.id === id ? withAllowedLibraryActions(update(item)) : item) })) setError("보관함 항목을 변경할 수 없어요.");
  }

  function deleteItem(id: string) {
    if (source.find((item) => item.id === id)?.purchased) {
      setError("구매한 항목은 삭제할 수 없고 숨기기만 할 수 있어요.");
      setPendingDeleteId(null);
      return;
    }
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
          return <article key={item.id} className={item.hidden ? "hidden-item" : undefined}>
            <div><small>{TYPE_LABELS[item.type]}{item.purchased ? " · 구매" : ""} · {item.profile.displayName} · {item.read ? "읽음" : "읽지 않음"}</small><h2>{item.allowedActions.includes("open") ? <Link href={item.href}>{item.title}</Link> : item.title}</h2><p>{item.subtitle}</p><time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div>
            <div className="library-item-actions">
              {(item.allowedActions.includes("hide") || item.allowedActions.includes("unhide")) && <button type="button" onClick={() => updateItem(item.id, (current) => ({ ...current, hidden: !current.hidden }))}>{item.hidden ? "보이기" : "숨기기"}</button>}
              {item.purchased ? <small>구매 리포트는 삭제 대신 숨길 수 있어요.</small> : item.allowedActions.includes("delete") && (pendingDeleteId === item.id ? <div className="danger-confirm library-delete-confirm"><p>{item.title}을 기기에서 삭제할까요?</p><button type="button" onClick={() => deleteItem(item.id)}>보관함 항목 삭제 확정</button><button type="button" onClick={() => setPendingDeleteId(null)}>취소</button></div> : <button type="button" onClick={() => setPendingDeleteId(item.id)}>삭제</button>)}
            </div>
          </article>;
        })}</div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
