"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { maskBirthDate, maskBirthTime, parseBirthDate } from "@/lib/contracts";
import type { NotificationPreferenceView } from "@/lib/contracts";
import type { FeedbackEntry, FeedbackReason, SettingsData } from "@/lib/domain";
import { INITIAL_BIRTH, INITIAL_SETTINGS_DATA, getTopic } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
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

function getSettings(): SettingsData | null {
  const inspection = settingsStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return {
    ...INITIAL_SETTINGS_DATA,
    notifications: INITIAL_SETTINGS_DATA.notifications.map((preference) => ({
      ...preference,
      topics: { ...preference.topics },
      quietHours: { ...preference.quietHours },
    })),
  };
}

type NotificationTopicCode = keyof NotificationPreferenceView["topics"];

const notificationTopics: readonly { code: NotificationTopicCode; label: string; classification: "서비스" | "마케팅" }[] = [
  { code: "payment_completed", label: "결제 완료", classification: "서비스" },
  { code: "monthly_flow", label: "이번 달 흐름 시작", classification: "마케팅" },
  { code: "important_period", label: "중요한 시기 진입", classification: "마케팅" },
  { code: "report_completed", label: "구매 리포트 생성 완료", classification: "서비스" },
  { code: "consultation_completed", label: "상담 답변 완료", classification: "서비스" },
  { code: "low_credits", label: "이용권 부족", classification: "서비스" },
  { code: "resume_consultation", label: "이전 상담 이어보기", classification: "마케팅" },
  { code: "interest_change", label: "관심 주제 관련 변화", classification: "마케팅" },
];

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
  const [message, setMessage] = useState("");
  if (!hydrated) return <LoadingState title="기기 설정을 확인하고 있어요" />;
  void settingsRaw; void peopleRaw; void consultRaw; void compatibilityRaw; void libraryRaw; void feedbackRaw; void profileRaw; void reportRaw; void commerceRaw; void birthDraftRaw; void feedbackSelectionRaw;
  const transactionState = inspectStorageTransaction();
  if (transactionState.status === "corrupt" || transactionState.status === "unavailable") {
    return <CorruptState title="저장 복구 기록을 확인해야 해요" description="손상된 복구 기록은 자동으로 지우지 않습니다. 기기 저장 정보는 그대로 둔 채 복구 기록만 초기화할 수 있어요." unavailable={transactionState.status === "unavailable"} onReset={clearCorruptStorageTransaction} />;
  }
  const settings = getSettings();
  if (!settings) return <CorruptState title="환경설정을 읽을 수 없어요" description="손상된 설정을 확인 없이 기본값으로 바꾸지 않습니다." unavailable={settingsStore.inspect().status === "unavailable"} onReset={settingsStore.remove} />;
  const activeSettings: SettingsData = settings;
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const inventory = getOwnedStorageInventory();
  const hasUnavailableStorage = inventory.some((item) => item.status === "unavailable");
  const profileInventory = inventory.find((item) => item.id === "profile");
  const peopleInventory = inventory.find((item) => item.id === "people");
  const commerceInspection = commerceStore.inspect();
  const consultationCredits = commerceInspection.status === "ok" ? commerceInspection.value.consultationCredits : null;
  const profileSummary = `${maskBirthDate(birth.birthDate)} · ${maskBirthTime(birth.birthTime, birth.birthTimeUnknown)} · ${birth.calendar === "solar" ? "양력" : birth.leapMonth ? "음력 윤달" : "음력 평달"}`;
  const profileStorageSummary = profileInventory?.status === "ok" ? "저장됨 · 이 기기" : profileInventory?.status === "unavailable" ? "확인 필요" : "저장 상태 확인";
  const peopleStorageSummary = peopleInventory?.status === "ok" ? `${peopleInventory.count}명 저장됨` : peopleInventory?.status === "unavailable" ? "확인 필요" : "저장 상태 확인";

  function updateSettings(update: Partial<SettingsData>) {
    const next: SettingsData = { version: 1, notifications: update.notifications ?? activeSettings.notifications };
    if (!settingsStore.write(next)) setMessage("이 브라우저에서는 설정을 저장할 수 없어요.");
  }

  function clearConsultations() {
    const inspection = libraryStore.inspect();
    if (inspection.status === "corrupt" || inspection.status === "unavailable") {
      setMessage("보관함 데이터를 먼저 확인해 주세요.");
      return;
    }
    const current = inspection.status === "ok" ? inspection.value : { version: 1 as const, items: [] };
    const next = { version: 1 as const, items: current.items.filter((item) => item.type !== "consultation") };
    const transaction = runStorageTransaction([
      createTransactionStep(consultationStore, null),
      createTransactionStep(libraryStore, next),
    ]);
    if (transaction === "committed") setMessage("상담과 연결된 보관함 항목을 삭제했어요.");
    else setMessage(transaction === "rolled-back" ? "상담 삭제에 실패해 모든 변경을 취소했어요." : "삭제 복구가 필요해 기기 저장 정보를 확인해 주세요.");
  }

  function clearInventoryItem(id: string, status: "ok" | "empty" | "corrupt" | "unavailable") {
    if (status === "unavailable") {
      window.location.reload();
      return;
    }
    if (hasUnavailableStorage) {
      setMessage("확인할 수 없는 저장소가 있어 삭제를 중단했어요.");
      return;
    }
    if (id === "consultations") {
      clearConsultations();
      return;
    }
    setMessage(clearOwnedStorage(id) ? "선택한 기기 저장 정보를 삭제했어요." : "선택한 기기 저장 정보를 삭제하지 못했어요.");
  }

  function updateNotification(channel: NotificationPreferenceView["channel"], update: (preference: NotificationPreferenceView) => NotificationPreferenceView) {
    updateSettings({ notifications: activeSettings.notifications.map((preference) => preference.channel === channel ? update(preference) : preference) });
  }

  function saveBirth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const birthDate = String(form.get("birthDate") ?? "");
    const birthTime = String(form.get("birthTime") ?? "");
    const birthTimeUnknown = form.get("birthTimeUnknown") === "on";
    const validDate = parseBirthDate(birthDate) !== null;
    if (!displayName || !validDate) return setMessage("이름과 실제 존재하는 생년월일을 입력해 주세요.");
    const [hour, minute] = birthTime.split(":").map(Number);
    const validTime = /^\d{2}:\d{2}$/.test(birthTime) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    if (!birthTimeUnknown && !validTime) return setMessage("출생 시간을 HH:mm 형식으로 입력하거나 ‘출생 시간을 몰라요’를 선택해 주세요.");
    const profile = { version: 1 as const, birth: { ...birth, displayName, birthDate, birthTime: birthTimeUnknown ? null : birthTime, birthTimeUnknown } };
    const transaction = saveProfileAndClearBirthDraft(profile);
    if (transaction === "committed") setMessage("출생 정보를 이 기기에 저장했어요.");
    else setMessage(transaction === "rolled-back" ? "출생 정보 저장에 실패해 변경을 취소했어요." : "저장 복구가 필요해 기기 저장 정보를 확인해 주세요.");
  }

  function clearAllLocalData() {
    if (hasUnavailableStorage) {
      setMessage("확인할 수 없는 저장소가 있어 전체 삭제를 중단했어요.");
      return;
    }
    const result = clearAllOwnedStorage();
    if (!result.success) {
      setMessage(`일부 기기 저장 정보를 삭제하지 못했어요: ${result.failedIds.join(", ")}`);
      return;
    }
    setConfirmClear(false);
    setMessage("사주리움이 만든 기기 저장 정보를 모두 삭제했어요.");
  }

  return (
    <main className="screen-content settings-content signal-atlas-settings-screen" aria-labelledby="settings-title">
      <header className="signal-settings-header">
        <p className="section-kicker signal-atlas-overline">설정과 데이터</p>
        <h1 id="settings-title">설정과 데이터</h1>
        <p className="supporting">이 기기에 저장된 정보와 알림을 관리해요.</p>
        <p className="signal-local-storage-note">계정 기능이 없으므로 모든 설정은 현재 브라우저에만 적용됩니다.</p>
      </header>

      <section className="settings-profile-summary signal-settings-profile" aria-labelledby="settings-profile-title">
        <div className="signal-settings-profile-copy">
          <span className="signal-settings-avatar" aria-hidden="true">{Array.from(birth.displayName)[0] ?? "나"}</span>
          <div>
            <h2 id="settings-profile-title">{birth.displayName}</h2>
            <p>{profileSummary}</p>
          </div>
        </div>
        <Link className="settings-row-action" href="/profile">수정</Link>
      </section>

      <section className="settings-section signal-settings-group signal-settings-records" aria-labelledby="settings-records-title">
        <h2 id="settings-records-title">기록 관리</h2>
        <nav className="signal-settings-row-list" aria-label="기록 관리">
          <Link className="signal-settings-row" href="/profile">
            <span><strong>내 사주 원국</strong><small>{profileStorageSummary}</small></span>
            <span className="signal-settings-row-marker" aria-hidden="true">›</span>
          </Link>
          <Link className="signal-settings-row" href="/products/credits">
            <span><strong>상담과 이용권</strong><small>{consultationCredits === null ? "내역 보기" : `${consultationCredits}회 남음 · 내역 보기`}</small></span>
            <span className="signal-settings-row-marker" aria-hidden="true">›</span>
          </Link>
          <Link className="signal-settings-row" href="/people">
            <span><strong>사람 · 궁합 기록</strong><small>{peopleStorageSummary}</small></span>
            <span className="signal-settings-row-marker" aria-hidden="true">›</span>
          </Link>
        </nav>
        <div className="settings-inline-editor signal-settings-editor">
          <h3>출생 정보 수정</h3>
          <p>현재 프로필의 핵심 값만 수정합니다. 달력·윤달·출생지·시간대·계산 기준과 관심사는 전체 프로필에서 관리하세요.</p>
          <form className="settings-birth-form" onSubmit={saveBirth}>
            <label>이름 또는 닉네임<input name="displayName" defaultValue={birth.displayName} /></label>
            <label>생년월일<input name="birthDate" type="date" defaultValue={birth.birthDate} /></label>
            <label>출생 시간<input name="birthTime" type="time" defaultValue={birth.birthTime ?? ""} /></label>
            <label className="check-card"><input name="birthTimeUnknown" type="checkbox" defaultChecked={birth.birthTimeUnknown} /> 출생 시간을 몰라요</label>
            <button className="secondary-button" type="submit">출생 정보 저장</button>
            <Link className="text-link" href="/profile">전체 프로필 관리</Link>
          </form>
        </div>
      </section>

      <section className="settings-section signal-settings-group signal-settings-notifications" aria-labelledby="settings-notifications-title">
        <h2 id="settings-notifications-title">알림 설정</h2>
        <p>실제 푸시·이메일 발송은 제공되지 않으며 선호도만 현재 브라우저에 저장됩니다.</p>
        {settings.notifications.map((preference) => (
          <article className="signal-notification-channel" key={preference.channel}>
            <h3>{preference.channel === "push" ? "푸시" : "이메일"}</h3>
            <label className="setting-toggle signal-settings-row"><span><strong>채널 사용</strong><small>{preference.channel === "push" ? "운영체제 권한을 요청하지 않음" : "이메일 주소를 수집하지 않음"}</small></span><input type="checkbox" checked={preference.enabled} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, enabled: event.target.checked }))} /></label>
            {notificationTopics.map((topic) => <label className="setting-toggle signal-settings-row" key={topic.code}><span><strong>{topic.label} · {topic.classification}</strong><small>topic · {topic.code}</small></span><input type="checkbox" checked={preference.topics[topic.code]} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, topics: { ...current.topics, [topic.code]: event.target.checked } }))} /></label>)}
            <label className="setting-toggle signal-settings-row"><span><strong>조용한 시간 사용</strong><small>{preference.quietHours.start}–{preference.quietHours.end} · {preference.quietHours.timezone}</small></span><input type="checkbox" checked={preference.quietHours.enabled} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, quietHours: { ...current.quietHours, enabled: event.target.checked } }))} /></label>
            <div className="settings-birth-form signal-notification-quiet-hours">
              <label>시작<input type="time" value={preference.quietHours.start} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))} /></label>
              <label>종료<input type="time" value={preference.quietHours.end} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))} /></label>
              <label>시간대<select value={preference.quietHours.timezone} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, quietHours: { ...current.quietHours, timezone: event.target.value } }))}><option value="Asia/Seoul">Asia/Seoul (KST)</option><option value="UTC">UTC</option></select></label>
            </div>
            <label className="setting-toggle signal-settings-row"><span><strong>동일 내용 중복 억제</strong><small>같은 본문과 대상의 반복 알림을 합침</small></span><input type="checkbox" checked={preference.suppressDuplicates} onChange={(event) => updateNotification(preference.channel, (current) => ({ ...current, suppressDuplicates: event.target.checked }))} /></label>
          </article>
        ))}
      </section>

      <section className="settings-section signal-settings-group signal-settings-privacy" aria-labelledby="settings-privacy-title">
        <h2 id="settings-privacy-title">개인정보</h2>
        <p>저장 범위와 서비스 안내를 확인하세요.</p>
        <nav className="settings-links signal-settings-row-list" aria-label="개인정보 및 안내">
          <Link className="signal-settings-row" href="/settings/feedback"><span><strong>피드백과 신고 관리</strong><small>이 기기에 저장된 평가와 신고</small></span><span className="signal-settings-row-marker" aria-hidden="true">›</span></Link>
          <Link className="signal-settings-row" href="/settings/about-ai"><span><strong>AI 사용 안내</strong><small>계산과 설명을 구분해요</small></span><span className="signal-settings-row-marker" aria-hidden="true">›</span></Link>
          <Link className="signal-settings-row" href="/settings/privacy"><span><strong>개인정보 안내</strong><small>브라우저 저장과 삭제 범위</small></span><span className="signal-settings-row-marker" aria-hidden="true">›</span></Link>
          <Link className="signal-settings-row" href="/settings/terms"><span><strong>이용약관</strong><small>현재 제공 범위</small></span><span className="signal-settings-row-marker" aria-hidden="true">›</span></Link>
          <Link className="signal-settings-row" href="/settings/safety"><span><strong>콘텐츠 안전 안내</strong><small>공포를 판매하지 않아요</small></span><span className="signal-settings-row-marker" aria-hidden="true">›</span></Link>
        </nav>
      </section>

      <section className="settings-section signal-settings-group signal-settings-deletion" aria-labelledby="settings-deletion-title">
        <h2 id="settings-deletion-title">기기 기록 삭제</h2>
        <p>이 기기의 모든 사주 기록을 지워요.</p>
        <div className="data-inventory signal-data-inventory">
          {inventory.map((item) => (
            <article className="signal-data-row" key={item.id}>
              <span>{item.label}<small>{item.scope === "session" ? "현재 탭" : "현재 브라우저"}</small></span>
              <strong>{item.status === "unavailable" ? "사용 불가" : item.status === "corrupt" ? "확인 필요" : `${item.count}개`}</strong>
              {pendingClearId === item.id ? (
                <div className="danger-confirm inventory-confirm">
                  <p>{item.label} 정보를 이 기기에서 {item.status === "corrupt" ? "초기화" : "삭제"}할까요?</p>
                  <button type="button" onClick={() => { clearInventoryItem(item.id, item.status); setPendingClearId(null); }}>{item.status === "corrupt" ? "초기화 확정" : "삭제 확정"}</button>
                  <button type="button" onClick={() => setPendingClearId(null)}>취소</button>
                </div>
              ) : (
                <button type="button" onClick={() => item.status === "unavailable" ? clearInventoryItem(item.id, item.status) : setPendingClearId(item.id)} disabled={item.status === "empty" || (hasUnavailableStorage && item.status !== "unavailable")}>{item.status === "unavailable" ? "다시 확인" : item.status === "corrupt" ? "초기화" : "삭제"}</button>
              )}
            </article>
          ))}
        </div>
        {hasUnavailableStorage ? (
          <>
            <p className="form-error" role="alert">확인할 수 없는 저장소가 있어 삭제 기능을 사용할 수 없어요.</p>
            <button className="secondary-button" type="button" disabled>전체 기기 저장 정보 삭제 · 사용 불가</button>
          </>
        ) : confirmClear ? (
          <div className="danger-confirm">
            <p>사주리움 서비스가 만든 기기 저장 정보를 모두 삭제합니다.</p>
            <button type="button" onClick={clearAllLocalData}>모두 삭제 확정</button>
            <button type="button" onClick={() => setConfirmClear(false)}>취소</button>
          </div>
        ) : (
          <button className="secondary-button" type="button" onClick={() => setConfirmClear(true)}>전체 기기 저장 정보 삭제</button>
        )}
      </section>

      <section className="settings-section signal-settings-group signal-settings-account-deletion" aria-labelledby="account-deletion-title">
        <h2 id="account-deletion-title">계정 기록 삭제</h2>
        <p>현재 계정 기능과 다른 기기 저장이 없어 실제 계정 삭제는 제공되지 않습니다.</p>
        <p className="signal-settings-note">이 프로토타입에서는 계정 삭제를 처리하지 않아요. 이 브라우저 기록은 위의 ‘기기 기록 삭제’에서 직접 지울 수 있습니다.</p>
        <button className="disabled-login" type="button" disabled>계정 삭제 · 이용 불가</button>
      </section>
      {message && <p className="settings-message" role="status">{message}</p>}
    </main>
  );
}

export function FeedbackManagementScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(feedbackListStore.subscribe, feedbackListStore.rawSnapshot, () => null);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  if (!hydrated) return <LoadingState title="피드백 기록을 확인하고 있어요" />;
  void raw;
  const inspection = feedbackListStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="피드백 데이터를 읽을 수 없어요" description="손상된 피드백을 확인 없이 초기화하지 않습니다." unavailable={inspection.status === "unavailable"} onReset={feedbackListStore.remove} />;
  const data = inspection.status === "ok" ? inspection.value : { version: 1 as const, entries: [] };

  function updateEntry(id: string, update: (entry: FeedbackEntry) => FeedbackEntry) {
    if (!feedbackListStore.write({ version: 1, entries: data.entries.map((entry) => entry.id === id ? update(entry) : entry) })) setError("피드백을 변경할 수 없어요.");
  }

  function deleteEntry(id: string) {
    if (!feedbackListStore.write({ version: 1, entries: data.entries.filter((entry) => entry.id !== id) })) {
      setError("피드백을 삭제할 수 없어요.");
      return;
    }
    setPendingDeleteId(null);
    setError("");
  }

  if (data.entries.length === 0) return <EmptyState title="저장된 피드백이 없어요" description="리포트 평가와 신고는 이 기기에만 저장됩니다." action={{ href: "/report", label: "리포트 보기" }} />;
  return (
    <main className="screen-content feedback-management" aria-labelledby="feedback-management-title">
      <p className="section-kicker">이 기기의 피드백</p><h1 id="feedback-management-title">평가와 신고를<br />관리하세요</h1>
      <div className="feedback-history">{data.entries.map((entry) => <article key={entry.id}><small>{feedbackTargetLabel(entry)} · {getTopic(entry.topic).title} · {entry.createdAt.slice(0, 10)}</small><h2>{FEEDBACK_REASON_LABELS[entry.reason]}</h2><p>{entry.comment || "자유 의견 없음"}</p><p>프로필 스냅샷 · {entry.provenance.profileSnapshotId}<br />차트 스냅샷 · {entry.provenance.chartSnapshotIds.join(", ")}<br />모델 · {entry.provenance.modelVersion ?? "고정 예시(모델 없음)"}<br />프롬프트 · {entry.provenance.promptVersion ?? "고정 예시(프롬프트 없음)"}<br />템플릿 · {entry.provenance.templateVersion}</p><div><Link href={`/settings/feedback/${entry.id}`}>수정</Link><button type="button" onClick={() => updateEntry(entry.id, (current) => ({ ...current, reported: !current.reported }))}>{entry.reported ? "신고 취소" : "부적절한 표현 신고"}</button>{pendingDeleteId === entry.id ? <div className="danger-confirm feedback-delete-confirm"><p>이 피드백을 기기에서 삭제할까요?</p><button type="button" onClick={() => deleteEntry(entry.id)}>피드백 삭제 확정</button><button type="button" onClick={() => setPendingDeleteId(null)}>취소</button></div> : <button type="button" onClick={() => setPendingDeleteId(entry.id)}>삭제</button>}</div></article>)}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  );
}

const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  too_generic: "내용이 너무 일반적임",
  repetitive: "같은 말이 반복됨",
  incorrect_chart: "사주 정보가 잘못됨",
  unanswered: "질문에 답하지 않음",
  inappropriate: "표현이 불쾌하거나 과도함",
  purchase_mismatch: "결제 내용과 다름",
  other: "기타",
};

function feedbackTargetLabel(entry: FeedbackEntry): string {
  if (entry.target.type === "report") return `report · ${entry.target.reportId}`;
  if (entry.target.type === "consultation_message") return `consultation_message · ${entry.target.sessionId} / ${entry.target.messageId}`;
  return `compatibility · ${entry.target.compatibilityId}`;
}

export function FeedbackEditScreen({ feedbackId }: { feedbackId: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState />;
  const inspection = feedbackListStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="피드백 데이터를 읽을 수 없어요" description="손상된 피드백을 확인 없이 덮어쓰지 않습니다." unavailable={inspection.status === "unavailable"} onReset={feedbackListStore.remove} />;
  const data = inspection.status === "ok" ? inspection.value : { version: 1 as const, entries: [] };
  const entry = data.entries.find((candidate) => candidate.id === feedbackId);
  if (!entry) return <EmptyState title="피드백을 찾을 수 없어요" description="삭제됐거나 다른 브라우저에 저장된 기록일 수 있어요." action={{ href: "/settings/feedback", label: "피드백 목록" }} />;
  return <FeedbackEditForm key={entry.id} entry={entry} entries={data.entries} />;
}

function FeedbackEditForm({ entry, entries }: { entry: FeedbackEntry; entries: FeedbackEntry[] }) {
  const [reason, setReason] = useState(entry.reason);
  const [comment, setComment] = useState(entry.comment);
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updated = { ...entry, reason, comment: comment.trim() };
    setSaved(feedbackListStore.write({ version: 1, entries: entries.map((candidate) => candidate.id === entry.id ? updated : candidate) }));
  }
  return <form className="screen-content feedback-edit" onSubmit={submit} aria-labelledby="feedback-edit-title"><p className="section-kicker">피드백 수정</p><h1 id="feedback-edit-title">상세 사유와 의견</h1><p>{feedbackTargetLabel(entry)}<br />프로필 스냅샷 · {entry.provenance.profileSnapshotId}<br />차트 스냅샷 · {entry.provenance.chartSnapshotIds.join(", ")}<br />템플릿 · {entry.provenance.templateVersion}</p><label>상세 사유<select value={reason} onChange={(event) => { setReason(event.target.value as FeedbackReason); setSaved(false); }}>{Object.entries(FEEDBACK_REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label>자유 의견<textarea rows={6} value={comment} onChange={(event) => { setComment(event.target.value); setSaved(false); }} /></label><button className="primary-button" type="submit">변경 내용 저장</button>{saved && <p role="status">이 기기에 저장했어요.</p>}<Link className="text-button inline-action" href="/settings/feedback">목록으로</Link></form>;
}

export function InformationScreen({ kind }: { kind: "ai" | "privacy" | "terms" | "safety" }) {
  const content = {
    ai: { kicker: "AI 사용 안내", title: "계산과 설명을 구분합니다", sections: ["현재 답변은 미리 작성된 예시이며 AI가 생성하지 않습니다.", "사주 계산과 결과를 설명하는 과정은 서로 구분합니다.", "결과의 근거와 한계를 함께 알립니다."] },
    privacy: { kicker: "개인정보 안내", title: "현재 데이터는 브라우저에만 저장됩니다", sections: ["이름·출생 정보·상담·궁합은 외부로 전송하지 않습니다.", "브라우저 데이터를 삭제하면 이 기기의 기록도 사라집니다.", "저장 범위와 삭제 방법을 언제나 확인할 수 있게 합니다."] },
    terms: { kicker: "이용약관", title: "현재 제공 범위를 안내합니다", sections: ["실제 사주 계산·상담·결제·상품 지급을 제공하지 않습니다.", "예시 결과는 중요한 결정이나 전문 판단을 대신하지 않습니다.", "표시된 가격과 상태는 실제 결제로 이어지지 않습니다."] },
    safety: { kicker: "콘텐츠 안전", title: "공포를 판매하지 않습니다", sections: ["질병·사망·사고·파산·이혼을 확정적으로 예언하지 않습니다.", "퇴사·투자·치료·결혼 같은 결정을 대신하지 않습니다.", "위기 상황이나 불안을 결제 유도에 사용하지 않습니다."] },
  }[kind];
  return <main className="screen-content information-content" aria-labelledby="information-title"><p className="section-kicker">{content.kicker}</p><h1 id="information-title">{content.title}</h1><div>{content.sections.map((section, index) => <article key={section}><small>{String(index + 1).padStart(2, "0")}</small><p>{section}</p></article>)}</div><Link className="secondary-button" href="/settings">설정으로</Link></main>;
}
