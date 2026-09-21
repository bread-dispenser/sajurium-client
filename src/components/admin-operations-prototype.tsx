"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AdminCommand, AdminCommandType, AuditView } from "@/lib/contracts";
import styles from "./saas-system-rollout.module.css";

type OperationTab = "users" | "orders" | "reports" | "templates" | "consultations" | "audit";
type Fixture = { id: string; title: string; status: string; summary: string; expectedVersion: string; facts: readonly [string, string][] };
type AuditEntry = AuditView & { requestId: string; label: string; beforeSummary: string; afterSummary: string };
type Action = {
  label: string;
  risk: boolean;
  command: { type: AdminCommandType; targetType: AdminCommand["targetType"] };
  beforeSummary: string;
  afterSummary: string;
};

const panel: CSSProperties = { border: "1px solid var(--sr-line)", borderRadius: "var(--sr-radius)", background: "var(--sr-surface)", padding: 16 };
const field: CSSProperties = { width: "100%", minHeight: 48, border: "1px solid var(--sr-control-line)", borderRadius: "var(--sr-radius)", background: "var(--sr-surface)", color: "var(--sr-ink)", padding: "0 12px" };
const muted: CSSProperties = { color: "var(--sr-muted)", fontSize: 13, lineHeight: 1.6 };

const TAB_LABELS: Record<OperationTab, string> = {
  users: "사용자·개인정보", orders: "주문·지급", reports: "리포트 품질", templates: "템플릿", consultations: "상담·안전", audit: "접근 감사",
};

const FIXTURES: Record<OperationTab, Fixture[]> = {
  users: [
    { id: "USR-0214", title: "봄빛 독자", status: "활성 · 삭제 요청 없음", summary: "프로필 2개 · 상담 이용권 3회", expectedVersion: "account-v12", facts: [["계정 상태", "활성 예시"], ["프로필", "해온 · 1992년생 / 달빛 · 1990년생 (마스킹)"], ["보유 이용권", "상담 3회 · 원장 예시"], ["개인정보 요청", "없음"]] },
    { id: "USR-0198", title: "저녁별 독자", status: "검토 · 삭제 요청 접수", summary: "프로필 1개 · 요청 기한 D-12", expectedVersion: "account-v8", facts: [["계정 상태", "검토 예시"], ["프로필", "별하 · 생년 정보 마스킹"], ["보유 이용권", "0회"], ["개인정보 요청", "삭제 접수 PRIV-0081 · 본인 확인 예시"]] },
  ],
  orders: [
    { id: "ORD-1042", title: "월간 흐름 리포트", status: "결제 완료 · 지급 완료", summary: "29,000원 표시 · 상태 일치", expectedVersion: "order-v6", facts: [["결제", "완료 PAY-7712"], ["상품 생성", "완료 RPT-0831"], ["지급 원장", "+1 · 결제 지급"], ["중복 탐지", "없음"]] },
    { id: "ORD-1039", title: "상담 이용권 5회", status: "결제 완료 · 지급 확인 필요", summary: "49,000원 표시 · 비교 불일치", expectedVersion: "order-v4", facts: [["결제", "완료 PAY-7701"], ["상품 생성", "해당 없음"], ["지급 원장", "대기 예시"], ["중복 탐지", "콜백 2건 · 지급 1건"]] },
  ],
  reports: [
    { id: "RPT-0831", title: "을목의 8월 흐름", status: "발행 · 신고 1건", summary: "월간 리포트 · 입력/버전 추적 예시", expectedVersion: "report-v7", facts: [["입력 스냅샷", "INP-22A · 원문 비공개"], ["계산 버전", "saju-core 2.4.1"], ["모델", "example-model-2026-08"], ["프롬프트", "monthly-prompt v18"], ["템플릿", "monthly-flow v7"]] },
    { id: "RPT-0828", title: "관계에서 지킬 간격", status: "비공개 검토 · 신고 2건", summary: "관계 리포트 · 품질 검수 예시", expectedVersion: "report-v5", facts: [["입력 스냅샷", "INP-21C · 권한 필요 표시"], ["계산 버전", "saju-core 2.4.1"], ["모델", "example-model-2026-08"], ["프롬프트", "relation-prompt v11"], ["템플릿", "relationship v5"]] },
  ],
  templates: [
    { id: "TPL-007", title: "월간 흐름", status: "v7 활성 · 검수 완료", summary: "카테고리: 월간 · 금지 표현 규칙 8개", expectedVersion: "template-v7", facts: [["활성 버전", "v7"], ["검수", "완료 예시"], ["직전 버전", "v6"], ["금지 표현", "확정적 질병·사망·투자 보장 등 8개"]] },
    { id: "TPL-011", title: "관계 해석", status: "v6 검수 대기 · v5 활성", summary: "카테고리: 관계 · 변경 메모 포함", expectedVersion: "template-v6", facts: [["활성 버전", "v5"], ["후보 버전", "v6"], ["검수", "대기 예시"], ["금지 표현", "공포 유도·상대 단정 등 6개"]] },
  ],
  consultations: [
    { id: "CNS-0417", title: "직업 방향 상담", status: "신고 검토 · 안전 필터 1회", summary: "이용권 정상 차감 · 개인정보 로그 제한", expectedVersion: "consultation-v9", facts: [["신고", "부적절한 확정 표현"], ["차감 원장", "-1 정상"], ["재생성", "0회"], ["안전 필터", "전문가 대체 위험 · 제한 응답"], ["로그 접근", "민감 필드 잠금"]] },
    { id: "CNS-0406", title: "건강 관련 질문", status: "응답 제한 · 차감 복구 후보", summary: "안전 정책 제한 · 이용권 미차감 원칙 비교", expectedVersion: "consultation-v3", facts: [["신고", "없음"], ["차감 원장", "-1 오류 예시"], ["재생성", "0회"], ["안전 필터", "의료 판단 요청 · 차단"], ["로그 접근", "보안 역할 전용"]] },
  ],
  audit: [
    { id: "ACL-0902", title: "민감 프로필 열람", status: "사유 기록됨", summary: "품질 담당자 · USR-0198 · 오늘 14:12", expectedVersion: "audit-v2", facts: [["운영자 역할", "품질 검수자"], ["대상", "프로필 마스킹 보기"], ["근거", "삭제 요청 확인 예시"], ["결과", "읽기 전용"]] },
    { id: "ACL-0899", title: "상담 로그 접근 거부", status: "권한 부족 · 차단", summary: "정산 담당자 · CNS-0417 · 오늘 11:08", expectedVersion: "audit-v1", facts: [["운영자 역할", "정산 담당자"], ["대상", "상담 민감 로그"], ["근거", "업무 범위 외 예시"], ["결과", "거부"]] },
  ],
};

const ACTIONS: Record<OperationTab, readonly Action[]> = {
  users: [
    { label: "계정 제한 표시", risk: true, command: { type: "restrict_account", targetType: "account" }, beforeSummary: "[마스킹] 계정 상태: 활성", afterSummary: "[마스킹] 계정 상태: 제한" },
    { label: "제한 해제 표시", risk: true, command: { type: "restore_account", targetType: "account" }, beforeSummary: "[마스킹] 계정 상태: 제한", afterSummary: "[마스킹] 계정 상태: 활성" },
    { label: "삭제 요청 처리 표시", risk: true, command: { type: "process_deletion", targetType: "account" }, beforeSummary: "[마스킹] 삭제 요청: 본인 확인 완료", afterSummary: "[마스킹] 삭제 요청: 처리 접수" },
  ],
  orders: [
    { label: "환불 처리 표시", risk: true, command: { type: "refund_order", targetType: "order" }, beforeSummary: "[마스킹] 주문 상태: 결제 완료", afterSummary: "[마스킹] 주문 상태: 환불 접수" },
    { label: "수동 이용권 지급 표시", risk: true, command: { type: "grant_credits", targetType: "order" }, beforeSummary: "[마스킹] 지급 원장: 변경 전", afterSummary: "[마스킹] 지급 원장: 관리자 조정" },
  ],
  reports: [
    { label: "리포트 재생성 표시", risk: true, command: { type: "regenerate_report", targetType: "report" }, beforeSummary: "[마스킹] 생성 버전: 기존", afterSummary: "[마스킹] 재생성 작업: 접수" },
    { label: "결과 비공개 전환", risk: true, command: { type: "hide_report", targetType: "report" }, beforeSummary: "[마스킹] 공개 상태: 발행", afterSummary: "[마스킹] 공개 상태: 비공개" },
  ],
  templates: [],
  consultations: [
    { label: "차감 오류 복구", risk: true, command: { type: "restore_credits", targetType: "consultation" }, beforeSummary: "[마스킹] 이용권 원장: 오류 차감", afterSummary: "[마스킹] 이용권 원장: 복구 접수" },
    { label: "상담 결과 재생성", risk: true, command: { type: "regenerate_report", targetType: "consultation" }, beforeSummary: "[마스킹] 상담 생성 상태: 완료", afterSummary: "[마스킹] 상담 재생성: 접수" },
    { label: "민감 로그 접근 제한", risk: true, command: { type: "restrict_sensitive_access", targetType: "consultation" }, beforeSummary: "[마스킹] 민감 로그 접근: 역할 기반", afterSummary: "[마스킹] 민감 로그 접근: 제한" },
  ],
  audit: [],
};

const initialAudit: AuditEntry[] = [
  { id: "AUD-0003", requestId: "req_demo_0902", actorId: "operator_quality_redacted", actorRole: "quality_reviewer", label: "민감 로그 접근 제한", command: { type: "restrict_sensitive_access", targetType: "account", targetId: "USR-0198", reason: "PRIV-0081 요청 확인", expectedVersion: "account-v8" }, outcome: "accepted", occurredAt: "2026-08-25T05:12:16.000Z", beforeSummary: "[마스킹] 민감 필드 접근: 역할 기반", afterSummary: "[마스킹] 민감 필드 접근: 제한" },
  { id: "AUD-0002", requestId: "req_demo_0899", actorId: "operator_billing_redacted", actorRole: "billing_operator", label: "상담 로그 접근 제한", command: { type: "restrict_sensitive_access", targetType: "consultation", targetId: "CNS-0417", reason: "상담 로그 권한 없음", expectedVersion: "consultation-v9" }, outcome: "rejected", occurredAt: "2026-08-25T02:08:41.000Z", beforeSummary: "[마스킹] 민감 로그 접근: 요청됨", afterSummary: "[마스킹] 민감 로그 접근: 거부" },
  { id: "AUD-0001", requestId: "req_demo_0884", actorId: "operator_content_redacted", actorRole: "content_operator", label: "리포트 비공개 전환", command: { type: "hide_report", targetType: "report", targetId: "RPT-0828", reason: "신고 검토", expectedVersion: "report-v5" }, outcome: "failed", occurredAt: "2026-08-24T08:40:03.000Z", beforeSummary: "[마스킹] 공개 상태: 검토", afterSummary: "[마스킹] 변경 없음" },
];

export function AdminOperationsPrototypeScreen() {
  const [tab, setTab] = useState<OperationTab>("users");
  const [selectedId, setSelectedId] = useState(FIXTURES.users[0].id);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Action | null>(null);
  const [audit, setAudit] = useState(initialAudit);
  const [message, setMessage] = useState("고정 예시만 표시합니다. 실제 운영 시스템과 연결되어 있지 않습니다.");
  const rows = useMemo(() => FIXTURES[tab].filter((item) => `${item.id} ${item.title} ${item.status}`.toLocaleLowerCase("ko-KR").includes(query.trim().toLocaleLowerCase("ko-KR"))), [query, tab]);
  const selected = FIXTURES[tab].find((item) => item.id === selectedId) ?? rows[0];

  function changeTab(next: OperationTab) {
    setTab(next); setSelectedId(FIXTURES[next][0].id); setQuery(""); setPending(null); setReason("");
    setMessage(`${TAB_LABELS[next]} 예시를 열었습니다.`);
  }
  function requestAction(action: Action) {
    if (!selected) return;
    if (action.risk) { setPending(action); setMessage("위험 작업은 영향과 사유를 확인한 뒤 확정해야 합니다."); return; }
    commitAction(action);
  }
  function commitAction(action: Action) {
    if (!selected) return;
    const command: AdminCommand = {
      type: action.command.type,
      targetType: action.command.targetType,
      targetId: selected.id,
      reason: reason.trim(),
      expectedVersion: selected.expectedVersion,
    };
    const sequence = String(audit.length + 1).padStart(4, "0");
    const entry: AuditEntry = {
      id: `AUD-${sequence}`,
      requestId: `req_demo_${sequence}`,
      actorId: "operator_current_redacted",
      actorRole: "operations_admin",
      label: action.label,
      command,
      outcome: "accepted",
      occurredAt: new Date().toISOString(),
      beforeSummary: action.beforeSummary,
      afterSummary: action.afterSummary,
    };
    setAudit((current) => [entry, ...current]);
    setPending(null); setReason("");
    setMessage(`${command.type} 명령을 ${command.targetType}:${command.targetId} 대상으로 로컬 감사 목록에만 추가했습니다. 실제 변경은 없습니다.`);
  }

  return <main className={`screen-content ${styles.srScreen}`} aria-labelledby="operations-title" style={{ gap: 24 }}>
    <header><p className="section-kicker">운영 상세 · 인터랙티브 화면 체험</p><h1 id="operations-title">운영·개인정보<br />품질 워크스페이스</h1><p className="supporting">모든 사용자, 결제, 리포트, 상담 값은 고정된 한국어 예시입니다. 서버 조회·저장·환불·지급·삭제·재생성은 일어나지 않습니다.</p></header>
    <aside className={styles.alertPanel}><strong>비운영 데모</strong><p style={{ ...muted, marginTop: 4 }}>버튼은 이 탭의 React 상태와 아래 감사 표시만 바꿉니다. 실제 관리자 권한이나 민감정보 접근 권한을 제공하지 않습니다.</p></aside>

    <nav data-slop-allow="overstuffed-row" role="tablist" aria-label="운영 업무" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
      {(Object.keys(TAB_LABELS) as OperationTab[]).map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => changeTab(id)} className={`${styles.tabButton}${tab === id ? ` ${styles.tabButtonSelected}` : ""}`}>{TAB_LABELS[id]}</button>)}
    </nav>

    <section data-slop-allow="overstuffed-row" aria-labelledby="records-title" style={{ display: "grid", gap: 12 }}>
      <div><p className="section-kicker">검색·조회</p><h2 id="records-title">{TAB_LABELS[tab]} 예시 레코드</h2></div>
      <label><span style={muted}>ID·제목·상태 검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 신고, ORD-1039" style={field} /></label>
      <div data-slop-allow="overstuffed-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          {rows.length ? rows.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setPending(null); setMessage(`${item.id} 상세 예시를 선택했습니다.`); }} aria-pressed={selected?.id === item.id} className={`${styles.recordRow}${selected?.id === item.id ? ` ${styles.recordRowSelected}` : ""}`}><small style={{ color: "var(--sr-accent)", fontWeight: 600 }}>{item.id}</small><strong style={{ display: "block", margin: "5px 0" }}>{item.title}</strong><span style={muted}>{item.status}</span></button>) : <div style={panel}><strong>검색 결과가 없습니다.</strong><p style={muted}>예시 ID나 상태로 다시 검색하세요.</p></div>}
        </div>
        <article className={styles.detailPanel} aria-label="선택 레코드 상세">
          {selected ? <><p className="section-kicker">{selected.id}</p><h2>{selected.title}</h2><p style={{ ...muted, margin: "6px 0 14px" }}>{selected.summary}</p><dl style={{ display: "grid", gap: 9, margin: 0 }}>{selected.facts.map(([term, value]) => <div key={term} style={{ borderTop: "1px solid var(--sr-line)", paddingTop: 8 }}><dt style={muted}>{term}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{value}</dd></div>)}</dl></> : <p>레코드를 선택하세요.</p>}
        </article>
      </div>
    </section>

    {tab === "templates" && <section data-slop-allow="overstuffed-row" aria-labelledby="template-editor-title" style={{ ...panel, display: "grid", gap: 10 }}><div><p className="section-kicker">등록·버전 예시</p><h2 id="template-editor-title">템플릿 변경안</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}><label><span style={muted}>카테고리</span><select style={field} defaultValue="월간"><option>월간</option><option>관계</option><option>직업</option><option>재물</option></select></label><label><span style={muted}>버전 이름</span><input style={field} defaultValue="v8-draft" /></label><label><span style={muted}>검수 상태</span><select style={field} defaultValue="검수 대기"><option>초안</option><option>검수 대기</option><option>승인</option><option>반려</option></select></label></div><label><span style={muted}>금지 표현 규칙(화면 메모)</span><textarea style={{ ...field, minHeight: 82, paddingTop: 10 }} defaultValue="질병·사망 단정, 투자 수익 보장, 공포를 유도하는 확정 표현" /></label><p style={muted}>입력값은 전송되지 않으며 “등록/반영” 작업을 선택해도 로컬 감사 표시만 추가됩니다.</p></section>}

    <section data-slop-allow="overstuffed-row" aria-labelledby="actions-title" style={{ display: "grid", gap: 10 }}><div><p className="section-kicker">로컬 작업 시뮬레이션</p><h2 id="actions-title">{TAB_LABELS[tab]} 작업</h2></div><label><span style={muted}>작업 사유 · 위험 작업 확인에 사용</span><input value={reason} onChange={(event) => setReason(event.target.value)} style={field} placeholder="예: 신고 검토 및 주문 상태 대조" /></label>{ACTIONS[tab].length > 0 ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>{ACTIONS[tab].map((action) => <button key={action.command.type} className={action.risk ? "secondary-button" : "primary-button"} type="button" onClick={() => requestAction(action)} data-command-type={action.command.type}>{action.label}{action.risk ? " · 확인 필요" : ""}</button>)}</div> : <p style={muted}>이 영역에는 canonical AdminCommand로 정의된 변경 작업이 없습니다.</p>}</section>

    {pending && selected && <section data-slop-allow="overstuffed-row" role="alertdialog" aria-modal="false" aria-labelledby="confirm-title" aria-describedby="confirm-description" className={styles.alertPanel}><p className="section-kicker">위험 작업 확인</p><h2 id="confirm-title">“{pending.label}”을 시뮬레이션할까요?</h2><p id="confirm-description" style={{ ...muted, margin: "8px 0 14px" }}>명령 {pending.command.type} · 대상 {pending.command.targetType}:{selected.id} · 예상 버전 {selected.expectedVersion}. 실제 운영에서는 권한, 사유, 이중 확인이 필요합니다. 여기서는 로컬 감사 행만 추가되고 실제 제한·삭제·환불·지급·재생성·배포는 없습니다.</p>{!reason.trim() && <p style={{ color: "var(--sr-accent)", fontSize: 13 }}>위 작업 사유를 입력해야 확정할 수 있습니다.</p>}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="primary-button" type="button" disabled={!reason.trim()} onClick={() => commitAction(pending)}>로컬 시뮬레이션 확정</button><button className="secondary-button" type="button" onClick={() => { setPending(null); setMessage("위험 작업을 취소했습니다."); }}>취소</button></div></section>}

    <section data-slop-allow="overstuffed-row" aria-labelledby="audit-title" style={{ display: "grid", gap: 10 }}><div><p className="section-kicker">추가 전용 표시 · 수정/삭제 불가</p><h2 id="audit-title">운영자 접근·작업 감사 기록</h2><p style={muted}>현재 화면에서 만든 행은 위에만 추가됩니다. 브라우저를 새로 열면 초기화되는 감사 UI 예시이며 실제 감사 로그가 아닙니다.</p></div><div role="region" aria-label="운영 감사 기록 표" tabIndex={0} className={styles.dataTableWrap}><table data-slop-allow="overstuffed-row" className={styles.dataTable} style={{ minWidth: 1180 }}><thead><tr data-slop-allow="overstuffed-row">{["기록 ID / 요청 ID", "발생 시각", "운영자 역할", "명령", "대상 / 버전", "결과", "사유", "변경 전 / 변경 후"].map((label) => <th key={label} scope="col" style={{ padding: "0.625rem 0.75rem", textAlign: "left" }}>{label}</th>)}</tr></thead><tbody>{audit.map((entry) => <tr data-slop-allow="overstuffed-row" key={entry.id} style={{ borderTop: "var(--rule)" }}><td style={{ padding: "0.625rem 0.75rem", fontWeight: 600 }}>{entry.id}<small style={{ ...muted, display: "block" }}>{entry.requestId}</small></td><td style={{ padding: "0.625rem 0.75rem" }}><time dateTime={entry.occurredAt}>{entry.occurredAt}</time></td><td style={{ padding: "0.625rem 0.75rem" }}>{entry.actorRole}<small style={{ ...muted, display: "block" }}>{entry.actorId}</small></td><td style={{ padding: "0.625rem 0.75rem" }}><code>{entry.command.type}</code><small style={{ ...muted, display: "block" }}>{entry.label}</small></td><td style={{ padding: "0.625rem 0.75rem" }}>{entry.command.targetType}:{entry.command.targetId}<small style={{ ...muted, display: "block" }}>expected {entry.command.expectedVersion ?? "없음"}</small></td><td style={{ padding: "0.625rem 0.75rem" }}>{entry.outcome}</td><td style={{ padding: "0.625rem 0.75rem" }}>{entry.command.reason}</td><td style={{ padding: "0.625rem 0.75rem" }}>{entry.beforeSummary}<small style={{ ...muted, display: "block" }}>→ {entry.afterSummary}</small></td></tr>)}</tbody></table></div></section>
    <p role="status" aria-live="polite" className={styles.statusNote}>{message}</p>
  </main>;
}

const METRICS = [
  ["일간 신규 사용자", "128명", "+8.5%"], ["사주 입력 완료율", "72.4%", "-1.2%p"], ["무료 결과 열람 수", "1,842회", "+6.1%"], ["상담 사용 수", "214회", "+3.8%"], ["상품별 결제액", "842만원", "월간 410만원 · 상담 270만원 · 관계 162만원"], ["결제 전환율", "4.8%", "+0.3%p"], ["리포트 생성 실패율", "1.7%", "+0.4%p"], ["이용권 차감 오류", "6건", "0.08%"], ["피드백 분포", "helpful 68%", "unclear 21% · wrong 11% · 응답 329건"], ["신고 발생률", "0.31%", "리포트 0.22% · 상담 0.09%"],
] as const;

const FUNNEL = [
  ["landing_viewed", "1만 2,480", "100%"], ["birth_input_started", "8,920", "71.5%"], ["birth_input_completed", "6,458", "51.7%"], ["chart_generation_succeeded", "6,331", "50.7%"], ["chart_generation_failed", "127", "1.0%"], ["free_report_viewed", "5,982", "47.9%"], ["signup_started", "2,141", "17.2%"], ["signup_completed", "1,756", "14.1%"], ["consultation_started", "622", "5.0%"], ["consultation_question_submitted", "534", "4.3%"], ["compatibility_started", "804", "6.4%"], ["compatibility_preview_viewed", "681", "5.5%"], ["paywall_viewed", "1,322", "10.6%"], ["order_created", "702", "5.6%"], ["purchase_completed", "601", "4.8%"], ["purchase_failed", "101", "0.8%"], ["paid_report_opened", "544", "4.4%"], ["report_feedback_submitted", "329", "2.6%"], ["notification_opened", "1,104", "8.8%"],
] as const;

const DRILL_ROWS = [
  ["2026-08-25 14:18", "RPT-GEN", "리포트 생성 실패", "모델 응답 시간 초과", "월간 · web", "재시도 대기"],
  ["2026-08-25 13:42", "PAY-FAIL", "결제 실패", "사용자 취소 예시", "상담권 · app", "종료"],
  ["2026-08-25 12:07", "CRD-ERR", "이용권 차감 오류", "제한 응답 후 차감", "상담 · web", "복구 검토"],
  ["2026-08-25 10:31", "CHART-FAIL", "원국 계산 실패", "시간대 값 누락", "무료 · web", "입력 안내"],
] as const;

export function AdminAnalyticsPrototypeScreen() {
  const [period, setPeriod] = useState("최근 7일");
  const [source, setSource] = useState("전체 유입");
  const [device, setDevice] = useState("전체 기기");
  const [product, setProduct] = useState("전체 상품");
  const [failureOnly, setFailureOnly] = useState(false);
  const [selectedStage, setSelectedStage] = useState("landing_viewed");
  const [message, setMessage] = useState("지표와 이벤트는 분석 화면 검토용 고정 예시입니다.");
  const visibleDrills = failureOnly ? DRILL_ROWS.filter((row) => row[2].includes("실패") || row[2].includes("오류")) : DRILL_ROWS;

  return <main className={`screen-content ${styles.srScreen}`} aria-labelledby="analytics-title" style={{ gap: 24 }}>
    <header><p className="section-kicker">운영 분석 · 인터랙티브 화면 체험</p><h1 id="analytics-title">제품·품질<br />운영 대시보드</h1><p className="supporting">실제 분석 이벤트, 사용자 식별자, 출생 정보 또는 상담 전문을 조회하지 않습니다. 아래 수치는 필터 상호작용을 위한 고정 예시입니다.</p></header>
    <aside className={styles.alertPanel}><strong>분석 데이터 아님</strong><p style={{ ...muted, marginTop: 4 }}>필터는 표시 문구만 바꾸며 서버 쿼리를 실행하지 않습니다. 일반 분석 이벤트에는 출생 정보 원문과 상담 내용 전문을 넣지 않는다는 개인정보 원칙을 함께 보여줍니다.</p></aside>

    <section data-slop-allow="overstuffed-row" aria-labelledby="filters-title" style={{ ...panel, display: "grid", gap: 10 }}><div><p className="section-kicker">예시 범위</p><h2 id="filters-title">대시보드 필터</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      <label><span style={muted}>기간</span><select value={period} onChange={(event) => { setPeriod(event.target.value); setMessage(`${event.target.value} 표시로 바꿨습니다. 값은 다시 계산되지 않습니다.`); }} style={field}><option>오늘</option><option>최근 7일</option><option>최근 30일</option></select></label>
      <label><span style={muted}>유입 경로</span><select value={source} onChange={(event) => setSource(event.target.value)} style={field}><option>전체 유입</option><option>직접 방문</option><option>콘텐츠</option><option>초대 코드</option></select></label>
      <label><span style={muted}>기기</span><select value={device} onChange={(event) => setDevice(event.target.value)} style={field}><option>전체 기기</option><option>모바일 web</option><option>데스크톱 web</option><option>app</option></select></label>
      <label><span style={muted}>상품</span><select value={product} onChange={(event) => setProduct(event.target.value)} style={field}><option>전체 상품</option><option>월간 리포트</option><option>관계 리포트</option><option>상담 이용권</option></select></label>
    </div><p style={muted}>현재 표시: {period} · {source} · {device} · {product} · 고정 예시</p></section>

    <section data-slop-allow="overstuffed-row" aria-labelledby="metrics-title"><div><p className="section-kicker">PRD 핵심 지표 전체</p><h2 id="metrics-title">운영 요약</h2></div><div data-slop-allow="overstuffed-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 10 }}>{METRICS.map(([label, value, note]) => <article key={label} style={panel}><small style={muted}>{label}</small><strong style={{ display: "block", margin: "5px 0", fontFamily: "inherit", fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</strong><span style={{ color: label.includes("실패") || label.includes("오류") || label.includes("신고") ? "var(--sr-accent)" : "var(--sr-muted)", fontSize: 12 }}>{note}</span></article>)}</div></section>

    <section data-slop-allow="overstuffed-row" aria-labelledby="errors-title" style={{ display: "grid", gap: 10 }}><div><p className="section-kicker">실패·오류율</p><h2 id="errors-title">품질 경보 예시</h2></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>{[["원국 계산 실패", "2.0%", "127 / 6,458"], ["리포트 생성 실패", "1.7%", "108 / 6,331"], ["결제 실패", "14.4%", "101 / 702"], ["이용권 차감 오류", "0.08%", "6 / 7,486"], ["안전 필터 제한", "2.4%", "13 / 534"], ["알림 열기 실패", "0.6%", "7건 예시"]].map(([label, value, note]) => <article key={label} style={{ ...panel }}><strong>{label}</strong><span style={{ display: "block", margin: "0.4375rem 0 0", fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</span><small style={muted}>{note}</small></article>)}</div></section>

    <section data-slop-allow="overstuffed-row" aria-labelledby="funnel-title" style={{ display: "grid", gap: 10 }}><div><p className="section-kicker">분석 이벤트 전체</p><h2 id="funnel-title">핵심 퍼널 단계</h2><p style={muted}>단계를 누르면 선택 상태만 바뀝니다. 실패 이벤트는 전환 단계와 분리해 함께 표시합니다.</p></div><div data-slop-allow="overstuffed-row" style={{ display: "grid", gap: 6 }}>{FUNNEL.map(([event, count, rate]) => <button key={event} type="button" aria-pressed={selectedStage === event} onClick={() => { setSelectedStage(event); setMessage(`${event} 단계 예시를 선택했습니다.`); }} className={`${styles.funnelRow}${selectedStage === event ? ` ${styles.funnelRowSelected}` : ""}`}><code>{event}</code><strong>{count}</strong><span>{rate}</span></button>)}</div></section>

    <section data-slop-allow="overstuffed-row" aria-labelledby="drill-title" style={{ display: "grid", gap: 10 }}><div><p className="section-kicker">선택 단계 · {selectedStage}</p><h2 id="drill-title">오류 드릴다운 예시</h2></div><label style={{ ...panel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span><strong>실패·오류 행만 보기</strong><small style={{ ...muted, display: "block" }}>개별 사용자나 민감 원문은 표시하지 않음</small></span><input type="checkbox" checked={failureOnly} onChange={(event) => setFailureOnly(event.target.checked)} /></label><div role="region" aria-label="오류 드릴다운 표" tabIndex={0} className={styles.dataTableWrap}><table data-slop-allow="overstuffed-row" className={styles.dataTable} style={{ minWidth: 760 }}><thead><tr data-slop-allow="overstuffed-row">{["시각", "코드", "구분", "원인 예시", "범위", "처리 상태"].map((label) => <th key={label} scope="col" style={{ padding: "0.625rem 0.75rem", textAlign: "left" }}>{label}</th>)}</tr></thead><tbody>{visibleDrills.map((row) => <tr data-slop-allow="overstuffed-row" key={row[1]} style={{ borderTop: "var(--rule)" }}>{row.map((cell, index) => <td key={`${row[1]}-${index}`} style={{ padding: "0.625rem 0.75rem", fontWeight: index === 1 ? 600 : 400 }}>{cell}</td>)}</tr>)}</tbody></table></div><p style={muted}>드릴다운 속성 예시: 익명 ID(표시 안 함), 프로필 ID(표시 안 함), report_type, product_id, acquisition_source, device_type, app_or_web, experiment_group, timestamp. 민감 원문은 수집·표시하지 않습니다.</p></section>
    <p role="status" aria-live="polite" className={styles.statusNote}>{message}</p>
  </main>;
}
