"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import { CorruptState, LoadingState } from "./page-state";
import type { BirthInfo, FeedbackData, FeedbackId, FeedbackReason, TopicId } from "@/lib/domain";
import type { CalendarKind, FeedbackProvenance, FeedbackTarget, OwnerRelationship, TopicId as ProfileTopicId } from "@/lib/contracts";
import { hasValidLeapMonthSemantics, maskBirthDate, maskBirthTime, maskBirthplace, parseBirthDate } from "@/lib/contracts";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  FEEDBACK_OPTIONS,
  INITIAL_BIRTH,
  TOPICS,
  getDailyFlow,
  getTopic,
  getTopicPreview,
} from "@/lib/fixtures";
import { createBasicReading, formatApiRequestError, getCurrentReport, submitReportFeedback, type LiveReport } from "@/lib/api/service";
import coreStyles from "./saas-core-rollout.module.css";
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

function PublicHeader({ step, backHref, title, action, p0 = false }: { step?: string; backHref?: string; title?: string; action?: { href: string; label: string }; p0?: boolean }) {
  return (
    <header className={p0 ? `p0-header ${title ? "p0-form-header" : ""}` : `journey-header signal-header ${title ? "signal-form-header" : "signal-brand-header"}`}>
      {backHref && (
        <Link className={p0 ? "p0-back" : "back-button signal-back-button"} href={backHref} aria-label="이전 화면으로 돌아가기">‹</Link>
      )}
      <Link className={p0 ? "p0-wordmark" : `wordmark ${title ? "signal-header-title" : "signal-brand"}`} href="/" aria-label={title ?? "사주리움 시작 화면"}>{title ?? "사주리움"}</Link>
      {step && <span className={p0 ? "p0-step" : "step-indicator signal-step-indicator"} aria-label={`${step} 단계`}>{step}</span>}
      {action && <Link className="p0-header-action" href={action.href}>{action.label}</Link>}
    </header>
  );
}

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

function localDateValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

const PREVIEW_PRIORITY_LABELS = {
  relationship: "관계",
  career: "일",
  money: "재물",
} as const;

function formatPreviewDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(year, month - 1, day).getDay()];
  return `${month}월 ${day}일 ${weekday}요일`;
}

function TodayPreview({ action }: { action: ReactNode }) {
  const hydrated = useHydrated();
  const today = hydrated ? localDateValue() : null;
  const flow = today ? getDailyFlow(today) : null;
  return (
    <section className="today-preview" aria-label="오늘의 흐름 미리보기">
      <div className="preview-opening">
        <div className={flow ? "preview-headline p0-ready" : "preview-headline"}>
          <h1 id="landing-title" className={flow ? undefined : "sr-only"}>{flow?.headline ?? "오늘의 예시를 준비하고 있어요"}</h1>
          {!flow && <div className="p0-skeleton" aria-hidden="true"><span /><span /><span /></div>}
        </div>
        <time className={flow ? "p0-date-ready" : undefined} dateTime={today ?? undefined}>{today ? formatPreviewDate(today) : "날짜 확인 중"}</time>
        <p className="preview-intro">사주리움에서 오늘 살필 문장을 만나보세요. 실제 사주 계산이 아닌 체험용 예시예요.</p>
        {action}
      </div>
      {flow ? <>
        <dl className="today-preview-rows p0-reveal p0-reveal-details">
          <div><dt>우선 영역</dt><dd>{PREVIEW_PRIORITY_LABELS[flow.priorityArea]}</dd></div>
          <div><dt>주의할 점</dt><dd>{flow.caution}</dd></div>
        </dl>
        <section className="preview-question p0-reveal p0-reveal-question"><h2>오늘의 질문</h2><p>{flow.suggestedQuestion}</p></section>
        <p className="today-preview-note p0-reveal p0-reveal-note">{flow.summary}</p>
      </> : <div className="p0-skeleton preview-pending" aria-hidden="true"><span /><span /><span /></div>}
    </section>
  );
}

const EMPTY_BIRTH: BirthInfo = {
  ...INITIAL_BIRTH,
  displayName: "",
  birthDate: "",
  birthTime: null,
  birthplace: "",
  birthTimeUnknown: true,
};

export function LandingScreen({ initialCalculationFailure }: { initialCalculationFailure: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const reportRaw = useSyncExternalStore(reportStore.subscribe, reportStore.rawSnapshot, () => null);
  void reportRaw;
  const reportInspection = hydrated ? reportStore.inspect() : null;
  if (reportInspection?.status === "corrupt" || reportInspection?.status === "unavailable") return <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />;
  const hasSavedReport = reportInspection?.status === "ok";
  const birthHref = initialCalculationFailure ? "/birth?calculation=fail" : "/birth";

  return (
    <section className="landing-screen p0-scope" aria-labelledby="landing-title">
      <PublicHeader p0 action={{ href: "/login", label: "로그인" }} />
      <div className="p0-content landing-content">
        <TodayPreview action={
          <button className="primary-button" type="button" aria-label="생년월일 입력하기 · 내 흐름 살펴보기" onClick={() => router.push(birthHref)}>
            생년월일 입력하기
          </button>
        } />
        <aside className="landing-copy">
          <strong>운명을 단정하지 않아요</strong>
          <p>버전이 기록된 명식 계산을 사용하되, 결과는 중요한 선택을 대신하지 않아요.</p>
        </aside>
        {hasSavedReport && <button className="secondary-button saved-report-action" type="button" onClick={() => router.push("/report")}>이 기기에 저장한 결과 이어보기</button>}
      </div>
    </section>
  );
}

export function BirthScreen({ initialCalculationFailure }: { initialCalculationFailure: boolean }) {
  const router = useRouter();
  const [birth, setBirth] = useState<BirthInfo>(EMPTY_BIRTH);
  const [phase, setPhase] = useState<"form" | "loading" | "failure">("form");
  const [formError, setFormError] = useState("");
  const [entryComplete, setEntryComplete] = useState(false);
  const failNextCalculation = useRef(initialCalculationFailure);

  function updateBirth(update: Partial<BirthInfo>) {
    setBirth((current) => ({ ...current, ...update }));
    setFormError("");
  }

  function updateProfileType(profileType: BirthInfo["profileType"]) {
    updateBirth({
      profileType,
      ownerRelationship: profileType === "self" ? "self" : birth.ownerRelationship === "self" ? "partner" : birth.ownerRelationship,
      thirdPartyConsent: profileType === "self" ? false : birth.thirdPartyConsent,
    });
  }

  async function finishCalculation(profile = birth) {
    if (failNextCalculation.current) {
      failNextCalculation.current = false;
      window.setTimeout(() => setPhase("failure"), 500);
      return;
    }
    try {
      await createBasicReading(profile);
      router.push("/report");
    } catch (error) {
      setFormError(formatApiRequestError(error, "서버에서 결과를 만들지 못했어요."));
      setPhase("failure");
    }
  }

  function submitBirth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = birth.displayName.trim();
    const selectedDate = parseBirthDate(birth.birthDate);
    if (!displayName) return setFormError("이름 또는 닉네임을 입력해 주세요.");
    if (!selectedDate) return setFormError("1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.");
    if (!hasValidLeapMonthSemantics(birth)) return setFormError("양력 날짜에는 윤달을 선택할 수 없어요.");
    if (!birth.birthTimeUnknown && !birth.birthTime) return setFormError("출생 시간을 입력하거나 ‘출생 시간을 몰라요’를 선택해 주세요.");
    if (!birth.birthplace.trim()) return setFormError("출생지를 입력해 주세요.");
    if (!birth.timezone.trim()) return setFormError("시간대를 입력해 주세요.");
    if (birth.profileType === "other" && !birth.thirdPartyConsent) return setFormError("다른 사람의 정보를 저장하려면 동의를 확인해 주세요.");
    if (birth.profileType === "self" && birth.ownerRelationship !== "self") return setFormError("본인 프로필의 관계는 본인이어야 해요.");
    if (birth.profileType === "other" && birth.ownerRelationship === "self") return setFormError("다른 사람과의 관계를 선택해 주세요.");

    const normalized = {
      ...birth,
      displayName,
      birthplace: birth.birthplace.trim(),
      timezone: birth.timezone.trim(),
      birthTime: birth.birthTimeUnknown ? null : birth.birthTime,
      personalization: {
        ...birth.personalization,
        relationshipStatus: birth.personalization.relationshipStatus?.trim() || null,
        occupationStatus: birth.personalization.occupationStatus?.trim() || null,
        primaryConcern: birth.personalization.primaryConcern?.trim() || null,
      },
    };
    if (!birthDraftStore.write({ version: 1, birth: normalized })) {
      return setFormError("브라우저 저장소를 사용할 수 없어 입력을 이어갈 수 없어요.");
    }
    setBirth(normalized);
    setPhase("loading");
    void finishCalculation(normalized);
  }

  if (phase === "loading") {
    return (
      <section className="onboarding-screen p0-scope" aria-labelledby="loading-title" aria-live="polite">
        <PublicHeader p0 title="출생 정보" step="2/3" />
        <div className="p0-content p0-state-content p0-state-entry" key="loading">
          <header className="p0-form-title">
            <h1 id="loading-title">{birth.displayName}님이 읽을 화면을<br />차분히 준비하고 있어요</h1>
            <p className="supporting">서버에서 명식과 오행 계산, 무료 요약 저장을 진행하고 있어요.</p>
          </header>
          <div className="p0-skeleton p0-loading-lines" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <aside className="p0-disclosure"><strong>계산 안내</strong><p>입력값은 익명 세션에 저장되고, 같은 입력은 같은 계산 스냅샷으로 재사용돼요.</p></aside>
        </div>
      </section>
    );
  }

  if (phase === "failure") {
    return (
      <section className="onboarding-screen p0-scope" aria-labelledby="failure-title">
        <PublicHeader p0 title="출생 정보" backHref="/birth" />
        <div className="p0-content p0-state-content p0-state-entry" key="failure">
          <div><h1 id="failure-title">결과를 불러오지 못했어요</h1><p>입력하신 정보는 그대로 보관했어요.<br />다시 시도하거나 입력 정보를 확인해 주세요.</p></div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <aside><strong>확인해볼 점</strong><ul className="p0-check-list"><li>입력 정보가 올바른지 확인</li><li>잠시 후 다시 준비</li></ul></aside>
          <div className="p0-state-actions">
            <button className="primary-button" type="button" onClick={() => { setPhase("loading"); void finishCalculation(); }}>다시 준비하기</button>
            <button className="secondary-button" type="button" onClick={() => setPhase("form")}>입력 정보 확인</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-screen p0-scope" aria-labelledby="birth-title">
      <PublicHeader p0 title="출생 정보" step="1/3" backHref="/" />
      <form className="p0-content p0-birth-form" onSubmit={submitBirth} noValidate>
        <header className={`p0-form-title${entryComplete ? "" : " p0-birth-entry"}`}>
          <h1 id="birth-title">이름과 생일을 알려주세요</h1>
          <p className="supporting">이름은 표시용이에요.</p>
        </header>
        <div className="birth-editor">
        <section className="birth-fields" aria-label="출생 정보 입력">
          <div className={`field-group${entryComplete ? "" : " p0-birth-entry p0-birth-field-entry"}`} onAnimationEnd={() => setEntryComplete(true)}>
            <label className="field-label" htmlFor="nickname">이름 또는 닉네임</label>
            <input id="nickname" name="nickname" value={birth.displayName} onChange={(event) => updateBirth({ displayName: event.target.value })} autoComplete="nickname" maxLength={20} aria-describedby={formError ? "birth-error" : undefined} />
          </div>
          <fieldset className="calendar-selector">
            <legend className="field-label">달력 기준 · 음력 선택 후 윤달 확인</legend>
            <div className="segmented-control" role="radiogroup" aria-label="달력 기준">
              {(["solar", "lunar"] as const).map((basis: CalendarKind) => (
                <button key={basis} className={birth.calendar === basis ? "selected" : ""} type="button" role="radio" aria-checked={birth.calendar === basis} onClick={() => updateBirth({ calendar: basis, leapMonth: basis === "lunar" ? birth.leapMonth : false })}>
                  {{ solar: "양력", lunar: "음력" }[basis]}
                </button>
              ))}
            </div>
            {birth.calendar === "lunar" && (
              <div className="lunar-leap-control p0-conditional-entry">
                <label className="check-card">
                  <input type="checkbox" checked={birth.leapMonth} onChange={(event) => updateBirth({ leapMonth: event.target.checked })} />
                  <span>음력 윤달</span>
                </label>
                <p className="field-help">태어난 날짜가 윤달이면 선택해 주세요.</p>
              </div>
            )}
          </fieldset>
          <fieldset className="gender-selector">
            <legend className="field-label">성별 기준</legend>
            <div className="segmented-control" role="radiogroup" aria-label="성별 기준">
              {(["female", "male"] as const).map((gender) => (
                <button key={gender} type="button" role="radio" className={birth.calculationGender === gender ? "selected" : ""} aria-checked={birth.calculationGender === gender} onClick={() => updateBirth({ calculationGender: gender })}>
                  {gender === "female" ? "여성" : "남성"}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="birth-datetime-row">
            <div className="field-group">
              <label className="field-label" htmlFor="birth-date">생년월일</label>
              <input id="birth-date" name="birthDate" type="date" lang="ko-KR" min="1900-01-01" max={localDateValue()} value={birth.birthDate} onChange={(event) => updateBirth({ birthDate: event.target.value })} />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="birth-time">출생 시간</label>
              <input id="birth-time" name="birthTime" type="time" lang="ko-KR" value={birth.birthTime ?? ""} disabled={birth.birthTimeUnknown} onChange={(event) => updateBirth({ birthTime: event.target.value || null })} />
            </div>
          </div>
          <label className="check-card">
            <input type="checkbox" checked={birth.birthTimeUnknown} onChange={(event) => updateBirth({ birthTimeUnknown: event.target.checked, birthTime: event.target.checked ? null : birth.birthTime })} />
            <span>출생 시간을 몰라요</span>
          </label>
          <div className="field-group signal-field">
            <label className="field-label" htmlFor="birthplace">출생지</label>
            <input id="birthplace" value={birth.birthplace} onChange={(event) => updateBirth({ birthplace: event.target.value })} placeholder="예: 서울" />
          </div>
        </section>
        <details className="birth-additional-fields">
          <summary>계산에 필요한 추가 정보</summary>
          <div className="birth-context-fields">
            <div className="field-group signal-field">
              <label className="field-label" htmlFor="timezone">시간대</label>
              <input id="timezone" value={birth.timezone} onChange={(event) => updateBirth({ timezone: event.target.value })} placeholder="Asia/Seoul" />
            </div>
            <label className="field-group">
              <span className="field-label">프로필 유형</span>
              <select value={birth.profileType} onChange={(event) => updateProfileType(event.target.value as BirthInfo["profileType"])}>
                <option value="self">본인</option>
                <option value="other">다른 사람</option>
              </select>
            </label>
            <label className="field-group">
              <span className="field-label">나와의 관계</span>
              <select value={birth.ownerRelationship} onChange={(event) => updateBirth({ ownerRelationship: event.target.value as OwnerRelationship })}>
                <option value="self">본인</option>
                <option value="partner">연인·배우자</option>
                <option value="family">가족</option>
                <option value="friend">친구</option>
                <option value="coworker">동료</option>
              </select>
            </label>
            <fieldset>
              <legend className="field-label">관심 주제 (선택)</legend>
              <div className="p0-interest-options">
                {(["love", "career", "money", "family"] as ProfileTopicId[]).map((topic) => (
                  <label className="check-card" key={topic}>
                    <input type="checkbox" checked={birth.personalization.interests.includes(topic)} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, interests: event.target.checked ? [...birth.personalization.interests, topic] : birth.personalization.interests.filter((item) => item !== topic) } })} />
                    {{ love: "연애", career: "커리어", money: "재물", family: "가족" }[topic as "love" | "career" | "money" | "family"]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field-group">
              <span className="field-label">관계 상태 (선택)</span>
              <input value={birth.personalization.relationshipStatus ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, relationshipStatus: event.target.value || null } })} />
            </label>
            <label className="field-group">
              <span className="field-label">직업 상태 (선택)</span>
              <input value={birth.personalization.occupationStatus ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, occupationStatus: event.target.value || null } })} />
            </label>
            <label className="field-group">
              <span className="field-label">주요 고민 (선택)</span>
              <textarea value={birth.personalization.primaryConcern ?? ""} onChange={(event) => updateBirth({ personalization: { ...birth.personalization, primaryConcern: event.target.value || null } })} maxLength={300} />
            </label>
            {birth.profileType === "other" && (
              <label className="check-card p0-conditional-entry">
                <input type="checkbox" checked={birth.thirdPartyConsent} onChange={(event) => updateBirth({ thirdPartyConsent: event.target.checked })} />
                <span>정보 주체의 동의를 확인했어요</span>
              </label>
            )}
          </div>
        </details>
        <aside className="privacy-panel signal-privacy-note" id="birth-privacy-note">
          <strong>입력 정보는 익명 세션에 저장돼요.</strong>
          <p>가입 없이 계산 결과를 다시 확인할 수 있고, 전송은 사주리움 API에만 이뤄져요.</p>
        </aside>
        {formError && <p className="form-error p0-feedback-entry" id="birth-error" role="alert">{formError}</p>}
        <button className="primary-button form-submit" type="submit">다음</button>
        </div>
      </form>
    </section>
  );
}

export function ReportScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  type ApiReport = LiveReport;
  const [serverReport, setServerReport] = useState<ApiReport | null>(null);
  const [serverState, setServerState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void getCurrentReport()
      .then((report) => {
        if (!active) return;
        setServerReport(report);
        setServerState(report ? "ready" : "missing");
      })
      .catch(() => active && setServerState("error"));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated) return <LoadingState title="저장한 결과를 확인하고 있어요" />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  if (serverState === "loading") return <LoadingState title="서버에 저장된 계산 결과를 불러오고 있어요" />;
  if (serverState === "missing") return <CorruptState title="계산 결과가 아직 없어요" description="출생 정보를 입력해 실제 계산을 먼저 완료해 주세요." unavailable onReset={() => { router.push("/birth"); return true; }} />;
  if (serverState === "error" || !serverReport) return <CorruptState title="서버 결과를 불러오지 못했어요" description="백엔드 연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  const firstSection = serverReport.sections[0];
  const headline = firstSection?.content ?? "계산 결과를 확인해 보세요.";

  return (
    <section className={`report-page signal-screen signal-report ${coreStyles.scope}`} aria-labelledby="report-title">
      <div className="screen-content report-content signal-report-content">
        <header className="editorial-hero signal-situation">
          <p className="section-kicker signal-kicker">실제 계산 · {birth.displayName}님</p>
          <h1 id="report-title">{headline}</h1>
          <p className="supporting">{maskBirthDate(birth.birthDate)} · {maskBirthTime(birth.birthTime, birth.birthTimeUnknown)} · {maskBirthplace(birth.birthplace)}</p>
        </header>
        {birth.birthTimeUnknown && <p className="accuracy-note signal-safety-note">출생 시간에 의존하는 시주와 대운 해석은 결과에서 제외했어요.</p>}
        <article className="insight-card current signal-card signal-signal" aria-labelledby="current-flow-title">
          <small id="current-flow-title">오늘의 흐름</small>
          <strong>{headline}</strong>
        </article>
        <section className="report-signals signal-signals" aria-labelledby="signals-title">
          <h2 id="signals-title">핵심 성향</h2>
          <ol className="insight-list signal-list">
            {serverReport.sections.map((section, index) => (
              <li className="insight-card signal-list-item" key={section.section_id}>
                <span className="signal-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{section.title}</strong>
                  <p>{section.content}</p>
                </div>
              </li>
            ))}
          </ol>
          <aside className="check-list signal-caution">
            <strong>선택을 대신하지 않는 참고 정보예요.</strong>
            <span>현재 조건과 실제 경험을 함께 확인해 주세요.</span>
          </aside>
        </section>
        <section className="report-evidence signal-evidence" aria-labelledby="evidence-title">
          <header className="report-evidence-header">
            <p className="section-kicker signal-kicker">해석 근거</p>
            <h2 id="evidence-title">왜 이런 해석인가요?</h2>
            <p>버전이 기록된 계산 스냅샷과 해석 근거를 함께 보여드려요.</p>
          </header>
          <div className="report-sections signal-evidence-list">
            {serverReport.sections.map((section) => section.access !== "LOCKED" ? (
              <article className="report-section signal-evidence-item" id={section.section_id} key={section.section_id}>
                <p className="section-kicker">{section.access === "PAID" ? "구매 리포트" : "무료 요약"}</p>
                <h3>{section.title}</h3>
                <strong>{section.content}</strong>
                <details><summary>해석 근거 보기</summary><ul>{section.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul></details>
              </article>
            ) : (
              <article className="report-section locked-report-section signal-locked-item" key={section.section_id}>
                <p className="section-kicker">잠긴 미리보기</p>
                <h3>{section.title}</h3>
                <strong>구매 후 서버에서 생성되는 영역이에요.</strong>
                <p>{section.evidence.join(" · ")}</p>
                <Link className="secondary-button" href="/products">상품 확인하기</Link>
              </article>
            ))}
          </div>
        </section>
        <nav className="report-actions report-next-action signal-next-action" aria-label="리포트 관련 기능">
          <Link className="secondary-button signal-secondary-action" href="/flow/today">오늘의 흐름</Link>
          <Link className="secondary-button signal-secondary-action" href="/flow/month">이번 달 흐름</Link>
          <button className="secondary-button signal-secondary-action" type="button" onClick={() => window.print()}>인쇄 · PDF 저장</button>
        </nav>
        <Link className="primary-button signal-primary-action" href="/report/topics" aria-label="관심 주제 고르기 · 관심 주제로 더 보기">관심 주제 고르기</Link>
      </div>
    </section>
  );
}

export function TopicsScreen() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [selectedTopic, setSelectedTopic] = useState<TopicId | null>(null);
  if (!hydrated) return <LoadingState />;
  const reportInspection = reportStore.inspect();
  if (reportInspection.status === "corrupt" || reportInspection.status === "unavailable") return <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />;
  const storedTopic = reportInspection.status === "ok" ? reportInspection.value.topic : null;
  const activeTopic = selectedTopic ?? storedTopic ?? "love";

  return (
    <section className={`screen-content topics-content signal-screen signal-topics ${coreStyles.scope}`} aria-labelledby="topics-title">
      <header className="editorial-hero signal-situation">
        <p className="section-kicker signal-kicker">관심 주제</p>
        <h1 id="topics-title">지금 가장 궁금한<br />주제 하나</h1>
        <p className="supporting">고민 하나를 고르면 그 시선으로 흐름과 미리보기를 읽어드려요.</p>
      </header>
      <section className="topic-signals signal-signals" aria-labelledby="topic-list-title">
        <h2 id="topic-list-title" className="sr-only">관심 주제 목록</h2>
        <div className="topic-list signal-list" role="radiogroup" aria-label="관심 주제">
          {TOPICS.map((topic, index) => (
            <label key={topic.id} className={`topic-card signal-list-item ${activeTopic === topic.id ? "selected" : ""}`}>
              <input className="selection-radio" type="radio" name="topic" value={topic.id} checked={activeTopic === topic.id} onChange={() => setSelectedTopic(topic.id)} />
              <span className="topic-number signal-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="topic-copy"><strong>{topic.title}</strong><small>{topic.description}</small></span>
              <span className="row-marker signal-row-marker" aria-hidden="true">{activeTopic === topic.id ? "✓" : "→"}</span>
            </label>
          ))}
        </div>
      </section>
      <aside className="topic-evidence signal-evidence" role="note">
        <span className="topic-evidence-marker" aria-hidden="true" />
        <p>주제는 언제든 바꿀 수 있어요.</p>
      </aside>
      <div className="topic-next-action signal-next-action">
        <button className="primary-button signal-primary-action" type="button" onClick={() => router.push(`/report/topics/${activeTopic}`)}>{getTopic(activeTopic).title} 내용 보기</button>
      </div>
    </section>
  );
}

export function TopicPreviewScreen({ topicId }: { topicId: TopicId }) {
  const topic = getTopic(topicId);
  const preview = getTopicPreview(topicId);
  const reportId = `rpt_fixture_${topicId}`;
  return (
    <section className={`screen-content preview-content signal-screen signal-topic-preview ${coreStyles.scope}`} aria-labelledby="preview-title">
      <header className="topic-preview-situation signal-situation">
        <p className="section-kicker signal-kicker">{topic.title}</p>
        <h1 id="preview-title">{preview.headline.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
        <p className="lead">{preview.introduction}</p>
      </header>
      <div className="topic-availability signal-evidence" aria-label="제공 범위">
        <span>무료 요약</span>
        <span aria-hidden="true">·</span>
        <span>잠긴 미리보기</span>
      </div>
      <section className="topic-preview-signals signal-signals" aria-labelledby="topic-signals-title">
        <h2 id="topic-signals-title" className="sr-only">주제 신호</h2>
        <article className="reading-section signal-signal">
          <small>이 주제의 강점</small>
          <strong>{preview.strength}</strong>
        </article>
        <article className="reading-section emphasis signal-signal">
          <small>점검할 부분</small>
          <strong>{preview.caution}</strong>
        </article>
        <article className="text-section signal-signal">
          <h3>지금의 흐름</h3>
          <p>{preview.flow}</p>
        </article>
      </section>
      <section className="topic-preview-evidence signal-evidence" aria-labelledby="topic-evidence-title">
        <h2 id="topic-evidence-title">왜 이런 결과인가요?</h2>
        <details>
          <summary>고정 예시의 범위 보기</summary>
          <p>현재 내용은 화면 체험을 위한 고정 예시이며 실제 사주 계산 결과가 아니에요. 입력 정보에 따라 문장이 달라지지 않으며, 사주는 선택을 대신하지 않습니다.</p>
        </details>
      </section>
      <div className="topic-preview-next-action signal-next-action">
        <Link className="primary-button signal-primary-action" href={`/report/feedback?targetType=report&reportId=${reportId}&topic=${topicId}`}>이 해석 저장하기</Link>
      </div>
    </section>
  );
}

const FIXTURE_FEEDBACK_PROVENANCE: FeedbackProvenance = {
  profileSnapshotId: "profile_snapshot_fixture_primary",
  chartSnapshotIds: ["chart_fixture_primary"],
  modelVersion: null,
  promptVersion: null,
  templateVersion: "fixture-1",
};

const FEEDBACK_REASONS: ReadonlyArray<{ code: FeedbackReason; label: string }> = [
  { code: "too_generic", label: "내용이 너무 일반적임" },
  { code: "repetitive", label: "같은 말이 반복됨" },
  { code: "incorrect_chart", label: "사주 정보가 잘못됨" },
  { code: "unanswered", label: "질문에 답하지 않음" },
  { code: "inappropriate", label: "표현이 불쾌하거나 과도함" },
  { code: "purchase_mismatch", label: "결제 내용과 다름" },
  { code: "other", label: "기타" },
];

export function FeedbackScreen({ target, topicId }: { target: Extract<FeedbackTarget, { type: "report" }>; topicId: TopicId }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackId | null>(null);
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [comment, setComment] = useState("");
  const [reported, setReported] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback) return setError("가장 가까운 답변 하나를 선택해 주세요.");
    if (!reason) return setError("상세 사유를 선택해 주세요.");
    if (/^\d+$/.test(target.reportId)) {
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
    <form className={`screen-content feedback-content ${coreStyles.scope}`} onSubmit={submit} aria-labelledby="feedback-title">
      <div className="editorial-hero"><p className="section-kicker">해석 평가</p><h1 id="feedback-title">이번 해석은 어떠셨나요?</h1><p className="supporting">평가와 신고는 서버 리포트 품질 기록에 저장됩니다.</p></div>
      <div className="feedback-list" role="radiogroup" aria-label="해석 평가">{FEEDBACK_OPTIONS.map((item) => <label key={item.id} className={`feedback-card ${feedback === item.id ? "selected" : ""}`}><input className="selection-radio" type="radio" name="feedback" value={item.id} checked={feedback === item.id} onChange={() => { setFeedback(item.id); setError(""); }} /><span aria-hidden="true">{item.symbol}</span><span><strong>{item.title}</strong><small>{item.description}</small></span></label>)}</div>
      {feedback && <aside className="selection-summary"><small>선택됨</small><strong>{FEEDBACK_OPTIONS.find((item) => item.id === feedback)?.title}</strong></aside>}
      <label className="feedback-detail-field">상세 사유<select value={reason} onChange={(event) => setReason(event.target.value as FeedbackReason | "")} required><option value="">선택해 주세요</option>{FEEDBACK_REASONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <label className="feedback-detail-field">자유 의견<textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="구체적인 의견을 남겨주세요" /></label>
      <label className="check-card"><input type="checkbox" checked={reported} onChange={(event) => setReported(event.target.checked)} />부적절하거나 단정적인 표현으로 신고</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button feedback-submit" type="submit">평가 저장하기</button>
    </form>
  );
}

export function SaveScreen({ topicId, feedback }: { topicId: TopicId; feedback: FeedbackId | null }) {
  const hydrated = useHydrated();
  const [savedInSession, setSavedInSession] = useState(false);
  const [error, setError] = useState("");
  if (!hydrated) return <LoadingState />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 덮어쓰지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const reportInspection = reportStore.inspect();
  if (reportInspection.status === "corrupt" || reportInspection.status === "unavailable") return <CorruptState title="저장한 리포트를 읽을 수 없어요" description="손상된 리포트를 확인 없이 덮어쓰지 않습니다." unavailable={reportInspection.status === "unavailable"} onReset={reportStore.remove} />;
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
    <section className={`screen-content save-content ${coreStyles.scope}`} aria-labelledby="save-title">
      <p className="section-kicker">저장 안내</p>
      <div><h1 id="save-title">{localSaved ? "이 기기에 저장했어요" : "이 기기에 결과를 저장할까요?"}</h1><p>{localSaved ? "같은 브라우저에서 다시 확인할 수 있어요. 브라우저 데이터를 지우면 이 기기 사본은 삭제됩니다." : "서버 계산 결과와 별도로, 이 브라우저에서 빠르게 이어볼 사본을 저장할 수 있어요."}</p></div>
      <aside className="check-list"><strong>기기에 저장하면 좋은 점</strong><span>✓ 무료 사주 요약 보관</span><span>✓ 관심 주제 이어보기</span><span>✓ 입력 정보는 기기 안에만 저장</span></aside>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!localSaved && <button className="primary-button" type="button" onClick={save}>이 기기에 결과 저장</button>}
      <Link className="secondary-button" href="/login">이메일 계정 로그인·가입</Link>
      <button className="disabled-login" type="button" disabled>소셜 로그인 · 준비 중</button>
      <Link className="text-button inline-action" href="/report" onClick={(event) => { if (!localSaved && !birthDraftStore.remove()) { event.preventDefault(); setError("입력 정보를 지우지 못해 이동을 중단했어요."); } }}>{localSaved ? "저장된 결과 계속 보기" : "저장하지 않고 계속 보기"}</Link>
      <p className="action-note">이메일 계정 기능은 사용할 수 있으며, 외부 결제 제공자 연결은 아직 준비 중이에요.</p>
    </section>
  );
}
