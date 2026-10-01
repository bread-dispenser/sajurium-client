"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { CommerceData, DemoOrderStatus, OrderDuplicateKey, ProductId } from "@/lib/domain";
import type { CreditLedgerEntry, OrderStatus, ProductView } from "@/lib/contracts";
import { commerceStore } from "@/lib/storage";
import { getProduct, INITIAL_COMMERCE_DATA, isProductId } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import { ConnectionErrorState, CorruptState, LoadingState } from "./page-state";
import { Banner } from "./ui/layout";
import { ChevronIcon, InfoIcon } from "./ui/icons";
import { createOrder, formatApiRequestError, formatConnectionError, getCredits, getOrder, getProduct as getServerProduct, isAccountSessionExpired, listOrderRefunds, listOrders, listProducts, type LiveOrder, type LiveRefund } from "@/lib/api/service";

const CURRENT_PROFILE_ID = "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X";
const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
const PAYMENTS_PAUSED_STATUS = "결제와 주문은 준비 중이에요. 지금은 구매할 수 없어요.";

/** One hanja per deep report, used as the product's cover tile. */
const PRODUCT_MARKS: Partial<Record<string, string>> = {
  "love-report": "緣",
  "career-report": "業",
  "money-report": "財",
  "compatibility-report": "合",
  "year-report": "年",
  "decade-report": "運",
};

const LEDGER_REASON_LABELS: Record<CreditLedgerEntry["reason"], string> = {
  purchase: "구매 지급",
  free_grant: "무료 지급",
  consultation_use: "상담 사용",
  refund: "환불로 회수",
  error_recovery: "오류 복구",
  admin_adjustment: "운영 조정",
  event_grant: "이벤트 지급",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "주문 접수",
  PAYMENT_PENDING: "결제 대기",
  PAID: "결제 확인",
  FULFILLING: "지급 중",
  COMPLETED: "완료",
  FAILED: "실패",
  REFUNDED: "환불 완료",
};

function getOrderDuplicateKey(productId: ProductId, productVersion: string): OrderDuplicateKey {
  return {
    productId,
    profileId: CURRENT_PROFILE_ID,
    chartSnapshotId: "chart_fixture_primary",
    periodKey: String(new Date().getFullYear()),
    interpretationVersion: `fixture-${productVersion}`,
  };
}

function hasSameOrderIdentity(order: OrderDuplicateKey, key: OrderDuplicateKey) {
  return order.productId === key.productId
    && order.profileId === key.profileId
    && order.chartSnapshotId === key.chartSnapshotId
    && order.periodKey === key.periodKey
    && order.interpretationVersion === key.interpretationVersion;
}

function getCommerceData(): CommerceData | null {
  const inspection = commerceStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return { ...INITIAL_COMMERCE_DATA, orders: [], generations: [], creditHistory: [] };
}

function price(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function shortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function longDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function reload() {
  window.location.reload();
  return true;
}

function commerceCorrupt() {
  return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록은 확인 없이 초기화하지 않아요. 초기화하면 이 브라우저의 체험 구매 기록만 지워져요." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
}

function ProductMark({ productId, size = "md" }: { productId: string; size?: "sm" | "md" | "lg" }) {
  const mark = PRODUCT_MARKS[productId];
  if (!mark) return null;
  const dims = size === "lg" ? { width: 56, height: 72, fontSize: 28 } : size === "sm" ? { width: 44, height: 56, fontSize: 22 } : { width: 48, height: 60, fontSize: 24 };
  return (
    <span className="sj-hanja" aria-hidden="true" style={{ ...dims, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "var(--sj-sunk)", color: "var(--sj-ink)" }}>
      {mark}
    </span>
  );
}

function BalanceCard({ balance, action }: { balance: number | null; action: { href: string; label: string } }) {
  return (
    <section className="sj-card-dark" aria-label="남은 상담 이용권" style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: "18px 20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto" }}>
        <span style={{ fontSize: 12, color: "var(--sj-on-dark-muted)" }}>남은 상담 이용권</span>
        {balance === null
          ? <span style={{ fontSize: 14, color: "var(--sj-on-dark-muted)" }}>잔액을 불러오지 못했어요</span>
          : <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.3 }}>{balance}<span style={{ fontSize: 16, marginLeft: 2 }}>회</span></span>}
      </div>
      <Link href={action.href} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 14px", border: "1px solid var(--sj-ink-strong-muted)", borderRadius: 8, color: "var(--sj-canvas)", fontSize: 13, textDecoration: "none", flex: "0 0 auto" }}>
        {action.label}
      </Link>
    </section>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="sj-row-in-group" style={{ justifyContent: "space-between", cursor: "default" }}>
      <span style={{ fontSize: 14, color: "var(--sj-ink-strong-muted)", flex: "0 0 auto" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 400, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

type Step = { name: string; detail?: string; state: "done" | "now" | "todo" | "failed" };

function OrderSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="sj-steps" aria-label="진행 상태">
      {steps.map((step, index) => (
        <li key={step.name} className="sj-step" aria-current={step.state === "now" ? "step" : undefined} style={index === steps.length - 1 ? { paddingBottom: 0 } : undefined}>
          {index < steps.length - 1 && <span className="sj-step-line" aria-hidden="true" />}
          <span className={`sj-step-dot${step.state === "done" ? " sj-step-dot-done" : step.state === "now" || step.state === "failed" ? " sj-step-dot-now" : ""}`} aria-hidden="true" />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: step.state === "todo" ? 400 : 700, color: step.state === "todo" ? "var(--sj-muted)" : "var(--sj-ink)" }}>{step.name}</span>
            {step.detail && <span className="sj-meta">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 보관함 > 리포트와 이용권 ---------- */

export function ProductListScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [liveProducts, setLiveProducts] = useState<ProductView[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listProducts()
      .then((items) => active && setLiveProducts(items))
      .catch((reason) => active && setLoadError(formatConnectionError(reason)));
    void getCredits()
      .then((value) => active && setBalance(value.balance.balance))
      .catch(() => active && setBalance(null));
    return () => { active = false; };
  }, [hydrated, attempt]);
  function retry() {
    setLoadError("");
    setLiveProducts(null);
    setBalance(undefined);
    setAttempt((value) => value + 1);
  }
  if (!hydrated || (!liveProducts && !loadError)) return <LoadingState title="리포트와 이용권을 불러오고 있어요" />;
  if (loadError || !liveProducts) return <ConnectionErrorState title="상품 정보를 불러오지 못했어요" description={loadError} onRetry={retry} />;
  void raw;
  const commerce = getCommerceData();
  if (!commerce) return commerceCorrupt();
  const purchased = new Set(commerce.orders.filter((order) => order.status === "COMPLETED").map((order) => order.productId));
  const creditProducts = liveProducts.filter((product) => product.kind === "consultation_credit");
  const reportProducts = liveProducts.filter((product) => product.kind === "report");

  const tabs = (
    <nav className="sj-tablist" aria-label="보관함 구분">
      <Link className="sj-tablist-tab" href="/library">내 기록</Link>
      <Link className="sj-tablist-tab" href="/products" aria-current="page">리포트와 이용권</Link>
    </nav>
  );

  const balanceCard = balance === undefined
    ? <div className="sj-skeleton" aria-hidden="true"><div className="sj-skeleton-block" style={{ height: 88 }} /></div>
    : <BalanceCard balance={balance} action={{ href: "/products/credits", label: "사용 내역" }} />;

  const pausedBanner = !PAYMENTS_ENABLED && (
    <Banner>결제는 준비 중이에요. 가격과 구성은 미리 볼 수 있어요.</Banner>
  );

  const reports = (
    <section className="sj-section" aria-labelledby="report-products-heading">
      <h2 id="report-products-heading" className="sj-h2">심층 리포트</h2>
      {reportProducts.length === 0
        ? <p className="sj-meta">지금 판매 중인 심층 리포트가 없어요.</p>
        : reportProducts.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="sj-card" style={{ flexDirection: "row", gap: 14, padding: 16, color: "var(--sj-ink)", textDecoration: "none" }}>
            <ProductMark productId={product.id} />
            <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 auto", minWidth: 0 }}>
              <span className="sj-h3">{product.title}</span>
              <span style={{ fontSize: 13, lineHeight: 1.55, color: "var(--sj-ink-strong-muted)" }}>{product.description}</span>
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{price(product.priceAmount)}</span>
                {purchased.has(product.id) && <span className="sj-badge">구매 기록 있음</span>}
              </span>
            </span>
            <ChevronIcon className="sj-chevron" style={{ alignSelf: "center" }} />
          </Link>
        ))}
    </section>
  );

  const credits = creditProducts.length > 0 && (
    <section className="sj-section" aria-labelledby="consultation-products-heading">
      <h2 id="consultation-products-heading" className="sj-h2">상담 이용권</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {creditProducts.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="sj-card" style={{ gap: 6, padding: 16, color: "var(--sj-ink)", textDecoration: "none" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{product.title}</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{price(product.priceAmount)}</span>
            <span style={{ fontSize: 12, color: "var(--sj-muted)" }}>{product.description}</span>
          </Link>
        ))}
      </div>
      <p className="sj-fine">상담 답변이 만들어졌을 때만 1회가 차감돼요.</p>
    </section>
  );

  return (
    <main className="sj-page" aria-labelledby="products-title">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 id="products-title" className="sj-h1">보관함</h1>
        {tabs}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {balanceCard}
        {pausedBanner}
      </div>
      <div className="sj-split">
        {reports}
        {credits && <div className="sj-aside">{credits}</div>}
      </div>
    </main>
  );
}

/* ---------- 상품 상세 ---------- */

export function LiveProductDetailScreen({ productId }: { productId: ProductId }) {
  const [product, setProduct] = useState<ProductView | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getServerProduct(productId)
      .then((value) => active && setProduct(value))
      .catch((reason) => active && setError(formatConnectionError(reason)));
    return () => { active = false; };
  }, [productId, attempt]);
  function retry() {
    setError("");
    setProduct(null);
    setAttempt((value) => value + 1);
  }
  if (!product && !error) return <LoadingState title="상품 정보를 불러오고 있어요" />;
  if (error || !product) return <ConnectionErrorState title="상품을 불러오지 못했어요" description={error} onRetry={retry} />;
  const isReport = product.kind === "report";

  return (
    <main className="sj-page" aria-labelledby="product-title">
      <section style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <ProductMark productId={product.id} size="lg" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <h1 id="product-title" className="sj-h1">{product.title}</h1>
          <p className="sj-lead">{product.description}</p>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>{price(product.priceAmount)}</span>
        </div>
      </section>

      {isReport ? (
        <section className="sj-section" aria-labelledby="product-diff">
          <h2 id="product-diff" className="sj-h2">기본 리포트와 무엇이 다른가요</h2>
          <div className="sj-group">
            <div className="sj-row-in-group" style={{ alignItems: "flex-start", padding: 16, cursor: "default" }}>
              <span style={{ width: 88, flex: "0 0 auto", fontSize: 13, fontWeight: 700, color: "var(--sj-ink-strong-muted)" }}>기본 리포트<br /><span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>무료</span></span>
              <span style={{ fontSize: 14, lineHeight: 1.65, color: "var(--sj-ink-body)" }}>한 줄 요약, 성격 경향, 관계에서의 모습까지 보여줘요. 명식 화면에서 바로 볼 수 있어요.</span>
            </div>
            <div className="sj-row-in-group" style={{ alignItems: "flex-start", padding: 16, cursor: "default" }}>
              <span style={{ width: 88, flex: "0 0 auto", fontSize: 13, fontWeight: 700 }}>{product.title}<br /><span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>{price(product.priceAmount)}</span></span>
              <span style={{ fontSize: 14, lineHeight: 1.65, color: "var(--sj-ink-body)" }}>{product.description}</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="sj-section" aria-labelledby="product-usage">
          <h2 id="product-usage" className="sj-h2">이용권은 이렇게 쓰여요</h2>
          <p className="sj-body">상담 답변이 만들어졌을 때만 1회가 차감돼요. 답변이 실패하면 차감되지 않아요.</p>
        </section>
      )}

      {product.includedSections.length > 0 && (
        <section className="sj-section" aria-labelledby="product-toc">
          <h2 id="product-toc" className="sj-h2">담기는 내용</h2>
          <ul className="sj-list">
            {product.includedSections.map((item) => <li key={item} className="sj-row" style={{ cursor: "default" }}><span className="sj-row-title">{item}</span></li>)}
          </ul>
        </section>
      )}

      <section className="sj-section" aria-labelledby="product-refund">
        <h2 id="product-refund" className="sj-h2">{isReport ? "환불과 다시 만들기" : "환불"}</h2>
        <p className="sj-body">
          {isReport
            ? "리포트가 만들어지기 전에는 환불을 요청할 수 있어요. 만드는 중에 실패하면 같은 조건으로 다시 만들어 드려요."
            : "환불이 끝나면 지급된 이용권은 회수되고, 이용권 내역에도 함께 남아요."}
        </p>
        <Link className="sj-text-button" href="/settings/terms" style={{ alignSelf: "flex-start" }}>환불 규정 전체 보기</Link>
      </section>

      {isReport && <p className="sj-fine">계산 요소를 바탕으로 한 일반 해석이에요. 특정 사건을 예측하거나 중요한 결정을 대신하지 않아요.</p>}

      <div className="sj-sticky-cta">
        {PAYMENTS_ENABLED ? (
          <Link className="sj-button sj-button-block" href={`/checkout/${productId}`}>{price(product.priceAmount)} 구매하기</Link>
        ) : (
          <>
            <p role="status" style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.6, color: "var(--sj-ink-body)" }}>
              <InfoIcon className="sj-banner-icon" style={{ marginTop: 1 }} />
              {PAYMENTS_PAUSED_STATUS}
            </p>
            <button className="sj-button sj-button-block" type="button" disabled>{price(product.priceAmount)} 구매하기</button>
          </>
        )}
      </div>
    </main>
  );
}

/* ---------- 결제하기 ---------- */

export function CheckoutScreen({ productId }: { productId: ProductId }) {
  const router = useRouter();
  const fallback = getProduct(productId);
  const consentId = useId();
  const [product, setProduct] = useState<ProductView | null>(null);
  const [productError, setProductError] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    let active = true;
    void getServerProduct(productId)
      .then((value) => active && setProduct(value))
      .catch(() => active && setProductError(true));
    return () => { active = false; };
  }, [productId]);

  async function submitOrder() {
    if (!agreed) {
      setServerError("주문 내용과 환불 규정을 확인한 뒤 동의에 표시해 주세요.");
      return;
    }
    setSubmitting(true);
    setServerError("");
    try {
      const created = await createOrder(productId);
      router.push(`/orders/${created.order_id}?productId=${productId}&state=pending&source=server`);
    } catch (error) {
      setServerError(formatApiRequestError(error, "주문을 만들지 못했어요. 잠시 후 다시 시도해 주세요."));
      setSubmitting(false);
    }
  }

  const title = product?.title ?? fallback.title;
  const isReport = (product?.kind ?? fallback.kind) === "report";
  const amount = product ? price(product.priceAmount) : productError ? "확인하지 못했어요" : "확인 중";
  const canSubmit = PAYMENTS_ENABLED && Boolean(product) && !submitting;

  return (
    <main className="sj-page" aria-labelledby="checkout-title">
      <h1 id="checkout-title" className="sj-visually-hidden">{title} 결제</h1>
      {!PAYMENTS_ENABLED && (
        <div className="sj-banner" role="status">
          <InfoIcon className="sj-banner-icon" />
          <p style={{ margin: 0 }}>{PAYMENTS_PAUSED_STATUS} 주문 내용은 미리 확인할 수 있어요.</p>
        </div>
      )}

      <section className="sj-section" aria-labelledby="checkout-summary">
        <h2 id="checkout-summary" className="sj-h2">주문 내용</h2>
        <div className="sj-group">
          <div className="sj-row-in-group" style={{ gap: 14, padding: 16, cursor: "default" }}>
            <ProductMark productId={productId} size="sm" />
            <span className="sj-row-main">
              <span className="sj-row-title" style={{ fontWeight: 700 }}>{title}</span>
              <span className="sj-row-sub">{isReport ? "한 번 구매하면 보관함에 남아요" : "구매하면 이용권이 바로 지급돼요"}</span>
            </span>
          </div>
          <SummaryRow label="상품 금액" value={amount} />
          <div className="sj-row-in-group" style={{ justifyContent: "space-between", minHeight: 60, background: "var(--sj-canvas)", borderTopColor: "var(--sj-line)", cursor: "default" }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>결제할 금액</span>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{amount}</span>
          </div>
        </div>
        <p className="sj-fine">금액은 결제 직전에 한 번 더 확인해요. 화면의 금액과 다르면 결제되지 않아요.</p>
      </section>

      <section className="sj-section" aria-labelledby="checkout-method">
        <h2 id="checkout-method" className="sj-h2">결제 수단</h2>
        <div style={{ minHeight: 88, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, border: "1px dashed var(--sj-control-line)", borderRadius: 12, background: "var(--sj-surface)", fontSize: 14, color: "var(--sj-muted)", textAlign: "center" }}>
          결제가 열리면 여기에서 결제 수단을 고를 수 있어요.
        </div>
      </section>

      <section className="sj-section" aria-labelledby="checkout-refund">
        <h2 id="checkout-refund" className="sj-h2">환불 규정</h2>
        <p className="sj-body">
          {isReport
            ? "리포트가 만들어지기 전에는 환불을 요청할 수 있어요. 만드는 중에 실패하면 같은 조건으로 다시 만들어 드려요."
            : "환불이 끝나면 지급된 이용권은 회수되고, 이용권 내역에도 함께 남아요."}
        </p>
        <Link className="sj-text-button" href="/settings/terms" style={{ alignSelf: "flex-start" }}>환불 규정 전체 보기</Link>
      </section>

      <label className="sj-card sj-check" htmlFor={consentId} style={{ flexDirection: "row", padding: "14px 16px" }}>
        <input id={consentId} className="sj-check-input" type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); setServerError(""); }} />
        주문 내용과 환불 규정을 확인했고, 결제에 동의해요.
      </label>

      <div className="sj-sticky-cta">
        {serverError && <p className="sj-error" role="alert">{serverError}</p>}
        <button className="sj-button sj-button-block" type="button" disabled={!canSubmit} onClick={() => { void submitOrder(); }}>
          {submitting ? "주문을 만들고 있어요" : product ? `${price(product.priceAmount)} 결제하기` : "결제하기"}
        </button>
        <p className="sj-fine sj-center">{isReport ? "결제가 확인된 뒤에 리포트를 만들기 시작해요" : "결제가 확인된 뒤에 이용권이 지급돼요"}</p>
      </div>
    </main>
  );
}

/* ---------- 주문 상세 ---------- */

const STATUS_COPY: Record<DemoOrderStatus, { title: string; description: string }> = {
  pending: { title: "결제 대기 상태 안내", description: "실제 결제 요청은 보내지 않았어요." },
  success: { title: "결제 성공 상태 안내", description: "이 기기에 기록을 남겨도 실제 구매나 상품 지급은 일어나지 않아요." },
  failure: { title: "결제 실패 상태 안내", description: "결제 수단이나 주문에는 아무 변화가 없어요." },
};

const ORDER_STATUS_ADAPTER: Record<DemoOrderStatus, OrderStatus> = {
  pending: "PAYMENT_PENDING",
  success: "COMPLETED",
  failure: "FAILED",
};

function serverOrderSteps(status: string, createdAt: string): Step[] {
  const created = { name: "주문 접수", detail: longDateTime(createdAt) };
  if (status === "COMPLETED") return [{ ...created, state: "done" }, { name: "결제 확인", state: "done" }, { name: "지급 완료", state: "done" }];
  if (status === "PAID" || status === "FULFILLING") return [{ ...created, state: "done" }, { name: "결제 확인", state: "done" }, { name: "지급 완료", detail: "지급하고 있어요", state: "now" }];
  if (status === "FAILED") return [{ ...created, state: "done" }, { name: "결제 확인", detail: "결제가 완료되지 않았어요", state: "failed" }, { name: "지급 완료", state: "todo" }];
  if (status === "REFUNDED") return [{ ...created, state: "done" }, { name: "결제 확인", state: "done" }, { name: "환불 완료", state: "done" }];
  return [{ ...created, state: "done" }, { name: "결제 확인", detail: "결제를 기다리고 있어요", state: "now" }, { name: "지급 완료", state: "todo" }];
}

function demoOrderSteps(status: DemoOrderStatus): Step[] {
  if (status === "success") return [{ name: "주문 접수", state: "done" }, { name: "결제 확인", state: "done" }, { name: "지급 완료", state: "done" }];
  if (status === "failure") return [{ name: "주문 접수", state: "done" }, { name: "결제 확인", detail: "결제가 완료되지 않았어요", state: "failed" }, { name: "지급 완료", state: "todo" }];
  return [{ name: "주문 접수", state: "done" }, { name: "결제 확인", detail: "결제를 기다리고 있어요", state: "now" }, { name: "지급 완료", state: "todo" }];
}

export function PaymentStatusScreen({ orderId, productId, status, server = false }: { orderId: string; productId: ProductId; status: DemoOrderStatus; server?: boolean }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [message, setMessage] = useState("");
  const [serverOrder, setServerOrder] = useState<LiveOrder | null>(null);
  const [serverProductTitle, setServerProductTitle] = useState<string | null>(null);
  const [serverError, setServerError] = useState(false);
  useEffect(() => {
    if (!hydrated || !server) return;
    let active = true;
    void getOrder(orderId).then((value) => active && setServerOrder(value)).catch(() => active && setServerError(true));
    void getServerProduct(productId).then((value) => active && setServerProductTitle(value.title)).catch(() => undefined);
    return () => { active = false; };
  }, [hydrated, orderId, productId, server]);
  if (!hydrated || (server && !serverOrder && !serverError)) return <LoadingState title="주문을 확인하고 있어요" />;
  if (server && (serverError || !serverOrder)) return <ConnectionErrorState title="주문을 불러오지 못했어요" description="이 계정의 주문인지, 연결 상태가 괜찮은지 확인한 뒤 다시 시도해 주세요." onRetry={reload} />;
  void raw;
  const product = getProduct(productId);

  if (serverOrder) {
    const title = serverProductTitle ?? product.title;
    const completed = serverOrder.status === "COMPLETED";
    const statusLabel = ORDER_STATUS_LABELS[serverOrder.status] ?? serverOrder.status;
    const headline = completed ? (product.kind === "report" ? "리포트가 준비됐어요" : "이용권이 지급됐어요")
      : serverOrder.status === "FAILED" ? "결제가 완료되지 않았어요"
      : serverOrder.status === "REFUNDED" ? "환불이 끝났어요"
      : serverOrder.status === "PAID" || serverOrder.status === "FULFILLING" ? "결제가 확인됐어요"
      : "주문을 만들었어요";
    const lead = completed ? (product.kind === "report" ? `${title}를 보관함에 넣었어요. 언제든 다시 열어볼 수 있어요.` : "상담 이용권이 지급됐어요. 이용권 내역에서 확인할 수 있어요.")
      : serverOrder.status === "FAILED" ? "결제 수단에서 금액이 빠져나가지 않았어요. 다시 주문하려면 상품 화면에서 시작해 주세요."
      : serverOrder.status === "REFUNDED" ? "지급된 이용권이나 리포트는 회수됐어요."
      : serverOrder.status === "PAID" || serverOrder.status === "FULFILLING" ? `${title}를 보관함에 넣는 중이에요.`
      : "결제가 확인되면 상품을 지급해요.";
    return (
      <main className="sj-page" aria-labelledby="payment-status-title">
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 id="payment-status-title" className="sj-h1">{headline}</h1>
          <p className="sj-lead">{lead}</p>
        </section>
        <section className="sj-card" aria-label="진행 상태">
          <OrderSteps steps={serverOrderSteps(serverOrder.status, serverOrder.created_at)} />
        </section>
        <section className="sj-group" aria-label="주문 정보">
          <SummaryRow label="상품" value={title} strong />
          <SummaryRow label="주문번호" value={serverOrder.order_id} />
          <SummaryRow label="결제 금액" value={price(serverOrder.amount_minor)} strong />
          <SummaryRow label="주문 일시" value={longDateTime(serverOrder.created_at)} />
          <SummaryRow label="상태" value={statusLabel} />
        </section>
        <div className="sj-actions">
          {completed
            ? <Link className="sj-button sj-button-block" href={product.kind === "report" ? "/library" : "/products/credits"}>{product.kind === "report" ? "보관함에서 보기" : "이용권 내역 보기"}</Link>
            : !PAYMENTS_ENABLED && serverOrder.status !== "FAILED" && serverOrder.status !== "REFUNDED" && <p className="sj-banner" role="status" style={{ margin: 0 }}>결제 연결이 준비 중이라 지금은 결제를 진행할 수 없어요.</p>}
          <Link className="sj-button-secondary" href="/products">리포트와 이용권으로</Link>
        </div>
        <p className="sj-fine">환불은 규정에 맞는지 확인한 뒤 처리돼요.</p>
      </main>
    );
  }

  const copy = STATUS_COPY[status];
  const duplicateKey = getOrderDuplicateKey(productId, product.version);
  const current = getCommerceData();
  if (!current) return commerceCorrupt();

  function recordDemoState() {
    const data = getCommerceData();
    if (!data) return setMessage("손상된 구매 기록을 초기화한 뒤 다시 시도해 주세요.");
    const orderStatus = ORDER_STATUS_ADAPTER[status];
    if (data.orders.some((order) => order.orderId === orderId)) {
      return setMessage(`예시 주문 ${orderId}은 이미 기록돼 있어서 다시 기록하지 않았어요.`);
    }
    if (orderStatus === "COMPLETED" && data.orders.some((order) => order.status === "COMPLETED" && hasSameOrderIdentity(order, duplicateKey))) {
      return setMessage("같은 상품과 기간의 예시 구매 기록이 이미 있어서 한 번 더 지급하지 않았어요. 보관함에서 기존 리포트를 열어 주세요.");
    }
    const now = new Date().toISOString();
    const resourceSuffix = crypto.randomUUID().replaceAll("-", "");
    const generationId = `gen_${crypto.randomUUID().replaceAll("-", "")}`;
    const order = { orderId, productVersion: product.version, ...duplicateKey, status: orderStatus, amount: product.priceAmount, currency: product.priceCurrency, provider: "WEB", createdAt: now, updatedAt: now } as const;
    const grantsCredits = orderStatus === "COMPLETED" && product.kind === "consultation_credit";
    const generation = product.kind === "report" ? { id: generationId, orderId, productId, reportId: orderStatus === "COMPLETED" ? `rpt_${resourceSuffix}` : null, status: orderStatus === "COMPLETED" ? "completed" : orderStatus === "FAILED" ? "failed" : "payment_pending", attemptCount: orderStatus === "FAILED" ? 1 : 0, error: null, createdAt: now, updatedAt: now } as const : null;
    const next: CommerceData = {
      ...data,
      orders: [order, ...data.orders],
      generations: generation ? [generation, ...data.generations] : data.generations,
      consultationCredits: data.consultationCredits + (grantsCredits ? 5 : 0),
      creditHistory: grantsCredits ? [{ id: `ledger_${resourceSuffix}`, description: "상담 5회 체험 기록", delta: 5, balanceAfter: data.consultationCredits + 5, source: "order", sourceId: orderId, reason: "purchase", createdAt: now }, ...data.creditHistory] : data.creditHistory,
    };
    if (!commerceStore.write(next)) return setMessage("이 브라우저에서는 예시 기록을 저장할 수 없어요. 저장소 설정을 확인해 주세요.");
    setMessage(`예시 주문 ${orderId}을 이 브라우저에 기록했어요.`);
  }

  return (
    <main className="sj-page" aria-labelledby="payment-status-title">
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 id="payment-status-title" className="sj-h1">{copy.title}</h1>
        <p className="sj-lead">{copy.description}</p>
      </section>
      <Banner>이 화면은 결제 흐름을 보여주는 예시예요. 실제 결제와 상품 지급은 일어나지 않아요.</Banner>
      <section className="sj-card" aria-label="진행 상태">
        <OrderSteps steps={demoOrderSteps(status)} />
      </section>
      <section className="sj-group" aria-label="주문 정보">
        <SummaryRow label="상품" value={product.title} strong />
        <SummaryRow label="주문번호" value={orderId} />
        <SummaryRow label="상태" value={ORDER_STATUS_LABELS[ORDER_STATUS_ADAPTER[status]]} />
        <SummaryRow label="실제 결제액" value="0원" strong />
      </section>
      <div className="sj-actions">
        <button className="sj-button sj-button-block" type="button" onClick={recordDemoState}>이 기기에 예시 기록 남기기</button>
        {message && <p className="sj-meta" role="status">{message}</p>}
        <Link className="sj-button-secondary" href={`/products/${productId}`}>상품 화면으로 돌아가기</Link>
      </div>
    </main>
  );
}

/* ---------- 이용권 내역 ---------- */

export function CreditsScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [liveCredits, setLiveCredits] = useState<{ balance: number; history: CreditLedgerEntry[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void getCredits().then((value) => active && setLiveCredits({ balance: value.balance.balance, history: value.ledger.items })).catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!liveCredits && !loadError)) return <LoadingState title="이용권 내역을 불러오고 있어요" />;
  void raw;
  if (loadError || !liveCredits) return <ConnectionErrorState title="이용권 내역을 불러오지 못했어요" onRetry={reload} />;
  return (
    <main className="sj-page" aria-labelledby="credits-title">
      <h1 id="credits-title" className="sj-visually-hidden">상담 이용권 {liveCredits.balance}회 남음</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BalanceCard balance={liveCredits.balance} action={{ href: "/products", label: "이용권 사기" }} />
        <p className="sj-meta">상담 답변이 만들어졌을 때만 1회가 차감돼요. 답변이 실패하면 차감되지 않아요.</p>
      </div>

      <section className="sj-section" aria-labelledby="credit-ledger">
        <div className="sj-section-head">
          <h2 id="credit-ledger" className="sj-h2">변동 기록</h2>
          <span className="sj-fine">최근 순</span>
        </div>
        {liveCredits.history.length === 0 ? (
          <p className="sj-meta">아직 변동 기록이 없어요. 첫 상담을 시작하면 무료 이용권 1회가 지급돼요.</p>
        ) : (
          <ul className="sj-list" style={{ borderTop: "1px solid var(--sj-line)" }}>
            {liveCredits.history.map((item) => (
              <li key={item.id} className="sj-row" style={{ minHeight: 64, cursor: "default" }}>
                <span className="sj-row-main">
                  <span className="sj-row-title">{item.description || LEDGER_REASON_LABELS[item.reason]}</span>
                  <span className="sj-row-sub"><time dateTime={item.createdAt}>{shortDate(item.createdAt)}</time>, {LEDGER_REASON_LABELS[item.reason]}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flex: "0 0 auto" }}>
                  <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: item.delta > 0 ? "var(--sj-ink)" : "var(--sj-muted)" }}>
                    {item.delta > 0 ? `+${item.delta}` : `−${Math.abs(item.delta)}`}
                  </span>
                  <span className="sj-fine">잔액 {item.balanceAfter}회</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="sj-fine">기록은 지우거나 고치지 않고 쌓여요. 잔액은 가장 최근 기록의 잔액과 같아요.</p>
    </main>
  );
}

const BILLING_STATUS_LABELS: Record<string, { label: string; tone: "dark" | "accent" | "plain" }> = {
  COMPLETED: { label: "완료", tone: "dark" },
  PAID: { label: "지급 중", tone: "plain" },
  FULFILLING: { label: "지급 중", tone: "plain" },
  PENDING: { label: "결제 대기", tone: "plain" },
  CREATED: { label: "결제 대기", tone: "plain" },
  FAILED: { label: "결제 실패", tone: "accent" },
  REFUNDED: { label: "환불 완료", tone: "plain" },
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "환불 요청됨",
  APPROVED: "환불 승인",
  REFUNDED: "환불 완료",
  REJECTED: "환불 거절",
};

function orderLinkState(status: string): DemoOrderStatus {
  if (status === "COMPLETED" || status === "PAID" || status === "FULFILLING" || status === "REFUNDED") return "success";
  if (status === "FAILED") return "failure";
  return "pending";
}

export function BillingScreen() {
  const hydrated = useHydrated();
  const [orders, setOrders] = useState<LiveOrder[] | null>(null);
  const [refunds, setRefunds] = useState<LiveRefund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listOrders()
      .then(async (items) => {
        if (!active) return;
        setOrders(items);
        const lists = await Promise.all(items.map((order) => listOrderRefunds(order.order_id).catch(() => [] as LiveRefund[])));
        if (active) setRefunds(lists.flat());
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setExpired(isAccountSessionExpired(cause));
        setError(formatApiRequestError(cause, "주문 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      });
    return () => { active = false; };
  }, [hydrated]);

  if (!hydrated || (!orders && !error)) return <LoadingState title="주문 내역을 불러오고 있어요" />;

  if (error || !orders) {
    return (
      <main className="sj-state" aria-labelledby="billing-error-title">
        <h1 id="billing-error-title" className="sj-h1">주문 내역을 불러오지 못했어요</h1>
        <p className="sj-error" role="alert">{error}</p>
        {expired
          ? <Link className="sj-button sj-button-block" href="/login">다시 로그인하기</Link>
          : <button className="sj-button sj-button-block" type="button" onClick={reload}>다시 시도</button>}
      </main>
    );
  }

  const productName = (orderId: string) => orders.find((order) => order.order_id === orderId)?.product_name ?? "주문";

  return (
    <main className="sj-page" aria-labelledby="billing-title">
      <div className="sj-section">
        <h1 id="billing-title" className="sj-h1">주문 {orders.length}건</h1>
        {!PAYMENTS_ENABLED && <Banner>결제는 준비 중이에요. 지난 주문과 환불 내역은 계속 볼 수 있어요.</Banner>}
      </div>

      <section className="sj-section" aria-labelledby="billing-orders">
        <h2 id="billing-orders" className="sj-h2">주문</h2>
        {orders.length === 0 ? (
          <p className="sj-meta">아직 주문이 없어요. 리포트나 이용권을 사면 여기에 쌓여요.</p>
        ) : (
          <ul className="sj-list" style={{ borderTop: "1px solid var(--sj-line)" }}>
            {orders.map((order) => {
              const status = BILLING_STATUS_LABELS[order.status] ?? { label: order.status, tone: "plain" as const };
              const known = isProductId(order.product_id);
              const content = (
                <>
                  <span className="sj-row-main">
                    <span className="sj-row-title">{order.product_name}</span>
                    <span className="sj-row-sub"><time dateTime={order.created_at}>{shortDate(order.created_at)}</time>, 주문번호 {order.order_number}</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{price(order.amount_minor)}</span>
                    <span className={`sj-badge${status.tone === "dark" ? " sj-badge-dark" : status.tone === "accent" ? " sj-badge-accent" : ""}`}>{status.label}</span>
                  </span>
                  {known && <ChevronIcon className="sj-chevron" />}
                </>
              );
              return (
                <li key={order.order_id}>
                  {known
                    ? <Link className="sj-row" href={`/orders/${order.order_id}?source=server&productId=${order.product_id}&state=${orderLinkState(order.status)}`}>{content}</Link>
                    : <div className="sj-row" style={{ cursor: "default" }}>{content}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="sj-section" aria-labelledby="billing-refunds">
        <h2 id="billing-refunds" className="sj-h2">환불 요청</h2>
        {refunds.length === 0 ? (
          <p className="sj-meta">환불 요청이 없어요.</p>
        ) : (
          <ul className="sj-list" style={{ borderTop: "1px solid var(--sj-line)" }}>
            {refunds.map((refund) => (
              <li key={refund.id} className="sj-row" style={{ cursor: "default" }}>
                <span className="sj-row-main">
                  <span className="sj-row-title">{productName(refund.orderId)}</span>
                  <span className="sj-row-sub"><time dateTime={refund.createdAt}>{shortDate(refund.createdAt)}</time>{refund.reason ? `, ${refund.reason}` : ""}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{price(refund.amount)}</span>
                  <span className="sj-badge">{REFUND_STATUS_LABELS[refund.status] ?? refund.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="sj-text-button" href="/products/credits">상담 이용권 변동 기록 보기</Link>
    </main>
  );
}
