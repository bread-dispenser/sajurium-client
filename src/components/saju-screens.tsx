"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { CorruptState, LoadingState } from "./page-state";
import type { BirthInfo, CalendarBasis, FeedbackData, FeedbackId, TopicId } from "@/lib/domain";
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

function PublicHeader({ step, backHref }: { step?: string; backHref?: string }) {
  return (
    <header className="journey-header">
      {backHref && (
        <Link className="back-button" href={backHref} aria-label="이전 화면으로 돌아가기">‹</Link>
      )}
      <Link className="wordmark" href="/" aria-label="사주리움 시작 화면">사주리움</Link>
      {step && <span className="step-indicator" aria-label={`${step} 단계`}>{step}</span>}
    </header>
  );
}

function sameBirth(left: BirthInfo, right: BirthInfo) {
  return left.nickname === right.nickname &&
    left.calendar === right.calendar &&
    left.birthDate === right.birthDate &&
    left.birthTime === right.birthTime &&
    left.unknownTime === right.unknownTime;
}

function formatBirthDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${year}. ${month}. ${day}`;
}

function localDateValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function parseBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  if (
    year < 1900 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
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
    <section className="phone-screen landing-screen" aria-labelledby="landing-title">
      <PublicHeader />
      <div className="screen-content landing-content">
        <div className="landing-hero">
          <div className="landing-heading">
            <p className="eyebrow">오늘의 흐름</p>
            <h1 id="landing-title">오늘, 어떤 흐름을<br />마주하고 있나요?</h1>
            <p className="lead">답을 정해주는 대신, 잠시 멈춰 지금의 마음과 선택을 돌아보는 시간을 건네요.</p>
          </div>
          <div className="sajurium-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
            <i />
          </div>
        </div>
        <article className="landing-preview" aria-label="체험용 결과 예시">
          <div>
            <span>오늘의 한 문장 · 예시</span>
            <small>8월 25일</small>
          </div>
          <strong>서두르기보다<br />방향을 고르는 날</strong>
          <p>빠른 결론보다 내가 지키고 싶은 조건을 먼저 살펴보세요.</p>
          <ul aria-label="예시 주제">
            <li>관계</li>
            <li>선택</li>
            <li>회복</li>
          </ul>
        </article>
        <div className="landing-actions">
          <button className="primary-button" type="button" onClick={() => router.push(birthHref)}>내 흐름 살펴보기</button>
          {hasSavedReport && <button className="secondary-button" type="button" onClick={() => router.push("/report")}>이 기기에 저장한 결과 이어보기</button>}
          <p className="action-note">약 2분 · 무료로 예시 결과를 먼저 확인해요</p>
        </div>
        <aside className="landing-copy">
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
    const nickname = birth.nickname.trim();
    const selectedDate = parseBirthDate(birth.birthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!nickname) return setFormError("이름 또는 닉네임을 입력해 주세요.");
    if (!selectedDate || selectedDate > today) return setFormError("1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.");
    if (!birth.unknownTime && !birth.birthTime) return setFormError("출생 시간을 입력하거나 ‘출생 시간을 몰라요’를 선택해 주세요.");

    const normalized = { ...birth, nickname };
    if (!birthDraftStore.write({ version: 1, birth: normalized })) {
      return setFormError("브라우저 저장소를 사용할 수 없어 입력을 이어갈 수 없어요.");
    }
    setBirth(normalized);
    setPhase("loading");
    finishCalculation();
  }

  if (phase === "loading") {
    return (
      <section className="phone-screen onboarding-screen" aria-labelledby="loading-title" aria-live="polite">
        <PublicHeader step="2 / 3" />
        <div className="screen-content loading-content">
          <div className="form-hero"><p className="section-kicker">예시 리포트 준비</p><h1 id="loading-title">{birth.nickname}님이 읽을 화면을<br />차분히 준비하고 있어요</h1></div>
          <div className="loading-status">
            <div className="status-row"><strong>화면 준비</strong><span>2 / 3</span></div>
            <div className="progress-track"><span /></div>
            <ol className="calculation-steps">
              <li className="complete"><span>01</span><p><strong>입력 형식 확인</strong><small>완료</small></p></li>
              <li className="active"><span>02</span><p><strong>예시 문장 불러오기</strong><small>준비 중</small></p></li>
              <li><span>03</span><p><strong>미리보기 화면 구성</strong><small>대기</small></p></li>
            </ol>
          </div>
          <aside className="tip-card"><strong>체험 안내</strong><p>실제 명식·역법·사주 계산은 하지 않아요. 입력값과 관계없이 같은 예시 문장을 보여드려요.</p></aside>
        </div>
      </section>
    );
  }

  if (phase === "failure") {
    return (
      <section className="phone-screen onboarding-screen" aria-labelledby="failure-title">
        <PublicHeader backHref="/birth" />
        <div className="screen-content failure-content">
          <p className="section-kicker">화면 준비를 마치지 못했어요</p>
          <div><h1 id="failure-title">결과를 불러오지 못했어요</h1><p>입력하신 정보는 그대로 보관했어요.<br />다시 시도하거나 입력 정보를 확인해 주세요.</p></div>
          <aside className="check-list"><strong>확인해볼 점</strong><span>· 입력 정보가 올바른지 확인</span><span>· 잠시 후 다시 준비</span></aside>
        </div>
        <div className="screen-actions double-actions">
          <button className="primary-button" type="button" onClick={() => { setPhase("loading"); finishCalculation(); }}>다시 준비하기</button>
          <button className="secondary-button" type="button" onClick={() => setPhase("form")}>입력 정보 확인</button>
        </div>
      </section>
    );
  }

  return (
    <section className="phone-screen onboarding-screen" aria-labelledby="birth-title">
      <PublicHeader step="1 / 3" backHref="/" />
      <form className="screen-content form-content" onSubmit={submitBirth} noValidate>
        <div className="form-hero"><p className="section-kicker">출생 정보</p><h1 id="birth-title">당신을 부를 이름과<br />태어난 날을 알려주세요</h1><p className="supporting">입력 정보는 화면 표시와 이 기기의 저장에만 사용해요. 실제 사주 계산에는 사용하지 않아요.</p></div>
        <div className="birth-fields">
          <div className="field-group">
            <label className="field-label" htmlFor="nickname">이름 또는 닉네임</label>
            <input id="nickname" name="nickname" value={birth.nickname} onChange={(event) => updateBirth({ nickname: event.target.value })} autoComplete="nickname" maxLength={20} aria-describedby={formError ? "birth-error" : undefined} />
          </div>
          <fieldset><legend className="field-label">달력 기준</legend><div className="segmented-control">
            {(["solar", "lunar", "leap"] as const).map((basis: CalendarBasis) => <button key={basis} className={birth.calendar === basis ? "selected" : ""} type="button" aria-pressed={birth.calendar === basis} onClick={() => updateBirth({ calendar: basis })}>{{ solar: "양력", lunar: "음력", leap: "윤달" }[basis]}</button>)}
          </div></fieldset>
          <div className="field-group">
            <label className="field-label" htmlFor="birth-date">생년월일</label>
            <input id="birth-date" name="birthDate" type="date" min="1900-01-01" max={localDateValue()} value={birth.birthDate} onChange={(event) => updateBirth({ birthDate: event.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="birth-time">출생 시간</label>
            <input id="birth-time" name="birthTime" type="time" value={birth.birthTime} disabled={birth.unknownTime} onChange={(event) => updateBirth({ birthTime: event.target.value })} />
          </div>
          <label className="check-card"><input type="checkbox" checked={birth.unknownTime} onChange={(event) => updateBirth({ unknownTime: event.target.checked })} /><span>출생 시간을 몰라요</span></label>
        </div>
        <aside className="privacy-panel"><strong>정보는 이 기기에만 머물러요</strong><p>출생 시간 미상 여부는 화면 형식과 이 기기 저장값에만 반영되며 정해진 예시 문장은 달라지지 않아요.</p></aside>
        {formError && <p className="form-error" id="birth-error" role="alert">{formError}</p>}
        <button className="primary-button form-submit" type="submit">다음</button>
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
    <section className="report-page" aria-labelledby="report-title">
      <div className="screen-content report-content">
        <div className="editorial-hero"><p className="section-kicker">무료 사주 요약</p><h1 id="report-title">{birth.nickname}님의 사주 요약</h1><p className="supporting">{formatBirthDate(birth.birthDate)} · {birth.unknownTime ? "출생 시간 미상" : birth.birthTime}</p></div>
        {birth.unknownTime && <p className="accuracy-note">출생 시간 미상 상태만 화면 형식에 반영하며 정해진 예시 문장은 달라지지 않아요.</p>}
        <article className="insight-card current"><small>지금의 흐름</small><strong>{BASIC_REPORT.currentFlow}</strong></article>
        <h2>핵심 성향</h2>
        <div className="insight-list">{BASIC_REPORT.insights.map((insight) => <article className="insight-card" key={insight.id}><div><strong>{insight.title}</strong><p>{insight.description}</p></div></article>)}</div>
        <h2>주의할 패턴</h2>
        <aside className="check-list"><strong>{BASIC_REPORT.caution}</strong><span>{BASIC_REPORT.suggestion}</span></aside>
        <h2>상세 리포트</h2>
        <div className="report-sections">
          {REPORT_SECTIONS.map((section) => section.access === "free" ? (
            <article className="report-section" id={section.id} key={section.id}>
              <p className="section-kicker">무료 영역</p>
              <h3>{section.title}</h3>
              <strong>{section.summary}</strong>
              <ul>{section.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              <details><summary>해석 근거 보기</summary><p>{section.evidence} 실제 계산 결과가 아닙니다.</p></details>
            </article>
          ) : (
            <article className="report-section locked-report-section" key={section.id}>
              <p className="section-kicker">잠긴 미리보기</p>
              <h3>{section.title}</h3>
              <strong>{section.summary}</strong>
              <p>{section.evidence}</p>
              <button type="button" disabled aria-disabled="true">실제 상품·결제 연결 전에는 열 수 없어요</button>
            </article>
          ))}
        </div>
        <nav className="report-actions" aria-label="리포트 관련 기능">
          <Link className="secondary-button" href="/flow/today">오늘의 흐름</Link>
          <Link className="secondary-button" href="/flow/month">이번 달 흐름</Link>
          <button className="secondary-button" type="button" onClick={() => window.print()}>인쇄 · PDF 저장</button>
        </nav>
        <Link className="primary-button" href="/report/topics">관심 주제로 더 보기</Link>
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
    <section className="screen-content topics-content" aria-labelledby="topics-title">
      <div className="editorial-hero"><p className="section-kicker">관심 주제</p><h1 id="topics-title">지금 가장 궁금한 주제는<br />무엇인가요?</h1><p className="supporting">선택한 주제에 맞춰 정해진 체험용 예시를 보여드려요.</p></div>
      <div className="topic-list" role="radiogroup" aria-label="관심 주제">
        {TOPICS.map((topic, index) => <label key={topic.id} className={`topic-card ${activeTopic === topic.id ? "selected" : ""}`}><input className="selection-radio" type="radio" name="topic" value={topic.id} checked={activeTopic === topic.id} onChange={() => setSelectedTopic(topic.id)} /><span className="topic-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{topic.title}</strong><small>{topic.description}</small></span><span className="row-marker" aria-hidden="true">{activeTopic === topic.id ? "✓" : "→"}</span></label>)}
      </div>
      <button className="primary-button" type="button" onClick={() => router.push(`/report/topics/${activeTopic}`)}>{getTopic(activeTopic).title} 내용 보기</button>
    </section>
  );
}

export function TopicPreviewScreen({ topicId }: { topicId: TopicId }) {
  const topic = getTopic(topicId);
  const preview = getTopicPreview(topicId);
  return (
    <section className="screen-content preview-content" aria-labelledby="preview-title">
      <p className="vermilion-eyebrow">{topic.title} · 체험용 예시</p>
      <h1 id="preview-title">{preview.headline.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
      <p className="lead">{preview.introduction}</p>
      <article className="reading-section"><small>이 주제의 강점</small><strong>{preview.strength}</strong></article>
      <article className="reading-section emphasis"><small>점검할 부분</small><strong>{preview.caution}</strong></article>
      <div className="text-section"><h2>지금의 흐름</h2><p>{preview.flow}</p></div>
      <details><summary>왜 이런 결과인가요?</summary><p>현재 내용은 화면 체험을 위한 고정 예시이며 실제 사주 계산 결과가 아니에요. 입력 정보에 따라 문장이 달라지지 않으며, 사주는 선택을 대신하지 않습니다.</p></details>
      <Link className="primary-button" href={`/report/feedback?topic=${topicId}`}>이 해석 저장하기</Link>
    </section>
  );
}

export function FeedbackScreen({ topicId }: { topicId: TopicId }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackId | null>(null);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [reported, setReported] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback) return setError("가장 가까운 답변 하나를 선택해 주세요.");
    const listInspection = feedbackListStore.inspect();
    if (listInspection.status === "corrupt" || listInspection.status === "unavailable") return setError("손상된 피드백 기록을 설정에서 확인해 주세요.");
    const now = new Date().toISOString();
    const current = listInspection.status === "ok" ? listInspection.value.entries : [];
    const selection = { version: 1 as const, savedAt: now, topic: topicId, feedback };
    const list: FeedbackData = {
      version: 1,
      entries: [
        {
          id: `feedback-${now.replace(/\D/g, "")}`,
          topic: topicId,
          rating: feedback,
          reason: reason.trim(),
          comment: comment.trim(),
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
      <label className="feedback-detail-field">상세 사유<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">선택하지 않음</option><option value="내용이 너무 일반적임">내용이 너무 일반적임</option><option value="같은 말이 반복됨">같은 말이 반복됨</option><option value="사주 정보가 잘못됨">사주 정보가 잘못됨</option><option value="질문에 답하지 않음">질문에 답하지 않음</option><option value="표현이 불쾌하거나 과도함">표현이 불쾌하거나 과도함</option><option value="결제 내용과 다름">결제 내용과 다름</option><option value="기타">기타</option></select></label>
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
