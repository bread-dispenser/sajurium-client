"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { CommerceData, ConsultationData, ConsultationDraft, ConsultationSession, LibraryData, TopicId } from "@/lib/domain";
import { withAllowedLibraryActions } from "@/lib/contracts";
import {
  INITIAL_COMMERCE_DATA,
  INITIAL_CONSULTATION_DATA,
  INITIAL_LIBRARY_ITEMS,
  RECOMMENDED_QUESTIONS,
  TOPICS,
  getTopic,
  isRestrictedConsultationQuestion,
} from "@/lib/fixtures";
import { commerceStore, consultationStore, createTransactionStep, libraryStore, runStorageTransaction } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import styles from "./saas-core-rollout.module.css";
import { createConsultation, deleteConsultation, getConsultation, getCredits, listConsultations, sendConsultationMessage, type ApiConsultation } from "@/lib/api/service";

const RESTRICTED_CONSULTATION_MESSAGE = "사망·질병 진단·임신·재판 결과·투자 수익·도박·타인의 속마음·외도처럼 확정을 요구하는 질문에는 확정적인 답을 제공하지 않아요. 안전한 질문으로 바꿔 주세요.";

function toLocalConsultation(item: ApiConsultation, topic: TopicId): ConsultationSession {
  const firstUser = item.messages.find((message) => message.role === "user");
  const lastAssistant = [...item.messages].reverse().find((message) => message.role === "assistant");
  return {
    id: String(item.id),
    title: item.session_title ?? firstUser?.content.slice(0, 36) ?? `${getTopic(topic).title} 상담`,
    status: item.status === "DELETED" ? "deleted" : item.status === "ACTIVE" ? "active" : "completed",
    context: {
      profileId: String(item.profile_id ?? ""),
      chartSnapshotId: "latest-snapshot",
      periodKey: item.created_at.slice(0, 7),
      topic,
      situation: null,
      referencedProfileIds: [],
    },
    createdAt: item.created_at,
    updatedAt: item.updated_at ?? item.created_at,
    summary: lastAssistant?.content ?? "답변을 준비하고 있어요.",
    messages: item.messages.map((message) => ({
      id: String(message.id),
      role: message.role === "user" ? "user" : "assistant",
      status: "completed",
      content: message.content,
      createdAt: message.created_at,
      completedAt: message.created_at,
      provenance: null,
    })),
  };
}

function normalizedTopic(value: string): TopicId {
  const topic = value.toLowerCase();
  return topic === "love" || topic === "money" || topic === "family" ? topic : "career";
}

function getConsultationData(): ConsultationData | null {
  const inspection = consultationStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return {
    ...INITIAL_CONSULTATION_DATA,
    sessions: [],
  };
}

function getCommerceData(): CommerceData | null {
  const inspection = commerceStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return { ...INITIAL_COMMERCE_DATA, orders: [], generations: [], creditHistory: [] };
}

function buildLibraryWithSession(session: ConsultationSession): LibraryData | null {
  const inspection = libraryStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return null;
  const current = inspection.status === "ok" ? inspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  const withoutExisting = current.filter((item) => item.id !== `library-${session.id}`);
  return {
    version: 1,
    items: [
      withAllowedLibraryActions({
        id: `library-${session.id}`,
        type: "consultation",
        title: session.title,
        subtitle: "기기에 저장한 예시 상담",
        createdAt: session.updatedAt,
        href: `/consult/session/${session.id}`,
        access: "available",
        purchased: false,
        read: false,
        hidden: false,
        profile: { id: session.context.profileId, displayName: "서연" },
        topic: session.context.topic,
      }),
      ...withoutExisting,
    ],
  };
}

export function ConsultationHomeScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(consultationStore.subscribe, consultationStore.rawSnapshot, () => null);
  const commerceRaw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [liveData, setLiveData] = useState<{ sessions: ConsultationSession[]; credits: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void Promise.all([listConsultations(), getCredits()])
      .then(([consultations, credits]) => active && setLiveData({
        sessions: consultations.items.map((item) => toLocalConsultation(item, normalizedTopic(item.consultation_type))),
        credits: credits.balance.balance,
      }))
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!liveData && !loadError)) return <LoadingState title="서버 상담 내역을 확인하고 있어요" />;
  void raw;
  void commerceRaw;
  if (loadError || !liveData) return <CorruptState title="상담 서버에 연결할 수 없어요" description="백엔드 연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  const sessions = [...liveData.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <main className={`screen-content consultation-home signal-screen signal-consultation-home ${styles.scope}`} aria-labelledby="consult-title">
      <div className="signal-hero consultation-hero">
        <p className="section-kicker signal-kicker">고민 상담</p>
        <h1 id="consult-title">마음에 걸리는 일을<br />한 문장으로</h1>
        <p className="supporting">사주 기록을 바탕으로 고민을 함께 풀어요. 첫 상담 1회는 무료예요.</p>
      </div>
      <section className="credit-summary signal-panel signal-credit-panel" aria-label="남은 상담 이용권">
        <div className="signal-credit-item"><small>첫 질문</small><strong>무료</strong></div>
        <div className="signal-credit-item"><small>상담 이용권</small><strong>{liveData.credits}회</strong></div>
        <p><strong>서버 원장 잔액 {liveData.credits}회</strong> · 성공한 후속 답변에만 차감돼요.</p>
        <Link className="text-button signal-action signal-credit-action" href="/products/credits">이용권 확인</Link>
      </section>
      <section className="session-section signal-section signal-topic-actions" aria-labelledby="consult-topic-title">
        <h2 id="consult-topic-title">어떤 고민인가요?</h2>
        <div className="signal-row-list">
          {TOPICS.map((topic) => (
            <Link className="signal-row signal-topic-row" href={`/consult/new?topic=${topic.id}`} key={topic.id}>
              <span className="signal-row-copy"><strong>{topic.title}</strong><small>{topic.description}</small></span>
              <span className="signal-row-arrow" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>
      <Link className="primary-button signal-action signal-primary-action" href="/consult/new">새 상담 시작하기</Link>
      <section className="session-section signal-section signal-session-history" aria-labelledby="recent-session-title">
        <h2 id="recent-session-title">최근 상담</h2>
        {sessions.length === 0 ? (
          <EmptyState title="저장된 상담이 없어요" description="첫 질문을 작성하면 익명 세션 또는 계정에 상담 내역이 저장됩니다." />
        ) : (
          <div className="session-list signal-row-list">{sessions.map((session) => <Link className="signal-row signal-session-row" href={`/consult/session/${session.id}`} key={session.id}><span className="signal-row-copy"><small>{getTopic(session.context.topic as TopicId).title} · {session.status}</small><strong>{session.title}</strong><span>{session.messages.length}개 메시지 · {session.updatedAt.slice(0, 10)}</span></span><span className="signal-row-arrow" aria-hidden="true">›</span></Link>)}</div>
        )}
      </section>
    </main>
  );
}

export function ConsultationNewScreen({ failFirstResponse, initialTopic }: { failFirstResponse: boolean; initialTopic?: TopicId }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="작성 중인 질문을 확인하고 있어요" />;
  const data = getConsultationData();
  if (!data) return <CorruptState title="상담 초안을 읽을 수 없어요" description="손상된 초안을 확인 없이 덮어쓰지 않습니다." unavailable={consultationStore.inspect().status === "unavailable"} onReset={consultationStore.remove} />;
  const initialDraft = data.draft
    ? { ...data.draft, topic: initialTopic ?? data.draft.topic }
    : { topic: initialTopic ?? ("career" as TopicId), question: "", situation: "" };
  return <ConsultationComposer key={JSON.stringify(initialDraft)} initialDraft={initialDraft} failFirstResponse={failFirstResponse} />;
}

function ConsultationComposer({ initialDraft, failFirstResponse }: { initialDraft: ConsultationDraft; failFirstResponse: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [phase, setPhase] = useState<"compose" | "loading" | "failure">("compose");
  const [error, setError] = useState("");
  const failNext = useRef(failFirstResponse);
  const restricted = isRestrictedConsultationQuestion(draft.question);

  function updateDraft(update: Partial<ConsultationDraft>) {
    const next = { ...draft, ...update };
    setDraft(next);
    setError("");
    const current = getConsultationData();
    if (!current || !consultationStore.write({ ...current, draft: next })) {
      setError("상담 초안을 이 브라우저에 저장할 수 없어요.");
    }
  }

  async function persistSession() {
    if (isRestrictedConsultationQuestion(draft.question)) {
      setPhase("compose");
      setError(RESTRICTED_CONSULTATION_MESSAGE);
      return;
    }
    const current = getConsultationData();
    const commerce = getCommerceData();
    if (!current || !commerce) {
      setPhase("compose");
      setError("손상된 기기 저장 정보를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    if (current.freeUsesRemaining <= 0 && commerce.consultationCredits <= 0) {
      setPhase("compose");
      setError("체험용 이용권이 남아 있지 않아요. 설정에서 기기 저장 정보를 초기화하면 다시 확인할 수 있어요.");
      return;
    }
    let session: ConsultationSession;
    try {
      const content = draft.situation.trim() ? `${draft.question.trim()}\n\n현재 상황: ${draft.situation.trim()}` : draft.question.trim();
      session = toLocalConsultation(await createConsultation(draft.topic.toUpperCase(), content), draft.topic);
    } catch (requestError) {
      setPhase("failure");
      setError(requestError instanceof Error ? requestError.message : "상담 서버가 답변을 만들지 못했어요.");
      return;
    }
    const nextData: ConsultationData = {
      ...current,
      draft: null,
      sessions: [session, ...current.sessions],
      freeUsesRemaining: Math.max(0, current.freeUsesRemaining - 1),
    };
    const usesPaidCredit = current.freeUsesRemaining <= 0;
    const nextCommerce: CommerceData = usesPaidCredit ? {
      ...commerce,
      consultationCredits: commerce.consultationCredits - 1,
      creditHistory: [{ id: `credit-use-${session.id}`, description: "상담 질문 사용", delta: -1, balanceAfter: commerce.consultationCredits - 1, source: "consultation", sourceId: session.id, reason: "consultation_use", createdAt: session.updatedAt }, ...commerce.creditHistory],
    } : commerce;
    const nextLibrary = buildLibraryWithSession(session);
    if (!nextLibrary) {
      setPhase("compose");
      setError("보관함 데이터를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    const steps = [
      ...(usesPaidCredit ? [createTransactionStep(commerceStore, nextCommerce)] : []),
      createTransactionStep(consultationStore, nextData),
      createTransactionStep(libraryStore, nextLibrary),
    ];
    const transaction = runStorageTransaction(steps);
    if (transaction !== "committed") {
      setPhase("compose");
      setError(transaction === "rolled-back" ? "상담 저장에 실패해 모든 변경을 취소했어요." : "저장 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
      return;
    }
    router.push(`/consult/session/${session.id}`);
  }

  function generateFixture() {
    if (isRestrictedConsultationQuestion(draft.question)) {
      setPhase("compose");
      setError(RESTRICTED_CONSULTATION_MESSAGE);
      return;
    }
    setPhase("loading");
    window.setTimeout(() => {
      if (failNext.current) {
        failNext.current = false;
        setPhase("failure");
      } else {
        void persistSession();
      }
    }, 900);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.question.trim()) return setError("질문을 입력하거나 추천 질문을 선택해 주세요.");
    if (restricted) return setError(RESTRICTED_CONSULTATION_MESSAGE);
    generateFixture();
  }

  if (phase === "loading") {
    return <LoadingState title="상담 답변을 안전하게 준비하고 있어요" />;
  }

  if (phase === "failure") {
    return (
      <section className={`page-state signal-screen signal-state ${styles.scope}`} aria-labelledby="consult-failure-title">
        <p className="section-kicker signal-kicker">응답 실패</p>
        <h1 id="consult-failure-title">답변을 준비하지 못했어요</h1>
        <p className="supporting">작성한 질문과 상황은 이 기기에 그대로 남아 있어요.</p>
        <button className="primary-button state-action signal-action" type="button" onClick={generateFixture}>다시 시도</button>
        <button className="text-button signal-action" type="button" onClick={() => setPhase("compose")}>질문 수정</button>
      </section>
    );
  }

  return (
    <form className={`screen-content consultation-form signal-screen signal-consultation-form ${styles.scope}`} onSubmit={submit} aria-labelledby="consult-form-title">
      <div className="signal-hero consultation-form-hero">
        <p className="section-kicker signal-kicker">새 상담</p>
        <h1 id="consult-form-title">마음에 걸리는 일을<br />한 문장으로</h1>
        <p className="supporting">주제를 고르고 지금의 조건을 적어보세요.</p>
      </div>
      <fieldset className="signal-panel signal-topic-picker">
        <legend>어떤 고민인가요?</legend>
        <div className="consult-topic-list signal-row-list" data-slop-allow="nested-cards">
          {TOPICS.map((topic, index) => (
            <button type="button" key={topic.id} className={`signal-row signal-topic-option${draft.topic === topic.id ? " selected signal-selected" : ""}`} aria-pressed={draft.topic === topic.id} onClick={() => updateDraft({ topic: topic.id, question: "" })}>
              <span className="signal-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="signal-row-copy"><strong>{topic.title}</strong><small>{topic.description}</small></span>
              <span className="signal-row-state" aria-hidden="true">{draft.topic === topic.id ? "선택됨" : ""}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <section className="recommended-questions signal-section signal-question-actions" aria-labelledby="recommended-title">
        <h2 id="recommended-title">추천 질문</h2>
        <div className="signal-row-list">
          {RECOMMENDED_QUESTIONS[draft.topic].map((question, index) => <button className="signal-row signal-question-row" type="button" key={question} onClick={() => updateDraft({ question })}><span className="signal-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="signal-row-copy"><strong>{question}</strong></span><span className="signal-row-arrow" aria-hidden="true">↗</span></button>)}
        </div>
      </section>
      <label className="signal-field" htmlFor="consult-question"><span>질문</span><textarea id="consult-question" value={draft.question} onChange={(event) => updateDraft({ question: event.target.value })} rows={4} placeholder="궁금한 점을 적어주세요" /></label>
      <label className="signal-field" htmlFor="consult-situation"><span>현재 상황</span><textarea id="consult-situation" value={draft.situation} onChange={(event) => updateDraft({ situation: event.target.value })} rows={4} placeholder="결정에 영향을 주는 조건을 적어주세요" /></label>
      {restricted && <aside className="restricted-guidance signal-evidence signal-safety-note"><strong>제한되는 질문이에요</strong><p>사망·질병 진단·임신 여부·재판 결과·투자 수익·도박 당첨·타인의 속마음·배우자의 외도처럼 확정이 필요한 내용은 다루지 않아요. 생활 조건을 정리하거나 전문가에게 물을 질문으로 바꿔보세요.</p></aside>}
      {error && <p className="form-error signal-error" role="alert">{error}</p>}
      <button className="primary-button signal-action signal-primary-action" type="submit">상담 답변 보기</button>
      <p className="action-note signal-evidence">첫 질문은 무료이며, 이후 답변이 성공한 경우에만 서버 이용권이 차감됩니다.</p>
    </form>
  );
}

export function ConsultationSessionScreen({ sessionId }: { sessionId: string }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(consultationStore.subscribe, consultationStore.rawSnapshot, () => null);
  const commerceRaw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const router = useRouter();
  const [followUp, setFollowUp] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!hydrated) return <LoadingState title="상담 내용을 불러오고 있어요" />;
  void raw;
  void commerceRaw;
  const data = getConsultationData();
  if (!data) return <CorruptState title="상담 데이터를 읽을 수 없어요" description="손상된 상담 기록을 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={consultationStore.inspect().status === "unavailable"} onReset={consultationStore.remove} />;
  const commerce = getCommerceData();
  if (!commerce) return <CorruptState title="이용권 데이터를 읽을 수 없어요" description="손상된 이용권 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  const activeData: ConsultationData = data;
  const activeCommerce: CommerceData = commerce;
  const session = data.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return <EmptyState title="상담을 찾을 수 없어요" description="이 기기에서 삭제됐거나 다른 브라우저에 저장된 상담일 수 있어요." action={{ href: "/consult", label: "상담 목록으로" }} />;
  const activeSession = session;

  async function appendFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = followUp.trim();
    if (!question) return setError("추가 질문을 입력해 주세요.");
    if (isRestrictedConsultationQuestion(question)) return setError(RESTRICTED_CONSULTATION_MESSAGE);
    let updated: ConsultationSession;
    let balance: number;
    try {
      updated = toLocalConsultation(await sendConsultationMessage(activeSession.id, question), activeSession.context.topic as TopicId);
      balance = (await getCredits()).balance.balance;
    } catch (requestError) {
      return setError(requestError instanceof Error ? requestError.message : "추가 답변을 만들지 못했어요.");
    }
    const nextCommerce: CommerceData = { ...activeCommerce, consultationCredits: balance };
    const nextData: ConsultationData = { ...activeData, sessions: activeData.sessions.map((candidate) => candidate.id === activeSession.id ? updated : candidate) };
    const nextLibrary = buildLibraryWithSession(updated);
    if (!nextLibrary) return setError("보관함 데이터를 확인한 뒤 다시 시도해 주세요.");
    const transaction = runStorageTransaction([
      createTransactionStep(commerceStore, nextCommerce),
      createTransactionStep(consultationStore, nextData),
      createTransactionStep(libraryStore, nextLibrary),
    ]);
    if (transaction !== "committed") return setError(transaction === "rolled-back" ? "추가 질문 저장에 실패해 이용권과 상담 변경을 모두 취소했어요." : "저장 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
    setFollowUp("");
    setError("");
  }

  function deleteSession() {
    const libraryInspection = libraryStore.inspect();
    if (libraryInspection.status === "corrupt" || libraryInspection.status === "unavailable") return setError("보관함 데이터를 확인한 뒤 다시 시도해 주세요.");
    const nextData: ConsultationData = { ...activeData, sessions: activeData.sessions.filter((candidate) => candidate.id !== activeSession.id) };
    const currentItems = libraryInspection.status === "ok" ? libraryInspection.value.items : [...INITIAL_LIBRARY_ITEMS];
    const nextLibrary = { version: 1 as const, items: currentItems.filter((item) => item.id !== `library-${activeSession.id}`) };
    const transaction = runStorageTransaction([
      createTransactionStep(consultationStore, nextData),
      createTransactionStep(libraryStore, nextLibrary),
    ]);
    if (transaction !== "committed") return setError(transaction === "rolled-back" ? "상담 삭제에 실패해 모든 변경을 취소했어요." : "삭제 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
    router.push("/consult");
  }

  function renameSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = titleDraft.trim();
    if (!title) return setError("새 상담 제목을 입력해 주세요.");
    const now = new Date().toISOString();
    const renamed = { ...activeSession, title, updatedAt: now };
    const nextData: ConsultationData = { ...activeData, sessions: activeData.sessions.map((candidate) => candidate.id === activeSession.id ? renamed : candidate) };
    const nextLibrary = buildLibraryWithSession(renamed);
    if (!nextLibrary) return setError("보관함 데이터를 확인한 뒤 다시 시도해 주세요.");
    const transaction = runStorageTransaction([
      createTransactionStep(consultationStore, nextData),
      createTransactionStep(libraryStore, nextLibrary),
    ]);
    if (transaction !== "committed") return setError("상담 제목을 저장하지 못했어요.");
    setTitleDraft("");
    setError("");
  }

  return (
    <main className={`screen-content consultation-session signal-screen signal-consultation-session ${styles.scope}`} aria-labelledby="session-title">
      <div className="signal-hero consultation-session-hero">
        <p className="section-kicker signal-kicker">{getTopic(session.context.topic as TopicId).title} · 상담</p>
        <h1 id="session-title">{session.title}</h1>
        <p className="supporting">사주 기록을 바탕으로 한 체험용 예시예요. 중요한 결정은 현실 조건과 전문가 의견을 함께 확인하세요.</p>
      </div>
      <aside className="check-list signal-evidence" aria-label="상담 결과 기준">
        <strong>체험용 예시</strong>
        <p>점수나 확정 답이 아닌, 질문을 정리하는 관점이에요.</p>
        <details>
          <summary>결과 기준 보기</summary>
          <dl className="signal-evidence-list">
            <div><dt>프로필</dt><dd>{session.context.profileId}</dd></div>
            <div><dt>차트 기록</dt><dd>{session.context.chartSnapshotId}</dd></div>
            <div><dt>기간</dt><dd>{session.context.periodKey}</dd></div>
            <div><dt>참조 프로필</dt><dd>{session.context.referencedProfileIds.length ? session.context.referencedProfileIds.join(", ") : "없음"}</dd></div>
          </dl>
        </details>
      </aside>
      <form className="follow-up-form signal-panel signal-title-form" onSubmit={renameSession}>
        <label className="signal-field" htmlFor="session-title-edit">상담 제목 바꾸기</label>
        <div className="signal-inline-action">
          <input id="session-title-edit" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder={session.title} />
          <button className="signal-action" type="submit">제목 저장</button>
        </div>
      </form>
      <section className="message-list signal-chat" aria-labelledby="session-chat-title">
        <h2 id="session-chat-title">오늘의 대화</h2>
        {session.messages.map((message) => <article key={message.id} className={`${message.role} signal-chat-message signal-chat-${message.role}`}><small>{message.role === "user" ? "나" : "사주리움 · 체험용 예시"} · {message.status}</small><div className="signal-chat-copy">{message.content?.split("\n").map((paragraph) => paragraph && <p key={paragraph}>{paragraph}</p>)}</div></article>)}
      </section>
      <section className="follow-up-suggestions signal-section signal-question-actions" aria-labelledby="follow-up-suggestions-title">
        <h2 id="follow-up-suggestions-title">이어볼 질문</h2>
        <div className="signal-row-list">{RECOMMENDED_QUESTIONS[session.context.topic as TopicId].slice(0, 2).map((question, index) => <button className="signal-row signal-question-row" type="button" key={question} onClick={() => setFollowUp(question)}><span className="signal-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="signal-row-copy"><strong>{question}</strong></span><span className="signal-row-arrow" aria-hidden="true">↗</span></button>)}</div>
      </section>
      <form className="follow-up-form signal-panel signal-follow-up-form" onSubmit={appendFollowUp}>
        <label className="signal-field" htmlFor="follow-up">추가 질문</label>
        <textarea id="follow-up" rows={3} value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="이어서 물어보세요" />
        <p className="action-note signal-evidence">추가 질문 1회 사용 · 남은 상담 이용권 {activeCommerce.consultationCredits}회</p>
        {error && <p className="form-error signal-error" role="alert">{error}</p>}
        <button className="primary-button signal-action signal-primary-action" type="submit">예시 답변 추가</button>
      </form>
      {confirmDelete ? <div className="danger-confirm signal-danger"><p>이 상담과 보관함 링크를 이 기기에서 삭제합니다.</p><button className="signal-action" type="button" onClick={deleteSession}>상담 삭제 확정</button><button className="signal-action" type="button" onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className="secondary-button signal-action signal-destructive-action" type="button" onClick={() => setConfirmDelete(true)}>이 상담 삭제</button>}
    </main>
  );
}

export function LiveConsultationSessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<ApiConsultation | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { void getConsultation(sessionId).then(setSession).catch((reason) => setError(reason instanceof Error ? reason.message : "상담을 불러오지 못했어요.")); }, [sessionId]);
  if (!session && !error) return <LoadingState title="서버 상담을 불러오고 있어요" />;
  if (error) return <EmptyState title="상담을 찾을 수 없어요" description={error} action={{ href: "/consult", label: "상담 목록" }} />;

  async function deleteLiveSession() {
    try {
      await deleteConsultation(sessionId);
      const consultationInspection = consultationStore.inspect();
      const libraryInspection = libraryStore.inspect();
      if (consultationInspection.status === "corrupt" || consultationInspection.status === "unavailable" || libraryInspection.status === "corrupt" || libraryInspection.status === "unavailable") {
        setError("서버 상담은 삭제했지만 이 기기의 연결 기록을 정리하지 못했어요.");
        return;
      }
      const consultationData = consultationInspection.status === "ok" ? consultationInspection.value : INITIAL_CONSULTATION_DATA;
      const libraryItems = libraryInspection.status === "ok" ? libraryInspection.value.items : INITIAL_LIBRARY_ITEMS;
      const transaction = runStorageTransaction([
        createTransactionStep(consultationStore, { ...consultationData, sessions: consultationData.sessions.filter((item) => item.id !== sessionId) }),
        createTransactionStep(libraryStore, { version: 1, items: libraryItems.filter((item) => item.href !== `/consult/session/${sessionId}`) }),
      ]);
      if (transaction !== "committed") {
        setError("서버 상담은 삭제했지만 이 기기의 연결 기록 정리가 완료되지 않았어요.");
        return;
      }
      router.push("/consult");
    } catch {
      setError("삭제하지 못했어요.");
    }
  }
  return (
    <main className={`screen-content consultation-session ${styles.scope}`} aria-labelledby="consult-session-title">
      <p className="section-kicker">서버 상담</p>
      <h1 id="consult-session-title">{session?.session_title ?? "상담 기록"}</h1>
      <section className="message-list">{session?.messages.map((message) => <article key={message.id} className={message.role}><small>{message.role === "user" ? "나" : "사주리움"}</small><p>{message.content}</p></article>)}</section>
      <form className="follow-up-form" onSubmit={(event) => { event.preventDefault(); if (!question.trim()) return; void sendConsultationMessage(sessionId, question).then((value) => { setSession(value); setQuestion(""); }).catch((reason) => setError(reason instanceof Error ? reason.message : "답변을 만들지 못했어요.")); }}>
        <label>추가 질문<textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
        <button className="primary-button" type="submit">서버 답변 요청</button>
      </form>
      {confirmDelete ? (
        <div className="danger-confirm">
          <p>이 상담을 서버 기록에서 삭제할까요?</p>
          <button type="button" onClick={() => { void deleteLiveSession(); }}>상담 삭제 확정</button>
          <button type="button" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      ) : <button className="secondary-button" type="button" onClick={() => setConfirmDelete(true)}>이 상담 삭제</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}
