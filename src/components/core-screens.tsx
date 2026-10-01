"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { LibraryItemType, LibraryItemView } from "@/lib/contracts";
import { libraryStore } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { markdownPreview, markdownTitle } from "@/lib/markdown";
import { BRANCHES, STEMS, currentDaeun, dayGanji, ganjiGlyphs, ganjiHanja, yearGanji, type ChartView, type DaeunPeriod, type Glyph } from "@/lib/saju";
import { ConnectionErrorState, EmptyState, LoadingState } from "./page-state";
import { BackIcon, ChartIcon, ChevronIcon, ConsultIcon, PairIcon } from "./ui/icons";
import { RowLink } from "./ui/layout";
import { ElementBalance, PillarGrid } from "./ui/chart-display";
import { deleteLibraryItem, formatApiRequestError, formatConnectionError, getCurrentChart, getFlow, isAccountSessionExpired, listLibrary, type LiveReport } from "@/lib/api/service";

/* ---------- Dates and period pillars (display only; charts come from the server) ---------- */

type Day = { year: number; month: number; day: number };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
// Name of the solar term that opens each month pillar, starting from 인월.
const MONTH_TERMS = ["입춘", "경칩", "청명", "입하", "망종", "소서", "입추", "백로", "한로", "입동", "대설", "소한"] as const;

function todayParts(date = new Date()): Day {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function sameDay(left: Day, right: Day) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function weekday({ year, month, day }: Day) {
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

// Same fixed 절입일 table the server uses for chart month pillars (standard_term_fixed_dates_v1),
// indexed by calendar month: 소한 1/6, 입춘 2/4, 경칩 3/6 … 대설 12/7.
const TERM_DAYS = [6, 4, 6, 5, 6, 6, 7, 8, 8, 8, 7, 7] as const;

/** Month index since 인월 (0 = 인 … 11 = 축) for a calendar day. */
function monthIndex({ month, day }: Day) {
  const opened = day >= TERM_DAYS[month - 1] ? month : month - 1;
  return (opened - 2 + 24) % 12;
}

/** Month pillar (월건) for a date, switching on each 절입일. */
function monthGanji(date: Day) {
  const index = monthIndex(date);
  const beforeSpring = date.month < 2 || (date.month === 2 && date.day < TERM_DAYS[1]);
  const sajuYear = beforeSpring ? date.year - 1 : date.year;
  const yearStem = (((sajuYear - 4) % 10) + 10) % 10;
  const stem = ((yearStem % 5) * 2 + 2 + index) % 10;
  return { ganji: `${STEMS[stem]}${BRANCHES[(index + 2) % 12]}`, index, sajuYear, term: MONTH_TERMS[index] };
}

/** First day of the month pillar that contains the date, and the first day of the next one. */
function monthPillarRange(date: Day) {
  const opened = date.day >= TERM_DAYS[date.month - 1];
  const startMonth = new Date(date.year, date.month - 1 - (opened ? 0 : 1), 1);
  const endMonth = new Date(date.year, date.month - (opened ? 0 : 1), 1);
  const start = { year: startMonth.getFullYear(), month: startMonth.getMonth() + 1, day: TERM_DAYS[startMonth.getMonth()] };
  const end = { year: endMonth.getFullYear(), month: endMonth.getMonth() + 1, day: TERM_DAYS[endMonth.getMonth()] };
  return { start, end, nextTerm: MONTH_TERMS[(monthIndex(date) + 1) % 12] };
}

/* ---------- Flow report helpers ---------- */

const FLOW_LABELS = ["차분한 정비", "새로운 시도", "관계 중심", "집중과 성과", "순환과 휴식"] as const;
type FlowLabel = (typeof FLOW_LABELS)[number];

const TODAY_QUESTIONS: Record<FlowLabel, string> = {
  "차분한 정비": "미뤄둔 일 가운데 오늘 정리할 한 가지는 무엇인가요?",
  "새로운 시도": "요즘 해보고 싶었던 일은 무엇인가요?",
  "관계 중심": "요즘 마음이 쓰이는 사람이 있나요?",
  "집중과 성과": "오늘 끝까지 붙잡고 싶은 일은 무엇인가요?",
  "순환과 휴식": "오늘 내려놓아도 괜찮은 일은 무엇인가요?",
};

function flowSections(report: LiveReport) {
  return report.sections.filter((section) => section.content);
}

/** The flow label the server wrote into its section text, if any. */
function flowLabel(report: LiveReport): FlowLabel | null {
  const text = report.sections.map((section) => section.content ?? "").join(" ");
  return FLOW_LABELS.find((label) => text.includes(label)) ?? null;
}

/* ---------- Small display pieces ---------- */

function Hanja({ glyph, dark = false }: { glyph: Glyph | null; dark?: boolean }) {
  if (!glyph) return null;
  return <span className={`sj-hanja ${dark ? `sj-el-dark-${glyph.element}` : `sj-el-${glyph.element}`}`} lang="zh-Hant">{glyph.hanja}</span>;
}

function GanjiBlock({ ganji, label }: { ganji: string; label: string }) {
  const { stem, branch } = ganjiGlyphs(ganji);
  return (
    <div className="sj-day-block" role="img" aria-label={label}>
      <span className="sj-day-block-char" aria-hidden="true"><Hanja glyph={stem} dark /></span>
      <span className="sj-day-block-char" aria-hidden="true"><Hanja glyph={branch} dark /></span>
    </div>
  );
}

function GanjiText({ ganji, size, dark = false }: { ganji: string; size: number; dark?: boolean }) {
  const { stem, branch } = ganjiGlyphs(ganji);
  return <span aria-hidden="true" style={{ fontSize: size, flex: "0 0 auto" }}><Hanja glyph={stem} dark={dark} /><Hanja glyph={branch} dark={dark} /></span>;
}

function TileGlyph({ children }: { children: ReactNode }) {
  return <span className="sj-ganji-tile" aria-hidden="true" lang="zh-Hant">{children}</span>;
}

function CalendarGlyph() {
  return (
    <span className="sj-ganji-tile" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
    </span>
  );
}

function FlowError({ error, needsLogin, title }: { error: string; needsLogin: boolean; title: string }) {
  return <EmptyState title={needsLogin ? "다시 로그인해 주세요" : title} description={error} action={needsLogin ? { href: "/login", label: "로그인" } : { href: "/birth", label: "출생 정보 입력하기" }} />;
}

function monthRowSub(today: Day) {
  const month = monthGanji(today);
  const { start } = monthPillarRange(today);
  return `${start.month}월 ${start.day}일 ${month.term}부터 ${month.ganji}월이에요`;
}

/* ---------- Home ---------- */

type HomeData = { flow: LiveReport; chart: ChartView | null; recent: LibraryItemView[] };

export function LiveHomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    void Promise.all([
      getFlow("today"),
      getCurrentChart().catch(() => null),
      listLibrary().then((page) => page.items.filter((item) => !item.hidden).slice(0, 3)).catch(() => []),
    ])
      .then(([flow, chart, recent]) => setData({ flow, chart, recent }))
      .catch((reason) => {
        setNeedsLogin(isAccountSessionExpired(reason));
        setError(formatApiRequestError(reason, "홈을 불러오지 못했어요."));
      });
  }, []);
  if (!data && !error) return <LoadingState title="오늘의 흐름을 불러오고 있어요" />;
  if (error || !data) return <FlowError error={error} needsLogin={needsLogin} title="오늘의 흐름을 준비할 수 없어요" />;

  const today = todayParts();
  const ganji = dayGanji(today.year, today.month, today.day);
  const month = monthGanji(today);
  const year = yearGanji(today.year);
  const label = flowLabel(data.flow);
  const sections = flowSections(data.flow);
  const daeun = data.chart ? currentDaeun(data.chart, today.year) : null;

  return (
    <main className="sj-page" aria-labelledby="home-title">
      <div className="sj-split">
        <div className="sj-page">
          <section className="sj-today">
            <GanjiBlock ganji={ganji} label={`오늘의 일진 ${ganji}`} />
            <div className="sj-today-text">
              <p className="sj-meta">
                <span className="sj-desktop-only" style={{ display: "inline" }}>{today.year}년 </span>
                {today.month}월 {today.day}일 {weekday(today)}요일, {ganji}일
              </p>
              <h1 id="home-title" className="sj-h1">{label ? `오늘은 ${label}의 흐름이에요` : "오늘의 흐름"}</h1>
            </div>
          </section>

          {sections.length > 0 && (
            <section className="sj-card" aria-label="오늘의 흐름 내용">
              {sections.map((section) => <p key={section.section_id} className="sj-body">{section.content}</p>)}
              <Link className="sj-text-button" href="/flow/today">오늘의 흐름 자세히 보기</Link>
            </section>
          )}

          <section className="sj-card-accent" aria-labelledby="today-question">
            <h2 id="today-question" className="sj-h2" style={{ fontSize: 18 }}>{label ? TODAY_QUESTIONS[label] : "요즘 어떤 선택 앞에 있나요?"}</h2>
            <Link className="sj-button sj-button-small" href="/consult/new" style={{ alignSelf: "flex-start" }}>상담 시작하기</Link>
          </section>

          <section className="sj-section" aria-labelledby="longer-flow">
            <h2 id="longer-flow" className="sj-h2">더 긴 흐름</h2>
            <div className="sj-list">
              <RowLink href="/flow/month" leading={<TileGlyph>{ganjiHanja(month.ganji).slice(1)}</TileGlyph>} title="이번 달 흐름" sub={monthRowSub(today)} />
              <RowLink href="/reports/year" leading={<TileGlyph>{ganjiHanja(year).slice(1)}</TileGlyph>} title="올해 흐름" sub={daeun ? `${year}년을 ${daeun.ganji} 대운과 함께 봐요` : `${today.year}년 ${year}년의 흐름이에요`} />
              <RowLink href="/calendar" leading={<CalendarGlyph />} title="시기 캘린더" sub="날짜별 일진을 봐요" />
            </div>
          </section>

          {data.recent.length > 0 && (
            <section className="sj-section sj-desktop-only" aria-labelledby="recent-title">
              <h2 id="recent-title" className="sj-h2">이어서 보기</h2>
              <div className="sj-list">
                {data.recent.map((item) => <RowLink key={item.id} href={item.href} title={item.title} value={formatShortDate(item.createdAt)} />)}
              </div>
            </section>
          )}
        </div>

        {data.chart && (
          <aside className="sj-aside sj-desktop-only" aria-labelledby="chart-summary-title">
            <div className="sj-card" style={{ gap: 20, padding: 28, borderRadius: 16 }}>
              <div className="sj-section-head">
                <h2 id="chart-summary-title" className="sj-h2" style={{ fontSize: 20 }}>내 명식</h2>
                <Link className="sj-text-button" href="/report">명식 자세히 보기</Link>
              </div>
              <PillarGrid chart={data.chart} />
              <div className="sj-section" style={{ gap: 10 }}>
                <h3 className="sj-h3">오행</h3>
                <ElementBalance counts={data.chart.fiveElements} />
              </div>
              {daeun && (
                <div className="sj-banner" style={{ alignItems: "center", gap: 14 }}>
                  <GanjiText ganji={daeun.ganji} size={28} />
                  <p className="sj-body" style={{ fontSize: 14 }}>{daeun.startAge}–{daeun.endAge}세에 지나는 {daeun.ganji} 대운이에요.</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/* ---------- Today / month / year flow ---------- */

type FlowMode = "today" | "month" | "year";

function flowPeriod(mode: FlowMode, today: Day) {
  if (mode === "today") {
    const ganji = dayGanji(today.year, today.month, today.day);
    return { ganji, blockLabel: `오늘의 일진 ${ganji}`, meta: `${today.year}년 ${today.month}월 ${today.day}일 ${weekday(today)}요일`, heading: `${today.month}월 ${today.day}일, ${ganji}일`, boundary: "" };
  }
  if (mode === "month") {
    const month = monthGanji(today);
    const { start, end, nextTerm } = monthPillarRange(today);
    return {
      ganji: month.ganji,
      blockLabel: `이번 달 월건 ${month.ganji}`,
      meta: `${end.month}월 ${end.day}일 ${nextTerm} 전까지 이어져요`,
      heading: `${month.ganji}월, ${start.month}월 ${start.day}일 ${month.term}부터`,
      boundary: "월의 경계는 절기(절입일)로 나눠요.",
    };
  }
  const ganji = yearGanji(today.year);
  return { ganji, blockLabel: `올해 간지 ${ganji}`, meta: "입춘부터 다음 해 입춘 전까지", heading: `${today.year}년 ${ganji}년`, boundary: "해의 경계는 입춘으로 나눠요." };
}

export function LiveFlowScreen({ mode }: { mode: FlowMode }) {
  const [data, setData] = useState<{ report: LiveReport; chart: ChartView | null } | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    void Promise.all([getFlow(mode), mode === "year" ? getCurrentChart().catch(() => null) : Promise.resolve(null)])
      .then(([report, chart]) => setData({ report, chart }))
      .catch((reason) => {
        setNeedsLogin(isAccountSessionExpired(reason));
        setError(formatApiRequestError(reason, "흐름을 불러오지 못했어요."));
      });
  }, [mode]);
  if (!data && !error) return <LoadingState title="흐름을 계산하고 있어요" />;
  if (error || !data) return <FlowError error={error} needsLogin={needsLogin} title="흐름을 준비할 수 없어요" />;

  const today = todayParts();
  const period = flowPeriod(mode, today);
  const label = flowLabel(data.report);
  const sections = flowSections(data.report);
  const daeun = data.chart ? currentDaeun(data.chart, today.year) : null;
  const month = monthGanji(today);
  const year = yearGanji(today.year);
  const todayGanji = dayGanji(today.year, today.month, today.day);

  return (
    <main className="sj-page" aria-labelledby="flow-title">
      <section className="sj-today">
        <GanjiBlock ganji={period.ganji} label={period.blockLabel} />
        <div className="sj-today-text">
          <p className="sj-meta">{period.meta}</p>
          <h1 id="flow-title" className="sj-h1">{period.heading}</h1>
          {label && <span className="sj-badge sj-badge-accent" style={{ alignSelf: "flex-start" }}>{label}</span>}
        </div>
      </section>

      {mode === "year" && daeun && (
        <section className="sj-section" aria-labelledby="year-daeun-title">
          <h2 id="year-daeun-title" className="sj-h2">{daeun.ganji} 대운 안에서 만나는 {year}년</h2>
          <div className="sj-card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <GanjiText ganji={daeun.ganji} size={30} />
              <span className="sj-fine">지금 대운, {daeun.startAge}–{daeun.endAge}세</span>
            </div>
            <span className="sj-meta">그리고</span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <GanjiText ganji={year} size={30} />
              <span className="sj-fine">올해</span>
            </div>
          </div>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.section_id} className="sj-card" aria-labelledby={`flow-section-${section.section_id}`}>
          <h2 id={`flow-section-${section.section_id}`} className="sj-h2">{section.title}</h2>
          <p className="sj-body">{section.content}</p>
          {section.evidence.length > 0 && (
            <div className="sj-chips">
              <span className="sj-fine">이렇게 읽었어요</span>
              {section.evidence.map((item) => <span key={item} className="sj-chip">{item}</span>)}
            </div>
          )}
        </section>
      ))}

      <section className="sj-section" aria-labelledby="other-flow">
        <h2 id="other-flow" className="sj-h2">다른 흐름 보기</h2>
        <div className="sj-list">
          {mode !== "today" && <RowLink href="/flow/today" leading={<TileGlyph>{ganjiHanja(todayGanji).slice(1)}</TileGlyph>} title="오늘의 흐름" sub={`${today.month}월 ${today.day}일 ${todayGanji}일`} />}
          {mode !== "month" && <RowLink href="/flow/month" leading={<TileGlyph>{ganjiHanja(month.ganji).slice(1)}</TileGlyph>} title="이번 달 흐름" sub={monthRowSub(today)} />}
          {mode !== "year" && <RowLink href="/reports/year" leading={<TileGlyph>{ganjiHanja(year).slice(1)}</TileGlyph>} title="올해 흐름" sub={`${today.year}년 ${year}년의 흐름이에요`} />}
          {mode === "year" && <RowLink href="/reports/decade" leading={daeun ? <TileGlyph>{ganjiHanja(daeun.ganji).slice(1)}</TileGlyph> : <CalendarGlyph />} title="10년 흐름" sub="대운 구간을 차례로 봐요" />}
          <RowLink href="/calendar" leading={<CalendarGlyph />} title="시기 캘린더" sub="날짜별 일진을 봐요" />
        </div>
      </section>

      <p className="sj-fine">{period.boundary ? `${period.boundary} ` : ""}서버에 저장된 명식과 기간 기준으로 생성한 결과예요.</p>
    </main>
  );
}

/* ---------- 10-year (대운) ---------- */

function periodName(period: DaeunPeriod) {
  return period.stem && period.branch ? `${period.stem.ko}${period.stem.element}, ${period.branch.ko}${period.branch.element}` : "";
}

export function DecadeScreen() {
  const [chart, setChart] = useState<ChartView | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    void getCurrentChart()
      .then(setChart)
      .catch((reason) => {
        setNeedsLogin(isAccountSessionExpired(reason));
        setError(formatApiRequestError(reason, "대운 정보를 불러오지 못했어요."));
      });
  }, []);
  if (chart === undefined && !error) return <LoadingState title="대운 구간을 불러오고 있어요" />;
  if (error) return <FlowError error={error} needsLogin={needsLogin} title="대운을 준비할 수 없어요" />;
  if (!chart || chart.daeun.periods.length === 0) {
    return <EmptyState title="대운을 보려면 명식이 필요해요" description="출생 정보를 입력하고 명식을 계산하면 10년 단위 대운 구간을 볼 수 있어요." action={{ href: "/birth", label: "출생 정보 입력하기" }} />;
  }

  const thisYear = new Date().getFullYear();
  const now = currentDaeun(chart, thisYear);
  const nowIndex = now ? chart.daeun.periods.indexOf(now) : -1;
  const direction = chart.daeun.direction === "backward" ? "간지 순서를 거꾸로 따라 흘러요" : chart.daeun.direction === "forward" ? "간지 순서를 따라 흘러요" : "";
  const startAge = chart.daeun.startAge ?? chart.daeun.periods[0]?.startAge;

  return (
    <main className="sj-page" aria-labelledby="decade-title">
      <section className="sj-section" style={{ gap: 8 }}>
        <h1 id="decade-title" className="sj-h1">{now ? `지금은 ${now.startAge}세부터 ${now.endAge}세까지 이어지는 ${now.ganji} 대운이에요` : "대운은 10년마다 바뀌어요"}</h1>
        <p className="sj-lead">
          {startAge !== undefined && startAge !== null ? `대운은 ${startAge}세에 시작해 10년마다 바뀌어요.` : "대운은 10년마다 바뀌어요."}
          {direction ? ` 이 명식의 대운은 ${direction}.` : ""}
        </p>
      </section>

      <section aria-labelledby="decade-steps">
        <h2 id="decade-steps" className="sj-visually-hidden">대운 구간</h2>
        <ol className="sj-steps">
          {chart.daeun.periods.map((period, index) => {
            const isNow = index === nowIndex;
            const past = nowIndex >= 0 && index < nowIndex;
            const last = index === chart.daeun.periods.length - 1;
            return (
              <li key={`${period.ganji}-${period.startAge}`} className="sj-step" aria-current={isNow ? "step" : undefined}>
                {!last && <span className="sj-step-line" aria-hidden="true" />}
                <span className={`sj-step-dot${isNow ? " sj-step-dot-now" : past ? " sj-step-dot-done" : ""}`} aria-hidden="true" />
                <div style={{ display: "flex", flex: "1 1 auto", alignItems: "center", gap: 12, opacity: past ? 0.7 : 1 }}>
                  <GanjiText ganji={period.ganji} size={24} />
                  <div className="sj-row-main">
                    <span className="sj-row-title" style={{ fontWeight: isNow ? 700 : 500 }}>{period.ganji} 대운, {period.startAge}–{period.endAge}세</span>
                    {periodName(period) && <span className="sj-row-sub">{periodName(period)}</span>}
                  </div>
                  {isNow && <span className="sj-badge sj-badge-accent">지금</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {now && (
        <section className="sj-section" aria-labelledby="decade-now">
          <div className="sj-card-dark" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <GanjiText ganji={now.ganji} size={36} dark />
            <div>
              <h2 id="decade-now" className="sj-h2" style={{ color: "var(--sj-canvas)" }}>{now.ganji} 대운, {now.startAge}–{now.endAge}세</h2>
              {periodName(now) && <p className="sj-card-dark-text">{periodName(now)}</p>}
            </div>
          </div>
          <Link className="sj-button-secondary" href="/reports/year">올해 흐름 보기</Link>
        </section>
      )}

      <p className="sj-fine">대운의 방향과 시작 나이는 생년월일시와 계산 기준 성별로 정해져요. 계산으로 나눈 구간이며 특정 사건을 예측하지 않아요.</p>
    </main>
  );
}

/* ---------- Calendar ---------- */

export function CalendarScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="달력을 준비하고 있어요" />;
  return <CalendarView today={todayParts()} />;
}

function CalendarView({ today }: { today: Day }) {
  const [view, setView] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState<Day>(today);
  const firstWeekday = new Date(view.year, view.month - 1, 1).getDay();
  const total = daysInMonth(view.year, view.month);
  const termDay = TERM_DAYS[view.month - 1];
  const termMonth = monthGanji({ year: view.year, month: view.month, day: termDay });

  function move(delta: number) {
    const next = new Date(view.year, view.month - 1 + delta, 1);
    const target = { year: next.getFullYear(), month: next.getMonth() + 1 };
    setView(target);
    setSelected(target.year === today.year && target.month === today.month ? today : { ...target, day: 1 });
  }

  const selectedGanji = dayGanji(selected.year, selected.month, selected.day);
  const selectedGlyphs = ganjiGlyphs(selectedGanji);
  const selectedIsToday = sameDay(selected, today);
  const selectedMonth = monthGanji(selected);
  const selectedYear = yearGanji(selectedMonth.sajuYear);

  return (
    <main className="sj-page sj-page-tight" aria-labelledby="calendar-title">
      <section className="sj-section" aria-labelledby="calendar-title">
        <div className="sj-section-head" style={{ alignItems: "center" }}>
          <div>
            <h1 id="calendar-title" className="sj-h1" style={{ fontSize: 22 }}>{view.year}년 {view.month}월</h1>
            <p className="sj-meta">{termDay}일 {termMonth.term}부터 {termMonth.ganji}월이에요</p>
          </div>
          <div style={{ display: "flex" }}>
            <button className="sj-icon-button" type="button" aria-label="이전 달" onClick={() => move(-1)}><BackIcon size={20} /></button>
            <button className="sj-icon-button" type="button" aria-label="다음 달" onClick={() => move(1)}><ChevronIcon size={20} /></button>
          </div>
        </div>

        <div className="sj-card" style={{ padding: "8px 6px 10px", gap: 4 }}>
          <div className="sj-calendar" aria-hidden="true">
            {WEEKDAYS.map((name) => <span key={name} className="sj-cal-weekday">{name}</span>)}
          </div>
          <div className="sj-calendar" role="group" aria-label={`${view.year}년 ${view.month}월 날짜`}>
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
            {Array.from({ length: total }, (_, index) => {
              const date = { year: view.year, month: view.month, day: index + 1 };
              const ganji = dayGanji(date.year, date.month, date.day);
              const isToday = sameDay(date, today);
              return (
                <button
                  key={date.day}
                  className="sj-cal-day"
                  type="button"
                  aria-pressed={sameDay(date, selected)}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={`${date.month}월 ${date.day}일 ${ganji}일${isToday ? ", 오늘" : ""}`}
                  onClick={() => setSelected(date)}
                >
                  <span className="sj-cal-date">{date.day}</span>
                  <span className="sj-cal-ganji">{ganji}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="sj-fine">날짜 아래 두 글자는 그날의 일진이에요. 날짜를 누르면 아래에서 자세히 볼 수 있어요.</p>
      </section>

      <section className="sj-card" aria-live="polite" aria-label="선택한 날" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16 }}>
        <div className="sj-day-block" aria-hidden="true" style={{ width: 64, padding: "10px 0", borderRadius: 8 }}>
          <span style={{ fontSize: 30 }}><Hanja glyph={selectedGlyphs.stem} dark /></span>
          <span style={{ fontSize: 30 }}><Hanja glyph={selectedGlyphs.branch} dark /></span>
        </div>
        <div className="sj-row-main" style={{ gap: 4 }}>
          <h2 className="sj-h2">{selected.month}월 {selected.day}일 {weekday(selected)}요일, {selectedGanji}일</h2>
          <p className="sj-meta">{selectedIsToday ? "오늘이에요. " : ""}{selectedMonth.ganji}월, {selectedYear}년 안의 하루예요.</p>
          {selectedIsToday && <Link className="sj-text-button" href="/flow/today" style={{ alignSelf: "flex-start" }}>오늘의 흐름 보기</Link>}
        </div>
      </section>

      <p className="sj-fine">일진은 날짜로 계산한 값이에요. 좋은 날과 나쁜 날을 가려 표시하지 않아요. 날짜별 흐름 해석은 오늘 하루만 볼 수 있어요.</p>
    </main>
  );
}

/* ---------- Library ---------- */

const TYPE_LABELS: Record<LibraryItemType, string> = {
  report: "리포트",
  consultation: "상담",
  compatibility: "궁합",
};

const TYPE_FILTERS: ReadonlyArray<{ id: "all" | LibraryItemType; label: string }> = [
  { id: "all", label: "전체" },
  { id: "report", label: "리포트" },
  { id: "consultation", label: "상담" },
  { id: "compatibility", label: "궁합" },
];

function TypeTile({ type }: { type: LibraryItemType }) {
  const Icon = type === "report" ? ChartIcon : type === "consultation" ? ConsultIcon : PairIcon;
  return <span className="sj-initial-tile" aria-hidden="true"><Icon /></span>;
}

export function LibraryRowContent({ item }: { item: LibraryItemView }) {
  // Previews are already plain from listLibrary; stripping again keeps older or local items clean too.
  const sub = [TYPE_LABELS[item.type], item.purchased ? "구매한 리포트" : "", item.hidden ? "숨긴 기록" : "", markdownPreview(item.subtitle)].filter(Boolean).join(", ");
  const title = markdownTitle(item.title) || TYPE_LABELS[item.type];
  return (
    <>
      <TypeTile type={item.type} />
      <span className="sj-row-main">
        <span className="sj-row-title sj-row-title-clamp">{title}</span>
        <span className="sj-row-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
      </span>
      <span className="sj-row-value">{formatShortDate(item.createdAt)}</span>
    </>
  );
}

export function LibraryScreen() {
  const hydrated = useHydrated();
  // Keeps the screen in sync with the browser library store (and surfaces blocked storage on reload).
  useSyncExternalStore(libraryStore.subscribe, libraryStore.rawSnapshot, () => null);
  const [type, setType] = useState<"all" | LibraryItemType>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState<LibraryItemView[] | null>(null);
  const [serverError, setServerError] = useState("");
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listLibrary()
      .then((page) => active && setServerItems(page.items))
      .catch((reason) => active && setServerError(formatConnectionError(reason)));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!serverItems && !serverError)) return <LoadingState title="보관함을 불러오고 있어요" />;
  if (serverError || !serverItems) return <ConnectionErrorState title="보관함을 불러올 수 없어요" description={serverError} onRetry={() => window.location.reload()} />;
  const source = serverItems;
  const hasHidden = source.some((item) => item.hidden);
  const items = source
    .filter((item) => (showHidden || !item.hidden) && (type === "all" || item.type === type))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  async function deleteItem(id: string) {
    if (source.find((item) => item.id === id)?.purchased) {
      setError("구매한 리포트는 삭제할 수 없고 숨기기만 할 수 있어요.");
      setPendingDeleteId(null);
      return;
    }
    try {
      await deleteLibraryItem(id);
      setServerItems((current) => current?.filter((item) => item.id !== id) ?? null);
      setPendingDeleteId(null);
      setError("");
    } catch {
      setError("기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="sj-page sj-page-tight" aria-labelledby="library-title" style={{ maxWidth: 720 }}>
      <h1 id="library-title" className="sj-h1">보관함</h1>
      <nav className="sj-tablist" aria-label="보관함 구분">
        <Link className="sj-tablist-tab" href="/library" aria-current="page">내 기록</Link>
        <Link className="sj-tablist-tab" href="/products">리포트와 이용권</Link>
      </nav>

      <div className="sj-chips" role="group" aria-label="종류로 거르기">
        {TYPE_FILTERS.map((filter) => (
          <button key={filter.id} className="sj-chip-button" type="button" aria-pressed={type === filter.id} onClick={() => setType(filter.id)}>{filter.label}</button>
        ))}
      </div>
      {hasHidden && (
        <label className="sj-check" style={{ paddingTop: 0 }}>
          <input className="sj-check-input" type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
          숨긴 기록도 보기
        </label>
      )}

      {error && <p className="sj-error" role="alert">{error}</p>}

      {source.length === 0 ? (
        <EmptyState title="아직 저장된 기록이 없어요" description="기본 리포트를 보거나 상담을 하면 여기에 차례로 모여요." action={{ href: "/report", label: "기본 리포트 보기" }} />
      ) : items.length === 0 ? (
        <div className="sj-section" role="status" style={{ padding: "24px 0" }}>
          <h2 className="sj-h2">이 종류의 기록이 없어요</h2>
          <p className="sj-meta">다른 종류를 고르거나 전체를 눌러 모든 기록을 보세요.</p>
        </div>
      ) : (
        <section aria-labelledby="library-results-title">
          <h2 id="library-results-title" className="sj-visually-hidden">저장된 기록 {items.length}개</h2>
          <ul className="sj-list">
            {items.map((item) => {
              const canDelete = !item.purchased && item.allowedActions.includes("delete");
              const confirming = pendingDeleteId === item.id;
              return (
                <li key={item.id} style={{ borderBottom: "1px solid var(--sj-line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {item.allowedActions.includes("open") ? (
                      <Link className="sj-row" href={item.href} style={{ borderBottom: 0, minWidth: 0 }}>
                        <LibraryRowContent item={item} />
                      </Link>
                    ) : (
                      <div className="sj-row" style={{ borderBottom: 0, minWidth: 0, cursor: "default" }}>
                        <LibraryRowContent item={item} />
                      </div>
                    )}
                    {canDelete && !confirming && (
                      <button className="sj-text-button" type="button" style={{ color: "var(--sj-muted)", fontWeight: 500, padding: "0 4px" }} aria-label={`${item.title} 삭제`} onClick={() => setPendingDeleteId(item.id)}>삭제</button>
                    )}
                  </div>
                  {item.purchased && <p className="sj-fine" style={{ paddingBottom: 10 }}>구매한 리포트는 삭제 대신 숨길 수 있어요.</p>}
                  {confirming && (
                    <div className="sj-banner" style={{ flexDirection: "column", marginBottom: 12 }}>
                      <p className="sj-body" style={{ fontSize: 14 }}>{item.title} 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.</p>
                      <div className="sj-actions-row">
                        <button className="sj-button-danger" type="button" onClick={() => { void deleteItem(item.id); }}>기록 삭제</button>
                        <button className="sj-button-secondary" type="button" onClick={() => setPendingDeleteId(null)}>취소</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="sj-fine">기록은 지금 쓰는 익명 세션이나 로그인한 계정에 저장돼요. 계정을 만들면 다른 기기에서도 이어 볼 수 있어요.</p>
    </main>
  );
}

