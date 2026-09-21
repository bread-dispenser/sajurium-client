"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { NotificationPreferenceView, ShareLinkView } from "@/lib/contracts";
import { useHydrated } from "@/hooks/use-hydrated";
import { INITIAL_SETTINGS_DATA } from "@/lib/fixtures";
import { settingsStore } from "@/lib/storage";
import { CorruptState, LoadingState } from "./page-state";
import styles from "./saas-system-rollout.module.css";
import { createReportShare, deactivateShareLink, getSharedContent, listShareLinks } from "@/lib/api/service";

const panel: CSSProperties = {
  border: "1px solid var(--sr-line)",
  borderRadius: "var(--sr-radius)",
  background: "var(--sr-surface)",
  padding: 16,
};

const muted: CSSProperties = { color: "var(--sr-muted)", fontSize: 13, lineHeight: 1.6 };
const field: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "1px solid var(--sr-control-line)",
  borderRadius: "var(--sr-radius)",
  background: "var(--sr-surface)",
  color: "var(--sr-ink)",
  padding: "0 12px",
};

function Disclosure({ children }: { children: ReactNode }) {
  return <p className={styles.disclosure}>{children}</p>;
}

export function LiveShareLinksScreen() {
  const [links, setLinks] = useState<Array<{ id: number; share_url?: string | null; expires_at: string; is_active: boolean }> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void listShareLinks().then(setLinks).catch(() => setError("공유 링크를 불러오지 못했어요.")); }, []);
  if (!links && !error) return <LoadingState title="서버 공유 링크를 불러오고 있어요" />;
  return <main className={`screen-content share-links-content ${styles.srScreen}`} aria-labelledby="share-links-title"><p className="section-kicker">공유 링크</p><h1 id="share-links-title">공개 범위를 직접 관리해요</h1><p className="supporting">링크 토큰은 서버에 해시로만 저장되며, 공개 결과에는 민감한 출생 정보가 포함되지 않습니다.</p><button className="primary-button" type="button" onClick={() => { void createReportShare().then((link) => setLinks((items) => [link, ...(items ?? [])])).catch((reason) => setError(reason instanceof Error ? reason.message : "리포트를 먼저 생성해 주세요.")); }}>현재 리포트 공유 링크 만들기</button>{error && <p className="form-error" role="alert">{error}</p>}<section className="signal-row-list">{links?.length === 0 ? <p>아직 공유 링크가 없어요.</p> : links?.map((link) => <article className="signal-row" key={link.id}><div className="signal-row-copy"><strong>{link.is_active ? "활성 링크" : "비활성 링크"}</strong><small>만료 {link.expires_at}</small>{link.share_url && <code>{link.share_url}</code>}</div>{link.is_active && <button type="button" onClick={() => { void deactivateShareLink(link.id).then((updated) => setLinks((items) => items?.map((item) => item.id === updated.id ? updated : item) ?? null)).catch(() => setError("링크를 비활성화하지 못했어요.")); }}>비활성화</button>}</article>)}</section></main>;
}

export function LiveSharedResultScreen({ token }: { token: string }) {
  const [content, setContent] = useState<{ title: string; sections: Array<{ title?: string; body?: string }> } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void getSharedContent(token).then((value) => setContent({ title: value.title, sections: value.sections as Array<{ title?: string; body?: string }> })).catch(() => setError("공유 링크가 없거나 만료됐어요.")); }, [token]);
  if (!content && !error) return <LoadingState title="공유 결과를 불러오고 있어요" />;
  if (error) return <main className={`screen-content ${styles.srShared}`}><h1>공유 결과를 열 수 없어요</h1><p>{error}</p></main>;
  return <main className={`screen-content ${styles.srShared}`} aria-labelledby="shared-title"><p className="section-kicker">공유 결과</p><h1 id="shared-title">{content?.title}</h1>{content?.sections.map((section, index) => <article className="signal-panel" key={index}><h2>{section.title}</h2><p>{section.body}</p></article>)}</main>;
}

function SwitchRow({ checked, label, note, onChange }: { checked: boolean; label: string; note: string; onChange: () => void }) {
  return (
    <label data-slop-allow="multiline-row-meta" className={styles.toggleRow}>
      <span><strong>{label}</strong><small className="sr-only">{note}</small></span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

const expiryLabels = { hour: "1시간", day: "24시간", week: "7일" } as const;
type Expiry = keyof typeof expiryLabels;

export function ShareLinkPrototypeScreen() {
  const [expiry, setExpiry] = useState<Expiry>("day");
  const [link, setLink] = useState<ShareLinkView | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("아직 공유 링크를 만들지 않았어요.");

  function createLink() {
    const offset = expiry === "hour" ? 60 * 60 * 1000 : expiry === "day" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const token = "V7m2Q9x4Ka8Nz3Rt";
    const now = new Date();
    setLink({
      id: "shr_7c1f9a2e4b6d8f03",
      targetType: "compatibility",
      targetId: "cmp_4e8b1d7a9c2f6035",
      url: `/shared/${token}`,
      status: "active",
      expiresAt: new Date(now.getTime() + offset).toISOString(),
      disabledAt: null,
      createdAt: now.toISOString(),
    });
    setMessage("이 탭에서만 보이는 예시 링크를 만들었어요. 서버 저장이나 외부 공개는 없습니다.");
  }

  const state = !link ? "생성 전" : link.status === "disabled" ? "비활성화됨" : link.status === "expired" ? "만료됨" : "열람 가능 예시";

  return (
    <main className={`screen-content ${styles.srScreen}`} aria-labelledby="share-link-title" style={{ gap: 22 }}>
      <header>
        <p className="section-kicker">공유 링크 · 인터랙티브 프로토타입</p>
        <h1 id="share-link-title">필요할 때 만들고,<br />언제든 닫아요</h1>
        <p className="supporting">버튼을 눌러야만 로컬 예시 링크가 나타납니다. 링크 생성·만료·차단 상태는 현재 탭의 React 상태로만 작동합니다.</p>
      </header>

      <Disclosure>표시되는 경로는 번들된 로컬 fixture를 확인하는 화면일 뿐, 서비스 공개 링크·서버 토큰·외부 전송을 만들지 않습니다. 공개 예시는 검색엔진 차단(noindex) 전제이며 로그인·편집·원문 데이터 접근을 제공하지 않습니다.</Disclosure>

      <section aria-labelledby="share-scope-title" style={{ display: "grid", gap: 10 }}>
        <div><p className="section-kicker">공개 범위</p><h2 id="share-scope-title">관계 결과 요약만 공유</h2></div>
        <article style={panel}>
          <strong>포함되는 내용</strong>
          <ul style={{ ...muted, marginBottom: 0, paddingLeft: 20 }}><li>관계의 강점 한 문장</li><li>대화 방식 키워드</li><li>함께 해볼 실천 제안</li></ul>
        </article>
        <article className={styles.exclusionCard}>
          <strong>민감 정보 자동 제외</strong>
          <p style={{ ...muted, marginBottom: 0 }}>정확한 생년월일·출생 시간·출생지·결제 정보·비공개 상담·상대방 전체 사주 데이터는 선택할 수 없으며 링크에도 넣지 않습니다.</p>
        </article>
        <SwitchRow checked={acknowledged} onChange={() => setAcknowledged((value) => !value)} label="공개 범위를 확인했어요" note="동의는 이 탭에만 남고 저장되지 않아요." />
      </section>

      <section aria-labelledby="expiry-setting-title" style={{ display: "grid", gap: 10 }}>
        <div><p className="section-kicker">접근 기간</p><h2 id="expiry-setting-title">자동 만료 설정</h2></div>
        <label><span style={muted}>예시 접근 기간</span><select value={expiry} onChange={(event) => setExpiry(event.target.value as Expiry)} style={field} disabled={Boolean(link)}>{Object.entries(expiryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="primary-button" type="button" onClick={createLink} disabled={!acknowledged || Boolean(link)}>로컬 예시 링크 명시적으로 만들기</button>
        {!acknowledged && <small style={muted}>공개 범위를 확인하면 생성 버튼을 사용할 수 있어요.</small>}
      </section>

      <section aria-labelledby="created-link-title" style={{ display: "grid", gap: 10 }} aria-live="polite">
        <div><p className="section-kicker">링크 관리</p><h2 id="created-link-title">현재 상태 · {state}</h2></div>
        {link ? (
          <article style={{ ...panel, display: "grid", gap: 12 }}>
            <label><span style={muted}>로컬 표시용 URL</span><input readOnly value={link.url} style={field} /></label>
            <dl style={{ display: "grid", gap: 6, margin: 0 }}><div><dt style={muted}>대상 리소스 ID</dt><dd style={{ margin: 0, fontWeight: 700 }}>{link.targetId}</dd></div><div><dt style={muted}>만료 예정 예시</dt><dd style={{ margin: 0, fontWeight: 700 }}>{new Date(link.expiresAt).toLocaleString("ko-KR")}</dd></div><div><dt style={muted}>robots 정책</dt><dd style={{ margin: 0, fontWeight: 700 }}>noindex, nofollow, noarchive</dd></div></dl>
            {link.status === "active" && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button type="button" className="secondary-button" onClick={() => { setLink((current) => current ? { ...current, status: "expired" } : current); setMessage("시간 경과를 대신해 만료 상태를 적용했어요. 예시 링크는 더 이상 열 수 없어요."); }}>만료 상태 체험</button><button type="button" className="secondary-button" onClick={() => { setLink((current) => current ? { ...current, status: "disabled", disabledAt: new Date().toISOString() } : current); setMessage("예시 링크를 즉시 비활성화했어요."); }}>지금 비활성화</button></div>}
            {link.status !== "active" && <button type="button" className="secondary-button" onClick={() => { setLink(null); setMessage("닫힌 예시를 지웠어요. 새 링크는 다시 명시적으로 만들어야 해요."); }}>닫힌 예시 정리</button>}
          </article>
        ) : <div style={panel}><strong>표시할 링크가 없어요.</strong><p style={{ ...muted, marginBottom: 0 }}>만료 기간을 고르고 공개 범위를 확인한 뒤 직접 생성하세요.</p></div>}
      </section>
      <p role="status" style={{ ...panel, ...muted }}>{message}</p>
    </main>
  );
}

type NotificationTopicCode = keyof NotificationPreferenceView["topics"];
type NotificationTopic = {
  code: NotificationTopicCode;
  label: string;
  note: string;
  deepLink: string;
  targetId: string;
  classification: "service" | "marketing";
};

const notificationTopics: readonly NotificationTopic[] = [
  { code: "payment_completed", label: "결제 완료", note: "결제 상태 확정", deepLink: "/orders/ord_6a2d9f4c8e1b7035", targetId: "ord_6a2d9f4c8e1b7035", classification: "service" },
  { code: "monthly_flow", label: "이번 달 흐름 시작", note: "월간 시작", deepLink: "/flows/monthly/mfl_3c8e1a7d5b2f9046", targetId: "mfl_3c8e1a7d5b2f9046", classification: "marketing" },
  { code: "important_period", label: "중요한 시기 진입", note: "전환 구간", deepLink: "/flows/yearly/yfl_8b4e2c7a1d9f6035", targetId: "yfl_8b4e2c7a1d9f6035", classification: "marketing" },
  { code: "report_completed", label: "구매 리포트 생성 완료", note: "결과 준비", deepLink: "/reports/rpt_5d1a8c3f7e2b9046", targetId: "rpt_5d1a8c3f7e2b9046", classification: "service" },
  { code: "consultation_completed", label: "상담 답변 완료", note: "상담 준비", deepLink: "/consultations/csn_2f7b4d9a1e8c6035", targetId: "csn_2f7b4d9a1e8c6035", classification: "service" },
  { code: "low_credits", label: "이용권 부족", note: "잔여량 부족", deepLink: "/credits/crd_9e3a6c1f8b2d7045", targetId: "crd_9e3a6c1f8b2d7045", classification: "service" },
  { code: "resume_consultation", label: "이전 상담 이어보기", note: "중단 상담 1회", deepLink: "/consultations/csn_7a2e9c4d1f8b6035", targetId: "csn_7a2e9c4d1f8b6035", classification: "marketing" },
  { code: "interest_change", label: "관심 주제 관련 변화", note: "선택 주제 변화", deepLink: "/flows/daily/dfl_4c9e2a7b1d8f6035", targetId: "dfl_4c9e2a7b1d8f6035", classification: "marketing" },
];

export function NotificationPolicyPrototypeScreen() {
  const hydrated = useHydrated();
  const settingsRaw = useSyncExternalStore(settingsStore.subscribe, settingsStore.rawSnapshot, () => null);
  const [selectedChannel, setSelectedChannel] = useState<NotificationPreferenceView["channel"]>("push");
  const [selected, setSelected] = useState<NotificationTopicCode>("report_completed");
  const [previewOpened, setPreviewOpened] = useState(false);
  const [message, setMessage] = useState("설정은 현재 브라우저에만 저장됩니다.");
  if (!hydrated) return <LoadingState title="알림 설정을 확인하고 있어요" />;
  void settingsRaw;
  const inspection = settingsStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return <CorruptState title="알림 설정을 읽을 수 없어요" description="손상된 설정을 확인 없이 기본값으로 바꾸지 않습니다." unavailable={inspection.status === "unavailable"} onReset={settingsStore.remove} />;
  const settings = inspection.status === "ok" ? inspection.value : INITIAL_SETTINGS_DATA;
  const preference = settings.notifications.find((item) => item.channel === selectedChannel) ?? settings.notifications[0];
  const topic = notificationTopics.find((item) => item.code === selected) ?? notificationTopics[0];

  function setPreference(update: (current: NotificationPreferenceView) => NotificationPreferenceView) {
    const next = { version: 1 as const, notifications: settings.notifications.map((current) => current.channel === preference.channel ? update(current) : current) };
    setMessage(settingsStore.write(next) ? "알림 선호도를 현재 브라우저에 저장했어요. 실제 알림 권한이나 예약은 바뀌지 않습니다." : "이 브라우저에서는 알림 설정을 저장할 수 없어요.");
  }

  function toggleTopic(code: NotificationTopicCode) {
    setPreference((current) => ({ ...current, topics: { ...current.topics, [code]: !current.topics[code] } }));
  }

  return (
    <main className={`screen-content ${styles.srScreen}`} aria-labelledby="notification-policy-title" style={{ gap: 22 }}>
      <header><p className="section-kicker">알림 정책 · 로컬 설정 프로토타입</p><h1 id="notification-policy-title">필요한 소식만,<br />방해 없이 받아요</h1><p className="supporting">푸시·이메일을 발송하거나 운영체제 권한을 요청하지 않습니다. 아래 선택은 정책 동작을 확인하는 로컬 예시입니다.</p></header>
      <Disclosure>출시 전 필수 우선순위는 결제 완료와 구매 리포트 생성 완료입니다. 오늘의 운세 반복 푸시는 리텐션 검증 전에는 제공하지 않습니다.</Disclosure>

      <section data-slop-allow="multiline-row-meta" aria-labelledby="topics-title" style={{ display: "grid", gap: 9 }}>
        <div><p className="section-kicker">채널과 주제별 선택</p><h2 id="topics-title">서비스·마케팅 알림 구분</h2></div>
        <label><span style={muted}>알림 채널</span><select value={preference.channel} onChange={(event) => setSelectedChannel(event.target.value as NotificationPreferenceView["channel"])} style={field}><option value="push">푸시</option><option value="email">이메일</option></select></label>
        <SwitchRow checked={preference.enabled} onChange={() => setPreference((current) => ({ ...current, enabled: !current.enabled }))} label={`${preference.channel === "push" ? "푸시" : "이메일"} 채널 사용`} note="현재 채널 전체 수신 상태" />
        {notificationTopics.map((item) => <div key={item.code} style={{ display: "grid", gap: 4 }}><SwitchRow checked={preference.topics[item.code]} onChange={() => toggleTopic(item.code)} label={`${item.label} · ${item.classification === "service" ? "서비스" : "마케팅"}`} note={item.note} /><small style={{ ...muted, paddingInline: 8 }}>topic · {item.code}</small></div>)}
      </section>

      <section aria-labelledby="quiet-title" style={{ display: "grid", gap: 10 }}>
        <div><p className="section-kicker">발송 제한</p><h2 id="quiet-title">야간 방해 금지</h2></div>
        <SwitchRow checked={preference.quietHours.enabled} onChange={() => setPreference((current) => ({ ...current, quietHours: { ...current.quietHours, enabled: !current.quietHours.enabled } }))} label="조용한 시간 사용" note="긴급 결제 상태도 실제 발송하지 않는 정책 미리보기예요." />
        <div style={{ ...panel, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label><span style={muted}>시작</span><input type="time" value={preference.quietHours.start} onChange={(event) => setPreference((current) => ({ ...current, quietHours: { ...current.quietHours, start: event.target.value } }))} disabled={!preference.quietHours.enabled} style={field} /></label>
          <label><span style={muted}>종료</span><input type="time" value={preference.quietHours.end} onChange={(event) => setPreference((current) => ({ ...current, quietHours: { ...current.quietHours, end: event.target.value } }))} disabled={!preference.quietHours.enabled} style={field} /></label>
        </div>
        <label><span style={muted}>조용한 시간 기준 시간대</span><select value={preference.quietHours.timezone} onChange={(event) => setPreference((current) => ({ ...current, quietHours: { ...current.quietHours, timezone: event.target.value } }))} style={field}><option value="Asia/Seoul">Asia/Seoul (KST)</option><option value="UTC">UTC</option></select></label>
        <SwitchRow checked={preference.suppressDuplicates} onChange={() => setPreference((current) => ({ ...current, suppressDuplicates: !current.suppressDuplicates }))} label="동일 내용 중복 억제" note={preference.suppressDuplicates ? "같은 내용은 두 번째부터 보류" : "비교 체험용으로 중복 허용 중"} />
        <p style={{ ...panel, ...muted }}><strong style={{ color: "var(--sr-ink)", display: "block", marginBottom: 4 }}>현재 정책 예시 · {preference.channel}</strong>{preference.quietHours.enabled ? `${preference.quietHours.start}–${preference.quietHours.end} (${preference.quietHours.timezone})에는 알림을 보류하고 이후 한 번만 표시합니다.` : "조용한 시간이 꺼져 있습니다."} {preference.suppressDuplicates ? "같은 본문·같은 대상 ID의 반복 알림은 합칩니다." : "중복 억제가 꺼진 체험 상태입니다."}</p>
      </section>

      <section aria-labelledby="deep-link-title" style={{ display: "grid", gap: 10 }}>
        <div><p className="section-kicker">딥링크 미리보기</p><h2 id="deep-link-title">알림을 눌렀을 때</h2></div>
        <label><span style={muted}>미리 볼 알림</span><select value={selected} onChange={(event) => { setSelected(event.target.value as NotificationTopicCode); setPreviewOpened(false); }} style={field}>{notificationTopics.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <article style={{ ...panel }}>
          <small style={{ color: "var(--sr-accent)", fontWeight: 600 }}>{topic.classification === "service" ? "서비스" : "마케팅"} · {preference.channel} · {topic.code}</small>
          <h3 style={{ margin: "7px 0" }}>{topic.label}</h3><p style={muted}>{topic.note}. 눌러 관련 화면으로 바로 이동하는 흐름을 확인하세요.</p>
          <p style={muted}>대상 리소스 ID · {topic.targetId}</p>
          <button type="button" className="primary-button" disabled={!preference.enabled || !preference.topics[topic.code]} onClick={() => { setPreviewOpened(true); setMessage(`${topic.deepLink} 화면의 로컬 딥링크 도착 미리보기를 열었어요.`); }}>딥링크 도착 미리보기</button>
          {(!preference.enabled || !preference.topics[topic.code]) && <p style={{ ...muted, marginBottom: 0 }}>현재 채널과 이 주제의 알림을 모두 켜야 미리볼 수 있어요.</p>}
        </article>
        {previewOpened && <article tabIndex={-1} style={{ ...panel, background: "var(--sr-surface-hover)" }}><p className="section-kicker">도착 화면 예시 · {topic.deepLink}</p><h3>{topic.label} 관련 화면</h3><p style={muted}>실제 라우팅 없이 도착 위치와 맥락만 보여줍니다. 읽음 처리나 서버 기록은 없습니다.</p><button className="secondary-button" type="button" onClick={() => setPreviewOpened(false)}>미리보기 닫기</button></article>}
      </section>
      <p role="status" style={{ ...panel, ...muted }}>{message}</p>
    </main>
  );
}

type LabId = "verification" | "family" | "monthly" | "subscription" | "expert" | "global";
const labs: readonly { id: LabId; label: string; title: string; description: string }[] = [
  { id: "verification", label: "과거 검증", title: "지난 시기와 실제 경험 비교", description: "과거 해석에 맞음·다름·모름을 표시해 검증 흐름을 체험합니다." },
  { id: "family", label: "가족 프로필", title: "가족 단위 프로필 묶음", description: "별칭과 관계만으로 그룹 구성을 미리봅니다." },
  { id: "monthly", label: "자동 리포트", title: "월간 자동 리포트", description: "원하는 주제와 생성 시점을 고르는 설정 모형입니다." },
  { id: "subscription", label: "구독", title: "구독 상품 탐색", description: "가상의 혜택과 갱신 주기를 비교하고 관심만 표시합니다." },
  { id: "expert", label: "전문가 연결", title: "상담사·전문가 연결", description: "연결 기준과 질문 범위를 준비하는 대기 신청 모형입니다." },
  { id: "global", label: "언어·출생지", title: "다국어와 해외 출생지", description: "표시 언어와 해외 도시 입력 경험을 미리봅니다." },
];

export function PlatformLabsPrototypeScreen() {
  const [tab, setTab] = useState<LabId>("verification");
  const [opted, setOpted] = useState<Record<LabId, boolean>>({ verification: false, family: false, monthly: false, subscription: false, expert: false, global: false });
  const [past, setPast] = useState("모름");
  const [familyMembers, setFamilyMembers] = useState<string[]>(["나"]);
  const [familyName, setFamilyName] = useState("");
  const [monthlyTopic, setMonthlyTopic] = useState("관계");
  const [monthlyDay, setMonthlyDay] = useState("1일");
  const [billing, setBilling] = useState("월간");
  const [expertTopic, setExpertTopic] = useState("진로 전환");
  const [language, setLanguage] = useState("한국어");
  const [birthplace, setBirthplace] = useState("Tokyo, Japan");
  const active = labs.find((item) => item.id === tab) ?? labs[0];

  function toggleOptIn() { setOpted((current) => ({ ...current, [tab]: !current[tab] })); }
  function addFamilyMember() {
    const value = familyName.trim();
    if (!value || familyMembers.includes(value)) return;
    setFamilyMembers((members) => [...members, value]);
    setFamilyName("");
  }

  return (
    <main className={`screen-content ${styles.srScreen}`} aria-labelledby="platform-labs-title" style={{ gap: 22 }}>
      <header><p className="section-kicker">플랫폼 랩스 · 장기 확장 체험</p><h1 id="platform-labs-title">먼 미래의 기능을<br />먼저 만져보세요</h1><p className="supporting">아직 제공되지 않는 장기 확장 개념입니다. 모든 입력과 참여 표시는 이 탭의 로컬 상태이며 신청·예약·결제·분석을 실행하지 않습니다.</p></header>
      <nav role="tablist" aria-label="P2 실험 선택" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 5 }}>
        {labs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`${styles.tabButton}${tab === item.id ? ` ${styles.tabButtonSelected}` : ""}`}>{item.label}</button>)}
      </nav>

      <section role="tabpanel" aria-labelledby="lab-panel-title" style={{ display: "grid", gap: 12 }}>
        <article className={styles.darkCard}><small className={styles.darkKicker}>CONCEPT ONLY · 제공 전</small><h2 id="lab-panel-title" className={styles.darkTitle}>{active.title}</h2><p className={styles.darkBody}>{active.description}</p></article>

        {tab === "verification" && <fieldset style={{ ...panel, display: "grid", gap: 10 }}><legend className="section-kicker">2024년 봄 · 변화가 커진 시기라는 예시</legend>{["맞음", "다름", "모름"].map((value) => <label key={value}><input type="radio" name="past" value={value} checked={past === value} onChange={() => setPast(value)} /> {value}</label>)}<p style={muted}>선택: {past}. 실제 해석 검증이나 개인화 학습은 하지 않습니다.</p></fieldset>}

        {tab === "family" && <div style={{ ...panel, display: "grid", gap: 10 }}><label><span style={muted}>가족 별칭</span><input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="예: 첫째" style={field} /></label><button type="button" className="secondary-button" onClick={addFamilyMember}>로컬 목록에 추가</button><ul aria-live="polite" style={{ margin: 0, paddingLeft: 20 }}>{familyMembers.map((member) => <li key={member}>{member}</li>)}</ul><p style={muted}>출생 정보 없이 구성 화면만 체험합니다. 프로필은 저장되지 않습니다.</p></div>}

        {tab === "monthly" && <div style={{ ...panel, display: "grid", gap: 10 }}><label><span style={muted}>중점 주제</span><select value={monthlyTopic} onChange={(event) => setMonthlyTopic(event.target.value)} style={field}><option>관계</option><option>일과 성장</option><option>생활 리듬</option></select></label><label><span style={muted}>매월 생성 시점 예시</span><select value={monthlyDay} onChange={(event) => setMonthlyDay(event.target.value)} style={field}><option>1일</option><option>5일</option><option>10일</option></select></label><p style={muted}>매월 {monthlyDay}, {monthlyTopic} 리포트를 준비하는 설정 예시입니다. 자동 생성·알림은 없습니다.</p></div>}

        {tab === "subscription" && <div style={{ ...panel, display: "grid", gap: 10 }}><div className="segmented-control" role="group" aria-label="구독 주기 예시">{["월간", "연간"].map((value) => <button key={value} type="button" className={billing === value ? "selected" : ""} aria-pressed={billing === value} onClick={() => setBilling(value)}>{value}</button>)}</div><strong>{billing} 탐색안</strong><p style={muted}>월간 리포트와 상담 이용권을 묶는 가상 구성입니다. 가격·혜택은 정해지지 않았고 구매나 결제를 받지 않습니다.</p></div>}

        {tab === "expert" && <div style={{ ...panel, display: "grid", gap: 10 }}><label><span style={muted}>상담하고 싶은 범위</span><select value={expertTopic} onChange={(event) => setExpertTopic(event.target.value)} style={field}><option>진로 전환</option><option>관계 대화</option><option>생활 계획</option></select></label><p style={muted}>선택한 범위: {expertTopic}. 전문가 목록·자격 검증·예약 가능 시간·비용이 준비되지 않아 실제 연결 버튼은 제공하지 않습니다.</p></div>}

        {tab === "global" && <div style={{ ...panel, display: "grid", gap: 10 }}><label><span style={muted}>표시 언어 예시</span><select value={language} onChange={(event) => setLanguage(event.target.value)} style={field}><option>한국어</option><option>English</option><option>日本語</option></select></label><label><span style={muted}>해외 출생 도시 검색 예시</span><input value={birthplace} onChange={(event) => setBirthplace(event.target.value)} style={field} /></label><p style={muted}>미리보기: {language} · {birthplace || "도시 미입력"}. 시간대 변환·장소 검색·사주 계산은 하지 않습니다.</p></div>}

        <SwitchRow checked={opted[tab]} onChange={toggleOptIn} label={opted[tab] ? "로컬 체험 참여 표시됨" : "이 개념에 관심 표시"} note="의견 제출이나 대기자 등록 없이 현재 탭에서만 바뀝니다." />
      </section>
      <Disclosure>관심 표시를 켜도 계정에 저장하거나 연락하지 않습니다. 실제 제공 여부와 일정은 확정되지 않았습니다.</Disclosure>
    </main>
  );
}

export function SharedCompatibilityPrototypeScreen({ token, state }: { token: string; state: ShareLinkView | null }) {
  const [detail, setDetail] = useState<"strength" | "rhythm" | "practice">("strength");
  const content = useMemo(() => ({
    strength: { title: "서로 다른 속도가 균형이 돼요", body: "한 사람은 방향을 또렷하게 잡고, 다른 사람은 주변의 온도를 살핍니다. 역할을 정하기보다 그때그때 필요한 강점을 빌려 주세요." },
    rhythm: { title: "생각할 여백을 먼저 약속해요", body: "답을 내는 속도가 다를 수 있어요. 중요한 대화에서는 결론을 재촉하지 않고 다시 만날 시간을 정하는 방식이 잘 맞습니다." },
    practice: { title: "이번 주 한 가지 실천", body: "서로에게 고마웠던 장면을 하나씩 말하고, 다음 대화에서 지키고 싶은 작은 규칙을 함께 정해 보세요." },
  }[detail]), [detail]);
  const displayState = state?.url === `/shared/${token}` ? state.status : "not-found";

  if (displayState !== "active") {
    const stateContent = {
      expired: { kicker: "공유 기간 종료", title: "만료된 공유 링크예요", body: "공유자가 정한 열람 기간이 끝났습니다. 요약 내용은 더 이상 표시하지 않습니다." },
      disabled: { kicker: "공유 중단", title: "닫힌 공유 링크예요", body: "공유자가 이 링크를 비활성화했습니다. 요약 내용은 더 이상 표시하지 않습니다." },
      "not-found": { kicker: "공유 링크 없음", title: "찾을 수 없는 공유 링크예요", body: "주소가 정확한지 확인해 주세요. 존재 여부나 원문 정보는 공개하지 않습니다." },
    }[displayState];

    return (
      <main data-share-state={displayState} className={styles.srShared}>
        <div style={{ width: "min(680px, 100%)", margin: "0 auto", display: "grid", gap: 22 }}>
          <header><p className="section-kicker">SAJURIUM · {stateContent.kicker}</p><h1>{stateContent.title}</h1><p className="supporting">{stateContent.body}</p></header>
          <Disclosure>개인정보, 비공개 상담, 계산 근거, 결제·계정 정보는 이 페이지에서 제공하지 않습니다.</Disclosure>
        </div>
      </main>
    );
  }

  return (
    <main data-share-state="active" className={styles.srShared}>
      <div style={{ width: "min(680px, 100%)", margin: "0 auto", display: "grid", gap: 22 }}>
        <header><p className="section-kicker">SAJURIUM · 공유된 관계 요약</p><h1>다름을 이해할수록<br />편안해지는 관계</h1><p className="supporting">고정 fixture로 구성한 읽기 전용 공유 예시입니다. 검색 결과에는 노출되지 않도록 설정되어 있습니다.</p></header>
        <article className={styles.darkCard}><small className={styles.darkKicker}>관계 키워드</small><h2 className={styles.darkTitle}>존중 · 여백 · 솔직한 확인</h2><p className={styles.darkBody}>두 사람은 같은 답을 빠르게 찾기보다 서로의 관점을 충분히 들을 때 신뢰가 깊어지는 관계로 표현됩니다.</p></article>
        <section aria-labelledby="public-summary-title" style={{ display: "grid", gap: 12 }}><div><p className="section-kicker">공개 요약</p><h2 id="public-summary-title">함께 살펴볼 내용</h2></div><div className="segmented-control" role="tablist" aria-label="관계 요약 종류">{([['strength', '강점'], ['rhythm', '대화 리듬'], ['practice', '실천']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={detail === id} className={detail === id ? "selected" : ""} onClick={() => setDetail(id)}>{label}</button>)}</div><article role="tabpanel" style={panel}><h3>{content.title}</h3><p style={muted}>{content.body}</p></article></section>
        <Disclosure>이 페이지는 요약만 보여줍니다. 개인을 특정하는 정보, 비공개 상담, 계산 근거, 결제·계정 정보는 제공하지 않으며 편집이나 원문 열람도 할 수 없습니다.</Disclosure>
        <footer style={{ ...muted, textAlign: "center" }}>사주 해석은 관계에 대한 참고 콘텐츠이며 중요한 결정이나 전문적인 판단을 대신하지 않습니다.</footer>
      </div>
    </main>
  );
}
