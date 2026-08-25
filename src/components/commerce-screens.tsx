"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { CommerceData, DemoOrderStatus, ProductId } from "@/lib/domain";
import { commerceStore, inspectCurrentBirth, resetBirthSource } from "@/lib/storage";
import { getProduct, INITIAL_BIRTH, INITIAL_COMMERCE_DATA, PRODUCTS } from "@/lib/fixtures";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, LoadingState } from "./page-state";

function getCommerceData(): CommerceData | null {
  const inspection = commerceStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return { ...INITIAL_COMMERCE_DATA, orders: [], creditHistory: [] };
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
  if (!hydrated) return <LoadingState title="상품 정보를 확인하고 있어요" />;
  void raw;
  const commerce = getCommerceData();
  if (!commerce) return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  const purchased = new Set(commerce.orders.filter((order) => order.status === "success").map((order) => order.productId));

  return (
    <main className="screen-content products-content" aria-labelledby="products-title">
      <p className="section-kicker">더 깊은 살펴보기</p>
      <h1 id="products-title">고민별로 더 깊게<br />살펴보세요</h1>
      <p className="supporting">이곳의 표시 가격과 결제 상태는 예시이며 실제 구매나 상품 지급은 발생하지 않습니다.</p>
      <div className="product-list">{PRODUCTS.map((product) => <article key={product.id}><div><small>{purchased.has(product.id) ? "기기 저장 기록 있음" : "잠긴 미리보기"}</small><h2><Link href={`/products/${product.id}`}>{product.title}</Link></h2><p>{product.description}</p></div><strong>{price(product.price)}</strong></article>)}</div>
      <Link className="secondary-button" href="/products/credits">상담 이용권과 사용 내역</Link>
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
  const purchased = commerce.orders.some((order) => order.productId === productId && order.status === "success");

  return (
    <main className="screen-content product-detail" aria-labelledby="product-title">
      <p className="section-kicker">상품 상세</p>
      <h1 id="product-title">{product.title}</h1>
      <p className="lead">{product.description}</p>
      <strong className="product-price">{price(product.price)}</strong>
      {purchased && <aside className="duplicate-notice"><strong>같은 상품의 체험 성공 기록이 있어요.</strong><p>실제 구매 내역이 아니며 중복 결제도 발생하지 않습니다.</p></aside>}
      <section className="personalized-preview"><small>{birth.nickname}님의 체험용 미리보기</small><h2>{product.preview}</h2><p>저장된 이름과 주제만 화면에 반영하며 실제 사주 계산은 하지 않습니다.</p></section>
      <section className="product-inclusions"><h2>포함 내용</h2><ul>{product.inclusions.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section className="locked-product"><p className="section-kicker">잠긴 콘텐츠</p><h2>세부 해석과 시기</h2><p>세부 해석과 시기는 제공하지 않으며 실제 결제나 상품 지급도 발생하지 않습니다.</p></section>
      <Link className="primary-button" href={`/checkout/${product.id}`}>주문 상태 예시 보기</Link>
      <p className="action-note">실제 결제 수단은 수집하지 않습니다.</p>
    </main>
  );
}

export function CheckoutScreen({ productId }: { productId: ProductId }) {
  const product = getProduct(productId);
  return (
    <main className="screen-content checkout-content" aria-labelledby="checkout-title">
      <p className="section-kicker">주문 확인</p>
      <h1 id="checkout-title">{product.title}</h1>
      <div className="order-summary"><span>상품 금액</span><strong>{price(product.price)}</strong><span>실제 청구</span><strong>0원</strong></div>
      <aside className="check-list"><strong>확인 사항</strong><span>· 실제 결제 서비스나 결제 수단에 연결되지 않아요.</span><span>· 성공 상태를 기록해도 상품은 지급되지 않아요.</span><span>· 이 브라우저에 저장된 체험 기록만 변경돼요.</span></aside>
      <nav className="demo-status-links" aria-label="결제 상태 예시 선택">
        <Link href={`/checkout/${product.id}/status?state=pending`}>대기 상태 보기</Link>
        <Link href={`/checkout/${product.id}/status?state=success`}>성공 상태 보기</Link>
        <Link href={`/checkout/${product.id}/status?state=failure`}>실패 상태 보기</Link>
      </nav>
      <button className="disabled-login" type="button" disabled>실제 결제 · 이용 불가</button>
    </main>
  );
}

const STATUS_COPY: Record<DemoOrderStatus, { label: string; title: string; description: string }> = {
  pending: { label: "대기", title: "결제 대기 상태 안내", description: "실제 결제 요청은 전송되지 않았습니다." },
  success: { label: "성공", title: "결제 성공 상태 안내", description: "이 기기에 기록을 남겨도 실제 구매·상품 지급은 발생하지 않습니다." },
  failure: { label: "실패", title: "결제 실패 상태 안내", description: "결제 수단이나 주문에는 아무 변화가 없습니다." },
};

export function PaymentStatusScreen({ productId, status }: { productId: ProductId; status: DemoOrderStatus }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  const [message, setMessage] = useState("");
  if (!hydrated) return <LoadingState />;
  void raw;
  const product = getProduct(productId);
  const copy = STATUS_COPY[status];
  const current = getCommerceData();
  if (!current) return <CorruptState title="체험 구매 기록을 읽을 수 없어요" description="손상된 구매 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;

  function recordDemoState() {
    const data = getCommerceData();
    if (!data) return setMessage("손상된 구매 기록을 초기화한 뒤 다시 시도해 주세요.");
    if (status === "success" && data.orders.some((order) => order.productId === productId && order.status === "success")) {
      return setMessage("같은 상품의 체험 성공 기록이 이미 있어 추가 지급하지 않았어요.");
    }
    const now = new Date().toISOString();
    const order = { id: `order-${now.replace(/\D/g, "")}`, productId, status, createdAt: now } as const;
    const grantsCredits = status === "success" && productId === "consult-5";
    const next: CommerceData = {
      ...data,
      orders: [order, ...data.orders],
      consultationCredits: data.consultationCredits + (grantsCredits ? 5 : 0),
      creditHistory: grantsCredits ? [{ id: `credit-${order.id}`, label: "상담 5회 체험 기록", delta: 5, createdAt: now }, ...data.creditHistory] : data.creditHistory,
    };
    if (!commerceStore.write(next)) return setMessage("이 브라우저에서는 체험 상태를 저장할 수 없어요.");
    setMessage("이 브라우저에 체험 상태를 기록했어요.");
  }

  return (
    <main className="screen-content payment-status" aria-labelledby="payment-status-title">
      <p className="section-kicker">{copy.label} · 결제 상태 안내</p>
      <h1 id="payment-status-title">{copy.title}</h1>
      <p className="supporting">{copy.description}</p>
      <aside className="order-summary"><span>상품</span><strong>{product.title}</strong><span>실제 결제액</span><strong>0원</strong></aside>
      <button className="primary-button" type="button" onClick={recordDemoState}>이 상태를 기기에 기록</button>
      {message && <p className="form-error" role="status">{message}</p>}
      <Link className="secondary-button" href={`/products/${productId}`}>상품 상세로 돌아가기</Link>
    </main>
  );
}

export function CreditsScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(commerceStore.subscribe, commerceStore.rawSnapshot, () => null);
  if (!hydrated) return <LoadingState title="이용권 내역을 확인하고 있어요" />;
  void raw;
  const data = getCommerceData();
  if (!data) return <CorruptState title="이용권 데이터를 읽을 수 없어요" description="손상된 이용권 기록을 확인 없이 초기화하지 않습니다." unavailable={commerceStore.inspect().status === "unavailable"} onReset={commerceStore.remove} />;
  return (
    <main className="screen-content credits-content" aria-labelledby="credits-title">
      <p className="section-kicker">이 기기의 이용권 기록</p>
      <h1 id="credits-title">상담 이용권<br />{data.consultationCredits}회</h1>
      <p className="supporting">이 브라우저에만 저장되는 체험 기록이며 실제 상담 이용권으로 사용할 수 없습니다.</p>
      <section className="credit-history"><h2>변경 내역</h2>{data.creditHistory.length === 0 ? <p>아직 체험용 이용권 변경 내역이 없어요.</p> : data.creditHistory.map((item) => <article key={item.id}><div><strong>{item.label}</strong><time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time></div><span>{item.delta > 0 ? `+${item.delta}` : item.delta}</span></article>)}</section>
      <Link className="secondary-button" href="/products">상품 목록</Link>
    </main>
  );
}
