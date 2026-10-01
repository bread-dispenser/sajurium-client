"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import { parseBirthDate } from "@/lib/contracts";
import type { FeedbackEntry, FeedbackReason } from "@/lib/domain";
import { FEEDBACK_OPTIONS, INITIAL_BIRTH, getTopic } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import { readServerJourney } from "@/lib/api/service";
import {
  birthDraftStore,
  clearAllOwnedStorage,
  clearCorruptStorageTransaction,
  clearOwnedStorage,
  commerceStore,
  compatibilityStore,
  consultationStore,
  createTransactionStep,
  feedbackListStore,
  feedbackStore,
  getOwnedStorageInventory,
  inspectCurrentBirth,
  inspectStorageTransaction,
  libraryStore,
  peopleStore,
  profileStore,
  reportStore,
  resetBirthSource,
  runStorageTransaction,
  saveProfileAndClearBirthDraft,
  settingsStore,
} from "@/lib/storage";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import { NotificationPreferencesGroup } from "./account-notification-screens";
import { ChevronIcon } from "./ui/icons";
import { GroupRowLink } from "./ui/layout";
import { downloadPrivacyExport, formatApiRequestError, requestPrivacyJob } from "@/lib/api/service";

type InventoryStatus = "ok" | "empty" | "corrupt" | "unavailable";

function DisclosureRow({ title, sub, value, expanded, controls, onToggle }: { title: ReactNode; sub?: ReactNode; value?: ReactNode; expanded: boolean; controls: string; onToggle: () => void }) {
  return (
    <button className="sj-row-in-group" type="button" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      <span className="sj-row-main">
        <span className="sj-row-title">{title}</span>
        {sub && <span className="sj-row-sub">{sub}</span>}
      </span>
      {value && <span className="sj-row-value">{value}</span>}
      <ChevronIcon className="sj-chevron" style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 160ms" }} />
    </button>
  );
}

function calendarLabel(calendar: string, leapMonth: boolean) {
  if (calendar === "solar") return "양력";
  return leapMonth ? "음력 윤달" : "음력";
}

export function SettingsScreen() {
  const hydrated = useHydrated();
  const settingsRaw = useSyncExternalStore(settingsStore.subscribe, settingsStore.rawSnapshot, () => null);
  const peopleRaw = useSyncExternalStore(peopleStore.subscribe, peopleStore.rawSnapshot, () => null);
  const consultRaw = useSyncExternalStore(consultationStore.subscribe, consultationStore.rawSnapshot, () => null);
  const compatibilityRaw = useSyncExternalStore(compatibilityStore.subscribe, compatibilityStore.rawSnapshot, () => null);
  const libraryRaw = useSyncExternalStore(libraryStore.subscribe, libraryStore.rawSnapshot, () => null);
  const feedbackRaw = useSyncExternalStore(feedbackListStore.subscribe, feedbackListStore.rawSnapshot, () => null);
  const profileRaw = useSyncExternalStore(profileStore.subscribe, profileStore.rawSnapshot, () => null);
  const reportRaw = useSyncExternalStore(reportStore.subscribe, reportStore.rawSnapshot, () => null);
  const commerceRaw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const birthDraftRaw = useSyncExternalStore(birthDraftStore.subscribe, birthDraftStore.rawSnapshot, () => null);
  const feedbackSelectionRaw = useSyncExternalStore(feedbackStore.subscribe, feedbackStore.rawSnapshot, () => null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingClearId, setPendingClearId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ area: "birth" | "device"; text: string } | null>(null);
  const [birthOpen, setBirthOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  if (!hydrated) return <LoadingState title="설정을 확인하고 있어요" />;
  void settingsRaw; void peopleRaw; void consultRaw; void compatibilityRaw; void libraryRaw; void feedbackRaw; void profileRaw; void reportRaw; void commerceRaw; void birthDraftRaw; void feedbackSelectionRaw;
  const transactionState = inspectStorageTransaction();
  if (transactionState.status === "corrupt" || transactionState.status === "unavailable") {
    return <CorruptState title="저장 복구 기록을 확인해야 해요" description="손상된 복구 기록은 자동으로 지우지 않아요. 기기 저장 정보는 그대로 둔 채 복구 기록만 초기화할 수 있어요." unavailable={transactionState.status === "unavailable"} onReset={clearCorruptStorageTransaction} />;
  }
  const settingsInspection = settingsStore.inspect();
  if (settingsInspection.status === "corrupt" || settingsInspection.status === "unavailable") {
    return <CorruptState title="환경설정을 읽을 수 없어요" description="손상된 설정을 확인 없이 기본값으로 바꾸지 않아요." unavailable={settingsInspection.status === "unavailable"} onReset={settingsStore.remove} />;
  }
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않아요." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const inventory = getOwnedStorageInventory();
  const hasUnavailableStorage = inventory.some((item) => item.status === "unavailable");
  const hasStorageProblem = hasUnavailableStorage || inventory.some((item) => item.status === "corrupt");
  const storedCount = inventory.filter((item) => item.status === "ok").length;
  const birthYear = /^\d{4}/.exec(birth.birthDate)?.[0];
  const birthSummary = `${birthYear ? `${birthYear}년생` : "생년 확인 필요"}, ${calendarLabel(birth.calendar, birth.leapMonth)}, ${birth.birthTimeUnknown || !birth.birthTime ? "태어난 시간 모름" : "태어난 시간 입력함"}`;
  const deviceExpanded = deviceOpen || hasStorageProblem;
  // 서버에 계산한 명식이 있으면 출생 정보는 서버 프로필에서 고친다. 없으면 이 기기 프로필만 고친다.
  const hasServerProfile = readServerJourney() !== null;

  function clearConsultations() {
    const inspection = libraryStore.inspect();
    if (inspection.status === "corrupt" || inspection.status === "unavailable") {
      setMessage({ area: "device", text: "보관함 데이터를 먼저 확인해 주세요." });
      return;
    }
    const current = inspection.status === "ok" ? inspection.value : { version: 1 as const, items: [] };
    const next = { version: 1 as const, items: current.items.filter((item) => item.type !== "consultation") };
    const transaction = runStorageTransaction([
      createTransactionStep(consultationStore, null),
      createTransactionStep(libraryStore, next),
    ]);
    if (transaction === "committed") setMessage({ area: "device", text: "상담과 연결된 보관함 항목을 삭제했어요." });
    else setMessage({ area: "device", text: transaction === "rolled-back" ? "상담 삭제에 실패해 모든 변경을 취소했어요." : "삭제 복구가 필요해요. 기기 저장 정보를 확인해 주세요." });
  }

  function clearInventoryItem(id: string, status: InventoryStatus) {
    if (status === "unavailable") {
      window.location.reload();
      return;
    }
    if (hasUnavailableStorage) {
      setMessage({ area: "device", text: "확인할 수 없는 저장소가 있어 삭제를 멈췄어요." });
      return;
    }
    if (id === "consultations") {
      clearConsultations();
      return;
    }
    setMessage({ area: "device", text: clearOwnedStorage(id) ? "선택한 기기 저장 정보를 삭제했어요." : "선택한 기기 저장 정보를 삭제하지 못했어요." });
  }

  function saveBirth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const birthDate = String(form.get("birthDate") ?? "");
    const birthTime = String(form.get("birthTime") ?? "");
    const birthTimeUnknown = form.get("birthTimeUnknown") === "on";
    const validDate = parseBirthDate(birthDate, new Date(), birth.calendar) !== null;
    if (!displayName || !validDate) return setMessage({ area: "birth", text: "이름과 실제 존재하는 생년월일을 입력해 주세요." });
    const [hour, minute] = birthTime.split(":").map(Number);
    const validTime = /^\d{2}:\d{2}$/.test(birthTime) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    if (!birthTimeUnknown && !validTime) return setMessage({ area: "birth", text: "출생 시간을 HH:mm 형식으로 입력하거나 ‘출생 시간을 몰라요’를 선택해 주세요." });
    const profile = { version: 1 as const, birth: { ...birth, displayName, birthDate, birthTime: birthTimeUnknown ? null : birthTime, birthTimeUnknown } };
    const transaction = saveProfileAndClearBirthDraft(profile);
    if (transaction === "committed") setMessage({ area: "birth", text: "출생 정보를 이 기기에 저장했어요." });
    else setMessage({ area: "birth", text: transaction === "rolled-back" ? "출생 정보 저장에 실패해 변경을 취소했어요." : "저장 복구가 필요해요. 기기 저장 정보를 확인해 주세요." });
  }

  function clearAllLocalData() {
    if (hasUnavailableStorage) {
      setMessage({ area: "device", text: "확인할 수 없는 저장소가 있어 전체 삭제를 멈췄어요." });
      return;
    }
    const result = clearAllOwnedStorage();
    if (!result.success) {
      setMessage({ area: "device", text: `일부 기기 저장 정보를 삭제하지 못했어요: ${result.failedIds.join(", ")}` });
      return;
    }
    setConfirmClear(false);
    setMessage({ area: "device", text: "사주리움이 만든 기기 저장 정보를 모두 삭제했어요." });
  }

  return (
    <main className="sj-page" aria-labelledby="settings-title">
      <h1 id="settings-title" className="sj-visually-hidden">설정과 데이터</h1>

      <section className="sj-section" aria-label="내 프로필">
        <div className="sj-card" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
          <span className="sj-initial-tile" aria-hidden="true">{Array.from(birth.displayName)[0] ?? "나"}</span>
          <div className="sj-row-main">
            <span className="sj-h2">{birth.displayName}</span>
            <span className="sj-meta">{birthSummary}</span>
          </div>
        </div>
        <Link className="sj-button-secondary" href="/login">계정 만들고 기록 옮기기</Link>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-me-title">
        <h2 id="settings-me-title" className="sj-group-title">내 정보</h2>
        <div className="sj-group">
          {hasServerProfile ? (
            <GroupRowLink href="/profile" title="출생 정보 수정" sub="바꾸면 새 명식으로 다시 계산해요" />
          ) : (
            <DisclosureRow title="출생 정보 수정" sub="이 기기에 저장된 프로필" expanded={birthOpen} controls="settings-birth-panel" onToggle={() => setBirthOpen((value) => !value)} />
          )}
          {!hasServerProfile && birthOpen && (
            <div id="settings-birth-panel" style={{ padding: "4px 16px 20px", borderTop: "1px solid var(--sj-track)" }}>
              <form className="sj-section" style={{ gap: 18, paddingTop: 12 }} onSubmit={saveBirth} noValidate>
                <p className="sj-help">핵심 값만 여기서 바꿀 수 있어요. 양력/음력, 윤달, 출생지, 시간대, 계산 기준과 관심사는 전체 프로필에서 관리하세요.</p>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="settings-display-name">이름 또는 닉네임</label>
                  <input id="settings-display-name" className="sj-input" name="displayName" defaultValue={birth.displayName} />
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="settings-birth-date">생년월일</label>
                  <input id="settings-birth-date" className="sj-input" name="birthDate" type={birth.calendar === "lunar" ? "text" : "date"} placeholder={birth.calendar === "lunar" ? "YYYY-MM-DD (음력)" : undefined} defaultValue={birth.birthDate} />
                </div>
                <div className="sj-field">
                  <label className="sj-label" htmlFor="settings-birth-time">출생 시간</label>
                  <input id="settings-birth-time" className="sj-input" name="birthTime" type="time" defaultValue={birth.birthTime ?? ""} />
                  <label className="sj-check"><input className="sj-check-input" name="birthTimeUnknown" type="checkbox" defaultChecked={birth.birthTimeUnknown} />출생 시간을 몰라요</label>
                </div>
                <div className="sj-actions">
                  <button className="sj-button sj-button-block" type="submit">출생 정보 저장</button>
                  <Link className="sj-text-button" href="/profile" style={{ alignSelf: "center" }}>전체 프로필 관리</Link>
                </div>
                {message?.area === "birth" && <p className="sj-meta" role="status">{message.text}</p>}
              </form>
            </div>
          )}
          <GroupRowLink href="/people" title="사람 보관함" sub="궁합을 볼 사람을 저장해요" />
        </div>
      </section>

      <section id="notifications" className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-notifications-title">
        <h2 id="settings-notifications-title" className="sj-group-title">알림</h2>
        <NotificationPreferencesGroup />
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>받은 알림은 <Link href="/notifications">알림함</Link>에서 볼 수 있어요.</p>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-usage-title">
        <h2 id="settings-usage-title" className="sj-group-title">이용 내역</h2>
        <div className="sj-group">
          <GroupRowLink href="/products/credits" title="상담 이용권" sub="남은 이용권과 사용 내역" />
          <GroupRowLink href="/billing" title="주문과 환불 내역" />
          <GroupRowLink href="/share/links" title="공유 링크 관리" />
        </div>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-privacy-title">
        <h2 id="settings-privacy-title" className="sj-group-title">개인정보와 안내</h2>
        <nav className="sj-group" aria-label="개인정보와 안내">
          <GroupRowLink href="/settings/privacy" title="내 데이터 내려받기와 삭제" />
          <GroupRowLink href="/settings/feedback" title="피드백과 신고" sub="이 기기에 저장된 평가와 신고" />
          <GroupRowLink href="/settings/about-ai" title="AI 해석은 이렇게 만들어져요" />
          <GroupRowLink href="/settings/safety" title="안전한 이용 안내" />
          <GroupRowLink href="/settings/terms" title="이용약관" />
        </nav>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-account-title">
        <h2 id="settings-account-title" className="sj-group-title">계정</h2>
        <div className="sj-group">
          <GroupRowLink href="/account" title="계정과 데이터 관리" sub="로그아웃, 계정 삭제" />
        </div>
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>서버 계정 삭제 요청과 이 브라우저의 기기 기록 삭제는 서로 다른 작업이에요. 계정 데이터는 계정 화면에서, 기기 기록은 아래에서 따로 지울 수 있어요.</p>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="settings-device-title">
        <h2 id="settings-device-title" className="sj-group-title">이 기기</h2>
        <div className="sj-group">
          <DisclosureRow title="이 기기에 저장된 정보" sub="이 브라우저에만 남아 있는 기록과 설정" value={hasStorageProblem ? "확인 필요" : `${storedCount}개 항목`} expanded={deviceExpanded} controls="settings-device-panel" onToggle={() => setDeviceOpen((value) => !value)} />
        </div>
        {deviceExpanded && (
          <div id="settings-device-panel" className="sj-section" style={{ paddingTop: 12 }}>
            <ul className="sj-list" aria-label="기기 저장 정보">
              {inventory.map((item) => (
                <li className="sj-row" key={item.id} style={{ cursor: "default", flexWrap: "wrap" }}>
                  <span className="sj-row-main">
                    <span className="sj-row-title">{item.label}</span>
                    <span className="sj-row-sub">{item.scope === "session" ? "지금 열린 탭" : "이 브라우저"}</span>
                  </span>
                  <span className="sj-row-value">{item.status === "unavailable" ? "사용 불가" : item.status === "corrupt" ? "확인 필요" : `${item.count}개`}</span>
                  {pendingClearId === item.id ? (
                    <div className="sj-section" style={{ flexBasis: "100%", gap: 8 }}>
                      <p className="sj-meta">{item.label} 정보를 이 기기에서 {item.status === "corrupt" ? "초기화" : "삭제"}할까요?</p>
                      <div className="sj-actions-row">
                        <button className="sj-button-danger" type="button" onClick={() => { clearInventoryItem(item.id, item.status); setPendingClearId(null); }}>{item.status === "corrupt" ? "초기화 확정" : "삭제 확정"}</button>
                        <button className="sj-button-secondary" type="button" onClick={() => setPendingClearId(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <button className="sj-button-secondary sj-button-small" style={{ minHeight: 44, padding: "0 14px", fontSize: 14 }} type="button" onClick={() => item.status === "unavailable" ? clearInventoryItem(item.id, item.status) : setPendingClearId(item.id)} disabled={item.status === "empty" || (hasUnavailableStorage && item.status !== "unavailable")}>{item.status === "unavailable" ? "다시 확인" : item.status === "corrupt" ? "초기화" : "삭제"}</button>
                  )}
                </li>
              ))}
            </ul>
            {hasUnavailableStorage ? (
              <>
                <p id="settings-storage-unavailable" className="sj-error" role="alert">확인할 수 없는 저장소가 있어 삭제 기능을 쓸 수 없어요. 브라우저 설정을 확인한 뒤 다시 확인을 눌러 주세요.</p>
                <button className="sj-button-danger" type="button" disabled aria-describedby="settings-storage-unavailable">전체 기기 저장 정보 삭제</button>
              </>
            ) : confirmClear ? (
              <div className="sj-card">
                <p className="sj-body">사주리움이 이 기기에 만든 저장 정보를 모두 지워요. 서버 계정의 기록은 그대로 남아요.</p>
                <div className="sj-actions-row">
                  <button className="sj-button-danger" type="button" onClick={clearAllLocalData}>모두 삭제 확정</button>
                  <button className="sj-button-secondary" type="button" onClick={() => setConfirmClear(false)}>취소</button>
                </div>
              </div>
            ) : (
              <button className="sj-button-danger" type="button" onClick={() => setConfirmClear(true)}>전체 기기 저장 정보 삭제</button>
            )}
            {message?.area === "device" && <p className="sj-meta" role="status">{message.text}</p>}
          </div>
        )}
      </section>
    </main>
  );
}

const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  too_generic: "내용이 너무 일반적이에요",
  repetitive: "같은 말이 반복돼요",
  incorrect_chart: "사주 정보가 잘못됐어요",
  unanswered: "질문에 답하지 않았어요",
  inappropriate: "표현이 불쾌하거나 지나쳐요",
  purchase_mismatch: "결제 내용과 달라요",
  other: "기타",
};

function feedbackTargetLabel(entry: FeedbackEntry): string {
  const topic = getTopic(entry.topic).title;
  if (entry.target.type === "report") return `리포트, ${topic}`;
  if (entry.target.type === "consultation_message") return `상담 답변, ${topic}`;
  return `궁합, ${topic}`;
}

function feedbackRatingLabel(entry: FeedbackEntry): string {
  return FEEDBACK_OPTIONS.find((option) => option.id === entry.rating)?.title ?? "평가";
}

function formatShortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso.slice(0, 10);
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

export function FeedbackManagementScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(feedbackListStore.subscribe, feedbackListStore.rawSnapshot, () => null);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  if (!hydrated) return <LoadingState title="피드백 기록을 확인하고 있어요" />;
  void raw;
  const inspection = feedbackListStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="피드백 데이터를 읽을 수 없어요" description="손상된 피드백을 확인 없이 초기화하지 않아요." unavailable={inspection.status === "unavailable"} onReset={feedbackListStore.remove} />;
  const data = inspection.status === "ok" ? inspection.value : { version: 1 as const, entries: [] };

  function updateEntry(id: string, update: (entry: FeedbackEntry) => FeedbackEntry) {
    if (!feedbackListStore.write({ version: 1, entries: data.entries.map((entry) => entry.id === id ? update(entry) : entry) })) setError("피드백을 바꾸지 못했어요. 브라우저 저장소 설정을 확인해 주세요.");
  }

  function deleteEntry(id: string) {
    if (!feedbackListStore.write({ version: 1, entries: data.entries.filter((entry) => entry.id !== id) })) {
      setError("피드백을 삭제하지 못했어요. 브라우저 저장소 설정을 확인해 주세요.");
      return;
    }
    setPendingDeleteId(null);
    setError("");
  }

  if (data.entries.length === 0) return <EmptyState title="저장된 피드백이 없어요" description="리포트를 읽고 평가나 신고를 남기면 여기에서 고치거나 지울 수 있어요." action={{ href: "/report/feedback", label: "피드백 남기기" }} />;
  return (
    <main className="sj-page" aria-labelledby="feedback-management-title">
      <div className="sj-section">
        <h1 id="feedback-management-title" className="sj-h1">보낸 평가와 신고</h1>
        <p className="sj-lead">남겨주신 의견은 이 기기에 저장돼 있어요. 사유를 고치거나 신고를 취소하고, 필요 없으면 지울 수 있어요.</p>
      </div>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="feedback-count-title">
        <h2 id="feedback-count-title" className="sj-group-title">보낸 기록 {data.entries.length}개</h2>
        <div className="sj-group">
          {data.entries.map((entry, index) => (
            <article key={entry.id} className="sj-section" style={{ gap: 8, padding: 16, borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
              <div className="sj-section-head">
                <h3 className="sj-h3">{feedbackTargetLabel(entry)}</h3>
                <span className="sj-fine" style={{ flex: "0 0 auto" }}>{formatShortDate(entry.createdAt)}</span>
              </div>
              <div className="sj-chips">
                <span className={entry.reported ? "sj-badge sj-badge-accent" : "sj-badge"}>{entry.reported ? "신고함" : feedbackRatingLabel(entry)}</span>
                <span className="sj-meta">{FEEDBACK_REASON_LABELS[entry.reason]}</span>
              </div>
              {entry.comment && <p className="sj-body" style={{ fontSize: 14 }}>{entry.comment}</p>}
              {pendingDeleteId === entry.id ? (
                <div className="sj-section" style={{ gap: 8, paddingTop: 10, borderTop: "1px solid var(--sj-track)" }}>
                  <p className="sj-meta">이 피드백을 기기에서 삭제할까요?</p>
                  <div className="sj-actions-row">
                    <button className="sj-button-danger" type="button" onClick={() => deleteEntry(entry.id)}>피드백 삭제 확정</button>
                    <button className="sj-button-secondary" type="button" onClick={() => setPendingDeleteId(null)}>취소</button>
                  </div>
                </div>
              ) : (
                <div className="sj-actions-row" style={{ gap: 16, paddingTop: 6, borderTop: "1px solid var(--sj-track)" }}>
                  <Link className="sj-text-button" href={`/settings/feedback/${entry.id}`}>사유 고치기</Link>
                  <button className="sj-text-button" type="button" onClick={() => updateEntry(entry.id, (current) => ({ ...current, reported: !current.reported }))}>{entry.reported ? "신고 취소" : "부적절한 표현 신고"}</button>
                  <button className="sj-text-button" type="button" style={{ color: "var(--sj-muted)" }} onClick={() => setPendingDeleteId(entry.id)}>삭제</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {error && <p className="sj-error" role="alert">{error}</p>}
      <Link className="sj-button-secondary" href="/report/feedback">피드백 남기기</Link>
    </main>
  );
}

export function FeedbackEditScreen({ feedbackId }: { feedbackId: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState />;
  const inspection = feedbackListStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="피드백 데이터를 읽을 수 없어요" description="손상된 피드백을 확인 없이 덮어쓰지 않아요." unavailable={inspection.status === "unavailable"} onReset={feedbackListStore.remove} />;
  const data = inspection.status === "ok" ? inspection.value : { version: 1 as const, entries: [] };
  const entry = data.entries.find((candidate) => candidate.id === feedbackId);
  if (!entry) return <EmptyState title="피드백을 찾을 수 없어요" description="삭제됐거나 다른 브라우저에 저장된 기록일 수 있어요." action={{ href: "/settings/feedback", label: "피드백 목록 보기" }} />;
  return <FeedbackEditForm key={entry.id} entry={entry} entries={data.entries} />;
}

function FeedbackEditForm({ entry, entries }: { entry: FeedbackEntry; entries: FeedbackEntry[] }) {
  const [reason, setReason] = useState(entry.reason);
  const [comment, setComment] = useState(entry.comment);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updated = { ...entry, reason, comment: comment.trim() };
    setResult(feedbackListStore.write({ version: 1, entries: entries.map((candidate) => candidate.id === entry.id ? updated : candidate) }) ? "saved" : "failed");
  }
  return (
    <main className="sj-page" aria-labelledby="feedback-edit-title">
      <div className="sj-section">
        <h1 id="feedback-edit-title" className="sj-h1">{feedbackTargetLabel(entry)}</h1>
        <p className="sj-meta">{formatShortDate(entry.createdAt)}에 남긴 {entry.reported ? "신고" : "평가"}예요.</p>
      </div>
      <form className="sj-section" style={{ gap: 20 }} onSubmit={submit}>
        <div className="sj-field">
          <label className="sj-label" htmlFor="feedback-reason">상세 사유</label>
          <select id="feedback-reason" className="sj-select" value={reason} onChange={(event) => { setReason(event.target.value as FeedbackReason); setResult(null); }}>
            {Object.entries(FEEDBACK_REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </div>
        <div className="sj-field">
          <label className="sj-label" htmlFor="feedback-comment">자유 의견</label>
          <textarea id="feedback-comment" className="sj-textarea" rows={6} value={comment} onChange={(event) => { setComment(event.target.value); setResult(null); }} />
        </div>
        <div className="sj-actions">
          <button className="sj-button sj-button-block" type="submit">변경 내용 저장</button>
          <Link className="sj-text-button" href="/settings/feedback" style={{ alignSelf: "center" }}>목록으로</Link>
        </div>
        {result === "saved" && <p className="sj-meta" role="status">이 기기에 저장했어요.</p>}
        {result === "failed" && <p className="sj-error" role="alert">저장하지 못했어요. 브라우저 저장소 설정을 확인해 주세요.</p>}
      </form>
    </main>
  );
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sj-section">
      <h2 className="sj-h2" style={{ fontSize: 19, letterSpacing: "-0.03em" }}>{title}</h2>
      {children}
    </section>
  );
}

function AboutAiContent() {
  const steps = [
    { title: "생년월일시 입력", desc: "양력이나 음력, 태어난 시간, 계산 기준 성별을 받아요." },
    { title: "명식 계산", desc: "정해진 규칙으로 계산해요. 같은 입력이면 같은 결과예요." },
    { title: "해석 문장", desc: "리포트는 템플릿으로, 상담 답변은 AI가 계산 결과를 문장으로 옮겨요." },
  ];
  return (
    <main className="sj-page" style={{ gap: 36 }} aria-labelledby="information-title">
      <div className="sj-section">
        <h1 id="information-title" className="sj-h1">계산과 설명을 나눠서 만들어요</h1>
        <p className="sj-lead">사주리움의 결과는 두 단계로 나뉘어요. 명식은 규칙으로 계산하고, 그 위에 읽기 쉬운 문장을 붙여요.</p>
      </div>

      <ol className="sj-steps" aria-label="결과가 만들어지는 순서">
        {steps.map((step, index) => (
          <li className="sj-step" key={step.title}>
            {index < steps.length - 1 && <span className="sj-step-line" aria-hidden="true" />}
            <span className={index === steps.length - 1 ? "sj-step-dot sj-step-dot-now" : "sj-step-dot sj-step-dot-done"} aria-hidden="true" />
            <span className="sj-row-main">
              <span className="sj-h3">{step.title}</span>
              <span className="sj-meta">{step.desc}</span>
            </span>
          </li>
        ))}
      </ol>

      <DocSection title="명식 계산은 규칙으로 해요">
        <p className="sj-body">네 기둥과 여덟 글자, 오행 개수, 십성, 대운은 입력한 출생 정보를 바탕으로 규칙에 따라 계산해요. 여기에는 AI가 끼어들지 않아서, 같은 생년월일시를 넣으면 언제나 같은 명식이 나와요.</p>
        <p className="sj-body">계산할 때마다 어떤 계산 방식 버전을 썼는지 함께 저장해요. 규칙을 고치더라도 예전 결과가 왜 그렇게 나왔는지 되짚을 수 있어요.</p>
      </DocSection>

      <DocSection title="해석 문장은 템플릿과 AI가 써요">
        <p className="sj-body">리포트와 흐름의 문장은 명식 요소마다 미리 써 둔 템플릿으로 만들어요. 상담 답변은 계산 결과와 질문을 AI에게 건네 문장으로 풀어요. AI는 명식을 바꾸지 못하고, 건네받은 계산 결과 안에서만 말해요.</p>
      </DocSection>

      <DocSection title="할 수 없는 것도 있어요">
        <p className="sj-body">AI 답변에는 오류나 부정확한 해석이 있을 수 있어요. 사주 해석은 성향과 흐름을 돌아보는 하나의 관점이고, 특정한 사건이나 날짜를 맞히지 않아요.</p>
        <div className="sj-card-accent">
          <h3 className="sj-h3">이런 결정에는 쓰지 마세요</h3>
          <ul className="sj-body" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            <li>진단, 치료, 약 복용 같은 건강과 의료 판단</li>
            <li>계약, 소송, 이혼 같은 법률 판단</li>
            <li>주식, 코인, 부동산 같은 재정 결정</li>
          </ul>
          <p className="sj-meta">이런 일은 의사, 변호사, 금융 전문가의 판단을 먼저 확인해 주세요.</p>
        </div>
      </DocSection>

      <nav className="sj-list" aria-label="관련 안내" style={{ borderTop: "1px solid var(--sj-line)" }}>
        <Link className="sj-row" href="/settings/safety"><span className="sj-row-main"><span className="sj-row-title">안전한 이용 안내</span></span><ChevronIcon className="sj-chevron" /></Link>
        <Link className="sj-row" href="/report/feedback"><span className="sj-row-main"><span className="sj-row-title">틀린 해석 알려주기</span></span><ChevronIcon className="sj-chevron" /></Link>
      </nav>
    </main>
  );
}

function SafetyContent() {
  const notFor = [
    { title: "의료와 심리 치료", desc: "몸이나 마음이 아프면 병원과 전문 상담을 먼저 찾아 주세요." },
    { title: "법률 판단", desc: "계약, 소송, 이혼 같은 일은 변호사와 상의하세요." },
    { title: "투자와 큰돈 결정", desc: "주식, 코인, 부동산은 금융 전문가의 도움을 받으세요." },
    { title: "퇴사나 결혼 같은 결정", desc: "선택은 늘 본인의 몫이에요. 해석은 돌아보는 참고 자료로만 써 주세요." },
  ];
  const promises = [
    "질병, 사망, 사고, 파산, 이혼을 확정적으로 예언하지 않아요.",
    "퇴사, 투자, 치료, 결혼 같은 결정을 대신하지 않아요.",
    "위기 상황이나 불안을 결제 유도에 쓰지 않아요.",
  ];
  return (
    <main className="sj-page" aria-labelledby="information-title">
      <section className="sj-card-dark" style={{ gap: 14, padding: 20, borderRadius: "var(--sj-radius-hero)" }} aria-labelledby="information-title">
        <div className="sj-section" style={{ gap: 6 }}>
          <h1 id="information-title" className="sj-h1" style={{ fontSize: 21, color: "#ffffff" }}>지금 많이 힘들다면, 사람과 이야기해요</h1>
          <p className="sj-card-dark-text" style={{ fontSize: 14 }}>사주 해석보다 먼저 도움을 받을 수 있어요. 두 곳 모두 24시간 전화를 받아요.</p>
        </div>
        <div className="sj-group" style={{ border: 0 }}>
          <a className="sj-row-in-group" href="tel:109">
            <span className="sj-row-main"><span className="sj-row-title" style={{ fontWeight: 700 }}>자살예방상담전화</span><span className="sj-row-sub">죽고 싶다는 생각이 들 때</span></span>
            <span className="sj-button sj-button-small">109</span>
          </a>
          <a className="sj-row-in-group" href="tel:15770199">
            <span className="sj-row-main"><span className="sj-row-title" style={{ fontWeight: 700 }}>정신건강위기상담</span><span className="sj-row-sub">불안, 우울, 마음의 위기</span></span>
            <span className="sj-button-secondary" style={{ minHeight: 44, fontSize: 14, fontWeight: 700 }}>1577-0199</span>
          </a>
        </div>
        <p className="sj-card-dark-text">당장 위험한 상황이면 112나 119에 바로 전화하세요.</p>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="safety-promise-title">
        <h2 id="safety-promise-title" className="sj-group-title">사주리움은 공포를 팔지 않아요</h2>
        <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {promises.map((promise) => <li className="sj-row-in-group" key={promise} style={{ cursor: "default" }}><span className="sj-row-title">{promise}</span></li>)}
        </ul>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="safety-notfor-title">
        <h2 id="safety-notfor-title" className="sj-group-title">상담이 대신하지 않는 것</h2>
        <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {notFor.map((item) => (
            <li className="sj-row-in-group" key={item.title} style={{ cursor: "default" }}>
              <span className="sj-row-main"><span className="sj-row-title">{item.title}</span><span className="sj-row-sub">{item.desc}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="safety-report-title">
        <h2 id="safety-report-title" className="sj-group-title">문제를 발견했다면</h2>
        <div className="sj-group">
          <div className="sj-row-in-group" style={{ cursor: "default" }}>
            <span className="sj-row-main">
              <span className="sj-row-title">불쾌하거나 위험한 표현을 알려 주세요</span>
              <span className="sj-row-sub">겁을 주는 단정, 사주 정보가 틀린 해석을 알려 주시면 확인해서 고쳐요.</span>
            </span>
          </div>
          <GroupRowLink href="/report/feedback" title="피드백이나 신고 남기기" />
          <GroupRowLink href="/settings/feedback" title="내가 보낸 피드백과 신고" />
        </div>
      </section>
    </main>
  );
}

function TermsContent() {
  const articles = [
    { id: "terms-scope", title: "서비스의 내용", body: "명식 계산, 기본 리포트, 상담, 궁합, 계정 데이터는 사주리움 서버에서 처리합니다." },
    { id: "terms-nature", title: "해석 결과의 성격", body: "결과와 상담은 중요한 결정이나 전문 판단을 대신하지 않습니다." },
    { id: "terms-paid", title: "유료 서비스", body: "외부 결제 제공자 승인과 유료 상품 지급은 아직 제공하지 않습니다." },
  ];
  return (
    <main className="sj-page" aria-labelledby="information-title">
      <nav className="sj-tablist" aria-label="문서 종류">
        <Link className="sj-tablist-tab" href="/settings/terms" aria-current="page">이용약관</Link>
        <Link className="sj-tablist-tab" href="/settings/privacy">개인정보</Link>
      </nav>
      <div className="sj-section" style={{ gap: 6 }}>
        <h1 id="information-title" className="sj-h1">사주리움 이용약관</h1>
        <p className="sj-meta">지금 제공하는 범위를 안내합니다.</p>
      </div>
      <nav className="sj-section" style={{ gap: 0 }} aria-labelledby="terms-toc-title">
        <h2 id="terms-toc-title" className="sj-group-title">목차</h2>
        <div className="sj-group">
          {articles.map((article) => <a className="sj-row-in-group" key={article.id} href={`#${article.id}`}><span className="sj-row-main"><span className="sj-row-title">{article.title}</span></span><ChevronIcon className="sj-chevron" /></a>)}
        </div>
      </nav>
      {articles.map((article) => (
        <article className="sj-section" id={article.id} key={article.id} style={{ scrollMarginTop: 96 }}>
          <h2 className="sj-h2" style={{ fontSize: 18, letterSpacing: "-0.03em" }}>{article.title}</h2>
          <p className="sj-body">{article.body}</p>
        </article>
      ))}
    </main>
  );
}

export function InformationScreen({ kind }: { kind: "ai" | "terms" | "safety" }) {
  if (kind === "ai") return <AboutAiContent />;
  if (kind === "safety") return <SafetyContent />;
  return <TermsContent />;
}

function PrivacyList({ items }: { items: string[] }) {
  return (
    <ul className="sj-body" style={{ margin: 0, padding: "0 16px 14px 34px", fontSize: 14 }}>
      {items.map((item) => <li key={item} style={{ padding: "4px 0" }}>{item}</li>)}
    </ul>
  );
}

export function LivePrivacyScreen() {
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<"exports" | "deletions" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function submit(type: "exports" | "deletions") {
    setPending(type); setMessage(null);
    try {
      const job = await requestPrivacyJob(type);
      if (type === "exports" && job.status === "COMPLETED") {
        await downloadPrivacyExport(job.job_id);
        setMessage({ tone: "status", text: "내 데이터 파일을 내려받았어요." });
      } else if (type === "deletions" && job.status === "COMPLETED") {
        setMessage({ tone: "status", text: "서버에 저장된 기록을 모두 지웠어요. 이 기기의 저장 정보는 설정에서 따로 지울 수 있어요." });
      } else {
        setMessage({ tone: "status", text: type === "exports" ? "내려받을 파일을 준비하고 있어요. 잠시 후 다시 눌러 주세요." : "삭제 요청을 받았어요. 처리가 끝나면 알림함으로 알려드려요." });
      }
    } catch (error) {
      setMessage({ tone: "error", text: formatApiRequestError(error, "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.") });
    } finally {
      setPending(null);
      setConfirmDelete(false);
    }
  }
  return (
    <main className="sj-page" aria-labelledby="privacy-title">
      <h1 id="privacy-title" className="sj-visually-hidden">내 데이터 관리</h1>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="privacy-export-title">
        <h2 id="privacy-export-title" className="sj-group-title">내 데이터 내려받기</h2>
        <div className="sj-card">
          <p className="sj-body" style={{ fontSize: 14 }}>서버에 저장된 출생 정보, 명식, 리포트, 상담 기록, 사람 보관함을 파일 하나로 모아 드려요.</p>
          <button className="sj-button" disabled={pending !== null} type="button" onClick={() => { void submit("exports"); }}>{pending === "exports" ? "파일을 준비하고 있어요" : "내 데이터 내려받기"}</button>
        </div>
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>파일은 지금 쓰고 있는 계정이나 익명 세션의 기록만 담아요.</p>
      </section>

      {message && (message.tone === "error"
        ? <p className="sj-error" role="alert">{message.text}</p>
        : <p className="sj-meta" role="status">{message.text}</p>)}

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="privacy-where-title">
        <h2 id="privacy-where-title" className="sj-group-title">어디에 저장되나요</h2>
        <div className="sj-group">
          <div style={{ padding: "16px 16px 6px" }}>
            <h3 className="sj-h3">사주리움 서버</h3>
            <p className="sj-meta">다른 기기에서도 이어 보려면 서버에 있어야 해요.</p>
          </div>
          <PrivacyList items={["출생 정보와 계산한 명식", "리포트와 상담 기록", "사람 보관함에 저장한 사람", "공유 링크와 알림 설정", "주문과 이용권 내역"]} />
          <div style={{ padding: "16px 16px 6px", borderTop: "1px solid var(--sj-track)" }}>
            <h3 className="sj-h3">이 기기</h3>
            <p className="sj-meta">브라우저 데이터를 지우면 함께 지워져요. 서버에는 보내지 않아요.</p>
          </div>
          <PrivacyList items={["익명으로 이어 쓰기 위한 로그인 정보", "이 브라우저에서 만든 기록과 화면 설정"]} />
        </div>
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>이 기기에 저장된 정보는 <Link href="/settings">설정</Link>의 ‘이 기기’에서 항목별로 지울 수 있어요.</p>
      </section>

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="privacy-erase-title">
        <h2 id="privacy-erase-title" className="sj-group-title">지우기</h2>
        <div className="sj-group">
          <button className="sj-row-in-group" type="button" disabled={pending !== null} aria-expanded={confirmDelete} onClick={() => setConfirmDelete((value) => !value)}>
            <span className="sj-row-main">
              <span className="sj-row-title sj-row-danger">서버에 저장된 기록 삭제</span>
              <span className="sj-row-sub">명식, 리포트, 상담, 사람 보관함, 공유 링크를 서버에서 지워요.</span>
            </span>
          </button>
          {confirmDelete && (
            <div className="sj-section" style={{ gap: 10, padding: "4px 16px 16px" }}>
              <p className="sj-meta">지운 기록은 되돌릴 수 없어요. 먼저 내려받아 두면 안전해요.</p>
              <div className="sj-actions-row">
                <button className="sj-button-danger" type="button" disabled={pending !== null} onClick={() => { void submit("deletions"); }}>{pending === "deletions" ? "삭제하고 있어요" : "삭제 확정"}</button>
                <button className="sj-button-secondary" type="button" onClick={() => setConfirmDelete(false)}>취소</button>
              </div>
            </div>
          )}
          <GroupRowLink href="/account" title="계정 삭제" sub="기록과 계정을 함께 지워요. 계정 화면에서 진행해요." danger />
        </div>
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>결제 기록은 법에 따라 따로 보관될 수 있어요.</p>
      </section>
    </main>
  );
}
