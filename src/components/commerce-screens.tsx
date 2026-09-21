"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CommerceData, DemoOrderStatus, OrderDuplicateKey, ProductId } from "@/lib/domain";
import type { OrderStatus } from "@/lib/contracts";
import { maskBirthDate, maskBirthplace, maskBirthTime, ORDER_STATUSES } from "@/lib/contracts";
import { commerceStore, inspectCurrentBirth, resetBirthSource } from "@/lib/storage";
import { getProduct, INITIAL_BIRTH, INITIAL_COMMERCE_DATA } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import styles from "./saas-system-rollout.module.css";
import { CorruptState, LoadingState } from "./page-state";
import { createOrder, formatApiRequestError, getCredits, getOrder, getProduct as getServerProduct, listProducts, type LiveOrder } from "@/lib/api/service";
import type { ProductView } from "@/lib/contracts";

const CURRENT_PROFILE_ID = "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X";
const TOPIC_LABELS = { love: "연애", marriage: "결혼", reunion: "재회", career: "커리어", business: "사업", money: "재물", family: "가족", relationships: "대인관계", other: "기타" } as const;

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
  if (value < 10_000) return `${value.toLocaleString("ko-KR")}원`;
  const tenThousands = Math.floor(value / 10_000);
  const remainder = value % 10_000;
  return remainder === 0 ? `${tenThousands}만원` : `${tenThousands}만 ${remainder.toLocaleString("ko-KR")}원`;
}

export function ProductListScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [liveProducts, setLiveProducts] = useState<ProductView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void listProducts()
      .then((items) => active && setLiveProducts(items))
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!liveProducts && !loadError)) return <LoadingState title="서버 상품 정보를 확인하고 있어요" />;
  if (loadError || !liveProducts) return <CorruptState title="상품 서버에 연결할 수 없어요" description="백엔드 연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  void raw;
  const commerce = getCommerceData();
  if (!commerce) return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  const purchased = new Set(commerce.orders.filter((order) => order.status === "COMPLETED").map((order) => order.productId));
  const creditProducts = liveProducts.filter((product) => product.kind === "consultation_credit");
  const reportProducts = liveProducts.filter((product) => product.kind === "report");
  const renderProduct = (product: ProductView) => (
    <article className="commerce-price-row" key={product.id}>
      <div>
        <small>{purchased.has(product.id) ? "구매 기록 있음 · 보관함" : "단건 구매"}</small>
        <h2><Link href={`/products/${product.id}`}>{product.title}</Link></h2>
        <p>{product.description}</p>
        {product.kind === "consultation_credit" && <small>현재 {commerce.consultationCredits}회 남음</small>}
      </div>
      <strong>{price(product.priceAmount)}</strong>
    </article>
  );

  return (
    <main className={`screen-content products-content signal-atlas-commerce-list ${styles.srScreen}`} aria-labelledby="products-title">
      <header className="commerce-page-header">
        <p className="section-kicker signal-atlas-overline">이용권 · 결제</p>
        <h1 id="products-title">필요한 만큼만<br />단건으로</h1>
        <p className="supporting">구독 없이 필요한 것만 구매해요. 가격과 상품 버전은 서버가 관리합니다.</p>
      </header>
      <div className="commerce-type-labels" aria-label="상품 안내">
        <span>이용권</span><span aria-hidden="true">·</span><span>리포트</span><span aria-hidden="true">·</span><span>이 브라우저 저장</span>
      </div>
      <section className="commerce-price-group signal-commerce-group" aria-labelledby="consultation-products-heading">
        <h2 id="consultation-products-heading">상담 이용권</h2>
        <div className="product-list signal-commerce-price-list">{creditProducts.map(renderProduct)}</div>
      </section>
      <section className="commerce-price-group signal-commerce-group" aria-labelledby="report-products-heading">
        <h2 id="report-products-heading">리포트</h2>
        <div className="product-list signal-commerce-price-list">{reportProducts.map(renderProduct)}</div>
      </section>
      <aside className="commerce-preservation-note signal-commerce-note">
        <strong>구매 기록 안내</strong>
        <p>구매한 리포트는 보관함에서 이어 읽는 흐름을 보여드려요. 결제 전 구성도 확인할 수 있어요.</p>
        <p>결제 승인은 제공자 검증 후에만 반영되고, 구매·환불 기록은 서버 원장에 남습니다.</p>
      </aside>
      <Link className="secondary-button signal-commerce-history" href="/products/credits">상담 이용권과 사용 내역</Link>
    </main>
  );
}

export function ProductDetailScreen({ productId }: { productId: ProductId }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  if (!hydrated) return <LoadingState title="상품 미리보기를 준비하고 있어요" />;
  void raw;
  const product = getProduct(productId);
  const birthState = inspectCurrentBirth(INITIAL_BIRTH);
  if (birthState.status !== "ok") return <CorruptState title="출생 정보를 읽을 수 없어요" description="손상된 출생 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={birthState.status === "unavailable"} onReset={() => resetBirthSource(birthState.store)} />;
  const birth = birthState.birth;
  const commerce = getCommerceData();
  if (!commerce) return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  const duplicateKey = getOrderDuplicateKey(productId, product.version);
  const purchased = commerce.orders.some((order) => order.status === "COMPLETED" && hasSameOrderIdentity(order, duplicateKey));
  const interests = birth.personalization.interests.map((topic) => TOPIC_LABELS[topic]).join(", ");
  const selectedConcern = birth.personalization.primaryConcern?.trim() || "입력한 주 고민 없음";
  const maskedBasis = `${maskBirthDate(birth.birthDate)} · ${maskBirthTime(birth.birthTime, birth.birthTimeUnknown)} · ${maskBirthplace(birth.birthplace)}`;

  return (
    <main className={`screen-content product-detail signal-atlas-commerce-detail ${styles.srScreen}`} aria-labelledby="product-title">
      <p className="section-kicker signal-atlas-overline">상품 상세</p>
      <h1 id="product-title">{product.title}</h1>
      <p className="lead">{product.description}</p>
      <p className="commerce-purchase-mode">단건 구매 · 구독 없음 · 구매 기록은 서버 계정 또는 익명 세션에 보관돼요.</p>
      <p className="supporting">{product.kind === "report" ? "리포트" : product.kind === "consultation_credit" ? "상담 이용권" : "구독"} · {product.status === "active" ? "판매 중" : product.status === "draft" ? "검토 중" : "판매 종료"} · 상품 버전 {product.version}</p>
      <strong className="product-price">{price(product.priceAmount)}</strong>
      {purchased && <aside className="duplicate-notice"><strong>같은 프로필·기간·해석 버전의 체험 성공 기록이 있어요.</strong><p>실제 구매 내역이 아니며 중복 결제도 발생하지 않습니다.</p><nav aria-label="중복 주문 선택지"><Link href="/library">기존 리포트 보기</Link><Link href={`/products/${product.id}#generation-policy`}>새 해석 버전 확인</Link><Link href="/profile">다른 프로필 선택</Link></nav></aside>}
      <section className="personalized-preview">
        <small>{birth.displayName}님의 현재 프로필로 구성한 체험용 미리보기</small>
        <h2>{product.preview}</h2>
        <p>선택 관심사: {interests || "선택한 관심사 없음"} · 주 고민: {selectedConcern}</p>
        <p>입력 기준: {maskedBasis} · {birth.calendar === "solar" ? "양력" : birth.leapMonth ? "음력 윤달" : "음력 평달"} · {birth.timezone}</p>
        <p>{birth.birthTimeUnknown ? "출생 시간을 몰라 시간에 따른 세부 해석은 제한돼요." : "저장된 출생 시간은 시 단위로 가려서 반영했어요."} 이 미리보기에서는 실제 사주 계산을 하지 않았습니다.</p>
      </section>
      <section><h2>이런 질문에 답해요</h2><ul>{product.answersQuestions.map((question) => <li key={question}>{question}</li>)}</ul></section>
      <section className="product-inclusions"><h2>포함 내용</h2><ul>{product.includedSections.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h2>필요한 입력</h2><ul>{product.requiredInputs.map((input) => <li key={input}>{input}</li>)}</ul><p>출생 시간: {product.requiresBirthTime ? "필수" : "없어도 이용 가능"}</p></section>
      <section id="generation-policy"><h2>생성 방식</h2><p>{product.generationMethod}</p></section>
      <section><h2>환불·재시도 정책</h2><p>{product.refundPolicy}</p></section>
      <section className="locked-product"><p className="section-kicker">구매 후 생성</p><h2>세부 해석과 시기</h2><p>결제 제공자의 승인이 확인된 주문에만 서버가 콘텐츠를 지급합니다.</p></section>
      <aside className="commerce-safety-note signal-commerce-note">
        <strong>안전한 구매 안내</strong>
        <p>금액과 상품 버전은 서버에서 확정하고 결제 결과를 다시 검증합니다. 사주 해석은 중요한 결정이나 전문가 판단을 대신하지 않습니다.</p>
      </aside>
      <Link className="primary-button signal-primary-cta" href={`/checkout/${product.id}`}>단건 구매 흐름 확인</Link>
      <p className="action-note">결제 수단 정보는 사주리움 서버가 직접 저장하지 않습니다.</p>
    </main>
  );
}

export function LiveProductDetailScreen({ productId }: { productId: ProductId }) {
  const [product, setProduct] = useState<ProductView | null>(null); const [error, setError] = useState("");
  useEffect(() => { void getServerProduct(productId).then(setProduct).catch((reason) => setError(formatApiRequestError(reason, "상품을 불러오지 못했어요."))); }, [productId]);
  if (!product && !error) return <LoadingState title="서버 상품을 불러오고 있어요" />;
  if (error) return <CorruptState title="상품을 불러오지 못했어요" description={error} unavailable onReset={() => { window.location.reload(); return true; }} />;
  return <main className={`screen-content product-detail signal-atlas-commerce-detail ${styles.srScreen}`} aria-labelledby="product-title"><p className="section-kicker">서버 카탈로그</p><h1 id="product-title">{product?.title}</h1><p className="lead">{product?.description}</p><strong className="product-price">{product ? price(product.priceAmount) : ""}</strong><p className="supporting">상품 버전 {product?.version} · {product?.kind === "consultation_credit" ? "상담 이용권" : "리포트"}</p><section><h2>필요한 입력</h2><ul>{product?.requiredInputs.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h2>생성 방식</h2><p>{product?.generationMethod}</p></section><section><h2>환불 정책</h2><p>{product?.refundPolicy}</p></section><Link className="primary-button signal-primary-cta" href={`/checkout/${productId}`}>서버 주문으로</Link></main>;
}

export function CheckoutScreen({ productId }: { productId: ProductId }) {
  const router = useRouter();
  const product = getProduct(productId);
  const duplicateKey = getOrderDuplicateKey(productId, product.version);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  async function submitOrder() {
    setSubmitting(true);
    setServerError("");
    try {
      const created = await createOrder(productId);
      router.push(`/orders/${created.order_id}?productId=${productId}&state=pending&source=server`);
    } catch (error) {
      setServerError(formatApiRequestError(error, "주문을 만들지 못했어요."));
      setSubmitting(false);
    }
  }
  return (
    <main className={`screen-content checkout-content signal-atlas-checkout ${styles.srScreen}`} aria-labelledby="checkout-title">
      <p className="section-kicker signal-atlas-overline">주문 확인</p>
      <h1 id="checkout-title">{product.title}</h1>
      <p className="supporting commerce-purchase-mode">단건 구매 · 구독 없음 · 최종 금액은 서버 상품 카탈로그에서 확정해요.</p>
      <div className="order-summary"><span>상품 ID</span><strong>{product.id}</strong><span>기간</span><strong>{duplicateKey.periodKey}</strong><span>상품 금액</span><strong>{price(product.priceAmount)}</strong><span>주문 ID</span><strong>생성 시 서버 할당</strong></div>
      <aside className="check-list commerce-safety-note"><strong>확인 사항</strong><span>· 가격·통화·상품 버전은 서버가 다시 확정해요.</span><span>· 같은 요청의 중복 주문은 멱등성 키로 막아요.</span><span>· 결제 제공자 승인 전에는 상품이 지급되지 않아요.</span></aside>
      <aside className="check-list"><strong>주문 상태 7단계</strong>{ORDER_STATUSES.map((state) => <span key={state}>· {state}</span>)}</aside>
      {serverError && <p className="form-error" role="alert">{serverError}</p>}
      <button className="primary-button signal-primary-cta" type="button" disabled={submitting} onClick={() => { void submitOrder(); }}>{submitting ? "서버에 주문 생성 중" : "서버 주문 만들기"}</button>
      <p className="action-note">실제 청구는 결제 제공자 승인 화면을 완료한 뒤에만 발생합니다.</p>
    </main>
  );
}

const STATUS_COPY: Record<DemoOrderStatus, { label: string; title: string; description: string }> = {
  pending: { label: "대기", title: "결제 대기 상태 안내", description: "실제 결제 요청은 전송되지 않았습니다." },
  success: { label: "성공", title: "결제 성공 상태 안내", description: "이 기기에 기록을 남겨도 실제 구매·상품 지급은 발생하지 않습니다." },
  failure: { label: "실패", title: "결제 실패 상태 안내", description: "결제 수단이나 주문에는 아무 변화가 없습니다." },
};

const ORDER_STATUS_ADAPTER: Record<DemoOrderStatus, OrderStatus> = {
  pending: "PAYMENT_PENDING",
  success: "COMPLETED",
  failure: "FAILED",
};

export function PaymentStatusScreen({ orderId, productId, status, server = false }: { orderId: string; productId: ProductId; status: DemoOrderStatus; server?: boolean }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [message, setMessage] = useState("");
  const [serverOrder, setServerOrder] = useState<LiveOrder | null>(null);
  const [serverError, setServerError] = useState(false);
  useEffect(() => {
    if (!hydrated || !server) return;
    let active = true;
    void getOrder(orderId).then((value) => active && setServerOrder(value)).catch(() => active && setServerError(true));
    return () => { active = false; };
  }, [hydrated, orderId, server]);
  if (!hydrated || (server && !serverOrder && !serverError)) return <LoadingState title="서버 주문을 확인하고 있어요" />;
  if (server && (serverError || !serverOrder)) return <CorruptState title="주문을 불러오지 못했어요" description="주문 소유권 또는 백엔드 연결 상태를 확인해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  void raw;
  const product = getProduct(productId);
  if (serverOrder) {
    return (
      <main className={`screen-content payment-status signal-atlas-payment-status ${styles.srScreen}`} aria-labelledby="payment-status-title">
        <p className="section-kicker signal-atlas-overline">서버 주문 · {serverOrder.status}</p>
        <h1 id="payment-status-title">주문이 안전하게 생성됐어요</h1>
        <p className="supporting">결제 제공자 승인 전 상태입니다. 승인 결과를 서버가 검증한 뒤 상품 지급 작업이 시작됩니다.</p>
        <aside className="order-summary"><span>상품</span><strong>{product.title}</strong><span>주문 ID</span><strong>{serverOrder.order_id}</strong><span>금액</span><strong>{price(serverOrder.amount_minor)}</strong><span>통화</span><strong>{serverOrder.currency}</strong><span>상태</span><strong>{serverOrder.status}</strong></aside>
        <button className="disabled-login signal-disabled-payment" type="button" disabled>결제 제공자 키 연결 필요</button>
        <Link className="secondary-button" href="/products">상품 목록으로</Link>
      </main>
    );
  }
  const copy = STATUS_COPY[status];
  const duplicateKey = getOrderDuplicateKey(productId, product.version);
  const current = getCommerceData();
  if (!current) return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;

  function recordDemoState() {
    const data = getCommerceData();
    if (!data) return setMessage("손상된 구매 기록을 초기화한 뒤 다시 시도해 주세요.");
    const orderStatus = ORDER_STATUS_ADAPTER[status];
    if (data.orders.some((order) => order.orderId === orderId)) {
      return setMessage(`주문 ${orderId}은 이미 처리돼 같은 멱등성 키로 다시 기록하지 않았어요.`);
    }
    if (orderStatus === "COMPLETED" && data.orders.some((order) => order.status === "COMPLETED" && hasSameOrderIdentity(order, duplicateKey))) {
      return setMessage("같은 상품·프로필·기간·해석 버전의 체험 성공 기록이 있어 추가 지급하지 않았어요. 기존 리포트, 새 해석 버전, 변경한 프로필 중 하나를 선택해 주세요.");
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
    if (!commerceStore.write(next)) return setMessage("이 브라우저에서는 체험 상태를 저장할 수 없어요.");
    setMessage(`멱등성 주문 ID ${orderId} · 생성 ${generationId}를 이 브라우저에 기록했어요.`);
  }

  return (
    <main className={`screen-content payment-status signal-atlas-payment-status ${styles.srScreen}`} aria-labelledby="payment-status-title">
      <p className="section-kicker signal-atlas-overline">{copy.label} · 결제 상태 안내</p>
      <h1 id="payment-status-title">{copy.title}</h1>
      <p className="supporting">{copy.description}</p>
      <aside className="commerce-safety-note signal-commerce-note">
        <strong>체험 기록 안내</strong>
        <p>이 상태는 단건 구매 흐름을 확인하기 위한 예시이며 실제 결제·상품 지급은 발생하지 않습니다.</p>
      </aside>
      <aside className="order-summary"><span>상품</span><strong>{product.title}</strong><span>상품 ID</span><strong>{product.id}</strong><span>주문 ID</span><strong>{orderId}</strong><span>프로필 ID</span><strong>{duplicateKey.profileId}</strong><span>차트 스냅샷 ID</span><strong>{duplicateKey.chartSnapshotId}</strong><span>기간</span><strong>{duplicateKey.periodKey}</strong><span>해석 버전</span><strong>{duplicateKey.interpretationVersion}</strong><span>정규 주문 상태</span><strong>{ORDER_STATUS_ADAPTER[status]}</strong><span>실제 결제액</span><strong>0원</strong></aside>
      <button className="primary-button signal-primary-cta" type="button" onClick={recordDemoState}>이 상태를 기기에 기록</button>
      {message && <p className="form-error" role="status">{message}</p>}
      <Link className="secondary-button" href={`/products/${productId}`}>상품 상세로 돌아가기</Link>
    </main>
  );
}

export function CreditsScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [liveCredits, setLiveCredits] = useState<{ balance: number; history: import("@/lib/contracts").CreditLedgerEntry[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void getCredits().then((value) => active && setLiveCredits({ balance: value.balance.balance, history: value.ledger.items })).catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [hydrated]);
  if (!hydrated || (!liveCredits && !loadError)) return <LoadingState title="서버 이용권 내역을 확인하고 있어요" />;
  void raw;
  if (loadError || !liveCredits) return <CorruptState title="이용권 서버에 연결할 수 없어요" description="백엔드 연결 상태를 확인한 뒤 다시 시도해 주세요." unavailable onReset={() => { window.location.reload(); return true; }} />;
  return (
    <main className={`screen-content credits-content signal-atlas-credits ${styles.srScreen}`} aria-labelledby="credits-title">
      <p className="section-kicker signal-atlas-overline">서버 이용권 원장</p>
      <h1 id="credits-title">상담 이용권<br />{liveCredits.balance}회</h1>
      <p className="supporting">구매·사용·환불을 덮어쓰지 않는 원장 기록으로 계산한 잔액입니다.</p>
      <section className="credit-history"><h2>변경 내역</h2>{liveCredits.history.length === 0 ? <p>아직 이용권 변경 내역이 없어요.</p> : liveCredits.history.map((item) => <article key={item.id}><div><strong>{item.description || item.reason}</strong><small>{item.reason} · {item.sourceId ?? "연결 리소스 없음"}</small><time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div><span>{item.delta > 0 ? `+${item.delta}` : item.delta}</span></article>)}</section>
      <Link className="secondary-button" href="/products">상품 목록</Link>
    </main>
  );
}
