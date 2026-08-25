"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { CommerceData, ConsultationData, ConsultationDraft, ConsultationSession, LibraryData, TopicId } from "@/lib/domain";
import {
  INITIAL_COMMERCE_DATA,
  INITIAL_CONSULTATION_DATA,
  INITIAL_LIBRARY_ITEMS,
  RECOMMENDED_QUESTIONS,
  TOPICS,
  getFixtureConsultationResponse,
  getTopic,
  isRestrictedConsultationQuestion,
} from "@/lib/fixtures";
import { commerceStore, consultationStore, createTransactionStep, libraryStore, runStorageTransaction } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";

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
  return { ...INITIAL_COMMERCE_DATA, orders: [], creditHistory: [] };
}

function buildLibraryWithSession(session: ConsultationSession): LibraryData | null {
  const inspection = libraryStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return null;
  const current = inspection.status === "ok" ? inspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  const withoutExisting = current.filter((item) => item.id !== `library-${session.id}`);
  return {
    version: 1,
    items: [
      {
        id: `library-${session.id}`,
        type: "consultation",
        title: session.title,
        subtitle: "기기에 저장한 예시 상담",
        createdAt: session.updatedAt,
        href: `/consult/session/${session.id}`,
        hidden: false,
      },
      ...withoutExisting,
    ],
  };
}

export function ConsultationHomeScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(consultationStore.subscribe, consultationStore.rawSnapshot, () => null);
  const commerceRaw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  if (!hydrated) return <LoadingState title="상담 내역을 확인하고 있어요" />;
  void raw;
  void commerceRaw;
  const data = getConsultationData();
  if (!data) return <CorruptState title="상담 데이터를 읽을 수 없어요" description="손상된 상담 기록을 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={consultationStore.inspect().status === "unavailable"} onReset={consultationStore.remove} />;
  const commerce = getCommerceData();
  if (!commerce) return <CorruptState title="이용권 데이터를 읽을 수 없어요" description="손상된 이용권 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  const sessions = [...data.sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <main className="screen-content consultation-home" aria-labelledby="consult-title">
      <p className="section-kicker">고민 상담</p>
      <h1 id="consult-title">지금의 고민을<br />정리해보세요</h1>
      <p className="supporting">실제 AI 상담이나 사주 계산 없이 미리 준비한 예시 답변과 기기 저장만 사용합니다.</p>
      <section className="credit-summary" aria-label="체험용 이용권 상태">
        <div><small>무료 질문</small><strong>{data.freeUsesRemaining}회</strong></div>
        <div><small>체험용 이용권</small><strong>{commerce.consultationCredits}회</strong></div>
        <p>실제 이용권이 아니며 이 브라우저에만 남는 체험 기록이에요.</p>
      </section>
      <Link className="primary-button" href="/consult/new">새 고민 정리하기</Link>
      <section className="session-section" aria-labelledby="recent-session-title">
        <h2 id="recent-session-title">최근 상담</h2>
        {sessions.length === 0 ? (
          <EmptyState title="저장된 상담이 없어요" description="첫 질문을 작성하면 이 기기에 상담 내역이 저장됩니다." />
        ) : (
          <div className="session-list">{sessions.map((session) => <Link href={`/consult/session/${session.id}`} key={session.id}><small>{getTopic(session.topic).title}</small><strong>{session.title}</strong><span>{session.messages.length}개 메시지 · {session.updatedAt.slice(0, 10)}</span></Link>)}</div>
        )}
      </section>
    </main>
  );
}

export function ConsultationNewScreen({ failFirstResponse }: { failFirstResponse: boolean }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="작성 중인 질문을 확인하고 있어요" />;
  const data = getConsultationData();
  if (!data) return <CorruptState title="상담 초안을 읽을 수 없어요" description="손상된 초안을 확인 없이 덮어쓰지 않습니다." unavailable={consultationStore.inspect().status === "unavailable"} onReset={consultationStore.remove} />;
  const initialDraft = data.draft ?? { topic: "career" as TopicId, question: "", situation: "" };
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

  function persistSession() {
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
    const now = new Date().toISOString();
    const id = `consult-${now.replace(/\D/g, "")}`;
    const session: ConsultationSession = {
      id,
      topic: draft.topic,
      title: draft.question.trim().slice(0, 36),
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: `${id}-user`, role: "user", content: draft.question.trim(), createdAt: now, fixture: false },
        { id: `${id}-fixture`, role: "assistant", content: getFixtureConsultationResponse(draft), createdAt: now, fixture: true },
      ],
    };
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
      creditHistory: [{ id: `credit-use-${id}`, label: "상담 예시 질문 사용", delta: -1, createdAt: now }, ...commerce.creditHistory],
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
    router.push(`/consult/session/${id}`);
  }

  function generateFixture() {
    setPhase("loading");
    window.setTimeout(() => {
      if (failNext.current) {
        failNext.current = false;
        setPhase("failure");
      } else {
        persistSession();
      }
    }, 900);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.question.trim()) return setError("질문을 입력하거나 추천 질문을 선택해 주세요.");
    if (restricted) return setError("건강·수명·투자·범죄와 관련된 질문에는 확정적인 답을 제공하지 않아요.");
    generateFixture();
  }

  if (phase === "loading") {
    return <LoadingState title="체험용 예시 답변을 준비하고 있어요" />;
  }

  if (phase === "failure") {
    return (
      <section className="page-state" aria-labelledby="consult-failure-title">
        <p className="section-kicker">응답 실패</p>
        <h1 id="consult-failure-title">답변을 준비하지 못했어요</h1>
        <p className="supporting">작성한 질문과 상황은 이 기기에 그대로 남아 있어요.</p>
        <button className="primary-button state-action" type="button" onClick={generateFixture}>다시 시도</button>
        <button className="text-button" type="button" onClick={() => setPhase("compose")}>질문 수정</button>
      </section>
    );
  }

  return (
    <form className="screen-content consultation-form" onSubmit={submit} aria-labelledby="consult-form-title">
      <p className="section-kicker">새 상담</p>
      <h1 id="consult-form-title">어떤 고민을<br />정리해볼까요?</h1>
      <fieldset><legend>주제</legend><div className="consult-topic-list">{TOPICS.map((topic) => <button type="button" key={topic.id} className={draft.topic === topic.id ? "selected" : undefined} aria-pressed={draft.topic === topic.id} onClick={() => updateDraft({ topic: topic.id, question: "" })}>{topic.title}</button>)}</div></fieldset>
      <section className="recommended-questions" aria-labelledby="recommended-title"><h2 id="recommended-title">추천 질문</h2>{RECOMMENDED_QUESTIONS[draft.topic].map((question) => <button type="button" key={question} onClick={() => updateDraft({ question })}>{question}</button>)}</section>
      <label><span>질문</span><textarea value={draft.question} onChange={(event) => updateDraft({ question: event.target.value })} rows={4} placeholder="궁금한 점을 적어주세요" /></label>
      <label><span>현재 상황</span><textarea value={draft.situation} onChange={(event) => updateDraft({ situation: event.target.value })} rows={4} placeholder="결정에 영향을 주는 실제 조건을 적어주세요" /></label>
      {restricted && <aside className="restricted-guidance"><strong>제한되는 질문이에요</strong><p>진단·치료·수명·투자 종목처럼 전문 판단이 필요한 내용은 확정적으로 답하지 않습니다.</p></aside>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">예시 답변 보기</button>
      <p className="action-note">실제 AI 답변 생성이나 유료 이용권 차감은 없습니다.</p>
    </form>
  );
}

export function ConsultationSessionScreen({ sessionId }: { sessionId: string }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(consultationStore.subscribe, consultationStore.rawSnapshot, () => null);
  const commerceRaw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const router = useRouter();
  const [followUp, setFollowUp] = useState("");
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

  function appendFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = followUp.trim();
    if (!question) return setError("추가 질문을 입력해 주세요.");
    if (isRestrictedConsultationQuestion(question)) return setError("전문 판단이 필요한 제한 질문에는 체험용 예시 답변을 추가하지 않아요.");
    if (activeCommerce.consultationCredits <= 0) return setError("추가 질문에 사용할 체험용 이용권이 없어요.");
    const now = new Date().toISOString();
    const messageSuffix = `${now.replace(/\D/g, "")}-${activeSession.messages.length}`;
    const response = getFixtureConsultationResponse({ topic: activeSession.topic, question, situation: "" });
    const updated: ConsultationSession = {
      ...activeSession,
      updatedAt: now,
      messages: [
        ...activeSession.messages,
        { id: `${activeSession.id}-user-${messageSuffix}`, role: "user", content: question, createdAt: now, fixture: false },
        { id: `${activeSession.id}-fixture-${messageSuffix}`, role: "assistant", content: response, createdAt: now, fixture: true },
      ],
    };
    const nextCommerce: CommerceData = {
      ...activeCommerce,
      consultationCredits: activeCommerce.consultationCredits - 1,
      creditHistory: [{ id: `credit-follow-up-${messageSuffix}`, label: "상담 예시 추가 질문 사용", delta: -1, createdAt: now }, ...activeCommerce.creditHistory],
    };
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

  return (
    <main className="screen-content consultation-session" aria-labelledby="session-title">
      <p className="section-kicker">{getTopic(session.topic).title} · 고민 상담</p>
      <h1 id="session-title">{session.title}</h1>
      <p className="supporting">실제 AI 상담이 아니며 중요한 결정은 현실 조건과 전문가 의견을 함께 확인하세요.</p>
      <div className="message-list" aria-label="상담 메시지">{session.messages.map((message) => <article key={message.id} className={message.role}><small>{message.role === "user" ? "나" : "사주리움 · 체험용 예시"}</small>{message.content.split("\n").map((paragraph) => paragraph && <p key={paragraph}>{paragraph}</p>)}</article>)}</div>
      <section className="follow-up-suggestions"><h2>이어볼 질문</h2>{RECOMMENDED_QUESTIONS[session.topic].slice(0, 2).map((question) => <button type="button" key={question} onClick={() => setFollowUp(question)}>{question}</button>)}</section>
      <form className="follow-up-form" onSubmit={appendFollowUp}><label htmlFor="follow-up">추가 질문</label><textarea id="follow-up" rows={3} value={followUp} onChange={(event) => setFollowUp(event.target.value)} /><p className="action-note">추가 질문은 체험용 이용권 1회를 사용해요 · 남은 {activeCommerce.consultationCredits}회</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">예시 답변 추가</button></form>
      {confirmDelete ? <div className="danger-confirm"><p>이 상담과 보관함 링크를 이 기기에서 삭제합니다.</p><button type="button" onClick={deleteSession}>상담 삭제 확정</button><button type="button" onClick={() => setConfirmDelete(false)}>취소</button></div> : <button className="secondary-button" type="button" onClick={() => setConfirmDelete(true)}>이 상담 삭제</button>}
    </main>
  );
}
