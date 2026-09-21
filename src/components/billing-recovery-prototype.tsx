"use client";

import { useMemo, useState } from "react";
import styles from "./saas-system-rollout.module.css";

type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FULFILLING"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED";
type ReportStatus = "QUEUED" | "GENERATING" | "READY" | "FAILED";
type Provider = "WEB" | "APP";
type LedgerType = "구매 지급" | "상담 사용" | "환불" | "오류 복구" | "관리자 조정";

type LedgerRow = {
  id: number;
  type: LedgerType;
  delta: number;
  source: string;
  note: string;
};

type PurchaseKey = {
  product: string;
  profile: string;
  period: string;
  version: string;
};

const ORDER_FLOW: OrderStatus[] = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "FULFILLING",
  "COMPLETED",
];

const PRODUCTS = [
  { id: "year-2026", name: "2026 올해 종합 리포트", kind: "REPORT" as const, price: "29,000원" },
  { id: "decade", name: "10년 흐름 리포트", kind: "REPORT" as const, price: "49,000원" },
  { id: "credit-3", name: "상담 이용권 3회", kind: "CREDIT" as const, price: "19,000원" },
  { id: "subscription", name: "월간 구독 (향후 상품)", kind: "SUBSCRIPTION" as const, price: "출시 예정" },
];

const INITIAL_PURCHASES: PurchaseKey[] = [
  { product: "year-2026", profile: "나", period: "2026", version: "v1" },
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: "주문 생성",
  PAYMENT_PENDING: "결제 대기",
  PAID: "결제 확인",
  FULFILLING: "상품 지급 중",
  COMPLETED: "완료",
  FAILED: "실패",
  REFUNDED: "환불 처리",
};

export function BillingRecoveryPrototype() {
  const [productId, setProductId] = useState("year-2026");
  const [profile, setProfile] = useState("나");
  const [period, setPeriod] = useState("2026");
  const [version, setVersion] = useState("v1");
  const [purchases, setPurchases] = useState<PurchaseKey[]>(INITIAL_PURCHASES);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("CREATED");
  const [reportStatus, setReportStatus] = useState<ReportStatus>("QUEUED");
  const [provider, setProvider] = useState<Provider>("WEB");
  const [verification, setVerification] = useState("검증 전");
  const [callbackCount, setCallbackCount] = useState(0);
  const [processedCallback, setProcessedCallback] = useState(false);
  const [orderSerial, setOrderSerial] = useState(1);
  const [message, setMessage] = useState("기존 구매 조건을 바꾸거나 기존 리포트를 열어보세요.");
  const [history, setHistory] = useState<string[]>(["CREATED · 프로토타입 주문 ORD-DEMO-001 생성"]);
  const [ledger, setLedger] = useState<LedgerRow[]>([
    { id: 1, type: "구매 지급", delta: 3, source: "ORD-DEMO-001", note: "상담 이용권 3회" },
    { id: 2, type: "상담 사용", delta: -1, source: "SESSION-DEMO-01", note: "상담 1회 사용" },
  ]);
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [refundApplied, setRefundApplied] = useState(false);
  const [manualRecoveryApplied, setManualRecoveryApplied] = useState(false);

  const product = PRODUCTS.find((item) => item.id === productId) ?? PRODUCTS[0];
  const duplicate = useMemo(
    () => purchases.some((item) => item.product === productId && item.profile === profile && item.period === period && item.version === version),
    [purchases, productId, profile, period, version],
  );
  const balance = ledger.reduce((sum, row) => sum + row.delta, 0);
  const orderId = `ORD-DEMO-${String(orderSerial).padStart(3, "0")}`;
  const callbackId = `callback-demo-${String(orderSerial).padStart(3, "0")}`;

  function addHistory(status: string, detail: string) {
    setHistory((rows) => [`${status} · ${detail}`, ...rows]);
  }

  function resetOrder() {
    const nextSerial = orderSerial + 1;
    setOrderSerial(nextSerial);
    setOrderStatus("CREATED");
    setReportStatus("QUEUED");
    setProcessedCallback(false);
    setCallbackCount(0);
    setRefundApplied(false);
    setRefundConfirmed(false);
    setHistory([`CREATED · 새 로컬 주문 ORD-DEMO-${String(nextSerial).padStart(3, "0")} 생성`]);
    setMessage("새 체험 주문을 만들었습니다. 실제 주문이나 결제는 생성되지 않았습니다.");
  }

  function advanceOrder() {
    const index = ORDER_FLOW.indexOf(orderStatus);
    if (index < 0 || index === ORDER_FLOW.length - 1) return;
    const next = ORDER_FLOW[index + 1];
    setOrderStatus(next);
    addHistory(next, STATUS_LABEL[next]);
    if (next === "FULFILLING" && product.kind === "REPORT") setReportStatus("GENERATING");
    if (next === "COMPLETED") {
      if (product.kind === "REPORT") setReportStatus("READY");
      setPurchases((rows) => duplicate ? rows : [...rows, { product: productId, profile, period, version }]);
    }
  }

  function receiveCallback() {
    setCallbackCount((count) => count + 1);
    if (processedCallback) {
      setMessage("중복 콜백을 감지해 무시했습니다. 주문 상태와 이용권 원장은 바뀌지 않았습니다.");
      addHistory("IDEMPOTENT", `이미 처리한 ${callbackId} 무시`);
      return;
    }
    setProcessedCallback(true);
    setOrderStatus("PAID");
    addHistory("PAID", `${callbackId} 최초 1회 반영`);
    if (product.kind === "CREDIT") {
      setLedger((rows) => [
        ...rows,
        { id: Date.now(), type: "구매 지급", delta: 3, source: orderId, note: "최초 콜백만 지급" },
      ]);
      setMessage("최초 콜백을 반영해 체험 이용권 3회를 원장에 기록했습니다.");
    } else {
      setMessage("최초 콜백을 반영했습니다. 같은 콜백을 다시 눌러 멱등성을 확인할 수 있습니다.");
    }
  }

  function failOrder() {
    setOrderStatus("FAILED");
    addHistory("FAILED", "결제 승인 또는 지급 처리 실패 시뮬레이션");
    setMessage("실패 상태입니다. 새 주문으로 다시 시도하거나 명시적으로 환불 복구를 선택하세요.");
  }

  function createMismatch() {
    setOrderStatus("PAID");
    setReportStatus("FAILED");
    addHistory("MISMATCH", "결제 성공 · 리포트 생성 최종 실패");
    setMessage("결제는 PAID로 유지되고 리포트만 FAILED입니다. 생성 실패가 결제 상태를 임의로 바꾸지 않습니다.");
  }

  function retryReport() {
    setReportStatus("GENERATING");
    setOrderStatus("FULFILLING");
    addHistory("RETRY", "리포트 재생성 시작");
    setMessage("재생성 중입니다. 완료 또는 다시 실패를 선택해 결과를 확인하세요.");
  }

  function requestRefund() {
    if (!refundConfirmed || refundApplied) return;
    setRefundApplied(true);
    setOrderStatus("REFUNDED");
    addHistory("REFUNDED", "사용자 확인 후 환불 복구 시뮬레이션");
    if (product.kind === "CREDIT" && processedCallback) {
      setLedger((rows) => [
        ...rows,
        { id: Date.now(), type: "환불", delta: -3, source: orderId, note: "지급분 회수 시뮬레이션" },
      ]);
    }
    setMessage("환불 상태만 로컬 화면에 반영했습니다. 실제 환불이나 금액 이동은 없습니다.");
  }

  function manualRecovery() {
    if (!recoveryConfirmed || manualRecoveryApplied) return;
    setManualRecoveryApplied(true);
    setLedger((rows) => [
      ...rows,
      { id: Date.now(), type: "오류 복구", delta: 1, source: "ADMIN-DEMO", note: "운영자 수동 복구 · 중복 실행 차단" },
    ]);
    setMessage("수동 복구 1회를 원장에 기록했습니다. 같은 복구는 다시 지급되지 않습니다.");
  }

  function addAdjustment() {
    setLedger((rows) => [
      ...rows,
      { id: Date.now(), type: "관리자 조정", delta: -1, source: "ADMIN-DEMO", note: "감사 가능한 조정 예시" },
    ]);
    setMessage("관리자 조정 예시를 원장에 추가했습니다. 실제 이용권에는 영향이 없습니다.");
  }

  function useCredit() {
    if (balance < 1) {
      setMessage("체험 잔액이 부족해 상담 사용 행을 만들지 않았습니다.");
      return;
    }
    setLedger((rows) => [
      ...rows,
      { id: Date.now(), type: "상담 사용", delta: -1, source: "SESSION-DEMO", note: "상담 1회 사용" },
    ]);
  }

  function verifyReceipt() {
    const result = provider === "WEB"
      ? "WebPaymentAdapter · 결제 제공자 승인값 검증 완료(시뮬레이션)"
      : "AppReceiptAdapter · 앱 스토어 영수증 검증 완료(시뮬레이션)";
    setVerification(result);
    addHistory("VERIFIED", result);
  }

  return (
    <main className={`screen-content settings-content ${styles.srScreen}`} aria-labelledby="billing-title">
      <header className="form-hero">
        <p className="section-kicker">결제 · 지급 · 복구 운영 프로토타입</p>
        <h1 id="billing-title">한 번만 지급하고,<br />실패는 분명하게 복구해요</h1>
        <p className="supporting">상품 선택부터 주문, 리포트 생성, 이용권 원장과 환불 복구까지 모든 상태를 직접 바꿔볼 수 있어요.</p>
      </header>

      <aside className="privacy-panel" aria-label="프로토타입 한계 안내">
        <strong>화면 체험 전용 · 실제 거래 없음</strong>
        <p>모든 값은 이 브라우저의 일시적인 React 상태입니다. 실제 결제·청구·환불·이용권 지급·영수증 검증·리포트 생성은 일어나지 않으며 새로고침하면 초기화됩니다.</p>
      </aside>

      <section data-slop-allow="overstuffed-row" className="insight-card current" aria-labelledby="purchase-heading">
        <small>상품 선택 · 중복 구매 방지</small>
        <h2 id="purchase-heading">상품과 중복 구매 점검</h2>
        <div className="birth-fields">
          <label className="field-group">
            <span className="field-label">상품 유형</span>
            <select value={productId} onChange={(event) => { setProductId(event.target.value); resetOrder(); }}>
              {PRODUCTS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price}</option>)}
            </select>
          </label>
          <label className="field-group"><span className="field-label">프로필</span><select value={profile} onChange={(event) => setProfile(event.target.value)}><option>나</option><option>김하늘</option><option>박바다</option></select></label>
          <label className="field-group"><span className="field-label">기간</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>2026</option><option>2027</option><option>2026–2035</option></select></label>
          <label className="field-group"><span className="field-label">해석 버전</span><select value={version} onChange={(event) => setVersion(event.target.value)}><option>v1</option><option>v2</option></select></label>
        </div>
        <div className="privacy-panel" role="status" aria-live="polite">
          <strong>{duplicate ? "중복 구매 감지" : "새 구매 가능"}</strong>
          <p>{duplicate
            ? "같은 상품·프로필·기간·버전의 완료 기록이 있습니다. 결제 진입을 막았습니다."
            : `${product.name} 조건과 일치하는 구매 기록이 없습니다.`}</p>
        </div>
        {duplicate ? (
          <div className="action-row">
            <button className="primary-button" type="button" onClick={() => setMessage("기존 2026 리포트를 여는 화면을 시뮬레이션했습니다.")}>기존 리포트 열기</button>
            <button className="secondary-button" type="button" onClick={() => setVersion("v2")}>새 해석 버전 선택</button>
            <button className="secondary-button" type="button" onClick={() => setProfile("김하늘")}>변경된 프로필로 만들기</button>
          </div>
        ) : (
          <button className="primary-button" type="button" disabled={product.kind === "SUBSCRIPTION"} onClick={resetOrder}>
            {product.kind === "SUBSCRIPTION" ? "향후 지원 예정" : "체험 주문 만들기"}
          </button>
        )}
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="order-heading">
        <small>주문 상태 · 중복 지급 방지</small>
        <h2 id="order-heading">주문 생명주기와 멱등성</h2>
        <p><strong>현재 주문</strong> · {orderId}</p>
        <p className="supporting" role="status"><strong>{orderStatus}</strong> · {STATUS_LABEL[orderStatus]}</p>
        <ol className="timeline-list" data-slop-allow="overstuffed-row" aria-label="정상 주문 흐름">
          {ORDER_FLOW.map((status) => <li key={status}><strong>{status}</strong><span>{STATUS_LABEL[status]}{status === orderStatus ? " · 현재" : ""}</span></li>)}
        </ol>
        <div className="action-row">
          <button className="primary-button" type="button" disabled={!ORDER_FLOW.includes(orderStatus) || orderStatus === "COMPLETED"} onClick={advanceOrder}>정상 다음 단계</button>
          <button className="secondary-button" type="button" onClick={failOrder}>실패로 전환</button>
          <button className="secondary-button" type="button" onClick={resetOrder}>새 주문으로 재시도</button>
        </div>
        <div className="privacy-panel">
          <strong>중복 콜백 실험 · 수신 {callbackCount}회 / 반영 {processedCallback ? "1회" : "0회"}</strong>
          <p>동일한 {callbackId}을 반복해도 주문과 이용권 지급은 최초 한 번만 반영됩니다.</p>
          <button className="secondary-button" type="button" onClick={receiveCallback}>같은 결제 콜백 보내기</button>
        </div>
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="report-heading">
        <small>생성 상태 · 실패 복구</small>
        <h2 id="report-heading">리포트 생성과 결제 불일치 복구</h2>
        <p role="status"><strong>생성 상태 · {reportStatus}</strong></p>
        <div className="topic-list" data-slop-allow="overstuffed-row" aria-label="리포트 생성 상태 선택">
          {(["QUEUED", "GENERATING", "READY", "FAILED"] as ReportStatus[]).map((status) => (
            <button className={reportStatus === status ? "topic-card selected" : "topic-card"} type="button" key={status} onClick={() => setReportStatus(status)}>
              <span><strong>{status}</strong><small>{status === "QUEUED" ? "생성 대기" : status === "GENERATING" ? "생성 중" : status === "READY" ? "완료" : "최종 실패"}</small></span>
            </button>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={createMismatch}>결제 성공 · 생성 실패 만들기</button>
        {reportStatus === "FAILED" && (
          <div className="privacy-panel" aria-label="리포트 실패 복구 선택">
            <strong>최종 생성 실패</strong>
            <p>주문 결제 상태는 {orderStatus}로 별도 유지됩니다. 재생성하거나 아래에서 환불을 명시적으로 요청하세요.</p>
            <button className="primary-button" type="button" onClick={retryReport}>리포트 재생성</button>
          </div>
        )}
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="ledger-heading">
        <small>이용권 변동 기록</small>
        <h2 id="ledger-heading">상담 이용권 원장</h2>
        <p><strong>체험 잔액 · {balance}회</strong></p>
        <div className="history-list" data-slop-allow="overstuffed-row">
          {ledger.map((row) => (
            <article className="history-item" key={row.id}>
              <div><strong>{row.type}</strong><small>{row.source} · {row.note}</small></div>
              <strong>{row.delta > 0 ? `+${row.delta}` : row.delta}회</strong>
            </article>
          ))}
        </div>
        <div className="action-row">
          <button className="secondary-button" type="button" onClick={useCredit}>상담 1회 사용</button>
          <button className="secondary-button" type="button" onClick={addAdjustment}>관리자 -1 조정</button>
        </div>
        <label className="consent-row">
          <input type="checkbox" checked={recoveryConfirmed} onChange={(event) => setRecoveryConfirmed(event.target.checked)} />
          <span><strong>수동 복구 확인</strong><small>오류 복구 +1회가 원장에 남고 같은 복구를 다시 실행하지 않음을 확인합니다.</small></span>
        </label>
        <button className="primary-button" type="button" disabled={!recoveryConfirmed || manualRecoveryApplied} onClick={manualRecovery}>
          {manualRecoveryApplied ? "수동 복구 반영됨" : "이용권 1회 수동 복구"}
        </button>
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="refund-heading">
        <small>환불 · 명시적 복구</small>
        <h2 id="refund-heading">환불 요청과 실패 복구</h2>
        <label className="consent-row">
          <input type="checkbox" checked={refundConfirmed} onChange={(event) => setRefundConfirmed(event.target.checked)} />
          <span><strong>환불 시뮬레이션 확인</strong><small>주문을 REFUNDED로 바꾸고, 지급된 체험 이용권이 있으면 환불 원장 행을 1회 기록합니다.</small></span>
        </label>
        <button className="primary-button" type="button" disabled={!refundConfirmed || refundApplied} onClick={requestRefund}>
          {refundApplied ? "환불 복구 반영됨" : "환불 요청 반영"}
        </button>
        <p className="supporting">실제 결제 취소나 카드 환불은 없으며, 프로토타입 상태만 바뀝니다.</p>
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="provider-heading">
        <small>플랫폼별 결제 검증</small>
        <h2 id="provider-heading">플랫폼별 결제 어댑터</h2>
        <fieldset>
          <legend>검증 경로 선택</legend>
          <div className="action-row">
            <label className="consent-row"><input type="radio" name="provider" checked={provider === "WEB"} onChange={() => { setProvider("WEB"); setVerification("검증 전"); }} /><span><strong>웹 결제</strong><small>WebPaymentAdapter · 제공자 승인값</small></span></label>
            <label className="consent-row"><input type="radio" name="provider" checked={provider === "APP"} onChange={() => { setProvider("APP"); setVerification("검증 전"); }} /><span><strong>앱 결제</strong><small>AppReceiptAdapter · 스토어 영수증</small></span></label>
          </div>
        </fieldset>
        <p><strong>공통 주문 도메인</strong> · {orderId} / {orderStatus}</p>
        <p role="status">{verification}</p>
        <button className="primary-button" type="button" onClick={verifyReceipt}>{provider === "WEB" ? "웹 승인값 검증" : "앱 영수증 검증"}</button>
      </section>

      <section data-slop-allow="overstuffed-row" className="insight-card" aria-labelledby="history-heading">
        <small>상태 전환 기록</small>
        <h2 id="history-heading">상태 전환 기록</h2>
        <p className="supporting" aria-live="polite">{message}</p>
        <div className="history-list" data-slop-allow="overstuffed-row">
          {history.map((item, index) => <p className="history-item" key={`${item}-${index}`}>{item}</p>)}
        </div>
      </section>
    </main>
  );
}
