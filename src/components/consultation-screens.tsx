"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CommerceData, ConsultationData, ConsultationDraft, ConsultationSession, LibraryData, TopicId } from "@/lib/domain";
import { withAllowedLibraryActions } from "@/lib/contracts";
import {
  INITIAL_COMMERCE_DATA,
  INITIAL_CONSULTATION_DATA,
  INITIAL_LIBRARY_ITEMS,
  RECOMMENDED_QUESTIONS,
  isRestrictedConsultationQuestion,
} from "@/lib/fixtures";
import { commerceStore, consultationStore, createTransactionStep, libraryStore, runStorageTransaction } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { ApiRequestError } from "@/lib/api/client";
import { MarkdownBlocks, blockToPlainText, parseMarkdown, plainInline, type MarkdownBlock } from "@/lib/markdown";
import type { ChartView } from "@/lib/saju";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import { RowLink } from "./ui/layout";
import { InfoIcon, SendIcon } from "./ui/icons";
import {
  createConsultation,
  deleteConsultation,
  formatApiRequestError,
  getConsultation,
  getCredits,
  getCurrentChart,
  isAccountSessionExpired,
  listConsultations,
  sendConsultationMessage,
  submitFeedback,
  type ApiConsultation,
} from "@/lib/api/service";

const RESTRICTED_CONSULTATION_MESSAGE = "사망·질병 진단·임신·재판 결과·투자 수익·도박·타인의 속마음·외도처럼 확정을 요구하는 질문에는 확정적인 답을 제공하지 않아요. 내가 정할 수 있는 조건으로 바꿔 물어보세요.";

/** 상담 유형: 화면 라벨과 서버 consultation_type(general|love|career|wealth)의 대응. */
const TOPIC_OPTIONS: readonly { id: TopicId; label: string; help: string; server: string }[] = [
  { id: "family", label: "일반", help: "생활 전반과 가까운 사람과의 고민을 함께 정리해요.", server: "general" },
  { id: "love", label: "연애", help: "연애는 마음을 주고받는 방식과 관계의 흐름을 중심으로 읽어요.", server: "love" },
  { id: "career", label: "커리어", help: "커리어는 일하는 방식, 역할, 변화의 시기를 중심으로 읽어요.", server: "career" },
  { id: "money", label: "재물", help: "재물은 돈을 대하는 태도와 결정 기준을 중심으로 읽어요.", server: "wealth" },
];

const SERVER_TYPE_LABELS: Record<string, string> = { general: "일반", love: "연애", career: "커리어", wealth: "재물" };

function serverTypeLabel(value: string) {
  return SERVER_TYPE_LABELS[value.toLowerCase()] ?? "일반";
}

function normalizedTopic(value: string): TopicId {
  const topic = value.toLowerCase();
  if (topic === "love" || topic === "career") return topic;
  if (topic === "wealth" || topic === "money") return "money";
  return "family";
}

function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${sameYear ? "" : `${date.getFullYear()}년 `}${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function sessionTitle(item: ApiConsultation) {
  const firstUser = item.messages.find((message) => message.role === "user");
  return item.session_title ?? firstUser?.content.slice(0, 60) ?? `${serverTypeLabel(item.consultation_type)} 상담`;
}

function isInsufficientCredits(error: unknown) {
  return error instanceof ApiRequestError && error.status === 402;
}

/**
 * Splits an answer into a short plain lead and the remaining markdown blocks.
 * The lead never carries markdown syntax; the rest keeps headings, emphasis and lists.
 */
export function splitAnswer(content: string): { lead: string; rest: MarkdownBlock[] } {
  const blocks = parseMarkdown(content);
  const [first, ...others] = blocks;
  if (!first) return { lead: "", rest: [] };
  if (first.type === "heading") return { lead: blockToPlainText(first), rest: others };
  if (first.type !== "paragraph") return { lead: "", rest: blocks };
  if (first.lines.length > 1 || others.length) {
    const [leadLine, ...restLines] = first.lines;
    return { lead: plainInline(leadLine).trim(), rest: restLines.length ? [{ type: "paragraph", lines: restLines }, ...others] : others };
  }
  const text = plainInline(first.lines[0]).trim();
  const match = text.match(/^([^]+?[.!?。])\s+([^]+)$/);
  if (match && match[1].length <= 90) return { lead: match[1], rest: [{ type: "paragraph", lines: [[{ type: "text", value: match[2] }]] }] };
  return { lead: "", rest: blocks };
}

function DayPillarTile({ chart }: { chart: ChartView }) {
  const day = chart.pillars.day;
  if (!day) return null;
  return (
    <span
      aria-label={`${day.stem.ko}${day.branch.ko} 일주`}
      lang="zh-Hant"
      style={{ display: "flex", flex: "0 0 auto", width: 44, height: 56, flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "var(--sj-ink)", fontSize: 19 }}
    >
      <span className={`sj-hanja sj-el-dark-${day.stem.element}`}>{day.stem.hanja}</span>
      <span className={`sj-hanja sj-el-dark-${day.branch.element}`}>{day.branch.hanja}</span>
    </span>
  );
}

function toLocalConsultation(item: ApiConsultation, topic: TopicId): ConsultationSession {
  const firstUser = item.messages.find((message) => message.role === "user");
  const lastAssistant = [...item.messages].reverse().find((message) => message.role === "assistant");
  return {
    id: String(item.id),
    title: item.session_title ?? firstUser?.content.slice(0, 36) ?? `${serverTypeLabel(item.consultation_type)} 상담`,
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
        subtitle: "기기에 저장한 상담",
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

function CreditCard({ credits, firstTime, idPrefix }: { credits: number; firstTime: boolean; idPrefix: string }) {
  const titleId = `${idPrefix}-credit-title`;
  return (
    <section className="sj-card-dark" aria-labelledby={titleId} style={{ padding: 20, gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 id={titleId} className="sj-card-dark-text" style={{ fontWeight: 400, color: "var(--sj-on-dark-muted)" }}>남은 상담 이용권</h2>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{credits}<span style={{ fontSize: 16, marginLeft: 2 }}>회</span></p>
        </div>
        <p className="sj-card-dark-text" style={{ maxWidth: 170, fontSize: 12, textAlign: "right", color: "var(--sj-on-dark-muted)" }}>
          {firstTime ? "첫 상담 1회는 무료로 드려요. 답변이 만들어졌을 때만 차감돼요." : "답변이 만들어졌을 때만 1회씩 차감돼요."}
        </p>
      </div>
      <Link className="sj-button sj-button-block" href="/consult/new">새 상담 시작</Link>
      <Link href="/products/credits" style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--sj-accent-on-dark)", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>이용권 내역 보기</Link>
    </section>
  );
}

export function ConsultationHomeScreen() {
  const hydrated = useHydrated();
  const [liveData, setLiveData] = useState<{ sessions: ApiConsultation[]; credits: number } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void Promise.all([listConsultations(), getCredits()])
      .then(([consultations, credits]) => active && setLiveData({ sessions: consultations.items, credits: credits.balance.balance }))
      .catch((reason) => active && setLoadError(reason ?? new Error("load failed")));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!liveData && !loadError)) return <LoadingState title="지난 상담을 불러오고 있어요" />;
  if (loadError || !liveData) {
    if (isAccountSessionExpired(loadError)) return <EmptyState title="다시 로그인해 주세요" description="로그인 세션이 만료됐어요. 다시 로그인하면 지난 상담을 이어볼 수 있어요." action={{ href: "/login", label: "로그인하기" }} />;
    return <CorruptState title="상담 내역을 불러오지 못했어요" description="연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  }
  const sessions = liveData.sessions
    .filter((session) => session.status !== "DELETED")
    .sort((left, right) => (right.updated_at ?? right.created_at).localeCompare(left.updated_at ?? left.created_at));
  const firstTime = sessions.length === 0;

  return (
    <main className="sj-split" aria-labelledby="consult-title">
      <div className="sj-page">
        <section className="sj-section" style={{ gap: 8 }}>
          <h1 id="consult-title" className="sj-h1">마음에 걸리는 일을<br />한 문장으로 물어보세요</h1>
          <p className="sj-lead">내 명식과 지금 지나는 대운을 바탕으로 고민을 함께 정리해요.</p>
        </section>
        <div className="sj-mobile-only">
          <CreditCard credits={liveData.credits} firstTime={firstTime} idPrefix="mobile" />
        </div>
        <section className="sj-section" aria-labelledby="past-consult-title" style={{ gap: 4 }}>
          <h2 id="past-consult-title" className="sj-h2">지난 상담</h2>
          {sessions.length === 0 ? (
            <p className="sj-meta" style={{ paddingTop: 8 }}>아직 나눈 상담이 없어요. 첫 질문을 보내면 여기에 모여요.</p>
          ) : (
            <ul className="sj-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <RowLink
                    href={`/consult/session/${session.id}`}
                    title={sessionTitle(session)}
                    sub={<span className="sj-chips"><span className="sj-chip">{serverTypeLabel(session.consultation_type)}</span><span>{formatShortDate(session.updated_at ?? session.created_at)}</span></span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="sj-fine">해석은 생각을 정리하는 관점이에요. 건강, 법률, 투자처럼 중요한 결정은 전문가와 함께 확인하세요.</p>
      </div>
      <aside className="sj-aside sj-desktop-only" aria-label="상담 이용권">
        <CreditCard credits={liveData.credits} firstTime={firstTime} idPrefix="aside" />
      </aside>
    </main>
  );
}

export function ConsultationNewScreen({ failFirstResponse, initialTopic }: { failFirstResponse: boolean; initialTopic?: TopicId }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="작성 중인 질문을 확인하고 있어요" />;
  const data = getConsultationData();
  if (!data) return <CorruptState title="작성 중인 질문을 읽을 수 없어요" description="손상된 초안을 확인 없이 덮어쓰지 않아요." unavailable={consultationStore.inspect().status === "unavailable"} onReset={consultationStore.remove} />;
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
  const [noCredits, setNoCredits] = useState(false);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const failNext = useRef(failFirstResponse);
  const restricted = isRestrictedConsultationQuestion(draft.question);
  const topicOption = TOPIC_OPTIONS.find((option) => option.id === draft.topic) ?? TOPIC_OPTIONS[0];
  const recommended = RECOMMENDED_QUESTIONS[draft.topic] ?? [];

  useEffect(() => {
    let active = true;
    void getCurrentChart().then((value) => active && setChart(value)).catch(() => undefined);
    void getCredits().then((value) => active && setCredits(value.balance.balance)).catch(() => undefined);
    return () => { active = false; };
  }, []);

  function updateDraft(update: Partial<ConsultationDraft>) {
    const next = { ...draft, ...update };
    setDraft(next);
    setError("");
    const current = getConsultationData();
    if (!current || !consultationStore.write({ ...current, draft: next })) {
      setError("작성 중인 질문을 이 브라우저에 저장할 수 없어요.");
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
      setError("이 기기에 저장된 정보가 손상됐어요. 설정에서 기기 저장 정보를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    if (current.freeUsesRemaining <= 0 && commerce.consultationCredits <= 0) {
      setPhase("compose");
      setError("이 기기에 남은 이용권이 없어요. 설정에서 기기 저장 정보를 초기화하면 다시 확인할 수 있어요.");
      return;
    }
    let session: ConsultationSession;
    try {
      const content = draft.situation.trim() ? `${draft.question.trim()}\n\n현재 상황: ${draft.situation.trim()}` : draft.question.trim();
      session = toLocalConsultation(await createConsultation(topicOption.server, content), draft.topic);
    } catch (requestError) {
      setNoCredits(isInsufficientCredits(requestError));
      setPhase("failure");
      setError(formatApiRequestError(requestError, "답변을 만들지 못했어요."));
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
      setError("보관함 정보를 확인한 뒤 다시 시도해 주세요.");
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
      setError(transaction === "rolled-back" ? "상담을 저장하지 못해 모든 변경을 취소했어요." : "저장 복구가 필요해요. 설정에서 기기 저장 정보를 확인해 주세요.");
      return;
    }
    router.push(`/consult/session/${session.id}`);
  }

  function requestAnswer() {
    if (isRestrictedConsultationQuestion(draft.question)) {
      setPhase("compose");
      setError(RESTRICTED_CONSULTATION_MESSAGE);
      return;
    }
    setNoCredits(false);
    setPhase("loading");
    window.setTimeout(() => {
      if (failNext.current) {
        failNext.current = false;
        setError("");
        setPhase("failure");
      } else {
        void persistSession();
      }
    }, 900);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.question.trim()) return setError("질문을 입력하거나 추천 질문을 골라 주세요.");
    if (restricted) return setError(RESTRICTED_CONSULTATION_MESSAGE);
    requestAnswer();
  }

  if (phase === "loading") {
    return <LoadingState title="답변을 만들고 있어요" />;
  }

  if (phase === "failure") {
    return (
      <section className="sj-state" aria-labelledby="consult-failure-title">
        <h1 id="consult-failure-title" className="sj-h1">{noCredits ? "남은 상담 이용권이 없어요" : "답변을 만들지 못했어요"}</h1>
        <p className="sj-lead">{noCredits ? "결제는 준비 중이라 지금은 이용권을 더 받을 수 없어요. 작성한 질문은 이 기기에 그대로 남아 있어요." : "작성한 질문과 상황은 이 기기에 그대로 남아 있어요. 이용권은 차감되지 않았어요."}</p>
        {error && <p className="sj-error" role="alert">{error}</p>}
        <div className="sj-actions" style={{ marginTop: 16 }}>
          {noCredits
            ? <Link className="sj-button sj-button-block" href="/products/credits">이용권 내역 보기</Link>
            : <button className="sj-button sj-button-block" type="button" onClick={requestAnswer}>다시 시도</button>}
          <button className="sj-button-secondary" type="button" onClick={() => { setError(""); setPhase("compose"); }}>질문 수정</button>
        </div>
      </section>
    );
  }

  const day = chart?.pillars.day;

  return (
    <form className="sj-page" onSubmit={submit} aria-labelledby="consult-form-title" noValidate>
      <h1 id="consult-form-title" className="sj-h1">어떤 고민인가요?</h1>

      {chart && day && (
        <section className="sj-section" aria-labelledby="consult-whom-title" style={{ gap: 10 }}>
          <h2 id="consult-whom-title" className="sj-label">누구의 명식으로 볼까요</h2>
          <div className="sj-card" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12 }}>
            <DayPillarTile chart={chart} />
            <span className="sj-row-main">
              <span className="sj-row-title" style={{ fontWeight: 700 }}>내 명식</span>
              <span className="sj-row-sub">본인, {day.stem.ko}{day.branch.ko} 일주</span>
            </span>
          </div>
        </section>
      )}

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>상담 유형</legend>
        <div className="sj-segmented">
          {TOPIC_OPTIONS.map((option) => (
            <button type="button" key={option.id} className="sj-segment" aria-pressed={draft.topic === option.id} onClick={() => updateDraft({ topic: option.id, question: "" })}>{option.label}</button>
          ))}
        </div>
        <p className="sj-help">{topicOption.help}</p>
      </fieldset>

      <div className="sj-field">
        <label className="sj-label" htmlFor="consult-question">질문</label>
        {recommended.length > 0 && (
          <div className="sj-chips" role="group" aria-label="추천 질문">
            {recommended.map((question) => (
              <button className="sj-chip-button" type="button" key={question} onClick={() => updateDraft({ question })}>{question}</button>
            ))}
          </div>
        )}
        <textarea id="consult-question" className="sj-textarea" value={draft.question} onChange={(event) => updateDraft({ question: event.target.value })} rows={3} placeholder="궁금한 점을 한 문장으로 적어주세요" aria-invalid={restricted || undefined} />
      </div>

      <div className="sj-field">
        <label className="sj-label" htmlFor="consult-situation">현재 상황 <span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>(선택)</span></label>
        <textarea id="consult-situation" className="sj-textarea" value={draft.situation} onChange={(event) => updateDraft({ situation: event.target.value })} rows={3} placeholder="결정에 영향을 주는 조건을 적어주세요. 예를 들어 지금 회사에서 몇 년째인지, 무엇이 아쉬운지요." />
      </div>

      {restricted ? (
        <div className="sj-banner sj-banner-accent" role="note">
          <InfoIcon className="sj-banner-icon" />
          <div>
            <strong>제한되는 질문이에요</strong>
            <p style={{ margin: "4px 0 0" }}>사망·질병 진단·임신 여부·재판 결과·투자 수익·도박 당첨·타인의 속마음·배우자의 외도처럼 확정이 필요한 내용은 다루지 않아요. 생활 조건을 정리하거나 전문가에게 물을 질문으로 바꿔보세요.</p>
          </div>
        </div>
      ) : (
        <div className="sj-banner" role="note">
          <InfoIcon className="sj-banner-icon" />
          <p style={{ margin: 0 }}>질병 진단, 재판 결과, 투자 수익, 다른 사람의 속마음처럼 확정이 필요한 질문에는 답하지 않아요. 내가 정할 수 있는 조건으로 바꿔 물어보세요.</p>
        </div>
      )}

      <div className="sj-sticky-cta">
        {error && <p className="sj-error" role="alert">{error}</p>}
        <button className="sj-button sj-button-block" type="submit">질문 보내기</button>
        <p className="sj-fine sj-center">첫 질문은 무료예요. 이후에는 답변이 만들어졌을 때만 이용권 1회가 차감돼요.{credits !== null ? ` 지금 ${credits}회 남아 있어요.` : ""}</p>
      </div>
    </form>
  );
}

/** Quick rating under one answer. A problem report opens the full form so a reason can be chosen. */
export function AnswerFeedback({ sessionId, messageId, topic }: { sessionId: string; messageId: string; topic: TopicId }) {
  const [sent, setSent] = useState<"helpful" | "unclear" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send(rating: "helpful" | "unclear") {
    if (pending || sent) return;
    setPending(true);
    setError("");
    try {
      await submitFeedback({ type: "consultation_message", messageId }, { rating });
      setSent(rating);
    } catch (reason) {
      setError(formatApiRequestError(reason, "의견을 보내지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setPending(false);
    }
  }

  const reportHref = `/report/feedback?targetType=consultation&sessionId=${sessionId}&messageId=${messageId}&topic=${topic}&report=1`;
  return (
    <div className="sj-section" style={{ gap: 6, paddingTop: 10, borderTop: "1px solid var(--sj-track)" }}>
      <div className="sj-chips" role="group" aria-label="이 답변 평가">
        <button className="sj-chip-button" type="button" style={{ minHeight: 44 }} aria-pressed={sent === "helpful"} disabled={pending || Boolean(sent)} onClick={() => void send("helpful")}>도움됐어요</button>
        <button className="sj-chip-button" type="button" style={{ minHeight: 44 }} aria-pressed={sent === "unclear"} disabled={pending || Boolean(sent)} onClick={() => void send("unclear")}>잘 모르겠어요</button>
        <Link className="sj-chip-button" href={reportHref} style={{ minHeight: 44, textDecoration: "none", color: "var(--sj-accent)" }}>문제 신고</Link>
      </div>
      {error && <p className="sj-error" role="alert">{error}</p>}
      {sent && <p className="sj-fine" role="status">의견을 보냈어요. 처리 상태는 설정의 피드백과 신고에서 볼 수 있어요.</p>}
    </div>
  );
}

export function LiveConsultationSessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<ApiConsultation | null>(null);
  const [loadError, setLoadError] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [noCredits, setNoCredits] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    let active = true;
    void getConsultation(sessionId).then((value) => active && setSession(value)).catch((reason) => active && setLoadError(formatApiRequestError(reason, "상담을 불러오지 못했어요.")));
    void getCredits().then((value) => active && setCredits(value.balance.balance)).catch(() => undefined);
    return () => { active = false; };
  }, [sessionId]);
  if (!session && !loadError) return <LoadingState title="상담을 불러오고 있어요" />;
  if (loadError || !session) return <EmptyState title="상담을 찾을 수 없어요" description={loadError} action={{ href: "/consult", label: "상담 목록으로" }} />;

  const topic = normalizedTopic(session.consultation_type);
  const followUps = (RECOMMENDED_QUESTIONS[topic] ?? []).slice(0, 2);

  async function sendFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content) return setError("추가 질문을 입력해 주세요.");
    if (isRestrictedConsultationQuestion(content)) return setError(RESTRICTED_CONSULTATION_MESSAGE);
    setSending(true);
    setError("");
    setNoCredits(false);
    try {
      const value = await sendConsultationMessage(sessionId, content);
      setSession(value);
      setQuestion("");
      void getCredits().then((snapshot) => setCredits(snapshot.balance.balance)).catch(() => undefined);
    } catch (reason) {
      setNoCredits(isInsufficientCredits(reason));
      setError(formatApiRequestError(reason, "답변을 만들지 못했어요. 이용권은 차감되지 않았어요."));
    } finally {
      setSending(false);
    }
  }

  async function deleteLiveSession() {
    try {
      await deleteConsultation(sessionId);
      const consultationInspection = consultationStore.inspect();
      const libraryInspection = libraryStore.inspect();
      if (consultationInspection.status === "corrupt" || consultationInspection.status === "unavailable" || libraryInspection.status === "corrupt" || libraryInspection.status === "unavailable") {
        setError("상담은 삭제했지만 이 기기에 남은 연결 기록을 정리하지 못했어요.");
        return;
      }
      const consultationData = consultationInspection.status === "ok" ? consultationInspection.value : INITIAL_CONSULTATION_DATA;
      const libraryItems = libraryInspection.status === "ok" ? libraryInspection.value.items : INITIAL_LIBRARY_ITEMS;
      const transaction = runStorageTransaction([
        createTransactionStep(consultationStore, { ...consultationData, sessions: consultationData.sessions.filter((item) => item.id !== sessionId) }),
        createTransactionStep(libraryStore, { version: 1, items: libraryItems.filter((item) => item.href !== `/consult/session/${sessionId}`) }),
      ]);
      if (transaction !== "committed") {
        setError("상담은 삭제했지만 이 기기에 남은 연결 기록을 정리하지 못했어요.");
        return;
      }
      router.push("/consult");
    } catch {
      setError("상담을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="sj-page" aria-labelledby="consult-session-title" style={{ gap: 20 }}>
      <div className="sj-section" style={{ gap: 4 }}>
        <h1 id="consult-session-title" className="sj-h1" style={{ fontSize: 22 }}>{sessionTitle(session)}</h1>
        <p className="sj-meta">{serverTypeLabel(session.consultation_type)} 상담, {formatShortDate(session.created_at)}{credits !== null ? `. 남은 이용권 ${credits}회` : ""}</p>
      </div>

      {/* 답변 안 제목은 h3라서 아웃라인용 h2를 둔다. .sj-chat 자식은 말풍선·답변만 두려고 바깥에 둔다. */}
      <h2 id="consult-chat-title" className="sj-visually-hidden">상담 대화</h2>
      <section className="sj-chat" aria-labelledby="consult-chat-title">
        {session.messages.map((message) => {
          if (message.role === "user") {
            return <div key={message.id} className="sj-bubble-me"><span className="sj-visually-hidden">내 질문: </span>{message.content}</div>;
          }
          const { lead, rest } = splitAnswer(message.content);
          return (
            <article key={message.id} className="sj-answer" aria-label="사주리움의 답변">
              <span className="sj-wordmark" style={{ fontSize: 14 }}>사주리움</span>
              {lead && <p className="sj-answer-lead">{lead}</p>}
              <MarkdownBlocks blocks={rest} headingLevel={3} textStyle={{ fontSize: 14 }} />
              <AnswerFeedback sessionId={sessionId} messageId={String(message.id)} topic={topic} />
            </article>
          );
        })}
      </section>

      {followUps.length > 0 && (
        <div className="sj-chips" role="group" aria-label="이어서 물어볼 질문">
          {followUps.map((item) => <button key={item} className="sj-chip-button" type="button" onClick={() => setQuestion(item)}>{item}</button>)}
        </div>
      )}

      <div className="sj-section" style={{ gap: 8 }}>
        {confirmDelete ? (
          <div className="sj-card" role="group" aria-label="상담 삭제 확인">
            <p className="sj-body">이 상담을 삭제할까요? 삭제한 대화는 되돌릴 수 없어요.</p>
            <div className="sj-actions-row">
              <button className="sj-button-danger" type="button" onClick={() => { void deleteLiveSession(); }}>상담 삭제 확정</button>
              <button className="sj-button-secondary" type="button" onClick={() => setConfirmDelete(false)}>취소</button>
            </div>
          </div>
        ) : (
          <button className="sj-text-button" type="button" style={{ alignSelf: "flex-start", color: "var(--sj-muted)" }} onClick={() => setConfirmDelete(true)}>이 상담 삭제</button>
        )}
      </div>

      <form className="sj-composer" onSubmit={sendFollowUp} aria-label="추가 질문">
        {error && (
          <p className="sj-error" role="alert">
            {error}
            {noCredits && <> <Link href="/products/credits" style={{ color: "var(--sj-accent)", fontWeight: 700 }}>이용권 내역 보기</Link></>}
          </p>
        )}
        {sending && <p className="sj-meta" role="status">답변을 만들고 있어요</p>}
        <div className="sj-composer-row">
          <label htmlFor="consult-follow-up" className="sj-visually-hidden">추가 질문</label>
          <textarea id="consult-follow-up" className="sj-composer-input" rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="이어서 물어보세요" />
          <button className="sj-send" type="submit" aria-label="보내기" disabled={sending || !question.trim()}><SendIcon /></button>
        </div>
        <p className="sj-fine sj-center" style={{ fontSize: 11 }}>답변이 만들어졌을 때만 이용권 1회가 차감돼요</p>
      </form>
    </main>
  );
}
