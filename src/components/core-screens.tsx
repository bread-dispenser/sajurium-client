"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { LibraryItem, LibraryItemType } from "@/lib/domain";
import { inspectCurrentBirth, libraryStore, resetBirthSource } from "@/lib/storage";
import { getDailyFlow, getMonthlyFlow, INITIAL_BIRTH, INITIAL_LIBRARY_ITEMS } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import styles from "./saas-core-rollout.module.css";
import { deleteLibraryItem, getFlow, listLibrary, type LiveReport } from "@/lib/api/service";

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

type MonthlyPhase = "early" | "middle" | "late";

const MONTHLY_PHASES: ReadonlyArray<{ id: MonthlyPhase; label: string; emphasis: string }> = [
  { id: "early", label: "초순", emphasis: "정리와 관찰" },
  { id: "middle", label: "중순", emphasis: "대화와 확장" },
  { id: "late", label: "하순", emphasis: "점검과 마무리" },
];

const PRIORITY_LABELS = {
  relationship: "관계",
  career: "일",
  money: "재물",
} as const;

function formatKoreanDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function formatSignalDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${month}.${day} (${weekday})`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function formatDateRange(value: string) {
  return value
    .split(" ~ ")
    .map((date) => date.slice(5).replace("-", "."))
    .join("–");
}

function monthlyPhaseForDate(value: string): MonthlyPhase {
  const day = Number(value.slice(8, 10));
  return day <= 10 ? "early" : day <= 20 ? "middle" : "late";
}

function monthlyPhaseForMonth(month: string, today = localDate()): MonthlyPhase {
  return month === today.slice(0, 7) ? monthlyPhaseForDate(today) : "middle";
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
  const visibleLibraryItems = libraryItems.filter((item) => !item.hidden);
  const latestItem = [...visibleLibraryItems].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const currentPhase = monthlyPhaseForDate(today);
  const monthTimeline = [
    { id: "early" as const, label: "초순", summary: month.earlyPeriod },
    { id: "middle" as const, label: "중순", summary: month.middlePeriod },
    { id: "late" as const, label: "하순", summary: month.latePeriod },
  ];

  return (
    <main className={`screen-content home-content platform-home signal-atlas-home-screen ${styles.scope}`} aria-labelledby="home-title">
      <header className="signal-atlas-home-lead">
        <div className="signal-atlas-date-context" aria-label={`오늘 ${formatKoreanDate(today)}`}>
          <p>오늘 · {formatKoreanDate(today)}</p>
          <span>내 기록 {visibleLibraryItems.length}개</span>
        </div>
        <div className="signal-atlas-question-lead">
          <h1 id="home-title">요즘, 어떤 선택 앞에 있나요?</h1>
          <p>지금의 흐름을 한 문장으로 정리해볼게요.</p>
        </div>
      </header>

      <section className="home-summary signal-atlas-today-signal" aria-labelledby="today-summary-title">
        <div className="signal-atlas-signal-context">
          <p>오늘의 신호</p>
          <time dateTime={today}>{formatSignalDate(today)}</time>
        </div>
        <h2 id="today-summary-title">{flow.headline}</h2>
        <p className="signal-atlas-signal-evidence">
          {PRIORITY_LABELS[flow.priorityArea]} 흐름을 먼저 살펴보기 좋아요. {flow.caution}
        </p>
        <p className="signal-atlas-disclaimer">{flow.summary}</p>
        <Link className="text-link signal-atlas-evidence-link" href="/flow/today">
          <span>이 문장이 나온 이유 보기</span>
          <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="service-group signal-atlas-month-timeline" aria-labelledby="monthly-change-title">
        <div className="platform-section-heading signal-atlas-section-heading">
          <h2 id="monthly-change-title">이번 달의 흐름</h2>
          <Link className="text-link signal-atlas-section-link" href="/flow/month">전체 보기</Link>
        </div>
        <div className="signal-atlas-timeline-list" role="list">
          {monthTimeline.map((item) => {
            const current = item.id === currentPhase;
            return (
              <article className={`signal-atlas-timeline-row${current ? " timeline-current" : ""}`} key={item.id} role="listitem" aria-current={current ? "true" : undefined}>
                <span className="signal-atlas-timeline-marker" aria-hidden="true" />
                <div>
                  <small>{item.label}</small>
                  <p>{item.summary}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="service-group signal-atlas-continue-reading" aria-labelledby="continue-reading-title">
        <div className="signal-atlas-continue-reading-line" aria-hidden="true" />
        <Link href={latestItem?.href ?? "/report"} className="signal-atlas-continue-reading-link">
          <span>
            <small id="continue-reading-title">이어 읽기</small>
            <strong>
              {latestItem ? latestItem.title : `${birth.displayName}님의 리포트 시작`}
            </strong>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      </section>

      <section className="service-group signal-atlas-consultation-cta" aria-label="상담 시작">
        <Link href="/consult/new">
          <strong>오늘의 고민을 남겨볼까요?</strong>
          <span aria-hidden="true">↗</span>
        </Link>
      </section>
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

  if (reading.kind === "daily") {
    return (
      <main className={`screen-content flow-content signal-atlas-flow-screen signal-atlas-today-flow ${styles.scope}`} aria-labelledby="flow-title">
        <div className="editorial-hero signal-atlas-flow-lead">
          <p className="section-kicker">오늘의 흐름</p>
          <h1 id="flow-title">{reading.headline}</h1>
          <p className="supporting">{reading.summary}</p>
        </div>
        <div className="period-control signal-atlas-period-navigation">
          <button type="button" onClick={previous} aria-label="이전 날짜">‹</button>
          <label>
            <span className="sr-only">조회 날짜</span>
            <input type="date" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <button type="button" onClick={next} aria-label="다음 날짜">›</button>
        </div>
        <section className="flow-sections signal-atlas-today-sections" aria-label="오늘의 세부 흐름">
          <article className="signal-atlas-today-detail">
            <small>오늘의 우선 영역</small>
            <p>{PRIORITY_LABELS[reading.priorityArea]}</p>
          </article>
          <article className="signal-atlas-today-detail">
            <small>점검할 부분</small>
            <p>{reading.caution}</p>
          </article>
          <article className="signal-atlas-today-detail">
            <small>추천 질문</small>
            <p>{reading.suggestedQuestion}</p>
          </article>
        </section>
        <nav className="flow-switch signal-atlas-flow-switch" aria-label="기간별 흐름 전환">
          <Link className="active" href="/flow/today">오늘</Link>
          <Link href="/flow/month">이번 달</Link>
          <Link href="/reports/year">올해</Link>
        </nav>
      </main>
    );
  }

  const currentPhase = monthlyPhaseForMonth(period);
  const intensityRows = [
    { ...MONTHLY_PHASES[0], summary: reading.earlyPeriod, level: "낮음", value: 22 },
    { ...MONTHLY_PHASES[1], summary: reading.middlePeriod, level: "높음", value: 55 },
    { ...MONTHLY_PHASES[2], summary: reading.latePeriod, level: "보통", value: 34 },
  ];
  const currentRow = intensityRows.find((row) => row.id === currentPhase) ?? intensityRows[1];
  const keyDates = [
    ...reading.opportunityPeriods.map((date) => ({ date, label: "기회" })),
    ...reading.cautionPeriods.map((date) => ({ date, label: "점검" })),
  ];

  return (
    <main className={`screen-content flow-content signal-atlas-flow-screen signal-atlas-month-flow ${styles.scope}`} aria-labelledby="flow-title">
      <div className="period-control signal-atlas-month-navigation">
        <button type="button" onClick={previous} aria-label="이전 달">‹</button>
        <label className="signal-atlas-month-picker">
          <span aria-hidden="true">{formatMonthLabel(period)}</span>
          <input aria-label="조회 월" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <button type="button" onClick={next} aria-label="다음 달">›</button>
      </div>
      <div className="editorial-hero signal-atlas-month-lead">
        <p className="section-kicker">{formatMonthLabel(period)}</p>
        <h1 id="flow-title">{reading.headline}</h1>
        <p className="supporting">계산을 바탕으로 본 시기별 흐름 강도</p>
        <p className="signal-atlas-disclaimer">{reading.overview}</p>
      </div>
      <section className="signal-atlas-intensity-rows" aria-labelledby="monthly-intensity-title">
        <h2 id="monthly-intensity-title" className="sr-only">월간 흐름 강도</h2>
        {intensityRows.map((row) => {
          const current = row.id === currentPhase;
          return (
            <article className={`signal-atlas-intensity-row${current ? " current" : ""}`} key={row.id} aria-current={current ? "true" : undefined} aria-label={`${row.label} · ${row.emphasis} · ${row.level}. ${row.summary}`}>
              <div className="signal-atlas-intensity-label">
                <strong>{row.label} · {row.emphasis} · {row.level}{current ? " · 지금" : ""}</strong>
              </div>
              <div className="signal-atlas-intensity-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.value} aria-label={`${row.label} 흐름 강도`}>
                <span style={{ width: `${row.value}%` }} />
              </div>
            </article>
          );
        })}
      </section>
      <section className="signal-atlas-period-focus" aria-labelledby="period-focus-title">
        <p className="section-kicker">{currentRow.label}의 초점</p>
        <h2 id="period-focus-title">{currentRow.id === "late" ? "이번 주엔 제안, 다음 주엔 결정." : currentRow.id === "middle" ? "대화로 조건을 넓혀보세요." : "정리한 기준으로 한 가지를 제안해보세요."}</h2>
        <p>{currentRow.summary}</p>
      </section>
      <section className="signal-atlas-key-dates" aria-labelledby="key-dates-title">
        <div className="signal-atlas-section-heading">
          <h2 id="key-dates-title">주요 날짜</h2>
        </div>
        <div className="signal-atlas-date-chips" role="list">
          {keyDates.map((item) => (
            <span className="signal-atlas-date-chip" key={`${item.label}-${item.date}`} role="listitem">
              <time dateTime={item.date.split(" ~ ")[0]}>{formatDateRange(item.date)}</time>
              <small>{item.label}</small>
            </span>
          ))}
        </div>
      </section>
      <section className="signal-atlas-action-suggestion" aria-labelledby="action-suggestion-title">
        <p className="section-kicker" id="action-suggestion-title">{currentRow.label} 행동 제안</p>
        <p>{currentRow.id === "late" ? "조건을 적고, 결정은 다음 주로 미뤄두세요." : currentRow.id === "middle" ? reading.relationship : reading.career}</p>
      </section>
      <nav className="flow-switch signal-atlas-flow-switch" aria-label="기간별 흐름 전환">
        <Link href="/flow/today">오늘</Link>
        <Link className="active" href="/flow/month">이번 달</Link>
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
  const [serverItems, setServerItems] = useState<LibraryItem[] | null>(null);
  const [serverError, setServerError] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listLibrary()
      .then((page) => active && setServerItems(page.items))
      .catch(() => active && setServerError(true));
    return () => { active = false; };
  }, [hydrated]);
  void raw;
  if (!hydrated || (!serverItems && !serverError)) return <LoadingState title="서버 보관함을 확인하고 있어요" />;
  if (serverError || !serverItems) return <CorruptState title="보관함 서버에 연결할 수 없어요" description="백엔드 연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  const source = serverItems;
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

  async function deleteItem(id: string) {
    if (source.find((item) => item.id === id)?.purchased) {
      setError("구매한 항목은 삭제할 수 없고 숨기기만 할 수 있어요.");
      setPendingDeleteId(null);
      return;
    }
    try {
      await deleteLibraryItem(id);
      setServerItems((current) => current?.filter((item) => item.id !== id) ?? null);
      setPendingDeleteId(null);
      setError("");
    } catch {
      setError("서버에서 보관함 항목을 삭제할 수 없어요.");
    }
  }

  const activeFilterCount = [type !== "all", dateRange !== "all", profileScope !== "all", topic !== "all", access !== "all", showHidden].filter(Boolean).length;

  return (
    <main className={`screen-content library-content signal-atlas-library-screen ${styles.scope}`} aria-labelledby="library-title">
      <header className="editorial-hero signal-atlas-library-lead">
        <p className="section-kicker">보관함</p>
        <h1 id="library-title">저장한 기록</h1>
        <p className="supporting">익명 세션 또는 로그인 계정에 연결된 서버 기록입니다.</p>
      </header>
      <section className="library-controls signal-atlas-library-controls" aria-label="보관함 검색과 필터">
        <label className="signal-atlas-library-search">
          <span>검색</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 설명" />
        </label>
        <details className="signal-atlas-library-filter-disclosure">
          <summary>필터{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}</summary>
          <div className="signal-atlas-library-filter-grid">
            <label><span>유형</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">전체</option><option value="report">리포트</option><option value="consultation">상담</option><option value="compatibility">궁합</option></select></label>
            <label><span>정렬</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label>
            <label><span>생성 날짜</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)}><option value="all">전체</option><option value="latest">가장 최근 날짜</option><option value="recent">최근 7일</option></select></label>
            <label><span>프로필</span><select value={profileScope} onChange={(event) => setProfileScope(event.target.value as typeof profileScope)}><option value="all">전체</option><option value="self">내 프로필</option><option value="relationship">관계 프로필</option></select></label>
            <label><span>주제</span><select value={topic} onChange={(event) => setTopic(event.target.value as typeof topic)}><option value="all">전체</option><option value="relationship">연애·관계</option><option value="career">일·커리어</option></select></label>
            <label><span>구매 여부</span><select value={access} onChange={(event) => setAccess(event.target.value as typeof access)}><option value="all">전체</option><option value="free">무료·로컬</option><option value="purchased">구매 리포트</option></select></label>
            <label className="show-hidden"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /> 숨긴 항목 보기</label>
          </div>
        </details>
      </section>
      <section className="signal-atlas-library-results" aria-labelledby="library-results-title">
        <header className="signal-atlas-library-results-heading">
          <h2 id="library-results-title">저장한 기록</h2>
          <span>{items.length}개</span>
        </header>
        {items.length === 0 ? (
          <EmptyState title="조건에 맞는 항목이 없어요" description="검색어나 필터를 바꿔보세요." />
        ) : (
          <div className="library-list signal-atlas-library-list">{items.map((item) => {
            return <article key={item.id} className={`signal-atlas-library-item${item.hidden ? " hidden-item" : ""}`}>
              <div className="signal-atlas-library-item-content">
                <small className="signal-atlas-library-item-meta">{TYPE_LABELS[item.type]}{item.purchased ? " · 구매" : ""} · {item.profile.displayName} · {item.read ? "읽음" : "읽지 않음"}</small>
                <h2>{item.allowedActions.includes("open") ? <Link href={item.href}>{item.title}</Link> : item.title}</h2>
                <p>{item.subtitle}</p>
                <time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time>
              </div>
              <div className="library-item-actions signal-atlas-library-item-actions">
                {item.purchased ? <small>구매 리포트는 삭제 대신 숨길 수 있어요.</small> : item.allowedActions.includes("delete") && (pendingDeleteId === item.id ? <div className="danger-confirm library-delete-confirm"><p>{item.title}을 서버에서 삭제할까요?</p><button type="button" onClick={() => { void deleteItem(item.id); }}>보관함 항목 삭제 확정</button><button type="button" onClick={() => setPendingDeleteId(null)}>취소</button></div> : <button type="button" onClick={() => setPendingDeleteId(item.id)}>삭제</button>)}
              </div>
            </article>;
          })}</div>
        )}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}

export function LiveFlowScreen({ mode }: { mode: "today" | "month" | "year" }) {
  const [report, setReport] = useState<LiveReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getFlow(mode).then(setReport).catch((reason) => setError(reason instanceof Error ? reason.message : "흐름을 불러오지 못했어요.")); }, [mode]);
  if (!report && !error) return <LoadingState title="서버 흐름을 계산하고 있어요" />;
  if (error) return <EmptyState title="흐름을 준비할 수 없어요" description={error} action={{ href: "/birth", label: "출생 정보 입력" }} />;
  const title = mode === "today" ? "오늘의 흐름" : mode === "month" ? "이번 달 흐름" : "올해 흐름";
  return <main className={`screen-content flow-content signal-atlas-flow-screen ${styles.scope}`} aria-labelledby="flow-title"><div className="editorial-hero signal-atlas-flow-lead"><p className="section-kicker">{title}</p><h1 id="flow-title">{report?.sections[0]?.content ?? report?.kind}</h1><p className="supporting">서버에 저장된 명식과 기간 기준으로 생성한 결과예요.</p></div><section className="flow-sections" aria-label="흐름 내용">{report?.sections.map((section) => <article className="signal-panel" key={section.section_id}><h2>{section.title}</h2><p>{section.content}</p></article>)}</section><Link className="secondary-button" href="/report">기본 리포트로</Link></main>;
}

export function LiveHomeScreen() {
  const [data, setData] = useState<{ flow: LiveReport; count: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void Promise.all([getFlow("today"), listLibrary()]).then(([flow, library]) => setData({ flow, count: library.items.length })).catch((reason) => setError(reason instanceof Error ? reason.message : "홈을 불러오지 못했어요.")); }, []);
  if (!data && !error) return <LoadingState title="오늘의 흐름을 불러오고 있어요" />;
  if (error) return <EmptyState title="오늘의 흐름을 준비할 수 없어요" description={error} action={{ href: "/birth", label: "출생 정보 입력" }} />;
  return <main className={`screen-content home-content platform-home signal-atlas-home-screen ${styles.scope}`} aria-labelledby="home-title"><header className="signal-atlas-home-lead"><p>오늘 · 서버 기록 {data?.count ?? 0}개</p><h1 id="home-title">오늘의 흐름</h1></header><section className="home-summary signal-atlas-today-signal"><p>오늘의 신호</p><h2>{data?.flow.sections[0]?.content}</h2><p className="signal-atlas-signal-evidence">서버에 저장된 명식과 오늘 날짜를 기준으로 생성했습니다.</p><Link className="text-link" href="/flow/today">전체 흐름 보기</Link></section><section className="service-group signal-atlas-consultation-cta"><Link href="/consult/new"><strong>오늘의 고민을 남겨볼까요?</strong><span aria-hidden="true">↗</span></Link></section><Link className="secondary-button" href="/library">서버 보관함 보기</Link></main>;
}
