"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatApiRequestError, getNotificationPreferences, loginAccount, logoutAccount, registerAccount, requestAccountDeletion, type AnonymousMigrationStatus, updateNotificationPreferences } from "@/lib/api/service";
import { LoadingState } from "./page-state";
import type { FormEvent } from "react";
import styles from "./saas-system-rollout.module.css";

type Provider = "카카오" | "Apple" | "Google" | "이메일";
type NotificationTab = "all" | "unread";
type NotificationKind = "흐름" | "리포트" | "결제";

type PrototypeNotification = {
  id: number;
  kind: NotificationKind;
  title: string;
  description: string;
  time: string;
  read: boolean;
};

const PROVIDERS: Provider[] = ["카카오", "Apple", "Google", "이메일"];

const INITIAL_NOTIFICATIONS: PrototypeNotification[] = [
  {
    id: 1,
    kind: "흐름",
    title: "오늘의 흐름이 준비됐어요",
    description: "서두르기보다 해야 할 일의 순서를 정리해 보기 좋은 날이에요.",
    time: "오늘 오전 8:30",
    read: false,
  },
  {
    id: 2,
    kind: "리포트",
    title: "관계 리포트를 이어서 읽어보세요",
    description: "저장해 둔 리포트의 핵심 해석과 대화 제안을 다시 확인할 수 있어요.",
    time: "어제 오후 6:10",
    read: false,
  },
  {
    id: 3,
    kind: "결제",
    title: "체험 결제 상태를 확인했어요",
    description: "실제 결제나 상품 지급 없이 화면 흐름만 완료된 체험 기록이에요.",
    time: "8월 22일 오후 2:40",
    read: true,
  },
];

export function LoginPrototypeScreen() {
  const [provider, setProvider] = useState<Provider>("카카오");
  const [email, setEmail] = useState("");
  const [serviceConsent, setServiceConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [account, setAccount] = useState<{ provider: Provider; email: string; marketing: boolean } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccount({ provider, email: email.trim(), marketing: marketingConsent });
  }

  if (account) {
    return (
      <main className={`screen-content settings-content signal-atlas-account-summary ${styles.srScreen}`} aria-labelledby="account-summary-title">
        <p className="section-kicker signal-atlas-overline">로그인 체험 완료</p>
        <h1 id="account-summary-title">사주리움에<br />돌아오셨네요</h1>
        <p className="supporting" role="status">입력한 내용으로 로그인 이후 화면을 미리 보여드려요.</p>

        <section className="insight-card current signal-account-summary-card" aria-labelledby="prototype-account-heading">
          <small>체험 계정</small>
          <h2 id="prototype-account-heading">체험 계정 요약</h2>
          <p><strong>연결 방식</strong> · {account.provider}</p>
          <p><strong>이메일</strong> · {account.email || "소셜 로그인 방식"}</p>
          <p><strong>소식 수신 선호</strong> · {account.marketing ? "선택함" : "선택하지 않음"}</p>
        </section>

        <aside className="privacy-panel signal-local-only-note">
          <strong>실제 로그인이 아닙니다</strong>
          <p>계정과 세션은 생성되지 않으며, 입력한 이메일과 선택 내용은 저장되거나 외부로 전송되지 않습니다.</p>
        </aside>

        <button className="secondary-button signal-secondary-action" type="button" onClick={() => setAccount(null)}>로그인 화면으로 돌아가기</button>
      </main>
    );
  }

  return (
    <main className={`screen-content form-content signal-atlas-login-screen ${styles.srScreen}`} aria-labelledby="login-title">
      <header className="form-hero signal-login-hero">
        <p className="section-kicker signal-atlas-overline">로그인</p>
        <h1 id="login-title">기록을 이어가려면<br />로그인해 주세요</h1>
        <p className="supporting">무료 요약은 가입 전에도 볼 수 있어요.</p>
      </header>

      <aside className="privacy-panel signal-login-disclosure" id="login-disclosure">
        <strong>로그인 체험 전용</strong>
        <p>실제 계정이나 세션을 만들지 않습니다. 소셜 서비스에 연결하지 않으며 입력값을 저장하거나 외부로 전송하지 않습니다.</p>
      </aside>

      <section data-slop-allow="nested-cards" className="signal-login-benefits" aria-label="로그인 후 이용할 수 있는 기능">
        <div className="signal-login-benefit-row">
          <span className="signal-login-benefit-icon" aria-hidden="true">✓</span>
          <span><strong>기기 기록 이관</strong><small>기존 기록을 계정으로 옮겨요.</small></span>
        </div>
        <div className="signal-login-benefit-row">
          <span className="signal-login-benefit-icon" aria-hidden="true">▣</span>
          <span><strong>구매 리포트 보관</strong><small>구매한 리포트를 보관함에 저장해요.</small></span>
        </div>
      </section>

      <form className="birth-fields signal-login-form" onSubmit={submit} aria-describedby="login-disclosure">
        <fieldset className="signal-login-provider-fieldset">
          <legend>로그인 방법 선택</legend>
          <div className="signal-login-provider-list topic-list">
            {PROVIDERS.map((item) => (
              <label className={`topic-card signal-login-provider${provider === item ? " selected" : ""}`} key={item}>
                <input
                  className="selection-radio"
                  type="radio"
                  name="provider"
                  value={item}
                  checked={provider === item}
                  onChange={() => setProvider(item)}
                />
                <span className="signal-login-provider-icon" aria-hidden="true">{item === "이메일" ? "✉" : item === "Google" ? "G" : "●"}</span>
                <span><strong>{item}로 로그인</strong><small>{item === "이메일" ? "이메일 주소로 로그인 체험" : `${item} 계정 연결 없이 선택만 체험`}</small></span>
                <span className="row-marker" aria-hidden="true">{provider === item ? "선택" : "○"}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {provider === "이메일" && (
          <label className="field-group signal-login-email-field" htmlFor="prototype-email">
            <span className="field-label">이메일</span>
            <input
              id="prototype-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
        )}

        <fieldset className="signal-login-consent-fieldset">
          <legend>약관 동의</legend>
          <label className="check-card">
            <input type="checkbox" checked={serviceConsent} onChange={(event) => setServiceConsent(event.target.checked)} required />
            <span>[필수] 서비스 이용약관에 동의합니다</span>
          </label>
          <label className="check-card">
            <input type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} required />
            <span>[필수] 개인정보 안내를 확인했습니다</span>
          </label>
          <label className="check-card">
            <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
            <span>[선택] 새로운 해석과 소식 안내를 받습니다</span>
          </label>
          <nav className="signal-login-legal-links" aria-label="약관 및 개인정보 안내">
            <Link href="/settings/terms">이용약관</Link>
            <Link href="/settings/privacy">개인정보 처리방침</Link>
          </nav>
          <p className="signal-login-legal-note">가입하면 위 약관에 동의해요. 기록은 언제든 삭제할 수 있어요.</p>
        </fieldset>

        <button className="primary-button signal-primary-cta form-submit" type="submit">로그인 이후 화면 보기</button>
        <p className="action-note">선택 동의 여부와 관계없이 프로토타입을 체험할 수 있어요.</p>
      </form>
    </main>
  );
}

export function NotificationCenterScreen() {
  const [tab, setTab] = useState<NotificationTab>("all");
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [preferences, setPreferences] = useState({ flow: true, report: true, payment: false, email: false });

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = tab === "unread"
    ? notifications.filter((notification) => !notification.read)
    : notifications;

  function markRead(id: number) {
    setNotifications((current) => current.map((notification) => (
      notification.id === id ? { ...notification, read: true } : notification
    )));
  }

  function markAllRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  function updatePreference(key: keyof typeof preferences, checked: boolean) {
    setPreferences((current) => ({ ...current, [key]: checked }));
  }

  return (
    <main className={`screen-content settings-content signal-atlas-notifications-screen ${styles.srScreen}`} aria-labelledby="notifications-title">
      <header className="signal-notifications-header">
        <p className="section-kicker signal-atlas-overline">소식과 기록</p>
        <h1 id="notifications-title">알림 센터</h1>
        <p className="supporting" aria-live="polite">읽지 않은 알림 {unreadCount}개 · 이 화면에서만 상태가 바뀝니다.</p>
      </header>

      <aside className="privacy-panel signal-notifications-disclosure">
        <strong>알림 체험 전용</strong>
        <p>실제 푸시나 이메일은 발송되지 않습니다. 읽음 상태와 수신 선호는 현재 화면에만 반영되며 저장되거나 외부로 전송되지 않아요.</p>
      </aside>

      <section className="settings-section signal-notification-list-section" aria-labelledby="notification-list-heading">
        <div>
          <h2 id="notification-list-heading">받은 알림</h2>
          <div className="segmented-control notification-tabs signal-notification-tabs" role="tablist" aria-label="알림 보기 범위">
            <button id="all-notifications-tab" className={tab === "all" ? "selected" : ""} type="button" role="tab" aria-controls="notification-panel" aria-selected={tab === "all"} onClick={() => setTab("all")}>전체 {notifications.length}</button>
            <button id="unread-notifications-tab" className={tab === "unread" ? "selected" : ""} type="button" role="tab" aria-controls="notification-panel" aria-selected={tab === "unread"} onClick={() => setTab("unread")}>읽지 않음 {unreadCount}</button>
          </div>
        </div>

        {unreadCount > 0 && <button className="secondary-button" type="button" onClick={markAllRead}>모두 읽음으로 표시</button>}

        <div id="notification-panel" className="library-list signal-notification-list" role="tabpanel" aria-labelledby={`${tab}-notifications-tab`} aria-live="polite">
          {visibleNotifications.map((notification) => (
            <article className={`signal-notification-row${notification.read ? " notification-read-item" : ""}`} key={notification.id}>
              <div>
                <small>{notification.kind} · {notification.read ? "읽음" : "새 알림"}</small>
                <h2>{notification.title}</h2>
                <p>{notification.description}</p>
                <time>{notification.time}</time>
              </div>
              <div className="library-item-actions">
                {!notification.read && <button type="button" onClick={() => markRead(notification.id)} aria-label={`‘${notification.title}’ 읽음으로 표시`}>읽음 표시</button>}
              </div>
            </article>
          ))}
          {visibleNotifications.length === 0 && (
            <article>
              <div><small>모두 확인했어요</small><h2>읽지 않은 알림이 없습니다</h2><p>전체 탭에서 지난 체험 알림을 다시 볼 수 있어요.</p></div>
            </article>
          )}
        </div>
      </section>

      <section className="settings-section signal-notification-preferences" aria-labelledby="notification-preferences-heading">
        <h2 id="notification-preferences-heading">알림 선호</h2>
        <p>아래 선택은 발송 신청이 아닌 화면 체험용 설정입니다.</p>
        <label className="setting-toggle"><span><strong>오늘의 흐름</strong><small>매일의 흐름 소식</small></span><input type="checkbox" checked={preferences.flow} onChange={(event) => updatePreference("flow", event.target.checked)} /></label>
        <label className="setting-toggle"><span><strong>새 리포트</strong><small>리포트 준비 및 다시 읽기</small></span><input type="checkbox" checked={preferences.report} onChange={(event) => updatePreference("report", event.target.checked)} /></label>
        <label className="setting-toggle"><span><strong>결제 상태</strong><small>체험 결제 흐름의 상태</small></span><input type="checkbox" checked={preferences.payment} onChange={(event) => updatePreference("payment", event.target.checked)} /></label>
        <label className="setting-toggle"><span><strong>이메일로 받기</strong><small>실제 이메일은 발송되지 않음</small></span><input type="checkbox" checked={preferences.email} onChange={(event) => updatePreference("email", event.target.checked)} /></label>
        <p className="action-note" role="status">{Object.values(preferences).filter(Boolean).length}개 항목을 화면에서 선택했어요.</p>
      </section>
    </main>
  );
}

export function LiveNotificationScreen() {
  const [preferences, setPreferences] = useState<{ topics: Record<string, boolean>; quiet_hours_start: number; quiet_hours_end: number; timezone: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getNotificationPreferences().then(setPreferences).catch((reason) => setError(formatApiRequestError(reason, "알림 설정을 불러오지 못했어요."))); }, []);
  if (!preferences && !error) return <LoadingState title="서버 알림 설정을 불러오고 있어요" />;
  return (
    <main className={`screen-content settings-content ${styles.srScreen}`} aria-labelledby="notification-title">
      <p className="section-kicker">알림 설정</p>
      <h1 id="notification-title">받고 싶은 소식</h1>
      {error ? <p className="form-error" role="alert">{error}</p> : <>
        <p className="supporting">선호도는 서버 계정 또는 익명 세션에 저장됩니다.</p>
        {Object.entries(preferences?.topics ?? {}).map(([topic, enabled]) => (
          <label className="setting-toggle" key={topic}>
            <span><strong>{topic}</strong></span>
            <input type="checkbox" checked={enabled} onChange={(event) => {
              if (!preferences) return;
              const previous = preferences;
              const topics = { ...preferences.topics, [topic]: event.target.checked };
              setPreferences({ ...preferences, topics });
              void updateNotificationPreferences({ topics }).then(setPreferences).catch(() => {
                setPreferences(previous);
                setError("저장하지 못했어요.");
              });
            }} />
          </label>
        ))}
        <p className="action-note">조용한 시간: {preferences?.quiet_hours_start}:00–{preferences?.quiet_hours_end}:00 · {preferences?.timezone}</p>
      </>}
    </main>
  );
}

const MIGRATION_MESSAGES: Record<AnonymousMigrationStatus, string> = {
  migrated: "로그인됐어요. 익명 데이터를 계정으로 옮겼어요.",
  "already-migrated": "로그인됐어요. 익명 데이터는 이미 계정으로 이전되어 있어요.",
  unavailable: "로그인됐어요. 익명 데이터가 만료되었거나 존재하지 않아 이전하지 못했어요.",
  pending: "로그인됐어요. 익명 데이터 이전을 마치지 못해 다음 로그인에서 이어서 시도돼요.",
  "not-needed": "로그인됐어요. 서버 계정으로 계속 진행할 수 있습니다.",
};

export function LiveLoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const action = mode === "login" ? loginAccount(email, password) : registerAccount(email, password, name);
    void action.then((result) => setMessage(MIGRATION_MESSAGES[result.migration])).catch((error) => setMessage(formatApiRequestError(error, "인증에 실패했어요.")));
  }

  return <main className={`screen-content login-content ${styles.srScreen}`} aria-labelledby="login-title"><p className="section-kicker">계정</p><h1 id="login-title">{mode === "login" ? "로그인" : "계정 만들기"}</h1><p className="supporting">로그인하면 현재 익명 데이터 이전을 이어갈 수 있습니다.</p><form onSubmit={submit}><label className="signal-field">이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{mode === "register" && <label className="signal-field">이름<input value={name} onChange={(event) => setName(event.target.value)} /></label>}<label className="signal-field">비밀번호<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button" type="submit">{mode === "login" ? "로그인" : "계정 만들기"}</button></form>{message && <p className="form-error" role="status">{message}</p>}<button className="text-button" type="button" onClick={() => setMode((current) => current === "login" ? "register" : "login")}>{mode === "login" ? "계정 만들기" : "로그인으로"}</button><p className="action-note">소셜 로그인은 제공자 자격증명이 연결되면 이 화면에 추가됩니다.</p></main>;
}

export function LiveAccountScreen() {
  const [reason, setReason] = useState(""); const [message, setMessage] = useState("");
  return <main className={`screen-content account-content ${styles.srScreen}`} aria-labelledby="account-title"><p className="section-kicker">계정</p><h1 id="account-title">계정과 데이터</h1><p className="supporting">익명 세션은 로그인 후 서버 계정으로 이전할 수 있습니다. 삭제 요청은 서버 정책에 따라 처리됩니다.</p><button className="secondary-button" type="button" onClick={() => { void logoutAccount().then((result) => setMessage(result === "complete" ? "로그아웃됐어요. 이 기기의 계정 세션을 지웠습니다." : "서버에 연결하지 못했지만 이 기기의 계정 세션은 지웠습니다.")); }}>로그아웃</button><label className="signal-field">삭제 사유 (선택)<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="secondary-button" type="button" onClick={() => { void requestAccountDeletion(reason).then((result) => setMessage(`삭제 요청 상태: ${String(result.status ?? "접수됨")}`)).catch((error) => setMessage(error instanceof Error ? error.message : "삭제 요청을 접수하지 못했어요.")); }}>계정 삭제 요청</button>{message && <p className="form-error" role="status">{message}</p>}</main>;
}
