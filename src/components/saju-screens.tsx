"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { CorruptState, LoadingState } from "./page-state";
import type { BirthInfo, FeedbackData, FeedbackId, FeedbackReason, TopicId } from "@/lib/domain";
import type { CalendarKind, FeedbackProvenance, FeedbackTarget, OwnerRelationship, TopicId as ProfileTopicId } from "@/lib/contracts";
import { hasValidLeapMonthSemantics, maskBirthDate, maskBirthTime, maskBirthplace, parseBirthDate } from "@/lib/contracts";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  BASIC_REPORT,
  FEEDBACK_OPTIONS,
  INITIAL_BIRTH,
  REPORT_SECTIONS,
  TOPICS,
  getTopic,
  getTopicPreview,
} from "@/lib/fixtures";
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

function PublicHeader({ step, backHref, title }: { step?: string; backHref?: string; title?: string }) {
  return (
    <header className={`journey-header signal-header ${title ? "signal-form-header" : "signal-brand-header"}`}>
      {backHref && (
        <Link className="back-button signal-back-button" href={backHref} aria-label="이전 화면으로 돌아가기">‹</Link>
      )}
      <Link className={`wordmark ${title ? "signal-header-title" : "signal-brand"}`} href="/" aria-label={title ?? "사주리움 시작 화면"}>{title ?? "사주리움"}</Link>
      {step && <span className="step-indicator signal-step-indicator" aria-label={`${step} 단계`}>{step}</span>}
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
    <section className="phone-screen landing-screen signal-screen signal-landing" aria-labelledby="landing-title">
      <PublicHeader />
      <div className="screen-content landing-content signal-landing-content">
        <header className="landing-hero signal-hero signal-situation">
          <p className="eyebrow signal-kicker">오늘의 흐름</p>
          <h1 id="landing-title">지금의 흐름을 살펴보세요</h1>
          <p className="lead signal-hero-description">생년월일만 입력하면 오늘의 한 문장부터 보여드려요.</p>
        </header>
        <article className="landing-preview signal-card signal-example-card" aria-label="오늘의 한 문장 예시">
          <div className="signal-card-context">
            <span>오늘의 한 문장</span>
            <small>예시 · 관계</small>
          </div>
          <strong className="signal-card-signal">서두르기보다 방향을 고르는 날</strong>
          <p className="signal-card-evidence">빠른 결정보다, 지키고 싶은 조건부터 살펴보세요.</p>
        </article>
        <div className="landing-actions signal-next-action">
          <p className="signal-reassurance" role="note">
            <span className="signal-reassurance-icon" aria-hidden="true" />
            가입 없이 무료 요약까지
          </p>
          <button
            className="primary-button signal-primary-action"
            type="button"
            aria-label="생년월일 입력하기 · 내 흐름 살펴보기"
            onClick={() => router.push(birthHref)}
          >
            생년월일 입력하기
          </button>
          {hasSavedReport && <button className="secondary-button signal-secondary-action" type="button" onClick={() => router.push("/report")}>이 기기에 저장한 결과 이어보기</button>}
        </div>
        <aside className="landing-copy signal-safety-note">
          <strong>운명을 단정하지 않아요</strong>
          <p>이 화면은 실제 사주 계산이 아닌 체험용 예시 콘텐츠를 보여줘요.</p>
        </aside>
      </div>
    </section>
  );
}

export function BirthScreen({ initialCalculationFailure }: { initialCalculationFailure: boolean }) {
  const router = useRouter();
  const [birth, setBirth] = useState<BirthInfo>(INITIAL_BIRTH);
  const [phase, setPhase] = useState<"form" | "loading" | "failure">("form");
  const [formError, setFormError] = useState("");
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

  function finishCalculation() {
    window.setTimeout(() => {
      if (failNextCalculation.current) {
        failNextCalculation.current = false;
        setPhase("failure");
      } else {
        router.push("/report");
      }
    }, 1200);
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
    finishCalculation();
  }

  if (phase === "loading") {
    return (
      <section className="phone-screen onboarding-screen signal-screen signal-calculation" aria-labelledby="loading-title" aria-live="polite">
        <PublicHeader title="출생 정보" step="2/3" />
        <div className="screen-content loading-content signal-calculation-content">
          <header className="form-hero signal-situation"><p className="section-kicker signal-kicker">예시 리포트 준비</p><h1 id="loading-title">{birth.displayName}님이 읽을 화면을<br />차분히 준비하고 있어요</h1></header>
          <div className="loading-status signal-progress">
            <div className="status-row"><strong>화면 준비</strong><span>2 / 3</span></div>
            <div className="progress-track"><span /></div>
            <ol className="calculation-steps">
              <li className="complete"><span>01</span><p><strong>입력 형식 확인</strong><small>완료</small></p></li>
              <li className="active" data-slop-allow="nested-cards"><span>02</span><p><strong>예시 문장 불러오기</strong><small>준비 중</small></p></li>
              <li><span>03</span><p><strong>미리보기 화면 구성</strong><small>대기</small></p></li>
            </ol>
          </div>
          <aside className="tip-card signal-safety-note"><strong>체험 안내</strong><p>실제 명식·역법·사주 계산은 하지 않아요. 입력값과 관계없이 같은 예시 문장을 보여드려요.</p></aside>
        </div>
      </section>
    );
  }

  if (phase === "failure") {
    return (
      <section className="phone-screen onboarding-screen signal-screen signal-calculation-failure" aria-labelledby="failure-title">
        <PublicHeader title="출생 정보" backHref="/birth" />
        <div className="screen-content failure-content signal-failure-content">
          <p className="section-kicker signal-kicker">화면 준비를 마치지 못했어요</p>
          <div><h1 id="failure-title">결과를 불러오지 못했어요</h1><p>입력하신 정보는 그대로 보관했어요.<br />다시 시도하거나 입력 정보를 확인해 주세요.</p></div>
          <aside className="check-list signal-evidence"><strong>확인해볼 점</strong><span>· 입력 정보가 올바른지 확인</span><span>· 잠시 후 다시 준비</span></aside>
        </div>
        <div className="screen-actions double-actions signal-next-action">
          <button className="primary-button signal-primary-action" type="button" onClick={() => { setPhase("loading"); finishCalculation(); }}>다시 준비하기</button>
          <button className="secondary-button signal-secondary-action" type="button" onClick={() => setPhase("form")}>입력 정보 확인</button>
        </div>
      </section>
    );
  }

  return (
    <section className="phone-screen onboarding-screen signal-screen signal-birth" aria-labelledby="birth-title">
      <PublicHeader title="출생 정보" step="1/3" backHref="/" />
      <form className="screen-content form-content signal-birth-form" onSubmit={submitBirth} noValidate>
        <header className="form-hero signal-situation">
          <p className="section-kicker signal-kicker">시작하기</p>
          <h1 id="birth-title">사주리움이 부를<br />이름과 생일</h1>
          <p className="supporting">이름은 표시용이에요.</p>
        </header>
        <section className="birth-fields signal-signals" aria-label="출생 정보 입력">
          <div className="field-group signal-field">
            <label className="field-label" htmlFor="nickname">이름 또는 닉네임</label>
            <input id="nickname" name="nickname" value={birth.displayName} onChange={(event) => updateBirth({ displayName: event.target.value })} autoComplete="nickname" maxLength={20} aria-describedby={formError ? "birth-error" : undefined} />
          </div>
          <fieldset className="signal-selector calendar-selector">
            <legend className="field-label">달력 기준 · 음력 선택 후 윤달 확인</legend>
            <div className="segmented-control" role="radiogroup" aria-label="달력 기준">
              {(["solar", "lunar"] as const).map((basis: CalendarKind) => (
                <button key={basis} className={birth.calendar === basis ? "selected" : ""} type="button" role="radio" aria-checked={birth.calendar === basis} onClick={() => updateBirth({ calendar: basis, leapMonth: basis === "lunar" ? birth.leapMonth : false })}>
                  {{ solar: "양력", lunar: "음력" }[basis]}
                </button>
              ))}
            </div>
            {birth.calendar === "lunar" && (
              <div className="lunar-leap-control signal-conditional-field">
                <label className="check-card">
                  <input type="checkbox" checked={birth.leapMonth} onChange={(event) => updateBirth({ leapMonth: event.target.checked })} />
                  <span>음력 윤달</span>
                </label>
                <p className="field-help">태어난 날짜가 윤달이면 선택해 주세요.</p>
              </div>
            )}
          </fieldset>
          <fieldset className="signal-selector gender-selector">
            <legend className="field-label">성별 기준</legend>
            <div className="segmented-control" role="radiogroup" aria-label="성별 기준">
              {(["female", "male"] as const).map((gender) => (
                <button key={gender} type="button" role="radio" className={birth.calculationGender === gender ? "selected" : ""} aria-checked={birth.calculationGender === gender} onClick={() => updateBirth({ calculationGender: gender })}>
                  {gender === "female" ? "여성" : "남성"}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="birth-datetime-row signal-datetime">
            <div className="field-group signal-field">
              <label className="field-label" htmlFor="birth-date">생년월일</label>
              <input id="birth-date" name="birthDate" type="date" lang="ko-KR" min="1900-01-01" max={localDateValue()} value={birth.birthDate} onChange={(event) => updateBirth({ birthDate: event.target.value })} />
            </div>
            <div className="field-group signal-field">
              <label className="field-label" htmlFor="birth-time">출생 시간</label>
              <input id="birth-time" name="birthTime" type="time" lang="ko-KR" value={birth.birthTime ?? ""} disabled={birth.birthTimeUnknown} onChange={(event) => updateBirth({ birthTime: event.target.value || null })} />
            </div>
          </div>
          <label className="check-card signal-time-unknown">
            <input type="checkbox" checked={birth.birthTimeUnknown} onChange={(event) => updateBirth({ birthTimeUnknown: event.target.checked, birthTime: event.target.checked ? null : birth.birthTime })} />
            <span>출생 시간을 몰라요</span>
          </label>
        </section>
        <details className="birth-additional-fields signal-evidence">
          <summary>계산에 필요한 추가 정보</summary>
          <div className="birth-context-fields">
            <div className="field-group signal-field">
              <label className="field-label" htmlFor="birthplace">출생지</label>
              <input id="birthplace" value={birth.birthplace} onChange={(event) => updateBirth({ birthplace: event.target.value })} />
            </div>
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
              <div className="signal-interest-options">
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
              <label className="check-card">
                <input type="checkbox" checked={birth.thirdPartyConsent} onChange={(event) => updateBirth({ thirdPartyConsent: event.target.checked })} />
                <span>정보 주체의 동의를 확인했어요</span>
              </label>
            )}
          </div>
        </details>
        <aside className="privacy-panel signal-privacy-note" id="birth-privacy-note">
          <strong>입력 정보는 기기에 저장돼요.</strong>
          <p>가입 없이 무료 요약을 확인해요. 실제 사주 계산이나 외부 전송은 하지 않아요.</p>
        </aside>
        {formError && <p className="form-error signal-form-error" id="birth-error" role="alert">{formError}</p>}
        <button className="primary-button form-submit signal-next-action signal-primary-action" type="submit">다음</button>
      </form>
    </section>
  );
}

export function ReportScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="저장한 결과를 확인하고 있어요" />;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;

  return (
    <section className="report-page signal-screen signal-report" aria-labelledby="report-title">
      <div className="screen-content report-content signal-report-content">
        <header className="editorial-hero signal-situation">
          <p className="section-kicker signal-kicker">무료 요약 · {birth.displayName}님</p>
          <h1 id="report-title">지금은 기준을<br />다시 세울 때</h1>
          <p className="supporting">{maskBirthDate(birth.birthDate)} · {maskBirthTime(birth.birthTime, birth.birthTimeUnknown)} · {maskBirthplace(birth.birthplace)}</p>
        </header>
        {birth.birthTimeUnknown && <p className="accuracy-note signal-safety-note">출생 시간 미상 상태만 화면 형식에 반영하며 정해진 예시 문장은 달라지지 않아요.</p>}
        <article className="insight-card current signal-card signal-signal" aria-labelledby="current-flow-title">
          <small id="current-flow-title">오늘의 흐름</small>
          <strong>{BASIC_REPORT.currentFlow}</strong>
        </article>
        <section className="report-signals signal-signals" aria-labelledby="signals-title">
          <h2 id="signals-title">핵심 성향</h2>
          <ol className="insight-list signal-list">
            {BASIC_REPORT.insights.map((insight, index) => (
              <li className="insight-card signal-list-item" key={insight.id}>
                <span className="signal-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{insight.title}</strong>
                  <p>{insight.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <aside className="check-list signal-caution">
            <strong>{BASIC_REPORT.caution}</strong>
            <span>{BASIC_REPORT.suggestion}</span>
          </aside>
        </section>
        <section className="report-evidence signal-evidence" aria-labelledby="evidence-title">
          <header className="report-evidence-header">
            <p className="section-kicker signal-kicker">해석 근거</p>
            <h2 id="evidence-title">왜 이런 해석인가요?</h2>
            <p>입력 정보와 고정된 예시 문장을 연결해 보여드려요.</p>
          </header>
          <div className="report-sections signal-evidence-list">
            {REPORT_SECTIONS.map((section) => section.access === "free" ? (
              <article className="report-section signal-evidence-item" id={section.id} key={section.id}>
                <p className="section-kicker">무료 요약</p>
                <h3>{section.title}</h3>
                <strong>{section.summary}</strong>
                <ul>{section.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                <details><summary>해석 근거 보기</summary><p>{section.evidence} 실제 계산 결과가 아닙니다.</p></details>
              </article>
            ) : (
              <article className="report-section locked-report-section signal-locked-item" key={section.id}>
                <p className="section-kicker">잠긴 미리보기</p>
                <h3>{section.title}</h3>
                <strong>{section.summary}</strong>
                <p>{section.evidence}</p>
                <button type="button" disabled aria-disabled="true">실제 상품·결제 연결 전에는 열 수 없어요</button>
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
    <section className="screen-content topics-content signal-screen signal-topics" aria-labelledby="topics-title">
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
    <section className="screen-content preview-content signal-screen signal-topic-preview" aria-labelledby="preview-title">
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback) return setError("가장 가까운 답변 하나를 선택해 주세요.");
    if (!reason) return setError("상세 사유를 선택해 주세요.");
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
    <form className="screen-content feedback-content" onSubmit={submit} aria-labelledby="feedback-title">
      <div className="editorial-hero"><p className="section-kicker">해석 평가</p><h1 id="feedback-title">이번 해석은 어떠셨나요?</h1><p className="supporting">응답은 이 기기에만 저장되며 외부로 전송되지 않아요.</p></div>
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
    <section className="screen-content save-content" aria-labelledby="save-title">
      <p className="section-kicker">저장 안내</p>
      <div><h1 id="save-title">{localSaved ? "이 기기에 저장했어요" : "이 기기에 결과를 저장할까요?"}</h1><p>{localSaved ? "같은 브라우저에서 다시 확인할 수 있어요. 브라우저 데이터를 지우면 결과도 삭제됩니다." : "계정 로그인 기능은 아직 준비 중이에요. 지금은 이 브라우저에만 결과를 저장할 수 있어요."}</p></div>
      <aside className="check-list"><strong>기기에 저장하면 좋은 점</strong><span>✓ 무료 사주 요약 보관</span><span>✓ 관심 주제 이어보기</span><span>✓ 입력 정보는 기기 안에만 저장</span></aside>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!localSaved && <button className="primary-button" type="button" onClick={save}>이 기기에 결과 저장</button>}
      <button className="disabled-login" type="button" disabled>카카오 로그인 · 준비 중</button>
      <button className="disabled-login" type="button" disabled>다른 방법으로 로그인 · 준비 중</button>
      <Link className="text-button inline-action" href="/report" onClick={(event) => { if (!localSaved && !birthDraftStore.remove()) { event.preventDefault(); setError("입력 정보를 지우지 못해 이동을 중단했어요."); } }}>{localSaved ? "저장된 결과 계속 보기" : "저장하지 않고 계속 보기"}</Link>
      <p className="action-note">계정 로그인과 결제 기능은 제공되지 않아요.</p>
    </section>
  );
}
