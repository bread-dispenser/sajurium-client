"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import { BackIcon, CheckIcon, ShareIcon } from "./ui/icons";
import { Banner, RowLink } from "./ui/layout";
import { DaeunStrip, ElementBalance, PillarGrid, PillarStrip } from "./ui/chart-display";
import type { BirthInfo, FeedbackData, FeedbackId, FeedbackReason, TopicId } from "@/lib/domain";
import type { FeedbackProvenance, FeedbackTarget, OwnerRelationship, TopicId as ProfileTopicId } from "@/lib/contracts";
import { hasValidLeapMonthSemantics, parseBirthDate } from "@/lib/contracts";
import { useHydrated } from "@/hooks/use-hydrated";
import { FEEDBACK_OPTIONS, INITIAL_BIRTH, TOPICS, getTopicPreview } from "@/lib/fixtures";
import { createBasicReading, formatApiRequestError, getCurrentChart, getCurrentReport, submitReportFeedback, type LiveReport } from "@/lib/api/service";
import { ELEMENTS, currentDaeun, ganjiGlyphs, ganjiHanja, type ChartView, type Pillar } from "@/lib/saju";
import {
  birthDraftStore,
  createTransactionStep,
  feedbackListStore,
  feedbackStore,
  inspectCurrentBirth,
  reportStore,
  resetBirthSource,
  runStorageTransaction,
  saveReportAndClearBirthDraft,
} from "@/lib/storage";

function sameBirth(left: BirthInfo, right: BirthInfo) {
  return left.displayName === right.displayName &&
    left.birthDate === right.birthDate &&
    left.calendar === right.calendar &&
    left.leapMonth === right.leapMonth &&
    left.birthTime === right.birthTime &&
    left.birthTimeUnknown === right.birthTimeUnknown &&
    left.birthplace === right.birthplace &&
    left.timezone === right.timezone &&
    left.calculationGender === right.calculationGender &&
    left.profileType === right.profileType &&
    left.ownerRelationship === right.ownerRelationship &&
    left.thirdPartyConsent === right.thirdPartyConsent &&
    left.personalization.relationshipStatus === right.personalization.relationshipStatus &&
    left.personalization.occupationStatus === right.personalization.occupationStatus &&
    left.personalization.primaryConcern === right.personalization.primaryConcern &&
    left.personalization.interests.length === right.personalization.interests.length &&
    left.personalization.interests.every((topic, index) => topic === right.personalization.interests[index]);
}

/* ---------- Shared display helpers ---------- */

function hourLabel(hour: number) {
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 === 0 ? 12 : hour % 12}시`;
}

function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return minute ? `${hourLabel(hour)} ${minute}분` : hourLabel(hour);
}

function calendarLabel(birth: Pick<BirthInfo, "calendar" | "leapMonth">) {
  return birth.calendar === "solar" ? "양력" : birth.leapMonth ? "음력 윤달" : "음력";
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function birthLine(birth: BirthInfo) {
  const time = birth.birthTimeUnknown || !birth.birthTime ? "태어난 시간 모름" : timeLabel(birth.birthTime);
  return `${birth.displayName}님, ${calendarLabel(birth)} ${dateLabel(birth.birthDate)} ${time}`;
}

const TOPIC_NAMES: Record<TopicId, string> = { love: "연애", career: "커리어", money: "재물", family: "가족" };
const TOPIC_MARKS: Record<TopicId, string> = { love: "緣", career: "業", money: "財", family: "家" };
const TOPIC_PRODUCTS: Partial<Record<TopicId, string>> = { love: "love-report", career: "career-report", money: "money-report" };

/* ---------- Landing (/) ---------- */

function samplePillar(ganji: string, tenGod: string | null): Pillar {
  const { stem, branch } = ganjiGlyphs(ganji);
  return { stem: stem!, branch: branch!, tenGod };
}

/** A fixed example chart (1992-06-18 14:30, female) shown on the landing page only. */
const SAMPLE_CHART: ChartView = {
  id: "sample",
  profileId: "sample",
  pillars: {
    hour: samplePillar("계미", "편인"),
    day: samplePillar("을축", null),
    month: samplePillar("병오", "상관"),
    year: samplePillar("임신", "정인"),
  },
  fiveElements: { 목: 1, 화: 2, 토: 2, 금: 1, 수: 2 },
  daeun: { direction: null, startAge: null, birthYear: null, periods: [] },
  engineVersion: "",
  calculationMethod: "",
};

export function LandingScreen({ initialCalculationFailure }: { initialCalculationFailure: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const reportRaw = useSyncExternalStore(reportStore.subscribe, reportStore.rawSnapshot, () => null);
  void reportRaw;
  const reportInspection = hydrated ? reportStore.inspect() : null;
  if (reportInspection?.status === "corrupt" || reportInspection?.status === "unavailable") {
    return (
      <div className="sj-public">
        <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 다른 내용으로 바꾸지 않아요." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />
      </div>
    );
  }
  const hasSavedReport = reportInspection?.status === "ok";
  const birthHref = initialCalculationFailure ? "/birth?calculation=fail" : "/birth";

  return (
    <div className="sj-public">
      <header className="sj-public-header">
        <Link className="sj-wordmark" href="/">사주리움</Link>
        <Link className="sj-text-button" href="/login">로그인</Link>
      </header>
      <main className="sj-landing sj-page" aria-labelledby="landing-title" style={{ paddingTop: 24 }}>
        <div className="sj-section" style={{ gap: 16, alignSelf: "end" }}>
          <h1 id="landing-title" className="sj-h1 sj-h1-hero">태어난 순간을<br />여덟 글자로 펼쳐봅니다</h1>
          <p className="sj-lead">생년월일시로 명식을 계산하고, 오행의 균형과 지금 지나는 대운을 근거와 함께 보여드려요.</p>
          <p className="sj-meta sj-desktop-only">명식, 오행, 대운, 오늘의 흐름과 기본 리포트는 무료로 볼 수 있어요. 궁금한 점은 명식을 바탕으로 상담해볼 수 있어요.</p>
        </div>
        <figure className="sj-section" aria-label="명식 예시: 계미시, 을축일, 병오월, 임신년" style={{ margin: 0, gridColumn: 2, gridRow: "1 / span 2", alignSelf: "center" }}>
          <PillarStrip chart={SAMPLE_CHART} />
          <figcaption className="sj-fine">예시 명식이에요. 1992년 6월 18일 오후 2시 30분에 태어난 사람의 명식이고, 어두운 칸이 나를 뜻하는 일간이에요.</figcaption>
        </figure>
        <div className="sj-actions" style={{ alignSelf: "start" }}>
          <div className="sj-actions-row">
            <Link className="sj-button sj-button-block" href={birthHref} style={{ flex: "1 1 220px" }}>내 명식 계산하기</Link>
            <Link className="sj-button-secondary sj-desktop-only" href="/login" style={{ flex: "1 1 220px", minHeight: 56 }}>로그인하고 기록 불러오기</Link>
          </div>
          {hasSavedReport && <button className="sj-button-secondary" type="button" onClick={() => router.push("/report")}>이 기기에 저장한 결과 이어보기</button>}
          <p className="sj-fine">가입 없이 시작할 수 있어요. 버전이 기록된 명식 계산을 쓰지만, 해석은 선택을 대신하지 않아요.</p>
        </div>
      </main>
    </div>
  );
}

/* ---------- Birth (/birth) ---------- */

type Sijin = { name: string; range: string; hour: number };

// 백엔드 규칙: 시지 = ((hour + 1) // 2) % 12. 각 시진의 첫 시각을 보낸다(자시는 23시).
const SIJIN: readonly Sijin[] = [
  { name: "자시", range: "23–01", hour: 23 },
  { name: "축시", range: "01–03", hour: 1 },
  { name: "인시", range: "03–05", hour: 3 },
  { name: "묘시", range: "05–07", hour: 5 },
  { name: "진시", range: "07–09", hour: 7 },
  { name: "사시", range: "09–11", hour: 9 },
  { name: "오시", range: "11–13", hour: 11 },
  { name: "미시", range: "13–15", hour: 13 },
  { name: "신시", range: "15–17", hour: 15 },
  { name: "유시", range: "17–19", hour: 17 },
  { name: "술시", range: "19–21", hour: 19 },
  { name: "해시", range: "21–23", hour: 21 },
];

function sijinSpan(sijin: Sijin) {
  const start = hourLabel(sijin.hour);
  const endHour = (sijin.hour + 2) % 24;
  const end = hourLabel(endHour);
  const samePeriod = (sijin.hour < 12) === (endHour < 12) && endHour !== 0;
  return `${start}–${samePeriod ? end.split(" ")[1] : end}`;
}

const EMPTY_BIRTH: BirthInfo = {
  ...INITIAL_BIRTH,
  displayName: "",
  birthDate: "",
  birthTime: null,
  birthplace: "",
  birthTimeUnknown: false,
  personalization: { ...INITIAL_BIRTH.personalization, interests: [] },
};

type CalendarChoice = "solar" | "lunar" | "leap";
const CALENDAR_CHOICES: ReadonlyArray<{ id: CalendarChoice; label: string }> = [
  { id: "solar", label: "양력" },
  { id: "lunar", label: "음력" },
  { id: "leap", label: "음력 윤달" },
];

function digits(value: string, max: number) {
  return value.replace(/\D/g, "").slice(0, max);
}

function composeDate(year: string, month: string, day: string) {
  if (!year || !month || !day) return "";
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function BirthScreen({ initialCalculationFailure }: { initialCalculationFailure: boolean }) {
  const router = useRouter();
  const [birth, setBirth] = useState<BirthInfo>(EMPTY_BIRTH);
  const [dateParts, setDateParts] = useState({ year: "", month: "", day: "" });
  const [timeMode, setTimeMode] = useState<"sijin" | "exact">("sijin");
  const [sijinIndex, setSijinIndex] = useState<number | null>(null);
  const [exact, setExact] = useState({ hour: "", minute: "" });
  const [step, setStep] = useState<1 | 2>(1);
  const [phase, setPhase] = useState<"form" | "loading" | "failure">("form");
  const [formError, setFormError] = useState("");
  const failNextCalculation = useRef(initialCalculationFailure);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownView = useRef(`${step}-${phase}`);

  useEffect(() => {
    const view = `${step}-${phase}`;
    if (shownView.current === view) return;
    shownView.current = view;
    window.scrollTo?.(0, 0);
    headingRef.current?.focus();
  }, [step, phase]);

  function updateBirth(update: Partial<BirthInfo>) {
    setBirth((current) => ({ ...current, ...update }));
    setFormError("");
  }

  function updateDate(part: "year" | "month" | "day", value: string) {
    setDateParts((current) => ({ ...current, [part]: digits(value, part === "year" ? 4 : 2) }));
    setFormError("");
  }

  function updateProfileType(profileType: BirthInfo["profileType"]) {
    updateBirth({
      profileType,
      ownerRelationship: profileType === "self" ? "self" : birth.ownerRelationship === "self" ? "partner" : birth.ownerRelationship,
      thirdPartyConsent: profileType === "self" ? false : birth.thirdPartyConsent,
    });
  }

  const calendarChoice: CalendarChoice = birth.calendar === "solar" ? "solar" : birth.leapMonth ? "leap" : "lunar";

  function birthTimeValue(): string | null {
    if (birth.birthTimeUnknown) return null;
    if (timeMode === "sijin") return sijinIndex === null ? null : `${String(SIJIN[sijinIndex].hour).padStart(2, "0")}:00`;
    if (!/^\d{1,2}$/.test(exact.hour) || !/^\d{0,2}$/.test(exact.minute)) return null;
    const hour = Number(exact.hour);
    const minute = Number(exact.minute || "0");
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function timeSummary() {
    if (birth.birthTimeUnknown) return "모름, 시주를 빼고 계산";
    if (timeMode === "sijin" && sijinIndex !== null) return `${SIJIN[sijinIndex].name} (${sijinSpan(SIJIN[sijinIndex])})`;
    const value = birthTimeValue();
    return value ? timeLabel(value) : "입력 전";
  }

  function validateFirstStep(): string | null {
    const birthDate = composeDate(dateParts.year, dateParts.month, dateParts.day);
    if (!birth.displayName.trim()) return "부를 이름을 입력해 주세요.";
    if (!parseBirthDate(birthDate, new Date(), birth.calendar)) return "1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.";
    if (!hasValidLeapMonthSemantics(birth)) return "양력 날짜에는 윤달을 선택할 수 없어요.";
    if (!birth.birthTimeUnknown) {
      if (timeMode === "sijin" && sijinIndex === null) return "태어난 시간을 고르거나 ‘시간을 몰라요’를 선택해 주세요.";
      if (timeMode === "exact" && !birthTimeValue()) return "정확한 시각은 0시부터 23시, 0분부터 59분 사이로 입력해 주세요.";
    }
    return null;
  }

  function normalizedBirth(): BirthInfo {
    return {
      ...birth,
      displayName: birth.displayName.trim(),
      birthDate: composeDate(dateParts.year, dateParts.month, dateParts.day),
      birthplace: birth.birthplace.trim(),
      timezone: birth.timezone.trim(),
      birthTime: birthTimeValue(),
      personalization: {
        ...birth.personalization,
        relationshipStatus: birth.personalization.relationshipStatus?.trim() || null,
        occupationStatus: birth.personalization.occupationStatus?.trim() || null,
        primaryConcern: birth.personalization.primaryConcern?.trim() || null,
      },
    };
  }

  async function finishCalculation(profile: BirthInfo) {
    if (failNextCalculation.current) {
      failNextCalculation.current = false;
      window.setTimeout(() => setPhase("failure"), 500);
      return;
    }
    try {
      await createBasicReading(profile);
      router.push("/report");
    } catch (error) {
      setFormError(formatApiRequestError(error, "서버에서 명식을 계산하지 못했어요."));
      setPhase("failure");
    }
  }

  function submitBirth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstError = validateFirstStep();
    if (step === 1) {
      if (firstError) return setFormError(firstError);
      setFormError("");
      setStep(2);
      return;
    }
    if (firstError) {
      setStep(1);
      return setFormError(firstError);
    }
    if (!birth.birthplace.trim()) return setFormError("출생지를 입력해 주세요.");
    if (!birth.timezone.trim()) return setFormError("시간대를 입력해 주세요.");
    if (birth.profileType === "other" && !birth.thirdPartyConsent) return setFormError("다른 사람의 정보를 저장하려면 동의를 확인해 주세요.");
    if (birth.profileType === "self" && birth.ownerRelationship !== "self") return setFormError("본인 프로필의 관계는 본인이어야 해요.");
    if (birth.profileType === "other" && birth.ownerRelationship === "self") return setFormError("다른 사람과의 관계를 선택해 주세요.");

    const normalized = normalizedBirth();
    if (!birthDraftStore.write({ version: 1, birth: normalized })) {
      return setFormError("브라우저 저장소를 사용할 수 없어 입력을 이어갈 수 없어요.");
    }
    setBirth(normalized);
    setPhase("loading");
    void finishCalculation(normalized);
  }

  if (phase === "loading") {
    return (
      <div className="sj-public">
        <main className="sj-state" aria-labelledby="loading-title" aria-live="polite" aria-busy="true">
          <h1 id="loading-title" ref={headingRef} tabIndex={-1} className="sj-h1">{birth.displayName}님의 명식을<br />계산하고 있어요</h1>
          <p className="sj-lead">서버에서 명식과 오행 계산, 기본 리포트 저장을 진행하고 있어요.</p>
          <div className="sj-skeleton" aria-hidden="true">
            <div className="sj-skeleton-block" />
            <div className="sj-skeleton-line" style={{ width: "86%" }} />
            <div className="sj-skeleton-line" style={{ width: "64%" }} />
          </div>
          <p className="sj-fine">입력값은 익명 세션에 저장되고, 같은 입력은 버전이 기록된 계산 스냅샷으로 다시 써요.</p>
        </main>
      </div>
    );
  }

  if (phase === "failure") {
    return (
      <div className="sj-public">
        <main className="sj-state" aria-labelledby="failure-title">
          <h1 id="failure-title" ref={headingRef} tabIndex={-1} className="sj-h1">결과를 불러오지 못했어요</h1>
          <p className="sj-lead">입력한 정보는 그대로 두었어요. 잠시 후 다시 계산하거나, 입력한 내용을 확인해 주세요.</p>
          {formError && <p className="sj-error" role="alert">{formError}</p>}
          <div className="sj-actions" style={{ marginTop: 12 }}>
            <button className="sj-button sj-button-block" type="button" onClick={() => { setFormError(""); setPhase("loading"); void finishCalculation(birth); }}>다시 계산하기</button>
            <button className="sj-button-secondary" type="button" onClick={() => { setFormError(""); setStep(2); setPhase("form"); }}>입력 정보 확인</button>
          </div>
        </main>
      </div>
    );
  }

  const errorNode = formError ? <p className="sj-error" id="birth-error" role="alert">{formError}</p> : null;
  const describedBy = formError ? "birth-error" : undefined;

  return (
    <div className="sj-public" style={{ maxWidth: 600 }}>
      <header className="sj-public-header" style={{ justifyContent: "flex-start", gap: 8 }}>
        {step === 1
          ? <Link className="sj-icon-button" href="/" aria-label="이전 화면으로 돌아가기" style={{ marginLeft: -12 }}><BackIcon /></Link>
          : <button className="sj-icon-button" type="button" aria-label="이전 단계로 돌아가기" style={{ marginLeft: -12 }} onClick={() => { setFormError(""); setStep(1); }}><BackIcon /></button>}
        <span className="sj-meta">{step} / 2 단계</span>
      </header>
      <div className="sj-progress" aria-hidden="true"><div className="sj-progress-bar" style={{ width: step === 1 ? "50%" : "100%" }} /></div>
      <form className="sj-page" onSubmit={submitBirth} noValidate aria-labelledby="birth-title" style={{ paddingTop: 28, flex: "1 1 auto" }}>
        {step === 1 ? (
          <>
            <div className="sj-section" style={{ gap: 8 }}>
              <h1 id="birth-title" ref={headingRef} tabIndex={-1} className="sj-h1">언제 태어나셨나요?</h1>
              <p className="sj-lead">네 기둥을 세우는 데 필요한 정보예요. 이름은 화면에 표시할 때만 써요.</p>
            </div>
            <div className="sj-field">
              <label className="sj-label" htmlFor="nickname">부를 이름</label>
              <input id="nickname" className="sj-input" name="nickname" value={birth.displayName} onChange={(event) => updateBirth({ displayName: event.target.value })} autoComplete="nickname" maxLength={20} aria-describedby={describedBy} />
            </div>
            <fieldset className="sj-field">
              <legend className="sj-label" style={{ marginBottom: 8 }}>생년월일</legend>
              <div className="sj-segmented" role="group" aria-label="달력 기준">
                {CALENDAR_CHOICES.map((choice) => (
                  <button key={choice.id} className="sj-segment" type="button" aria-pressed={calendarChoice === choice.id} onClick={() => updateBirth({ calendar: choice.id === "solar" ? "solar" : "lunar", leapMonth: choice.id === "leap" })}>
                    {choice.label}
                  </button>
                ))}
              </div>
              <div className="sj-date-grid">
                <label className="sj-unit-input">
                  <input id="birth-year" className="sj-unit-input-field" aria-label="태어난 해" inputMode="numeric" autoComplete="bday-year" value={dateParts.year} onChange={(event) => updateDate("year", event.target.value)} placeholder="1992" aria-describedby={describedBy} />
                  <span className="sj-unit" aria-hidden="true">년</span>
                </label>
                <label className="sj-unit-input">
                  <input id="birth-month" className="sj-unit-input-field" aria-label="태어난 달" inputMode="numeric" autoComplete="bday-month" value={dateParts.month} onChange={(event) => updateDate("month", event.target.value)} placeholder="6" />
                  <span className="sj-unit" aria-hidden="true">월</span>
                </label>
                <label className="sj-unit-input">
                  <input id="birth-day" className="sj-unit-input-field" aria-label="태어난 날" inputMode="numeric" autoComplete="bday-day" value={dateParts.day} onChange={(event) => updateDate("day", event.target.value)} placeholder="18" />
                  <span className="sj-unit" aria-hidden="true">일</span>
                </label>
              </div>
              {birth.calendar === "lunar" && <p className="sj-help">음력 날짜는 서버에서 양력으로 바꿔 계산해요. 윤달에 태어났다면 ‘음력 윤달’을 골라 주세요.</p>}
            </fieldset>
            <div className="sj-field" role="group" aria-labelledby="birth-time-label">
              <div className="sj-section-head" style={{ alignItems: "center" }}>
                <span id="birth-time-label" className="sj-label">태어난 시간</span>
                <button className="sj-text-button" type="button" disabled={birth.birthTimeUnknown} onClick={() => { setTimeMode(timeMode === "sijin" ? "exact" : "sijin"); setFormError(""); }}>
                  {timeMode === "sijin" ? "정확한 시각 입력" : "시진으로 고르기"}
                </button>
              </div>
              {timeMode === "sijin" ? (
                <div className="sj-choice-grid" role="group" aria-label="시진">
                  {SIJIN.map((sijin, index) => (
                    <button key={sijin.name} className="sj-choice" type="button" aria-pressed={!birth.birthTimeUnknown && sijinIndex === index} aria-label={`${sijin.name}, ${sijinSpan(sijin)}`} disabled={birth.birthTimeUnknown} onClick={() => { setSijinIndex(index); setFormError(""); }} style={birth.birthTimeUnknown ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
                      <span className="sj-choice-title" aria-hidden="true">{sijin.name}</span>
                      <span className="sj-choice-sub" aria-hidden="true">{sijin.range}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sj-date-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="sj-unit-input">
                    <input id="birth-hour" className="sj-unit-input-field" aria-label="태어난 시" inputMode="numeric" value={exact.hour} disabled={birth.birthTimeUnknown} onChange={(event) => { setExact((current) => ({ ...current, hour: digits(event.target.value, 2) })); setFormError(""); }} placeholder="14" />
                    <span className="sj-unit" aria-hidden="true">시</span>
                  </label>
                  <label className="sj-unit-input">
                    <input id="birth-minute" className="sj-unit-input-field" aria-label="태어난 분" inputMode="numeric" value={exact.minute} disabled={birth.birthTimeUnknown} onChange={(event) => { setExact((current) => ({ ...current, minute: digits(event.target.value, 2) })); setFormError(""); }} placeholder="30" />
                    <span className="sj-unit" aria-hidden="true">분</span>
                  </label>
                </div>
              )}
              {timeMode === "exact" && <p className="sj-help">24시간 기준으로 입력해 주세요. 오후 2시 30분이면 14시 30분이에요.</p>}
              {timeMode === "sijin" && sijinIndex === 0 && !birth.birthTimeUnknown && <p className="sj-help">자시는 밤 11시로 계산해서 다음 날 일주를 써요. 자정이 지나 태어났다면 정확한 시각으로 입력해 주세요.</p>}
              <label className="sj-check">
                <input className="sj-check-input" type="checkbox" checked={birth.birthTimeUnknown} onChange={(event) => updateBirth({ birthTimeUnknown: event.target.checked })} />
                <span>시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.</span>
              </label>
            </div>
            <fieldset className="sj-field">
              <legend className="sj-label" style={{ marginBottom: 8 }}>계산 기준 성별</legend>
              <div className="sj-segmented" role="group" aria-label="계산 기준 성별">
                {(["female", "male"] as const).map((gender) => (
                  <button key={gender} className="sj-segment" type="button" aria-pressed={birth.calculationGender === gender} onClick={() => updateBirth({ calculationGender: gender })}>
                    {gender === "female" ? "여성" : "남성"}
                  </button>
                ))}
              </div>
              <p className="sj-help">대운이 흐르는 방향을 정할 때만 쓰여요.</p>
            </fieldset>
          </>
        ) : (
          <>
            <div className="sj-section" style={{ gap: 8 }}>
              <h1 id="birth-title" ref={headingRef} tabIndex={-1} className="sj-h1">이대로 계산할까요?</h1>
              <p className="sj-lead">입력한 내용을 한 번 더 확인해 주세요. 틀린 곳은 바로 고칠 수 있어요.</p>
            </div>
            <div className="sj-field">
              <label className="sj-label" htmlFor="birthplace">출생지</label>
              <input id="birthplace" className="sj-input" autoComplete="address-level2" value={birth.birthplace} onChange={(event) => updateBirth({ birthplace: event.target.value })} placeholder="예: 서울, 부산, 뉴욕" aria-describedby="birthplace-help" />
              <p className="sj-help" id="birthplace-help">도시 이름이면 충분해요.</p>
            </div>
            <section className="sj-section" aria-labelledby="birth-summary-title">
              <h2 id="birth-summary-title" className="sj-h2">입력한 내용</h2>
              <div className="sj-group">
                {[
                  ["부를 이름", birth.displayName.trim()],
                  ["생년월일", `${calendarLabel(birth)} ${dateLabel(composeDate(dateParts.year, dateParts.month, dateParts.day))}`],
                  ["태어난 시간", timeSummary()],
                  ["계산 기준 성별", birth.calculationGender === "female" ? "여성" : "남성"],
                ].map(([label, value]) => (
                  <div key={label} className="sj-row-in-group" style={{ cursor: "default" }}>
                    <span className="sj-row-main">
                      <span className="sj-row-sub">{label}</span>
                      <span className="sj-row-title">{value}</span>
                    </span>
                    <button className="sj-text-button" type="button" aria-label={`${label} 수정`} onClick={() => { setFormError(""); setStep(1); }} style={{ padding: "0 4px" }}>수정</button>
                  </div>
                ))}
              </div>
            </section>
            <section className="sj-section" aria-labelledby="birth-solar-title">
              <h2 id="birth-solar-title" className="sj-h2">계산에 쓰는 날짜</h2>
              <p className="sj-body">
                {birth.calendar === "solar"
                  ? "양력으로 입력해서 날짜를 그대로 계산해요."
                  : "음력 날짜는 서버에서 양력으로 바꾼 뒤 계산해요."}
              </p>
            </section>
            <details className="sj-card" style={{ gap: 0 }}>
              <summary className="sj-h3" style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>계산에 필요한 추가 정보</summary>
              <div className="sj-page sj-page-tight" style={{ paddingTop: 12 }}>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="timezone">시간대</label>
                  <input id="timezone" className="sj-input" value={birth.timezone} onChange={(event) => updateBirth({ timezone: event.target.value })} placeholder="Asia/Seoul" />
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="profile-type">프로필 유형</label>
                  <select id="profile-type" className="sj-select" value={birth.profileType} onChange={(event) => updateProfileType(event.target.value as BirthInfo["profileType"])}>
                    <option value="self">본인</option>
                    <option value="other">다른 사람</option>
                  </select>
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="owner-relationship">나와의 관계</label>
                  <select id="owner-relationship" className="sj-select" value={birth.ownerRelationship} onChange={(event) => updateBirth({ ownerRelationship: event.target.value as OwnerRelationship })}>
                    <option value="self">본인</option>
                    <option value="partner">연인, 배우자</option>
                    <option value="family">가족</option>
                    <option value="friend">친구</option>
                    <option value="coworker">동료</option>
                  </select>
                </div>
                <fieldset className="sj-field">
                  <legend className="sj-label" style={{ marginBottom: 8 }}>관심 주제 (선택)</legend>
                  <div className="sj-chips">
                    {(["love", "career", "money", "family"] as ProfileTopicId[]).map((topic) => {
                      const selected = birth.personalization.interests.includes(topic);
                      return (
                        <button key={topic} className="sj-chip-button" type="button" aria-pressed={selected} onClick={() => updateBirth({ personalization: { ...birth.personalization, interests: selected ? birth.personalization.interests.filter((item) => item !== topic) : [...birth.personalization.interests, topic] } })}>
                          {TOPIC_NAMES[topic as TopicId]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="relationship-status">관계 상태 (선택)</label>
                  <input id="relationship-status" className="sj-input" value={birth.personalization.relationshipStatus ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, relationshipStatus: event.target.value || null } })} />
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="occupation-status">직업 상태 (선택)</label>
                  <input id="occupation-status" className="sj-input" value={birth.personalization.occupationStatus ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, occupationStatus: event.target.value || null } })} />
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="primary-concern">주요 고민 (선택)</label>
                  <textarea id="primary-concern" className="sj-textarea" value={birth.personalization.primaryConcern ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, primaryConcern: event.target.value || null } })} maxLength={300} />
                </div>
                {birth.profileType === "other" && (
                  <label className="sj-check">
                    <input className="sj-check-input" type="checkbox" checked={birth.thirdPartyConsent} onChange={(event) => updateBirth({ thirdPartyConsent: event.target.checked })} />
                    <span>정보 주체의 동의를 확인했어요</span>
                  </label>
                )}
              </div>
            </details>
          </>
        )}
        <div className="sj-sticky-cta" style={{ marginTop: "auto" }}>
          {errorNode}
          <button className="sj-button sj-button-block" type="submit">{step === 1 ? "다음" : "명식 계산하기"}</button>
          <p className="sj-fine sj-center">입력한 정보는 이 기기의 익명 세션에만 연결돼요.</p>
        </div>
      </form>
    </div>
  );
}

/* ---------- Report (/report) ---------- */

function strongestElements(counts: ChartView["fiveElements"]) {
  const max = Math.max(...ELEMENTS.map((element) => counts[element]));
  const strongest = ELEMENTS.filter((element) => counts[element] === max && max > 0);
  const missing = ELEMENTS.filter((element) => counts[element] === 0);
  const parts = [strongest.length ? `${strongest.join(", ")} 기운이 가장 많이 보여요.` : ""];
  if (missing.length) parts.push(`${missing.join(", ")} 기운은 명식에 없어요.`);
  return parts.filter(Boolean).join(" ");
}

function daeunSummary(chart: ChartView) {
  if (chart.daeun.startAge === null) return null;
  const direction = chart.daeun.direction === "backward" ? "거꾸로" : chart.daeun.direction === "forward" ? "순서대로" : null;
  return `${chart.daeun.startAge}세에 시작해${direction ? ` ${direction}` : ""} 흘러요`;
}

function CurrentDaeunCard({ chart }: { chart: ChartView }) {
  const now = currentDaeun(chart);
  if (!now) return null;
  return (
    <div className="sj-card-accent" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
      <span className="sj-ganji-tile-dark" style={{ width: "auto", padding: "0 10px" }} lang="zh-Hant" aria-hidden="true">
        {now.stem && <span className={`sj-el-dark-${now.stem.element}`}>{now.stem.hanja}</span>}
        {now.branch && <span className={`sj-el-dark-${now.branch.element}`}>{now.branch.hanja}</span>}
      </span>
      <p className="sj-body" style={{ fontSize: 14 }}>지금은 {now.ganji} 대운({now.startAge}–{now.endAge}세)을 지나고 있어요.</p>
    </div>
  );
}

function DaeunList({ chart }: { chart: ChartView }) {
  const now = currentDaeun(chart);
  const nowIndex = now ? chart.daeun.periods.indexOf(now) : -1;
  return (
    <ol className="sj-list" aria-label="대운 구간">
      {chart.daeun.periods.map((period, index) => {
        const isNow = index === nowIndex;
        const past = nowIndex >= 0 && index < nowIndex;
        return (
          <li key={period.ganji + period.startAge} aria-current={isNow ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 12px", borderRadius: 8, background: isNow ? "var(--sj-accent-soft)" : undefined }}>
            <span className="sj-hanja" lang="zh-Hant" aria-hidden="true" style={{ fontSize: 20, fontWeight: isNow ? 900 : 700, color: isNow ? "var(--sj-ink)" : past ? "var(--sj-muted)" : "var(--sj-ink-body)" }}>{ganjiHanja(period.ganji)}</span>
            <span className="sj-meta" style={{ color: isNow ? "var(--sj-ink-body)" : undefined }}>{period.ganji}</span>
            {isNow && <span className="sj-badge" style={{ background: "var(--sj-accent)", color: "#ffffff" }}>지금</span>}
            <span className="sj-meta" style={{ marginLeft: "auto", color: isNow ? "var(--sj-accent)" : undefined, fontWeight: isNow ? 700 : undefined }}>{period.startAge}–{period.endAge}세</span>
          </li>
        );
      })}
    </ol>
  );
}

function BasisList({ chart, birth }: { chart: ChartView; birth: BirthInfo | null }) {
  const rows: Array<[string, string]> = [];
  if (birth) rows.push(["출생", `${calendarLabel(birth)} ${dateLabel(birth.birthDate)}${birth.birthTimeUnknown || !birth.birthTime ? ", 시간 모름" : ` ${timeLabel(birth.birthTime)}`}${birth.birthplace ? `, ${birth.birthplace}` : ""}`]);
  rows.push(["월 기준", "절입일 기준으로 월주를 정해요"]);
  rows.push(["일 경계", "밤 11시 이후 출생은 다음 날 일주로 계산해요"]);
  const daeun = daeunSummary(chart);
  if (daeun) rows.push(["대운", `${birth ? `${birth.calculationGender === "female" ? "여성" : "남성"} 기준, ` : ""}${daeun}`]);
  rows.push(["계산 엔진", chart.engineVersion]);
  return (
    <dl className="sj-list" style={{ margin: 0 }}>
      {rows.map(([key, value]) => (
        <div key={key} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--sj-line)" }}>
          <dt className="sj-meta" style={{ flex: "0 0 72px" }}>{key}</dt>
          <dd className="sj-meta" style={{ margin: 0, color: "var(--sj-ink-body)" }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportSections({ report }: { report: LiveReport }) {
  return (
    <div className="sj-group">
      {report.sections.map((section, index) => (
        <article key={section.section_id} id={`report-${section.section_id}`} className="sj-section" style={{ gap: 8, padding: 20, borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
          <div className="sj-section-head" style={{ alignItems: "center" }}>
            <h3 className="sj-h3">{section.title}</h3>
            {section.access === "PAID" && <span className="sj-badge">구매한 리포트</span>}
            {section.access === "LOCKED" && <span className="sj-badge">잠김</span>}
          </div>
          {section.access !== "LOCKED" ? (
            <>
              <p className="sj-body">{section.content}</p>
              {section.evidence.length > 0 && (
                <details>
                  <summary className="sj-text-button" style={{ fontSize: 13 }}>해석 근거 보기</summary>
                  <ul className="sj-meta" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{section.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
                </details>
              )}
            </>
          ) : (
            <>
              <p className="sj-meta">구매하면 서버에서 만들어지는 내용이에요.</p>
              <Link className="sj-text-button" href="/products">리포트 상품 보기</Link>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

export function ReportScreen() {
  const hydrated = useHydrated();
  const [serverReport, setServerReport] = useState<LiveReport | null>(null);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [serverState, setServerState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void Promise.all([getCurrentReport(), getCurrentChart()])
      .then(([report, currentChart]) => {
        if (!active) return;
        setServerReport(report);
        setChart(currentChart);
        setServerState(report ? "ready" : "missing");
      })
      .catch(() => active && setServerState("error"));
    return () => { active = false; };
  }, [hydrated]);

  if (!hydrated) return <LoadingState title="저장한 결과를 확인하고 있어요" />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 다른 내용으로 바꾸지 않아요." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  // inspectCurrentBirth falls back to the fixture when nothing is stored; never present that as the user's birth.
  const birth = birthState.birth === INITIAL_BIRTH ? null : birthState.birth;
  if (serverState === "loading") return <LoadingState title="명식을 불러오고 있어요" />;
  if (serverState === "missing") return <EmptyState title="아직 계산한 명식이 없어요" description="생년월일과 태어난 시간을 입력하면 네 기둥과 오행, 대운을 계산해 보여드려요." action={{ href: "/birth", label: "출생 정보 입력하기" }} />;
  if (serverState === "error" || !serverReport) {
    return (
      <section className="sj-state" aria-labelledby="report-error-title">
        <h1 id="report-error-title" className="sj-h1">명식을 불러오지 못했어요</h1>
        <p className="sj-lead" role="alert">서버에 연결하지 못했어요. 네트워크 상태를 확인한 뒤 다시 불러와 주세요.</p>
        <button className="sj-button sj-button-block" type="button" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>다시 불러오기</button>
      </section>
    );
  }

  const day = chart?.pillars.day ?? null;
  const title = day ? `${day.stem.ko}${day.branch.ko} 일주, ${day.stem.ko}${day.stem.element} 일간의 명식` : "기본 리포트";
  const timeUnknown = chart ? chart.pillars.hour === null : birth?.birthTimeUnknown ?? false;
  const daeunNote = chart ? daeunSummary(chart) : null;

  const daeunSection = (idPrefix: string, vertical: boolean) => chart && chart.daeun.periods.length > 0 && (
    <section className="sj-section" aria-labelledby={`${idPrefix}-daeun-title`}>
      <div className="sj-section-head" style={{ flexWrap: "wrap" }}>
        <h2 id={`${idPrefix}-daeun-title`} className="sj-h2">대운, 10년마다 바뀌는 흐름</h2>
        {daeunNote && <span className="sj-meta">{daeunNote}</span>}
      </div>
      {vertical ? <DaeunList chart={chart} /> : <DaeunStrip chart={chart} />}
      <CurrentDaeunCard chart={chart} />
    </section>
  );

  return (
    <main className="sj-page">
      <div className="sj-split">
        <div className="sj-page">
          <section className="sj-section" style={{ gap: 8 }}>
            {birth && <p className="sj-meta">{birthLine(birth)}</p>}
            <h1 id="report-title" className="sj-h1">{title}</h1>
            <Link className="sj-text-button" href="/share" style={{ alignSelf: "flex-start" }}><ShareIcon />공유 카드 만들기</Link>
          </section>

          {chart && (
            <section className="sj-section" aria-labelledby="pillars-title">
              <h2 id="pillars-title" className="sj-visually-hidden">네 기둥</h2>
              <PillarGrid chart={chart} reveal />
              <p className="sj-fine">먹색 칸이 나를 뜻하는 일간이에요. 한자 위 작은 글자는 일간과의 관계(십성)예요.</p>
            </section>
          )}

          {timeUnknown && <Banner>출생 시간에 의존하는 시주와 대운 해석은 결과에서 제외했어요.</Banner>}

          {chart && (
            <section className="sj-section" aria-labelledby="elements-title">
              <h2 id="elements-title" className="sj-h2">오행의 균형</h2>
              <ElementBalance counts={chart.fiveElements} />
              <p className="sj-meta">{strongestElements(chart.fiveElements)}</p>
            </section>
          )}

          <div className="sj-mobile-only">{daeunSection("mobile", false)}</div>

          <section className="sj-section" aria-labelledby="report-sections-title">
            <div className="sj-section-head">
              <h2 id="report-sections-title" className="sj-h2">기본 리포트</h2>
              <Link className="sj-text-button" href="/report/topics">주제별 리포트 보기</Link>
            </div>
            <ReportSections report={serverReport} />
            <p className="sj-fine">계산 요소를 바탕으로 한 일반적인 경향이에요. 선택을 대신하지 않는 참고 정보예요.</p>
          </section>

          <section className="sj-section" aria-labelledby="report-more-title">
            <h2 id="report-more-title" className="sj-visually-hidden">더 보기</h2>
            <div className="sj-list">
              <RowLink href="/report/topics" title="관심 주제로 더 보기" sub="연애, 커리어, 재물, 가족 미리보기" />
              <RowLink href="/flow/today" title="오늘의 흐름" />
              <RowLink href="/flow/month" title="이번 달 흐름" />
            </div>
            <button className="sj-text-button" type="button" onClick={() => window.print()} style={{ alignSelf: "flex-start" }}>인쇄하거나 PDF로 저장하기</button>
          </section>

          {chart && (
            <details className="sj-mobile-only sj-card" style={{ gap: 0 }}>
              <summary className="sj-h3" style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>계산 근거 보기</summary>
              <p className="sj-meta" style={{ marginTop: 4 }}>이 명식은 버전이 기록된 계산 스냅샷이에요. 같은 입력은 같은 결과로 다시 보여드려요.</p>
              <BasisList chart={chart} birth={birth} />
            </details>
          )}
        </div>

        {chart && (
          <aside className="sj-aside sj-desktop-only sj-page" aria-label="대운과 계산 근거">
            {daeunSection("desktop", true)}
            <section className="sj-section" aria-labelledby="basis-title">
              <h2 id="basis-title" className="sj-h2">계산 근거</h2>
              <p className="sj-meta">이 명식은 버전이 기록된 계산 스냅샷이에요. 같은 입력은 같은 결과로 다시 보여드려요.</p>
              <BasisList chart={chart} birth={birth} />
              <Link className="sj-text-button" href="/birth">출생 정보 다시 입력하기</Link>
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}

/* ---------- Topics (/report/topics, /report/topics/[topic]) ---------- */

export function TopicsScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState />;
  const reportInspection = reportStore.inspect();
  if (reportInspection.status === "corrupt" || reportInspection.status === "unavailable") return <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 다른 내용으로 바꾸지 않아요." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />;
  const storedTopic = reportInspection.status === "ok" ? reportInspection.value.topic : null;

  return (
    <main className="sj-page">
      <section className="sj-section" style={{ gap: 8 }}>
        <h1 id="topics-title" className="sj-h1">궁금한 주제부터 읽어보세요</h1>
        <p className="sj-lead">주제를 고르면 강점, 주의할 점, 지금의 흐름을 짧게 읽을 수 있어요.</p>
      </section>
      <section aria-label="주제 목록">
        <ul className="sj-list">
          {TOPICS.map((topic) => (
            <li key={topic.id}>
              <RowLink
                href={`/report/topics/${topic.id}`}
                leading={<span className="sj-ganji-tile" aria-hidden="true" lang="zh-Hant">{TOPIC_MARKS[topic.id]}</span>}
                title={TOPIC_NAMES[topic.id]}
                sub={getTopicPreview(topic.id).headline.replace(/\n/g, " ")}
                value={storedTopic === topic.id ? "저장한 주제" : undefined}
              />
            </li>
          ))}
        </ul>
      </section>
      <Banner>주제별 미리보기는 누구에게나 같은 예시 문장이에요. 명식을 반영한 심층 리포트는 결제가 준비되면 열려요.</Banner>
      <p className="sj-fine">사주는 선택을 대신하지 않아요.</p>
    </main>
  );
}

export function TopicPreviewScreen({ topicId }: { topicId: TopicId }) {
  const preview = getTopicPreview(topicId);
  const name = TOPIC_NAMES[topicId];
  const productSlug = TOPIC_PRODUCTS[topicId];
  const feedbackHref = `/report/feedback?targetType=report&reportId=rpt_fixture_${topicId}&topic=${topicId}`;
  const sections = [
    { title: "강점", body: preview.strength },
    { title: "주의할 점", body: preview.caution },
    { title: "지금의 흐름", body: preview.flow },
  ];

  return (
    <main className="sj-page">
      <section className="sj-section" style={{ gap: 8 }}>
        <h1 id="preview-title" className="sj-h1">{preview.headline.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
        <p className="sj-lead">{preview.introduction}</p>
      </section>

      <section className="sj-group" aria-label={`${name} 무료 미리보기`}>
        {sections.map((section, index) => (
          <article key={section.title} className="sj-section" style={{ gap: 8, padding: 20, borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
            <h2 className="sj-h2">{section.title}</h2>
            <p className="sj-body">{section.body}</p>
          </article>
        ))}
      </section>

      {productSlug && (
        <section className="sj-section" aria-labelledby="locked-title">
          <h2 id="locked-title" className="sj-h2">심층 리포트에 이어지는 내용</h2>
          <div className="sj-card">
            <h3 className="sj-h3">{name} 심층 리포트</h3>
            <p className="sj-meta">명식을 바탕으로 {name} 주제를 자세히 정리하는 유료 리포트예요.</p>
            <button className="sj-button sj-button-block" type="button" disabled>결제 준비 중</button>
            <p className="sj-fine">지금은 결제를 받지 않고 있어요. <Link href={`/products/${productSlug}`} style={{ color: "var(--sj-accent)", fontWeight: 700 }}>리포트 구성 보기</Link></p>
          </div>
        </section>
      )}

      <section className="sj-section" aria-labelledby="topic-feedback-title">
        <h2 id="topic-feedback-title" className="sj-h2">이 해석이 도움이 됐나요?</h2>
        <div className="sj-actions-row">
          <Link className="sj-button-secondary" href={`${feedbackHref}&rating=helpful`} style={{ flex: "1 1 0" }}>도움됐어요</Link>
          <Link className="sj-button-secondary" href={`${feedbackHref}&report=1`} style={{ flex: "1 1 0" }}>문제 신고</Link>
        </div>
      </section>

      <details className="sj-card" style={{ gap: 0 }}>
        <summary className="sj-h3" style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>이 미리보기의 범위</summary>
        <p className="sj-meta" style={{ marginTop: 4 }}>현재 내용은 화면 체험을 위한 고정 예시이며 실제 사주 계산 결과가 아니에요. 입력 정보에 따라 문장이 달라지지 않아요.</p>
      </details>
      <p className="sj-fine">사주는 선택을 대신하지 않아요.</p>
    </main>
  );
}

/* ---------- Feedback (/report/feedback) ---------- */

const FIXTURE_FEEDBACK_PROVENANCE: FeedbackProvenance = {
  profileSnapshotId: "profile_snapshot_fixture_primary",
  chartSnapshotIds: ["chart_fixture_primary"],
  modelVersion: null,
  promptVersion: null,
  templateVersion: "fixture-1",
};

const FEEDBACK_REASONS: ReadonlyArray<{ code: FeedbackReason; label: string }> = [
  { code: "too_generic", label: "내용이 너무 일반적이에요" },
  { code: "repetitive", label: "같은 말이 반복돼요" },
  { code: "incorrect_chart", label: "사주 정보가 잘못됐어요" },
  { code: "unanswered", label: "질문에 답하지 않았어요" },
  { code: "inappropriate", label: "표현이 불쾌하거나 과해요" },
  { code: "purchase_mismatch", label: "결제 내용과 달라요" },
  { code: "other", label: "기타" },
];

export function FeedbackScreen({ target, topicId, initialRating = null, initialReported = false }: { target: Extract<FeedbackTarget, { type: "report" }>; topicId: TopicId; initialRating?: FeedbackId | null; initialReported?: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackId | null>(initialRating);
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [comment, setComment] = useState("");
  const [reported, setReported] = useState(initialReported);
  const [error, setError] = useState("");
  const serverReport = /^\d+$/.test(target.reportId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback) return setError("가장 가까운 평가 하나를 골라 주세요.");
    if (!reason) return setError("어떤 점이 그랬는지 하나를 골라 주세요.");
    if (serverReport) {
      try {
        await submitReportFeedback(target.reportId, feedback, comment.trim() || reason, reported);
      } catch (requestError) {
        return setError(requestError instanceof Error ? requestError.message : "서버에 피드백을 저장하지 못했어요.");
      }
    }
    const listInspection = feedbackListStore.inspect();
    if (listInspection.status === "corrupt" || listInspection.status === "unavailable") return setError("손상된 피드백 기록을 설정에서 확인해 주세요.");
    const now = new Date().toISOString();
    const current = listInspection.status === "ok" ? listInspection.value.entries : [];
    const selection = {
      version: 1 as const,
      target,
      topic: topicId,
      rating: feedback,
      reason,
      comment: comment.trim(),
      provenance: FIXTURE_FEEDBACK_PROVENANCE,
      reported,
      createdAt: now,
    };
    const list: FeedbackData = {
      version: 1,
      entries: [
        {
          id: `feedback-${now.replace(/\D/g, "")}`,
          target,
          topic: topicId,
          rating: feedback,
          reason,
          comment: comment.trim(),
          provenance: FIXTURE_FEEDBACK_PROVENANCE,
          reported,
          createdAt: now,
        },
        ...current,
      ],
    };
    const transaction = runStorageTransaction([
      createTransactionStep(feedbackStore, selection),
      createTransactionStep(feedbackListStore, list),
    ]);
    if (transaction !== "committed") return setError(transaction === "rolled-back" ? "피드백 저장에 실패해 모든 변경을 취소했어요." : "저장 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
    router.push(`/report/save?topic=${topicId}&feedback=${feedback}`);
  }

  return (
    <form className="sj-page" onSubmit={submit} noValidate aria-labelledby="feedback-title">
      <section className="sj-card" aria-label="피드백 대상" style={{ gap: 6, padding: 16 }}>
        <p className="sj-meta">{serverReport ? "기본 사주 리포트" : `${TOPIC_NAMES[topicId]} 미리보기`}</p>
        {!serverReport && <p className="sj-body" style={{ fontSize: 14 }}>{getTopicPreview(topicId).introduction}</p>}
      </section>

      <fieldset className="sj-field">
        <legend style={{ marginBottom: 12 }}><h1 id="feedback-title" className="sj-h1" style={{ fontSize: 20 }}>이 해석이 어땠나요?</h1></legend>
        <div className="sj-choice-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {FEEDBACK_OPTIONS.map((item) => (
            <button key={item.id} className="sj-choice" type="button" aria-pressed={feedback === item.id} onClick={() => { setFeedback(item.id); setError(""); }}>
              <span className="sj-choice-title" style={{ fontSize: 14 }}>{item.title}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 4 }}>어떤 점이 그랬나요?</legend>
        <p className="sj-help">가장 가까운 것 하나를 골라 주세요.</p>
        <div className="sj-chips">
          {FEEDBACK_REASONS.map((item) => (
            <button key={item.code} className="sj-chip-button" type="button" aria-pressed={reason === item.code} onClick={() => { setReason(item.code); setError(""); }}>{item.label}</button>
          ))}
        </div>
      </fieldset>

      <div className="sj-field">
        <label className="sj-label" htmlFor="feedback-detail">더 알려주실 내용 <span className="sj-meta" style={{ fontWeight: 400 }}>(선택)</span></label>
        <textarea id="feedback-detail" className="sj-textarea" rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="예: 저는 사람을 모으기보다 혼자 일할 때 편해요" aria-describedby="feedback-detail-help" />
        <p className="sj-help" id="feedback-detail-help">출생 정보나 연락처는 적지 않아도 돼요.</p>
      </div>

      <label className="sj-check sj-card" style={{ flexDirection: "row", padding: 16 }}>
        <input className="sj-check-input" type="checkbox" checked={reported} onChange={(event) => setReported(event.target.checked)} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="sj-h3">문제가 있는 표현으로 신고하기</span>
          <span className="sj-meta">불쾌하거나 겁을 주는 말, 위험한 조언이 있었다면 체크해 주세요. 먼저 확인해요.</span>
        </span>
      </label>

      <div className="sj-sticky-cta">
        {error && <p className="sj-error" role="alert">{error}</p>}
        <button className="sj-button sj-button-block" type="submit">피드백 보내기</button>
        <p className="sj-fine sj-center">보낸 내용은 피드백과 신고 목록에서 다시 볼 수 있어요.</p>
      </div>
    </form>
  );
}

/* ---------- Save (/report/save) ---------- */

export function SaveScreen({ topicId, feedback }: { topicId: TopicId; feedback: FeedbackId | null }) {
  const hydrated = useHydrated();
  const [savedInSession, setSavedInSession] = useState(false);
  const [error, setError] = useState("");
  if (!hydrated) return <LoadingState />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 덮어쓰지 않아요." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const reportInspection = reportStore.inspect();
  if (reportInspection.status === "corrupt" || reportInspection.status === "unavailable") return <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 덮어쓰지 않아요." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />;
  const storedReport = reportInspection.status === "ok" ? reportInspection.value : null;
  const localSaved = savedInSession || Boolean(storedReport && storedReport.topic === topicId && storedReport.feedback === feedback && sameBirth(storedReport.birth, birth));

  function save() {
    const report = { version: 1 as const, savedAt: new Date().toISOString(), birth, topic: topicId, feedback };
    const transaction = saveReportAndClearBirthDraft(report);
    if (transaction !== "committed") return setError(transaction === "rolled-back" ? "결과 저장에 실패해 변경을 취소했어요." : "저장 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
    setError("");
    setSavedInSession(true);
  }

  return (
    <main className="sj-page" aria-labelledby="save-title">
      <section className="sj-section" style={{ gap: 8 }}>
        <h1 id="save-title" className="sj-h1">{localSaved ? "이 기기에 저장했어요" : "이 기기에 결과를 저장할까요?"}</h1>
        <p className="sj-lead" role={localSaved ? "status" : undefined}>{localSaved ? "같은 브라우저에서 다시 확인할 수 있어요. 브라우저 데이터를 지우면 이 기기 사본은 삭제돼요." : "서버 계산 결과와 별도로, 이 브라우저에서 빠르게 이어볼 사본을 저장할 수 있어요."}</p>
      </section>
      <section className="sj-card" aria-labelledby="save-benefits-title">
        <h2 id="save-benefits-title" className="sj-h3">기기에 저장하면 좋은 점</h2>
        <ul className="sj-list" style={{ gap: 6 }}>
          {["무료 사주 요약을 보관해요", "고른 관심 주제를 이어볼 수 있어요", "입력 정보는 이 기기 안에만 저장돼요"].map((item) => (
            <li key={item} className="sj-body" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><CheckIcon style={{ color: "var(--sj-accent)" }} />{item}</li>
          ))}
        </ul>
      </section>
      {error && <p className="sj-error" role="alert">{error}</p>}
      <div className="sj-actions">
        {!localSaved && <button className="sj-button sj-button-block" type="button" onClick={save}>이 기기에 결과 저장</button>}
        <Link className="sj-button-secondary" href="/login">이메일로 로그인하거나 가입하기</Link>
        <button className="sj-button-secondary" type="button" disabled>소셜 로그인은 준비 중이에요</button>
        <Link className="sj-text-button" style={{ alignSelf: "center" }} href="/report" onClick={(event) => { if (!localSaved && !birthDraftStore.remove()) { event.preventDefault(); setError("입력 정보를 지우지 못해 이동을 중단했어요."); } }}>{localSaved ? "저장된 결과 계속 보기" : "저장하지 않고 계속 보기"}</Link>
      </div>
      <p className="sj-fine">이메일 계정 기능은 사용할 수 있으며, 외부 결제 제공자 연결은 아직 준비 중이에요.</p>
    </main>
  );
}
