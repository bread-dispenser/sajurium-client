"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Provider = "카카오" | "Apple" | "Google";
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

const PROVIDERS: Provider[] = ["카카오", "Apple", "Google"];

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
      <main className="screen-content settings-content" aria-labelledby="account-summary-title">
        <p className="section-kicker">로그인 체험 완료</p>
        <h1 id="account-summary-title">사주리움에<br />돌아오셨네요</h1>
        <p className="supporting" role="status">입력한 내용으로 로그인 이후 화면을 미리 보여드려요.</p>

        <section className="insight-card current" aria-labelledby="prototype-account-heading">
          <small>PROTOTYPE ACCOUNT</small>
          <h2 id="prototype-account-heading">체험 계정 요약</h2>
          <p><strong>연결 방식</strong> · {account.provider}</p>
          <p><strong>이메일</strong> · {account.email}</p>
          <p><strong>소식 수신 선호</strong> · {account.marketing ? "선택함" : "선택하지 않음"}</p>
        </section>

        <aside className="privacy-panel">
          <strong>실제 로그인이 아닙니다</strong>
          <p>계정과 세션은 생성되지 않으며, 입력한 이메일과 선택 내용은 저장되거나 외부로 전송되지 않습니다.</p>
        </aside>

        <button className="secondary-button" type="button" onClick={() => setAccount(null)}>로그인 화면으로 돌아가기</button>
      </main>
    );
  }

  return (
    <main className="screen-content form-content" aria-labelledby="login-title">
      <header className="form-hero">
        <p className="section-kicker">계정 프로토타입</p>
        <h1 id="login-title">나의 기록을 잇는<br />로그인</h1>
        <p className="supporting">원하는 로그인 방식과 동의 항목을 선택해 로그인 이후 화면을 체험해 보세요.</p>
      </header>

      <aside className="privacy-panel" id="login-disclosure">
        <strong>화면 체험 전용</strong>
        <p>실제 계정이나 세션을 만들지 않습니다. 소셜 서비스에 연결하지 않으며 입력값을 저장하거나 외부로 전송하지 않습니다.</p>
      </aside>

      <form className="birth-fields" onSubmit={submit} aria-describedby="login-disclosure">
        <fieldset>
          <legend>소셜 로그인 제공자</legend>
          <div className="topic-list">
            {PROVIDERS.map((item) => (
              <label className={`topic-card${provider === item ? " selected" : ""}`} key={item}>
                <input
                  className="selection-radio"
                  type="radio"
                  name="provider"
                  value={item}
                  checked={provider === item}
                  onChange={() => setProvider(item)}
                />
                <span className="topic-number" aria-hidden="true">{item.slice(0, 1)}</span>
                <span><strong>{item}</strong><small>{item} 계정 연결 화면 체험</small></span>
                <span className="row-marker" aria-hidden="true">{provider === item ? "선택" : "○"}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field-group" htmlFor="prototype-email">
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

        <fieldset>
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
        </fieldset>

        <button className="primary-button form-submit" type="submit">로그인 이후 화면 보기</button>
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
    <main className="screen-content settings-content" aria-labelledby="notifications-title">
      <header>
        <p className="section-kicker">소식과 기록</p>
        <h1 id="notifications-title">알림 센터</h1>
        <p className="supporting" aria-live="polite">읽지 않은 알림 {unreadCount}개 · 이 화면에서만 상태가 바뀝니다.</p>
      </header>

      <aside className="privacy-panel">
        <strong>알림 체험 전용</strong>
        <p>실제 푸시나 이메일은 발송되지 않습니다. 읽음 상태와 수신 선호는 현재 화면에만 반영되며 저장되거나 외부로 전송되지 않아요.</p>
      </aside>

      <section className="settings-section" aria-labelledby="notification-list-heading">
        <div>
          <h2 id="notification-list-heading">받은 알림</h2>
          <div className="segmented-control notification-tabs" role="tablist" aria-label="알림 보기 범위">
            <button id="all-notifications-tab" className={tab === "all" ? "selected" : ""} type="button" role="tab" aria-controls="notification-panel" aria-selected={tab === "all"} onClick={() => setTab("all")}>전체 {notifications.length}</button>
            <button id="unread-notifications-tab" className={tab === "unread" ? "selected" : ""} type="button" role="tab" aria-controls="notification-panel" aria-selected={tab === "unread"} onClick={() => setTab("unread")}>읽지 않음 {unreadCount}</button>
          </div>
        </div>

        {unreadCount > 0 && <button className="secondary-button" type="button" onClick={markAllRead}>모두 읽음으로 표시</button>}

        <div id="notification-panel" className="library-list" role="tabpanel" aria-labelledby={`${tab}-notifications-tab`} aria-live="polite">
          {visibleNotifications.map((notification) => (
            <article className={notification.read ? "notification-read-item" : ""} key={notification.id}>
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

      <section className="settings-section" aria-labelledby="notification-preferences-heading">
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
