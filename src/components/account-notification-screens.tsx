"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { announceUnreadCount, formatApiRequestError, formatIdentityError, getNotificationPreferences, getSessionKind, linkIdentity, listEnabledSocialProviders, listIdentities, listNotifications, markAllNotificationsRead, markNotificationRead, loginAccount, loginSocialAccount, logoutAccount, registerAccount, requestAccountDeletion, unlinkIdentity, type AccountIdentities, type AnonymousMigrationStatus, type ServerNotification, type SocialProvider, updateNotificationPreferences } from "@/lib/api/service";
import { useHydrated } from "@/hooks/use-hydrated";
import { pushEnabled } from "@/lib/feature-availability";
import { clientSocialProviders, SocialLoginOptions, SocialProviderButtons } from "./social-login-options";
import { EmptyState, LoadingState } from "./page-state";
import { CheckIcon } from "./ui/icons";
import { Banner, GroupRowLink } from "./ui/layout";

/* ---------- Notification topics ---------- */

/**
 * Every topic the server can send (`DEFAULT_TOPICS` in the backend notification service),
 * plus the legacy `payment` code older preferences may still carry. Settings rows and inbox
 * labels both read this list, so a topic is named the same way everywhere.
 */
const NOTIFICATION_TOPICS: readonly { code: string; label: string; desc: string }[] = [
  { code: "daily_flow", label: "오늘의 흐름", desc: "그날의 흐름이 준비되면 알려드려요" },
  { code: "report_ready", label: "리포트 완성", desc: "리포트가 준비되면 알려드려요" },
  { code: "consultation_answered", label: "상담 답변", desc: "상담 답변이 도착하면 알려드려요" },
  { code: "payment_completed", label: "결제 완료", desc: "결제와 지급이 끝나면 알려드려요" },
  { code: "payment", label: "결제", desc: "주문과 결제 상태가 바뀌면 알려드려요" },
  { code: "marketing", label: "혜택과 소식", desc: "새 리포트와 이벤트 안내, 따로 동의한 경우에만 보내요" },
];

/** Topics this client does not know yet share one row, so no two rows look the same and no raw code shows. */
const OTHER_TOPICS_ROW = { code: "__other__", label: "기타 알림", desc: "위에 없는 서비스 안내를 한 번에 켜고 꺼요" };

function notificationTopicLabel(topic: string) {
  return NOTIFICATION_TOPICS.find((item) => item.code === topic)?.label ?? "알림";
}

function formatHour(hour: number) {
  if (hour === 0) return "자정";
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `아침 ${hour}시`;
  if (hour === 12) return "낮 12시";
  if (hour < 18) return `오후 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

function formatNotificationDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso.slice(0, 10);
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

type NotificationPreferences = { topics: Record<string, boolean>; quiet_hours_start: number; quiet_hours_end: number; timezone: string };

/** Server-backed notification preferences, shown as a group inside the settings screen. */
export function NotificationPreferencesGroup() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [quietOpen, setQuietOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void getNotificationPreferences()
      .then((value) => { if (active) setPreferences(value); })
      .catch((reason) => { if (active) setLoadError(formatApiRequestError(reason, "알림 설정을 불러오지 못했어요.")); });
    return () => { active = false; };
  }, [attempt]);

  function save(next: NotificationPreferences, body: Partial<NotificationPreferences>) {
    if (!preferences) return;
    const previous = preferences;
    setPreferences(next);
    setSaveError("");
    void updateNotificationPreferences(body).then(setPreferences).catch(() => {
      setPreferences(previous);
      setSaveError("알림 설정을 저장하지 못했어요. 잠시 후 다시 바꿔 주세요.");
    });
  }

  if (loadError) {
    return (
      <div className="sj-card">
        <p className="sj-error" role="alert">{loadError}</p>
        <button className="sj-button-secondary" type="button" onClick={() => { setPreferences(null); setLoadError(""); setAttempt((value) => value + 1); }}>다시 시도</button>
      </div>
    );
  }
  if (!preferences) {
    return (
      <div className="sj-card" aria-busy="true">
        <p className="sj-meta">알림 설정을 불러오고 있어요.</p>
      </div>
    );
  }

  const known = NOTIFICATION_TOPICS.filter((topic) => topic.code in preferences.topics);
  const extra = Object.keys(preferences.topics).filter((code) => !NOTIFICATION_TOPICS.some((topic) => topic.code === code));
  const rows = [
    ...known.map((topic) => ({ ...topic, codes: [topic.code] })),
    ...(extra.length ? [{ ...OTHER_TOPICS_ROW, codes: extra }] : []),
  ];
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <>
      <div className="sj-group">
        {rows.map((topic) => (
          <label className="sj-row-in-group" key={topic.code} style={{ minHeight: 64 }}>
            <span className="sj-row-main">
              <span className="sj-row-title">{topic.label}</span>
              <span className="sj-row-sub" style={{ fontSize: 12 }}>{topic.desc}</span>
            </span>
            <input className="sj-switch" type="checkbox" role="switch" checked={topic.codes.every((code) => preferences.topics[code])} onChange={(event) => {
              const changed = Object.fromEntries(topic.codes.map((code) => [code, event.target.checked]));
              const topics = { ...preferences.topics, ...changed };
              save({ ...preferences, topics }, { topics });
            }} />
          </label>
        ))}
        <button className="sj-row-in-group" type="button" aria-expanded={quietOpen} aria-controls="quiet-hours-panel" onClick={() => setQuietOpen((value) => !value)}>
          <span className="sj-row-main"><span className="sj-row-title">방해 금지 시간</span></span>
          <span className="sj-row-value">{formatHour(preferences.quiet_hours_start)} – {formatHour(preferences.quiet_hours_end)}</span>
        </button>
        {quietOpen && (
          <div id="quiet-hours-panel" className="sj-section" style={{ padding: "4px 16px 16px" }}>
            <p className="sj-help">이 시간에는 알림을 보내지 않아요.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div className="sj-field">
                <label className="sj-label" htmlFor="quiet-start">시작</label>
                <select id="quiet-start" className="sj-select" value={preferences.quiet_hours_start} onChange={(event) => {
                  const value = Number(event.target.value);
                  save({ ...preferences, quiet_hours_start: value }, { quiet_hours_start: value });
                }}>
                  {hours.map((hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                </select>
              </div>
              <div className="sj-field">
                <label className="sj-label" htmlFor="quiet-end">끝</label>
                <select id="quiet-end" className="sj-select" value={preferences.quiet_hours_end} onChange={(event) => {
                  const value = Number(event.target.value);
                  save({ ...preferences, quiet_hours_end: value }, { quiet_hours_end: value });
                }}>
                  {hours.map((hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
      {!pushEnabled && <p className="sj-fine" style={{ margin: "8px 4px 0" }}>휴대폰 푸시는 준비 중이에요. 고른 알림은 알림함에 쌓여요.</p>}
      {saveError && <p className="sj-error" role="alert" style={{ marginTop: 8 }}>{saveError}</p>}
    </>
  );
}

/* ---------- Notification inbox ---------- */

function internalHref(link: string | null | undefined) {
  return link?.startsWith("/") && !link.startsWith("//") ? link : null;
}

function NotificationRow({ notification, first, onOpen }: { notification: ServerNotification; first: boolean; onOpen: (notification: ServerNotification) => void }) {
  const read = Boolean(notification.read_at);
  const href = internalHref(notification.deep_link);
  const titleId = `notification-${notification.id}-title`;
  const content = (
    <>
      <span className={read ? "sj-unread-dot sj-unread-dot-off" : "sj-unread-dot"} aria-hidden="true" />
      <span className="sj-row-main">
        <span className="sj-fine">{notificationTopicLabel(notification.topic)}, {formatNotificationDate(notification.created_at)}</span>
        <span id={titleId} className="sj-row-title" style={read ? { color: "var(--sj-ink-strong-muted)" } : { fontWeight: 700 }}>{notification.title}</span>
        {notification.body && <span className="sj-row-sub" style={{ color: "var(--sj-ink-strong-muted)" }}>{notification.body}</span>}
        {!read && <span className="sj-visually-hidden">, 읽지 않음</span>}
      </span>
      {!read && <span className="sj-badge sj-badge-accent" aria-hidden="true">읽지 않음</span>}
    </>
  );
  const rowStyle = { alignItems: "flex-start", padding: "14px 16px", borderTop: first ? 0 : undefined } as const;
  if (href) {
    return (
      <li>
        <Link className="sj-row-in-group" href={href} style={rowStyle} onClick={() => { if (!read) onOpen(notification); }}>{content}</Link>
      </li>
    );
  }
  if (!read) {
    return (
      <li>
        <button className="sj-row-in-group" type="button" style={rowStyle} onClick={() => onOpen(notification)}>{content}</button>
      </li>
    );
  }
  return <li className="sj-row-in-group" style={{ ...rowStyle, cursor: "default" }}>{content}</li>;
}

export function LiveNotificationScreen() {
  const [notifications, setNotifications] = useState<ServerNotification[] | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void listNotifications()
      .then((items) => { if (active) setNotifications(items); })
      .catch((reason) => { if (active) setError(formatApiRequestError(reason, "알림을 불러오지 못했어요.")); });
    return () => { active = false; };
  }, [attempt]);
  if (!notifications && !error) return <LoadingState title="받은 알림을 불러오고 있어요" />;
  if (notifications && notifications.length === 0) {
    return (
      <main className="sj-page">
        <EmptyState title="아직 받은 알림이 없어요" description="리포트가 준비되거나 그날의 흐름이 열리면 여기에 모아 드려요. 받을 알림 종류는 설정에서 고를 수 있어요." action={{ href: "/settings#notifications", label: "알림 설정 열기" }} />
      </main>
    );
  }

  const items = notifications ?? [];
  const unread = items.filter((item) => !item.read_at);
  const read = items.filter((item) => item.read_at);

  function applyRead(updated: ServerNotification) {
    setNotifications((current) => {
      const next = current?.map((item) => (item.id === updated.id ? { ...item, read_at: updated.read_at ?? new Date().toISOString() } : item)) ?? null;
      if (next) announceUnreadCount(next.filter((item) => !item.read_at).length);
      return next;
    });
  }

  function open(notification: ServerNotification) {
    setActionError("");
    setStatus("");
    void markNotificationRead(notification.id)
      .then((updated) => {
        applyRead(updated);
        if (!internalHref(notification.deep_link)) setStatus(`'${notification.title}' 알림을 읽음으로 표시했어요.`);
      })
      .catch((reason) => setActionError(formatApiRequestError(reason, "읽음으로 표시하지 못했어요. 잠시 후 다시 시도해 주세요.")));
  }

  async function markAll() {
    setMarkingAll(true);
    setActionError("");
    setStatus("");
    try {
      const result = await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((current) => current?.map((item) => (item.read_at ? item : { ...item, read_at: now })) ?? null);
      announceUnreadCount(result.unreadCount);
      setStatus("알림을 모두 읽음으로 표시했어요.");
    } catch (reason) {
      setActionError(formatApiRequestError(reason, "모두 읽음으로 표시하지 못했어요. 잠시 후 다시 시도해 주세요."));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <main className="sj-page" aria-labelledby="notification-title">
      <div className="sj-section-head" style={{ alignItems: "center" }}>
        <h1 id="notification-title" className="sj-h2">받은 알림</h1>
        {!error && unread.length > 0 && (
          <button className="sj-text-button" type="button" onClick={() => void markAll()} disabled={markingAll}>{markingAll ? "표시하고 있어요" : "모두 읽음"}</button>
        )}
      </div>
      {!pushEnabled && <Banner>휴대폰 푸시는 준비 중이고, 알림은 여기서 모두 볼 수 있어요.</Banner>}
      {actionError && <p className="sj-error" role="alert">{actionError}</p>}
      <p className="sj-meta" role="status">{status}</p>

      {error ? (
        <div className="sj-section">
          <p className="sj-error" role="alert">{error}</p>
          <button className="sj-button-secondary" type="button" onClick={() => { setNotifications(null); setError(""); setAttempt((value) => value + 1); }}>알림 다시 불러오기</button>
        </div>
      ) : (
        <>
          {unread.length > 0 && (
            <section className="sj-section" style={{ gap: 0 }} aria-labelledby="notification-unread-heading">
              <h2 id="notification-unread-heading" className="sj-group-title">읽지 않음 {unread.length}개</h2>
              <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {unread.map((notification, index) => <NotificationRow key={notification.id} notification={notification} first={index === 0} onOpen={open} />)}
              </ul>
            </section>
          )}
          {read.length > 0 && (
            <section className="sj-section" style={{ gap: 0 }} aria-labelledby="notification-read-heading">
              <h2 id="notification-read-heading" className="sj-group-title">읽음</h2>
              <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {read.map((notification, index) => <NotificationRow key={notification.id} notification={notification} first={index === 0} onOpen={open} />)}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="sj-section" style={{ gap: 0 }} aria-label="알림 설정">
        <div className="sj-group">
          <GroupRowLink href="/settings#notifications" title="알림 설정" sub="받을 알림 종류와 방해 금지 시간" />
        </div>
      </section>
    </main>
  );
}

/* ---------- Login ---------- */

const MIGRATION_MESSAGES: Record<AnonymousMigrationStatus, string> = {
  migrated: "로그인됐어요. 익명 데이터를 계정으로 옮겼어요.",
  "already-migrated": "로그인됐어요. 익명 데이터는 이미 계정으로 이전되어 있어요.",
  unavailable: "로그인됐어요. 익명 데이터가 만료되었거나 존재하지 않아 이전하지 못했어요.",
  pending: "로그인됐어요. 익명 데이터 이전을 마치지 못해 다음 로그인에서 이어서 시도돼요.",
  "not-needed": "로그인됐어요. 계정으로 계속 이용할 수 있어요.",
};

export function LiveLoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setMessage("");
    setSignedIn(false);
    setPending(true);
    const action = mode === "login" ? loginAccount(email, password) : registerAccount(email, password, name);
    void action.then((result) => { setMessage(MIGRATION_MESSAGES[result.migration]); setSignedIn(true); })
      .catch((error) => setMessage(formatApiRequestError(error, "로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.")))
      .finally(() => { pendingRef.current = false; setPending(false); });
  }

  async function acceptSocialCredential(provider: SocialProvider, idToken: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setMessage("");
    setSignedIn(false);
    try {
      const result = await loginSocialAccount(provider, idToken);
      setMessage(MIGRATION_MESSAGES[result.migration]);
      setSignedIn(true);
    } catch (error) {
      setMessage(formatApiRequestError(error, "소셜 로그인을 마치지 못했어요. 다시 시도해 주세요."));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function switchMode(next: "login" | "register") {
    if (pending) return;
    setMode(next);
    setMessage("");
  }

  const submitLabel = mode === "login" ? "로그인" : "계정 만들기";

  return (
    <main className="sj-page" style={{ gap: 24 }} aria-labelledby="login-title">
      <div className="sj-section" style={{ gap: 8 }}>
        <h1 id="login-title" className="sj-h1">{mode === "login" ? "로그인하고 기록을 이어가세요" : "계정을 만들고 기록을 옮겨요"}</h1>
        <p className="sj-lead" style={{ fontSize: 14 }}>다른 기기에서도 같은 명식과 리포트를 볼 수 있어요.</p>
      </div>

      <div className="sj-segmented" role="tablist" aria-label="로그인 방식">
        <button className="sj-segment" id="login-tab-login" type="button" role="tab" aria-selected={mode === "login"} aria-controls="login-panel" disabled={pending} onClick={() => switchMode("login")}>로그인</button>
        <button className="sj-segment" id="login-tab-register" type="button" role="tab" aria-selected={mode === "register"} aria-controls="login-panel" disabled={pending} onClick={() => switchMode("register")}>계정 만들기</button>
      </div>

      <Banner>지금 이 기기에서 쓰던 명식, 리포트, 상담 기록과 이용권은 로그인하면 계정으로 옮겨져요.</Banner>

      <form id="login-panel" role="tabpanel" aria-labelledby={mode === "login" ? "login-tab-login" : "login-tab-register"} className="sj-section" style={{ gap: 18 }} onSubmit={submit}>
        <div className="sj-field">
          <label className="sj-label" htmlFor="login-email">이메일</label>
          <input id="login-email" className="sj-input" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        {mode === "register" && (
          <div className="sj-field">
            <label className="sj-label" htmlFor="login-name">이름</label>
            <input id="login-name" className="sj-input" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        )}
        <div className="sj-field">
          <label className="sj-label" htmlFor="login-password">비밀번호</label>
          <input id="login-password" className="sj-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} aria-describedby="login-password-help" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <p id="login-password-help" className="sj-help">8자 이상이에요</p>
        </div>
        <button className="sj-button sj-button-block" type="submit" disabled={pending}>{submitLabel}</button>
      </form>

      {message && (
        <div className="sj-section" style={{ gap: 8 }}>
          <p className={signedIn ? "sj-meta" : "sj-error"} role="status" style={signedIn ? { display: "flex", gap: 8, alignItems: "flex-start", color: "var(--sj-ink-body)" } : undefined}>
            {signedIn && <CheckIcon style={{ flex: "0 0 auto", marginTop: 2 }} />}{message}
          </p>
          {signedIn && <Link className="sj-button-secondary" href="/home">홈으로 가기</Link>}
        </div>
      )}

      <SocialLoginOptions onCredential={acceptSocialCredential} onError={(text) => { setSignedIn(false); setMessage(text); }} pending={pending} />

      <p className="sj-fine sj-center">가입하면 <Link href="/settings/terms">이용약관</Link>과 <Link href="/settings/privacy">개인정보 처리방침</Link>에 동의하게 돼요.</p>
    </main>
  );
}

/* ---------- Account ---------- */

const PROVIDER_LABELS: Record<string, string> = { google: "Google", apple: "Apple", kakao: "카카오" };

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function formatLinkedDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * Moves keyboard focus to an element by id after the next render. Confirmation steps swap
 * buttons in and out, and the browser drops focus to the page body when the focused button
 * unmounts, so each step names where focus should land instead.
 */
function useFocusAfterRender() {
  const target = useRef<string | null>(null);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (!target.current) return;
    const element = document.getElementById(target.current);
    target.current = null;
    element?.focus();
  }, [request]);
  return (id: string) => {
    target.current = id;
    setRequest((value) => value + 1);
  };
}

/** Login methods of a signed-in account: list, unlink with confirmation, and link enabled providers. */
export function LoginMethodsSection() {
  const [methods, setMethods] = useState<AccountIdentities | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [enabledProviders, setEnabledProviders] = useState<SocialProvider[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [status, setStatus] = useState("");
  const focusAfterRender = useFocusAfterRender();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    void listIdentities()
      .then((value) => { if (active) setMethods(value); })
      .catch((reason) => { if (active) setLoadError(formatIdentityError(reason, "로그인 수단을 불러오지 못했어요.")); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    let active = true;
    // 서버가 켜 둔 제공자만 연결 버튼을 그린다. 목록을 못 받으면 버튼 없이 안내만 남긴다.
    void listEnabledSocialProviders()
      .then((value) => { if (active) setEnabledProviders(value); })
      .catch(() => { if (active) setEnabledProviders([]); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    try {
      const value = await listIdentities();
      if (mounted.current) setMethods(value);
    } catch {
      // 방금 받은 목록을 그대로 두고, 작업 결과 안내만 보여 준다.
    }
  }

  async function unlink(provider: string) {
    setBusy(provider);
    setActionError("");
    setStatus("");
    let succeeded = false;
    try {
      await unlinkIdentity(provider);
      if (!mounted.current) return;
      setStatus(`${providerLabel(provider)} 연결을 해제했어요.`);
      succeeded = true;
    } catch (reason) {
      if (!mounted.current) return;
      setActionError(formatIdentityError(reason, "연결을 해제하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    setConfirming(null);
    await refresh();
    if (!mounted.current) return;
    setBusy(null);
    // The row's buttons are gone or replaced, so focus lands on the result message.
    focusAfterRender(succeeded ? "account-methods-status" : "account-methods-error");
  }

  async function link(provider: SocialProvider, idToken: string) {
    if (busy) return;
    setBusy("link");
    setActionError("");
    setStatus("");
    try {
      await linkIdentity(provider, idToken);
      if (!mounted.current) return;
      const label = providerLabel(provider);
      setStatus(`${label} 계정을 연결했어요. 이제 ${label}로 로그인해도 이 계정이 열려요.`);
    } catch (reason) {
      if (!mounted.current) return;
      setActionError(formatIdentityError(reason, "소셜 계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    await refresh();
    if (mounted.current) setBusy(null);
  }

  const linked = new Set(methods?.identities.map((item) => item.provider));
  const linkable = enabledProviders && methods ? clientSocialProviders().filter((provider) => enabledProviders.includes(provider) && !linked.has(provider)) : [];
  const canUnlink = methods ? methods.hasPassword || methods.identities.length > 1 : false;
  const rowStyle = { cursor: "default", flexWrap: "wrap" } as const;

  return (
    <section className="sj-section" style={{ gap: 0 }} aria-labelledby="account-methods-title">
      <h2 id="account-methods-title" className="sj-group-title">로그인 수단</h2>
      {loadError ? (
        <div className="sj-card">
          <p className="sj-error" role="alert">{loadError}</p>
          <button className="sj-button-secondary" type="button" onClick={() => { setLoadError(""); setMethods(null); setAttempt((value) => value + 1); }}>로그인 수단 다시 불러오기</button>
        </div>
      ) : !methods ? (
        <div className="sj-card" aria-busy="true">
          <p className="sj-meta">로그인 수단을 불러오고 있어요.</p>
        </div>
      ) : (
        <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }} aria-label="연결된 로그인 수단">
          {methods.hasPassword && (
            <li className="sj-row-in-group" style={rowStyle}>
              <span className="sj-row-main">
                <span className="sj-row-title">이메일과 비밀번호</span>
                {methods.email && <span className="sj-row-sub">{methods.email}</span>}
              </span>
            </li>
          )}
          {methods.identities.map((identity) => {
            const label = providerLabel(identity.provider);
            const noteId = `identity-${identity.provider}-note`;
            return (
              <li key={identity.provider} className="sj-row-in-group" style={rowStyle}>
                <span className="sj-row-main">
                  <span className="sj-row-title">{label}</span>
                  <span className="sj-row-sub">{formatLinkedDate(identity.linkedAt)}에 연결했어요</span>
                  {!canUnlink && <span id={noteId} className="sj-row-sub">남은 로그인 수단이 이것뿐이라 해제할 수 없어요.</span>}
                </span>
                {confirming !== identity.provider && (
                  <button id={`identity-${identity.provider}-unlink`} className="sj-text-button" type="button" aria-label={`${label} 연결 해제`} aria-describedby={canUnlink ? undefined : noteId}
                          disabled={!canUnlink || busy !== null} onClick={() => {
                            setStatus("");
                            setActionError("");
                            setConfirming(identity.provider);
                            focusAfterRender(`identity-${identity.provider}-confirm`);
                          }}>연결 해제</button>
                )}
                {confirming === identity.provider && (
                  <div className="sj-section" role="group" aria-labelledby={`identity-${identity.provider}-question`} style={{ flexBasis: "100%", gap: 8, paddingBottom: 6 }}>
                    <p id={`identity-${identity.provider}-question`} className="sj-meta">{label} 연결을 해제할까요? 해제하면 {label}로는 이 계정에 로그인할 수 없어요.</p>
                    <div className="sj-actions-row">
                      <button id={`identity-${identity.provider}-confirm`} className="sj-button-danger" type="button" disabled={busy !== null} aria-describedby={`identity-${identity.provider}-question`}
                              onClick={() => { void unlink(identity.provider); }}>{busy === identity.provider ? "해제하고 있어요" : "연결 해제 확정"}</button>
                      <button className="sj-button-secondary" type="button" disabled={busy !== null} onClick={() => {
                        setConfirming(null);
                        focusAfterRender(`identity-${identity.provider}-unlink`);
                      }}>취소</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {!methods.hasPassword && methods.identities.length === 0 && (
            <li className="sj-row-in-group" style={rowStyle}><span className="sj-row-sub">연결된 로그인 수단이 없어요.</span></li>
          )}
        </ul>
      )}
      <p className="sj-fine" style={{ margin: "8px 4px 0" }}>같은 이메일이라도 계정을 자동으로 합치지 않아요. 여기에서 연결한 수단으로 로그인하면 지금 이 계정이 열려요.</p>

      {methods && enabledProviders && (linkable.length > 0 ? (
        <div className="sj-section" style={{ gap: 10, marginTop: 16 }}>
          <h3 className="sj-group-title" style={{ margin: "0 4px" }}>다른 로그인 수단 연결</h3>
          <SocialProviderButtons providers={linkable} onCredential={link} pending={busy !== null} appleLabel="Apple 계정 연결"
                                 onError={(text) => { setStatus(""); setActionError(text); }} />
        </div>
      ) : (
        <p className="sj-fine" style={{ margin: "4px 4px 0" }}>다른 로그인 수단은 준비되면 여기에서 연결할 수 있어요.</p>
      ))}

      {actionError && <p id="account-methods-error" className="sj-error" role="alert" tabIndex={-1} style={{ marginTop: 8 }}>{actionError}</p>}
      {status && <p id="account-methods-status" className="sj-meta" role="status" tabIndex={-1} style={{ marginTop: 8 }}>{status}</p>}
    </section>
  );
}

const MOVED_RECORDS = ["프로필과 명식", "리포트", "상담 기록", "사람 보관함", "상담 이용권"];

export function LiveAccountScreen() {
  const hydrated = useHydrated();
  const sessionKind = hydrated ? getSessionKind() : "none";
  const signedIn = sessionKind === "account";
  const [reason, setReason] = useState("");
  const [logoutMessage, setLogoutMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<"logout" | "delete" | null>(null);
  const focusAfterRender = useFocusAfterRender();

  function logout() {
    setPending("logout");
    setLogoutMessage("");
    void logoutAccount()
      .then((result) => setLogoutMessage(result === "complete" ? "로그아웃됐어요. 이 기기의 계정 연결을 지웠어요." : "서버에 연결하지 못했지만 이 기기의 계정 연결은 지웠어요."))
      .finally(() => setPending(null));
  }

  function deleteAccount() {
    setPending("delete");
    setDeleteMessage(null);
    void requestAccountDeletion(reason)
      .then((result) => setDeleteMessage(result.status === "DELETED"
        ? { tone: "status", text: "계정과 서버 기록을 삭제했어요. 이 기기의 저장 정보는 설정에서 따로 지울 수 있어요." }
        : { tone: "status", text: "삭제 요청을 받았어요. 처리가 끝나면 알려드려요." }))
      .catch((error) => setDeleteMessage({ tone: "error", text: formatApiRequestError(error, "계정 삭제 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.") }))
      .finally(() => {
        setPending(null);
        setConfirmDelete(false);
        // The confirm button unmounts here; focus the message that says what happened.
        focusAfterRender("account-delete-result");
      });
  }

  return (
    <main className="sj-page" style={{ gap: 24 }} aria-labelledby="account-title">
      {signedIn ? (
        <section className="sj-section" aria-labelledby="account-title">
          <h1 id="account-title" className="sj-h1" style={{ fontSize: 20 }}>계정으로 로그인되어 있어요</h1>
          <p className="sj-body" style={{ fontSize: 14 }}>기록은 계정에 저장되고, 다른 기기에서 로그인해도 이어서 볼 수 있어요.</p>
        </section>
      ) : (
      <section className="sj-card" style={{ gap: 16 }} aria-labelledby="account-title">
        <div className="sj-section" style={{ gap: 6 }}>
          <h1 id="account-title" className="sj-h1" style={{ fontSize: 20 }}>로그인하면 지금 기록을 계정으로 옮겨요</h1>
          <p className="sj-body" style={{ fontSize: 14 }}>익명으로 쓰던 기록이 그대로 옮겨지고, 다른 기기에서도 이어 볼 수 있어요.</p>
        </div>
        <ul className="sj-list" aria-label="계정으로 옮겨지는 기록">
          {MOVED_RECORDS.map((record, index) => (
            <li key={record} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44, borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
              <CheckIcon style={{ color: "var(--sj-muted)" }} />
              <span className="sj-row-title">{record}</span>
            </li>
          ))}
        </ul>
        <div className="sj-actions">
          <Link className="sj-button" href="/login">로그인하고 기록 옮기기</Link>
        </div>
        <p className="sj-fine">옮기는 도중 연결이 끊기면 다음에 로그인할 때 이어서 옮겨요.</p>
      </section>
      )}

      {signedIn && <LoginMethodsSection />}

      {signedIn && (
      <section className="sj-section" style={{ gap: 0 }} aria-labelledby="account-session-title">
        <h2 id="account-session-title" className="sj-group-title">로그인 정보</h2>
        <div className="sj-group">
          <button className="sj-row-in-group" type="button" disabled={pending !== null} onClick={logout}>
            <span className="sj-row-main"><span className="sj-row-title">로그아웃</span></span>
          </button>
        </div>
        <p className="sj-fine" style={{ margin: "8px 4px 0" }}>로그아웃하면 이 기기에서만 연결이 풀려요. 기록은 계정에 그대로 있어요.</p>
      </section>
      )}
      {/* 로그아웃하면 signedIn이 바로 false가 되므로, 결과 안내는 로그인 정보 영역 밖에 둔다. */}
      {logoutMessage && <p className="sj-meta" role="status">{logoutMessage}</p>}

      <section className="sj-card" style={{ gap: 14, borderColor: "var(--sj-danger)" }} aria-labelledby="account-delete-title">
        <h2 id="account-delete-title" className="sj-h2" style={{ color: "var(--sj-danger)" }}>계정 삭제</h2>
        <ul className="sj-body" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          <li>명식, 리포트, 상담 기록, 남은 이용권이 모두 사라져요.</li>
          <li>삭제한 계정은 되돌릴 수 없어요.</li>
          <li>이 기기의 저장 정보는 설정에서 따로 지울 수 있어요.</li>
        </ul>
        <p className="sj-meta">기록을 남겨두고 싶다면 먼저 <Link href="/settings/privacy">내 데이터 내려받기</Link>를 해 두세요.</p>
        <div className="sj-field">
          <label className="sj-label" htmlFor="account-delete-reason">삭제하는 이유 <span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>(선택)</span></label>
          <textarea id="account-delete-reason" className="sj-textarea" style={{ minHeight: 88 }} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        {confirmDelete ? (
          <div className="sj-section" role="group" aria-labelledby="account-delete-question" style={{ gap: 8 }}>
            <p id="account-delete-question" className="sj-meta">정말 계정을 삭제할까요?</p>
            <div className="sj-actions-row">
              <button id="account-delete-confirm" className="sj-button-danger" type="button" disabled={pending !== null} aria-describedby="account-delete-question" onClick={deleteAccount}>{pending === "delete" ? "삭제하고 있어요" : "계정 삭제 확정"}</button>
              <button className="sj-button-secondary" type="button" onClick={() => {
                setConfirmDelete(false);
                focusAfterRender("account-delete-start");
              }}>취소</button>
            </div>
          </div>
        ) : (
          <button id="account-delete-start" className="sj-button-danger" type="button" disabled={pending !== null} onClick={() => {
            setDeleteMessage(null);
            setConfirmDelete(true);
            focusAfterRender("account-delete-confirm");
          }}>계정 삭제</button>
        )}
        {deleteMessage && (deleteMessage.tone === "error"
          ? <p id="account-delete-result" className="sj-error" role="alert" tabIndex={-1}>{deleteMessage.text}</p>
          : <p id="account-delete-result" className="sj-meta" role="status" tabIndex={-1}>{deleteMessage.text}</p>)}
      </section>
    </main>
  );
}
