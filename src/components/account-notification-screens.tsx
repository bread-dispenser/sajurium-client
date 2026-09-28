"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatApiRequestError, getNotificationPreferences, getSessionKind, listNotifications, loginAccount, loginSocialAccount, logoutAccount, registerAccount, requestAccountDeletion, type AnonymousMigrationStatus, type ServerNotification, type SocialProvider, updateNotificationPreferences } from "@/lib/api/service";
import { useHydrated } from "@/hooks/use-hydrated";
import { pushEnabled } from "@/lib/feature-availability";
import { SocialLoginOptions } from "./social-login-options";
import { EmptyState, LoadingState } from "./page-state";
import { CheckIcon } from "./ui/icons";
import { Banner, GroupRowLink } from "./ui/layout";

/* ---------- Notification topics ---------- */

const NOTIFICATION_TOPICS: readonly { code: string; label: string; desc: string }[] = [
  { code: "daily_flow", label: "오늘의 흐름", desc: "그날의 흐름이 준비되면 알려드려요" },
  { code: "report_ready", label: "리포트 완성", desc: "리포트가 준비되면 알려드려요" },
  { code: "payment", label: "결제", desc: "주문과 결제 상태가 바뀌면 알려드려요" },
  { code: "marketing", label: "혜택과 소식", desc: "새 리포트와 이벤트 안내, 따로 동의한 경우에만 보내요" },
];

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
  const rows = [...known, ...extra.map((code) => ({ code, label: "기타 알림", desc: "서비스 운영에 필요한 안내" }))];
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
            <input className="sj-switch" type="checkbox" role="switch" checked={preferences.topics[topic.code]} onChange={(event) => {
              const topics = { ...preferences.topics, [topic.code]: event.target.checked };
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

export function LiveNotificationScreen() {
  const [notifications, setNotifications] = useState<ServerNotification[] | null>(null);
  const [error, setError] = useState("");
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
  return (
    <main className="sj-page" aria-labelledby="notification-title">
      <h1 id="notification-title" className="sj-visually-hidden">받은 알림</h1>
      {!pushEnabled && <Banner>휴대폰 푸시는 준비 중이고, 알림은 여기서 모두 볼 수 있어요.</Banner>}

      {error ? (
        <div className="sj-section">
          <p className="sj-error" role="alert">{error}</p>
          <button className="sj-button-secondary" type="button" onClick={() => { setNotifications(null); setError(""); setAttempt((value) => value + 1); }}>알림 다시 불러오기</button>
        </div>
      ) : (
        <section className="sj-section" style={{ gap: 0 }} aria-labelledby="notification-list-heading">
          <h2 id="notification-list-heading" className="sj-group-title">받은 알림 {notifications?.length ?? 0}개</h2>
          <ul className="sj-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {(notifications ?? []).map((notification, index) => {
              const href = notification.deep_link?.startsWith("/") && !notification.deep_link.startsWith("//") ? notification.deep_link : null;
              const read = Boolean(notification.read_at);
              return (
                <li key={notification.id} className="sj-section" style={{ gap: 2, padding: "14px 16px", borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
                  <span className="sj-fine">{notificationTopicLabel(notification.topic)}, {formatNotificationDate(notification.created_at)}{read ? ", 읽음" : ""}</span>
                  <h3 className="sj-h3" style={read ? { fontWeight: 500, color: "var(--sj-ink-strong-muted)" } : undefined}>{notification.title}</h3>
                  {notification.body && <p className="sj-meta" style={{ color: "var(--sj-ink-strong-muted)" }}>{notification.body}</p>}
                  {href && <Link className="sj-text-button" href={href} style={{ alignSelf: "flex-start" }}>내용 보기</Link>}
                </li>
              );
            })}
          </ul>
        </section>
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
      .finally(() => { setPending(null); setConfirmDelete(false); });
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
          <div className="sj-section" style={{ gap: 8 }}>
            <p className="sj-meta">정말 계정을 삭제할까요?</p>
            <div className="sj-actions-row">
              <button className="sj-button-danger" type="button" disabled={pending !== null} onClick={deleteAccount}>{pending === "delete" ? "삭제하고 있어요" : "계정 삭제 확정"}</button>
              <button className="sj-button-secondary" type="button" onClick={() => setConfirmDelete(false)}>취소</button>
            </div>
          </div>
        ) : (
          <button className="sj-button-danger" type="button" disabled={pending !== null} onClick={() => setConfirmDelete(true)}>계정 삭제</button>
        )}
        {deleteMessage && (deleteMessage.tone === "error"
          ? <p className="sj-error" role="alert">{deleteMessage.text}</p>
          : <p className="sj-meta" role="status">{deleteMessage.text}</p>)}
      </section>
    </main>
  );
}
