"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type AdminTab = "users" | "orders" | "reports" | "consultations" | "quality";

type AdminRow = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  updated: string;
  details: readonly string[];
};

const ADMIN_TABS: readonly { id: AdminTab; label: string }[] = [
  { id: "users", label: "사용자" },
  { id: "orders", label: "주문" },
  { id: "reports", label: "리포트" },
  { id: "consultations", label: "상담" },
  { id: "quality", label: "품질" },
];

const ADMIN_FIXTURES: Record<AdminTab, AdminRow[]> = {
  users: [
    { id: "USR-0214", title: "봄빛 독자", subtitle: "체험 사용자 · 최근 리포트 3건", status: "활성 예시", updated: "오늘 14:20", details: ["가입 경로 · 초대 코드 예시", "보관 항목 · 4개", "민감정보 · 표시하지 않음"] },
    { id: "USR-0198", title: "저녁별 독자", subtitle: "체험 사용자 · 최근 리포트 1건", status: "검토 예시", updated: "어제 18:05", details: ["가입 경로 · 직접 방문 예시", "보관 항목 · 1개", "민감정보 · 표시하지 않음"] },
    { id: "USR-0176", title: "푸른봄 독자", subtitle: "체험 사용자 · 저장 기록 없음", status: "휴면 예시", updated: "8월 21일", details: ["가입 경로 · 콘텐츠 예시", "보관 항목 · 0개", "민감정보 · 표시하지 않음"] },
  ],
  orders: [
    { id: "ORD-1042", title: "월간 흐름 리포트", subtitle: "2만 9,000원 표시 예시", status: "완료 예시", updated: "오늘 13:42", details: ["결제 수단 · 수집하지 않음", "실제 청구 · 0원", "상품 지급 · 발생하지 않음"] },
    { id: "ORD-1039", title: "상담 이용권 5회", subtitle: "4만 9,000원 표시 예시", status: "대기 예시", updated: "오늘 11:18", details: ["결제 수단 · 수집하지 않음", "실제 청구 · 0원", "상태 · 화면용 fixture"] },
    { id: "ORD-1031", title: "관계 리포트", subtitle: "1만 9,000원 표시 예시", status: "취소 예시", updated: "8월 23일", details: ["결제 수단 · 수집하지 않음", "환불 · 발생하지 않음", "상태 · 화면용 fixture"] },
  ],
  reports: [
    { id: "RPT-0831", title: "을목의 8월 흐름", subtitle: "월간 · 7개 섹션", status: "발행 예시", updated: "오늘 15:10", details: ["본문 · 미리 작성된 예시", "AI 생성 · 사용하지 않음", "공개 링크 · 생성하지 않음"] },
    { id: "RPT-0828", title: "관계에서 지킬 간격", subtitle: "관계 · 5개 섹션", status: "검수 예시", updated: "오늘 09:34", details: ["본문 · 미리 작성된 예시", "교정 메모 · 2개", "공개 링크 · 생성하지 않음"] },
    { id: "RPT-0819", title: "일의 리듬과 전환", subtitle: "직업 · 6개 섹션", status: "보류 예시", updated: "8월 22일", details: ["본문 · 미리 작성된 예시", "교정 메모 · 1개", "공개 링크 · 생성하지 않음"] },
  ],
  consultations: [
    { id: "CNS-0417", title: "직업 방향 상담", subtitle: "질문 4개 · 체험 세션", status: "진행 예시", updated: "오늘 16:02", details: ["상담자 · 연결되지 않음", "응답 · 미리 작성된 예시", "이용권 · 실제 차감 없음"] },
    { id: "CNS-0412", title: "올해의 관계 흐름", subtitle: "질문 3개 · 체험 세션", status: "완료 예시", updated: "어제 20:15", details: ["상담자 · 연결되지 않음", "응답 · 미리 작성된 예시", "이용권 · 실제 차감 없음"] },
    { id: "CNS-0406", title: "이직 시기 질문", subtitle: "질문 2개 · 체험 세션", status: "대기 예시", updated: "8월 20일", details: ["상담자 · 연결되지 않음", "응답 · 생성하지 않음", "이용권 · 실제 차감 없음"] },
  ],
  quality: [
    { id: "QA-0092", title: "확정적 표현 점검", subtitle: "콘텐츠 안전 · 규칙 8개", status: "통과 예시", updated: "오늘 12:08", details: ["공포 유도 표현 · 없음", "전문 판단 대체 · 없음", "검사 실행 · 화면용 fixture"] },
    { id: "QA-0089", title: "개인정보 노출 점검", subtitle: "공유 카드 · 필드 6개", status: "검토 예시", updated: "오늘 10:41", details: ["이름 기본값 · 숨김", "생년월일 기본값 · 숨김", "검사 실행 · 화면용 fixture"] },
    { id: "QA-0084", title: "상품 고지 문구 점검", subtitle: "상거래 · 화면 4개", status: "보류 예시", updated: "8월 22일", details: ["실제 결제 고지 · 확인 필요 예시", "환불 표현 · 해당 없음", "검사 실행 · 화면용 fixture"] },
  ],
};

const panelStyle: CSSProperties = { border: "var(--rule)", borderRadius: "var(--radius-md)", background: "var(--surface-strong)", padding: 16 };
const fieldStyle: CSSProperties = { width: "100%", minHeight: 46, border: "var(--rule)", borderRadius: 12, background: "var(--surface-strong)", color: "var(--ink)", padding: "0 12px" };
const mutedStyle: CSSProperties = { color: "var(--stone-700)", fontSize: 12 };

export function AdminPrototypeScreen() {
  const [tab, setTab] = useState<AdminTab>("users");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [selectedId, setSelectedId] = useState(ADMIN_FIXTURES.users[0].id);
  const [rows, setRows] = useState(ADMIN_FIXTURES);
  const [message, setMessage] = useState("화면의 모든 값은 고정된 한국어 예시 데이터입니다.");

  const statusOptions = useMemo(() => ["전체", ...new Set(rows[tab].map((row) => row.status))], [rows, tab]);
  const visibleRows = rows[tab].filter((row) => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    const matchesQuery = !keyword || `${row.id} ${row.title} ${row.subtitle}`.toLocaleLowerCase("ko-KR").includes(keyword);
    return matchesQuery && (status === "전체" || row.status === status);
  });
  const selected = visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0];

  function selectTab(next: AdminTab) {
    setTab(next);
    setStatus("전체");
    setQuery("");
    setSelectedId(rows[next][0].id);
    setMessage(`${ADMIN_TABS.find((item) => item.id === next)?.label} 예시 목록을 열었어요.`);
  }

  function updatePrototypeStatus() {
    if (!selected) return;
    setRows((current) => ({
      ...current,
      [tab]: current[tab].map((row) => row.id === selected.id ? { ...row, status: row.status === "확인됨 · 로컬" ? ADMIN_FIXTURES[tab].find((fixture) => fixture.id === row.id)?.status ?? row.status : "확인됨 · 로컬" } : row),
    }));
    setStatus("전체");
    setMessage(`${selected.id}의 표시 상태만 이 화면에서 바꿨어요. 서버에는 저장되지 않았습니다.`);
  }

  return (
    <main className="screen-content admin-prototype-content" aria-labelledby="admin-prototype-title" style={{ gap: 24 }}>
      <header>
        <p className="section-kicker">운영 화면 프로토타입 · 실제 관리자 도구 아님</p>
        <h1 id="admin-prototype-title">사주리움 운영<br />워크스페이스</h1>
        <p className="supporting">고정 fixture로 상호작용을 확인하는 화면입니다. 실제 사용자·주문·리포트·상담 데이터에 연결되지 않으며 어떤 운영 변경도 전송하지 않습니다.</p>
      </header>

      <section aria-label="예시 요약 지표" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {[["사용자 예시", "214", "+12 이번 주"], ["주문 예시", "38", "완료 표시 31"], ["검수 대기", "7", "fixture 기준"], ["상담 예시", "16", "진행 표시 4"]].map(([label, value, note]) => <article key={label} style={panelStyle}><small style={mutedStyle}>{label}</small><strong style={{ display: "block", margin: "4px 0", fontFamily: "var(--editorial-font)", fontSize: 27, fontWeight: 400 }}>{value}</strong><span style={{ color: "var(--vermilion)", fontSize: 11 }}>{note}</span></article>)}
      </section>

      <section aria-labelledby="admin-list-title" style={{ display: "grid", gap: 14 }}>
        <div>
          <p className="section-kicker">탐색과 검토</p>
          <h2 id="admin-list-title">예시 레코드</h2>
        </div>
        <div role="tablist" aria-label="운영 데이터 종류" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {ADMIN_TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => selectTab(item.id)} style={{ minWidth: 82, minHeight: 42, border: tab === item.id ? "1px solid var(--vermilion)" : "var(--rule)", borderRadius: 999, background: tab === item.id ? "rgb(169 52 34 / 8%)" : "var(--surface-strong)", color: tab === item.id ? "var(--vermilion-dark)" : "var(--ink)", fontSize: 12, fontWeight: 700 }}>{item.label}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(130px, 1fr)", gap: 8 }}>
          <label><span style={mutedStyle}>검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ID 또는 제목" style={fieldStyle} /></label>
          <label><span style={mutedStyle}>상태</span><select value={status} onChange={(event) => setStatus(event.target.value)} style={fieldStyle}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div aria-live="polite" style={{ display: "grid", gap: 8, alignContent: "start" }}>
            {visibleRows.length === 0 ? (
              <div style={panelStyle}><strong>조건에 맞는 예시가 없어요.</strong><p style={mutedStyle}>검색어나 상태 필터를 바꿔 보세요.</p></div>
            ) : visibleRows.map((row) => (
              <button key={row.id} type="button" onClick={() => { setSelectedId(row.id); setMessage(`${row.id} 상세를 선택했어요.`); }} aria-pressed={selected?.id === row.id} style={{ ...panelStyle, width: "100%", textAlign: "left", boxShadow: selected?.id === row.id ? "inset 3px 0 0 var(--vermilion)" : "none" }}>
                <small style={{ color: "var(--vermilion)", fontWeight: 800 }}>{row.id}</small>
                <strong style={{ display: "block", marginTop: 6 }}>{row.title}</strong>
                <span style={{ ...mutedStyle, display: "block", marginTop: 4 }}>{row.status}</span>
              </button>
            ))}
          </div>

          <aside aria-label="선택한 예시 상세" style={{ ...panelStyle, alignSelf: "start", background: "var(--surface-warm)" }}>
            {selected ? <><p className="section-kicker">선택 상세 · {selected.id}</p><h2>{selected.title}</h2><p style={{ ...mutedStyle, margin: "6px 0 14px" }}>{selected.subtitle}</p><dl style={{ display: "grid", gap: 8, margin: 0 }}>{selected.details.map((detail) => { const [term, value] = detail.split(" · "); return <div key={detail} style={{ borderTop: "1px solid rgb(32 30 27 / 12%)", paddingTop: 8 }}><dt style={mutedStyle}>{term}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{value}</dd></div>; })}</dl><button className="secondary-button" type="button" onClick={updatePrototypeStatus} style={{ marginTop: 16, background: "var(--surface-strong)" }}>표시 상태만 전환</button></> : <><h2>선택된 예시 없음</h2><p style={mutedStyle}>왼쪽 목록에서 레코드를 선택하세요.</p></>}
          </aside>
        </div>
      </section>

      <p role="status" style={{ ...panelStyle, ...mutedStyle, borderColor: "rgb(169 52 34 / 28%)" }}>{message}</p>
    </main>
  );
}

type ShareKind = "daily" | "monthly" | "relationship";
type ShareFields = { name: boolean; birthDate: boolean; period: boolean; elements: boolean; insight: boolean; action: boolean };

const SHARE_CONTENT: Record<ShareKind, { label: string; eyebrow: string; title: string; insight: string; action: string }> = {
  daily: { label: "오늘의 흐름", eyebrow: "오늘의 리듬", title: "서두르지 않을수록 또렷해지는 날", insight: "먼저 정리하고 나중에 움직이면 중요한 대화의 결이 한결 부드러워집니다.", action: "오후에는 결론보다 질문을 하나 더 남겨 보세요." },
  monthly: { label: "이번 달 흐름", eyebrow: "8월의 흐름", title: "작은 기준을 세우면 선택이 가벼워져요", insight: "넓게 펼치기보다 오래 가져갈 한 가지를 고르는 달입니다.", action: "이번 달 지킬 기준을 한 문장으로 적어 보세요." },
  relationship: { label: "관계 리포트", eyebrow: "관계의 온도", title: "가까움과 간격을 함께 돌보는 관계", insight: "다름을 고치기보다 서로의 회복 속도를 존중할 때 신뢰가 자랍니다.", action: "답을 재촉하지 않는 시간을 약속해 보세요." },
};

export function SharePrototypeScreen() {
  const [kind, setKind] = useState<ShareKind>("daily");
  const [fields, setFields] = useState<ShareFields>({ name: false, birthDate: false, period: true, elements: true, insight: true, action: true });
  const [expiry, setExpiry] = useState("24시간");
  const [message, setMessage] = useState("미리보기 설정만 이 화면의 메모리에 유지됩니다.");
  const content = SHARE_CONTENT[kind];

  function toggleField(field: keyof ShareFields) {
    setFields((current) => ({ ...current, [field]: !current[field] }));
    setMessage("공유 카드 미리보기를 업데이트했어요. 외부 전송은 없습니다.");
  }

  function cardText() {
    return ["사주리움 · 공유 카드 미리보기", fields.period ? content.eyebrow : null, content.title, fields.name ? "이름: 해온" : null, fields.birthDate ? "생년월일: 1992. 04. 18." : null, fields.elements ? "오행 균형: 목 30 · 화 20 · 토 20 · 금 10 · 수 20" : null, fields.insight ? content.insight : null, fields.action ? content.action : null, `만료 설정 표시: ${expiry}`, "공개 링크나 외부 업로드를 만들지 않은 로컬 프로토타입"].filter(Boolean).join("\n");
  }

  function svgCard() {
    const lines = cardText().split("\n").map((line) => line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"));
    const text = lines.map((line, index) => `<text x="84" y="${120 + index * 54}" font-size="${index === 2 ? 38 : 24}" fill="${index === 2 ? "#fffdf8" : "#ddd7cb"}" font-family="serif">${line}</text>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" rx="56" fill="#201e1b"/><circle cx="940" cy="140" r="52" fill="#a93422"/>${text}</svg>`;
  }

  async function copyLocally() {
    try {
      await navigator.clipboard.writeText(cardText());
      setMessage("미리보기 문구를 이 기기의 클립보드에 복사했어요. 공개 링크는 만들지 않았습니다.");
    } catch {
      setMessage("브라우저가 클립보드 복사를 허용하지 않았어요. 외부로 전송된 정보는 없습니다.");
    }
  }

  function downloadLocally() {
    const blob = new Blob([svgCard()], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "sajurium-share-card.svg";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("SVG 이미지 카드를 이 기기에서 만들었어요. 외부 업로드는 없습니다.");
  }

  const toggleRows: readonly [keyof ShareFields, string, string][] = [
    ["name", "이름", "민감 정보 · 기본 숨김"],
    ["birthDate", "생년월일", "민감 정보 · 기본 숨김"],
    ["period", "기간 제목", "오늘·이번 달 등"],
    ["elements", "오행 균형", "요약 수치"],
    ["insight", "핵심 해석", "공유할 본문"],
    ["action", "실천 메모", "짧은 제안"],
  ];

  return (
    <main className="screen-content share-prototype-content" aria-labelledby="share-prototype-title" style={{ gap: 24 }}>
      <header>
        <p className="section-kicker">공유 카드 프로토타입 · 로컬 미리보기</p>
        <h1 id="share-prototype-title">보여줄 정보만<br />직접 골라보세요</h1>
        <p className="supporting">이름과 생년월일은 기본으로 숨겨져 있습니다. 이 화면은 공개 링크를 만들거나 이미지를 서버에 올리지 않으며, 선택값도 저장하지 않습니다.</p>
      </header>

      <section aria-labelledby="share-kind-title" style={{ display: "grid", gap: 10 }}>
        <h2 id="share-kind-title">1. 콘텐츠 선택</h2>
        <div className="segmented-control" role="group" aria-label="공유할 콘텐츠 종류">
          {(Object.entries(SHARE_CONTENT) as [ShareKind, (typeof SHARE_CONTENT)[ShareKind]][]).map(([id, item]) => <button key={id} type="button" className={kind === id ? "selected" : ""} aria-pressed={kind === id} onClick={() => { setKind(id); setMessage(`${item.label} 카드 미리보기를 열었어요.`); }}>{item.label}</button>)}
        </div>
      </section>

      <section aria-labelledby="privacy-fields-title" style={{ display: "grid", gap: 10 }}>
        <div><h2 id="privacy-fields-title">2. 표시 정보</h2><p style={mutedStyle}>체크한 항목만 아래 카드에 나타납니다.</p></div>
        <fieldset style={{ display: "grid", gap: 8 }}>
          <legend className="section-kicker">개인정보 보호 선택</legend>
          {toggleRows.map(([field, label, note]) => <label key={field} className="setting-toggle" style={{ ...panelStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><span><strong style={{ display: "block" }}>{label}</strong><small style={mutedStyle}>{note}</small></span><input type="checkbox" checked={fields[field]} onChange={() => toggleField(field)} /></label>)}
        </fieldset>
      </section>

      <section aria-labelledby="preview-title" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12 }}><div><p className="section-kicker">실시간 카드</p><h2 id="preview-title">3. 미리보기</h2></div><small style={mutedStyle}>{content.label}</small></div>
        <article style={{ borderRadius: 24, background: "var(--ink)", color: "#fffdf8", padding: "28px 24px", boxShadow: "none" }}>
          <p style={{ color: "#e9a595", fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>SAJURIUM · SHARE PREVIEW</p>
          {fields.period && <p style={{ marginTop: 22, color: "#ddd7cb", fontSize: 12 }}>{content.eyebrow}</p>}
          <h3 style={{ marginTop: 6, fontSize: 28, lineHeight: 1.35 }}>{content.title}</h3>
          {(fields.name || fields.birthDate) && <p style={{ marginTop: 16, color: "#ddd7cb", fontSize: 12 }}>{fields.name && "해온"}{fields.name && fields.birthDate && " · "}{fields.birthDate && "1992. 04. 18."}</p>}
          {fields.elements && <div style={{ marginTop: 20, borderTop: "1px solid rgb(255 255 255 / 18%)", paddingTop: 14 }}><small style={{ color: "#ddd7cb" }}>오행 균형</small><p style={{ marginTop: 5, letterSpacing: ".04em" }}>목 30 · 화 20 · 토 20 · 금 10 · 수 20</p></div>}
          {fields.insight && <p style={{ marginTop: 20, fontFamily: "var(--editorial-font)", fontSize: 17, lineHeight: 1.8 }}>{content.insight}</p>}
          {fields.action && <p style={{ marginTop: 18, borderRadius: 12, background: "rgb(255 255 255 / 9%)", padding: 12, color: "#f3efe6", fontSize: 12 }}>오늘의 메모 · {content.action}</p>}
          <p style={{ marginTop: 22, color: "#bdb6aa", fontSize: 12 }}>만료 표시 · {expiry} / 사주 해석은 중요한 결정이나 전문 판단을 대신하지 않습니다.</p>
        </article>
      </section>

      <section aria-labelledby="expiry-title" style={{ display: "grid", gap: 10 }}>
        <h2 id="expiry-title">4. 만료 표시</h2>
        <label><span style={mutedStyle}>카드에 표시할 만료 기준</span><select value={expiry} onChange={(event) => { setExpiry(event.target.value); setMessage(`${event.target.value} 만료 문구를 미리보기에 적용했어요.`); }} style={fieldStyle}><option>24시간</option><option>7일</option><option>30일</option><option>만료 없음</option></select></label>
        <p style={mutedStyle}>링크가 생성되지 않으므로 실제 접근 만료를 실행하지 않습니다. 선택값은 카드와 복사·다운로드 문구에만 표시됩니다.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        <button className="primary-button" type="button" onClick={copyLocally}>문구 로컬 복사</button>
        <button className="secondary-button" type="button" onClick={downloadLocally}>이미지 카드 다운로드</button>
      </div>
      <p className="action-note">공개 URL·외부 업로드·서버 저장은 생성되지 않습니다.</p>
      <p role="status" style={{ ...panelStyle, ...mutedStyle, borderColor: "rgb(169 52 34 / 28%)" }}>{message}</p>
    </main>
  );
}
