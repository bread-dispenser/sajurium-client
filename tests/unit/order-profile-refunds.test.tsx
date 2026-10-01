import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BillingScreen, CheckoutScreen, PaymentStatusScreen, orderReferenceLabel } from "@/components/commerce-screens";
import { ApiRequestError } from "@/lib/api/client";
import { buildOrderRequest, createOrder, formatOrderError, listRefunds, orderProfileRequirement, validateOrderSelection } from "@/lib/api/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const PRODUCTS = [
  { id: 2, code: "report_love_deep", name: "연애 심층 리포트", product_type: "report", price: 4900, currency: "KRW", is_active: true, version: 1, description: "관계 성향과 반복 패턴을 차분히 살펴보는 리포트" },
  { id: 5, code: "compatibility_deep", name: "궁합 심층 리포트", product_type: "compatibility", price: 5900, currency: "KRW", is_active: true, version: 1, description: "두 사람의 관계를 여러 관점으로 살펴보는 리포트" },
  { id: 8, code: "report_family_deep", name: "가족 심층 리포트", product_type: "report", price: 4900, currency: "KRW", is_active: true, version: 1, description: "가족 안에서의 역할과 거리감을 차분히 살펴보는 리포트" },
  { id: 9, code: "report_decade_deep", name: "대운(10년) 심층 리포트", product_type: "report", price: 5900, currency: "KRW", is_active: true, version: 1, description: "10년 단위 흐름을 구간별 근거와 함께 정리하는 리포트" },
  { id: 6, code: "credit_pack_5", name: "상담 이용권 5회", product_type: "credit_pack", price: 9900, currency: "KRW", is_active: true, version: 1, description: "상담 이용권" },
];

function profileSummary(id: number, nickname: string, isSelf: boolean, relationship: string | null = null) {
  return { id, nickname, is_self: isSelf, relationship_type: relationship, birth_year: 1992, birth_time_unknown: false, birth_location_masked: "서울**", created_at: "2026-09-01T00:00:00" };
}

// The self profile is deliberately not first, so the default has to look for it.
const PROFILES = [profileSummary(5, "민준", false, "friend"), profileSummary(3, "서연", true)];

function order(overrides: Record<string, unknown>) {
  return {
    id: 1, order_number: "ORD-A1EA2E295B6D", amount: 4900, currency: "KRW", status: "COMPLETED", product_code: "report_love_deep",
    product_name: "연애 심층 리포트", product_version: 1, fulfillment_status: "READY", profile_id: null, profile_display_name: null,
    partner_profile_id: null, partner_profile_display_name: null, relation_type: null, created_at: "2026-09-28T03:00:00", ...overrides,
  };
}

type Call = { method: string; path: string; body: unknown };

function mockApi(handler: (method: string, path: string) => Response | undefined) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path: url.pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return handler(method, url.pathname) ?? json({ code: "NOT_FOUND", message: "없음" }, 404);
  });
  return calls;
}

function serveCheckout(profiles: unknown[] = PROFILES) {
  return mockApi((_method, path) => {
    if (path === "/api/v1/products") return json(PRODUCTS);
    if (path === "/api/v1/profiles/") return json(profiles);
    return undefined;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
});
afterEach(cleanup);

describe("order request body builder", () => {
  it("sends the chosen profile_id for a report product", () => {
    expect(buildOrderRequest("love-report", { profileId: "3", partnerProfileId: "5", relationType: "friend" }, "order-1")).toEqual({
      product_code: "report_love_deep", idempotency_key: "order-1", profile_id: 3,
    });
  });

  it.each([
    ["family-report", "report_family_deep"],
    ["decade-report", "report_decade_deep"],
  ] as const)("treats %s as a single-profile report and sends only profile_id", (id, code) => {
    expect(orderProfileRequirement(id)).toBe("single");
    expect(buildOrderRequest(id, { profileId: "3", partnerProfileId: "5", relationType: "family" }, "order-fd")).toEqual({
      product_code: code, idempotency_key: "order-fd", profile_id: 3,
    });
    expect(validateOrderSelection(id, {})).toBe("어느 명식으로 볼지 골라 주세요.");
    expect(() => buildOrderRequest(id, {}, "k")).toThrow("어느 명식으로 볼지 골라 주세요.");
  });

  it("sends both profiles and the relation for a compatibility product, defaulting the relation to couple", () => {
    expect(buildOrderRequest("compatibility-report", { profileId: "3", partnerProfileId: "5", relationType: "friend" }, "order-2")).toEqual({
      product_code: "compatibility_deep", idempotency_key: "order-2", profile_id: 3, partner_profile_id: 5, relation_type: "friend",
    });
    expect(buildOrderRequest("compatibility-report", { profileId: "3", partnerProfileId: "5" }, "order-3")).toMatchObject({ relation_type: "couple" });
  });

  it("sends no profile fields for a credit pack, even when a selection is around", () => {
    expect(buildOrderRequest("consult-5", { profileId: "3", partnerProfileId: "5", relationType: "family" }, "order-4")).toEqual({
      product_code: "credit_pack_5", idempotency_key: "order-4",
    });
  });

  it("refuses to build a body the server would reject", () => {
    expect(() => buildOrderRequest("love-report", {}, "k")).toThrow("어느 명식으로 볼지 골라 주세요.");
    expect(() => buildOrderRequest("compatibility-report", { profileId: "3" }, "k")).toThrow("함께 볼 사람을 골라 주세요.");
    expect(() => buildOrderRequest("compatibility-report", { profileId: "3", partnerProfileId: "3" }, "k")).toThrow("서로 다른 두 사람을 골라 주세요.");
    expect(validateOrderSelection("consult-5", {})).toBeNull();
  });

  it("posts the built body to POST /orders", async () => {
    const calls = mockApi((method, path) => (method === "POST" && path === "/api/v1/orders" ? json(order({ status: "PAYMENT_PENDING", profile_id: 3, profile_display_name: "서연" }), 201) : undefined));
    const created = await createOrder("love-report", { profileId: "3" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ product_code: "report_love_deep", profile_id: 3 });
    expect(calls[0].body).not.toHaveProperty("partner_profile_id");
    expect(created.profile_display_name).toBe("서연");
  });

  it("explains the server's profile ownership and validation errors in Korean", () => {
    const error = (code: string, status: number) => new ApiRequestError(status, { code, message: "server text", field_errors: {}, request_id: "", retryable: false }, null, new Headers());
    expect(formatOrderError(error("PROFILE_NOT_FOUND", 404))).toContain("고른 사람을 찾을 수 없어요");
    expect(formatOrderError(error("SAME_PROFILE", 422))).toBe("서로 다른 두 사람을 골라 주세요.");
    expect(formatOrderError(error("CHART_REQUIRED", 409))).toContain("명식이 아직 없어요");
    expect(formatOrderError(error("PROFILE_REQUIRED", 422))).toBe("어느 명식으로 볼지 골라 주세요.");
    expect(formatOrderError(error("PAYMENTS_DISABLED", 503))).toContain("결제와 주문은 준비 중이에요");
  });
});

describe("checkout reference profile step", () => {
  it("defaults a report checkout to the self profile while purchase stays paused", async () => {
    serveCheckout();
    render(<CheckoutScreen productId="love-report" />);

    const select = await screen.findByLabelText("누구의 명식으로 볼까요");
    expect(select).toHaveValue("3");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["민준, 친구", "서연, 본인"]);
    expect(screen.getByRole("region", { name: "주문 내용" })).toHaveTextContent("기준 명식서연");
    expect(screen.getByRole("status")).toHaveTextContent("결제와 주문은 준비 중이에요");
    await waitFor(() => expect(screen.getByRole("button", { name: /결제하기/ })).toBeDisabled());

    fireEvent.change(select, { target: { value: "5" } });
    expect(screen.getByRole("region", { name: "주문 내용" })).toHaveTextContent("기준 명식민준");
  });

  it.each([
    ["family-report", "가족 심층 리포트", "4,900원"],
    ["decade-report", "대운(10년) 심층 리포트", "5,900원"],
  ] as const)("asks for a reference profile on the %s checkout and loads saved people", async (id, name, amount) => {
    const calls = serveCheckout();
    render(<CheckoutScreen productId={id} />);

    const select = await screen.findByLabelText("누구의 명식으로 볼까요");
    expect(select).toHaveValue("3");
    expect(calls.some((call) => call.path === "/api/v1/profiles/")).toBe(true);
    await waitFor(() => expect(screen.getAllByText(amount)).toHaveLength(2));
    const summary = screen.getByRole("region", { name: "주문 내용" });
    expect(summary).toHaveTextContent(name);
    expect(summary).toHaveTextContent("기준 명식서연");
    expect(screen.queryByLabelText("함께 볼 사람")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /결제하기/ })).toBeDisabled();
  });

  it("defaults a compatibility checkout to me and another person, and rejects two identical profiles", async () => {
    serveCheckout();
    render(<CheckoutScreen productId="compatibility-report" />);

    const first = await screen.findByLabelText("기준이 되는 사람");
    const second = screen.getByLabelText("함께 볼 사람");
    expect(first).toHaveValue("3");
    expect(second).toHaveValue("5");
    expect(screen.getByRole("button", { name: "연인" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "주문 내용" })).toHaveTextContent("서연과 민준");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "가족" }));
    expect(screen.getByRole("button", { name: "가족" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(second, { target: { value: "3" } });
    expect(screen.getByRole("alert")).toHaveTextContent("서로 다른 두 사람을 골라 주세요.");
    expect(second).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /결제하기/ })).toBeDisabled();
  });

  it("asks for a second person when only one profile is saved for compatibility", async () => {
    serveCheckout([profileSummary(3, "서연", true)]);
    render(<CheckoutScreen productId="compatibility-report" />);
    expect(await screen.findByText(/궁합은 두 사람이 필요해요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "사람 추가" })).toHaveAttribute("href", "/people/new");
  });

  it("shows no profile step for a credit pack and does not load profiles", async () => {
    const calls = serveCheckout();
    render(<CheckoutScreen productId="consult-5" />);
    await waitFor(() => expect(screen.getAllByText("9,900원")).toHaveLength(2));
    expect(screen.queryByRole("heading", { name: "기준 명식" })).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === "/api/v1/profiles/")).toBe(false);
  });
});

describe("orders show the reference profile", () => {
  it("labels one or two reference profiles without a middle dot", () => {
    const base = { profile_id: null, profile_display_name: null, partner_profile_id: null, partner_profile_display_name: null };
    expect(orderReferenceLabel({ ...base, profile_id: "3", profile_display_name: "나" })).toBe("나");
    expect(orderReferenceLabel({ ...base, profile_id: "3", profile_display_name: "나", partner_profile_id: "5", partner_profile_display_name: "상대" })).toBe("나와 상대");
    expect(orderReferenceLabel({ ...base, profile_id: "5", profile_display_name: "민준", partner_profile_id: "3", partner_profile_display_name: "서연" })).toBe("민준과 서연");
    expect(orderReferenceLabel({ ...base, profile_id: "3" })).toBe("삭제한 프로필");
    expect(orderReferenceLabel(base)).toBeNull();
  });

  it("shows 기준 on the orders list, and nothing for a credit pack", async () => {
    mockApi((_method, path) => {
      if (path === "/api/v1/orders") {
        return json([
          order({ id: 1, profile_id: 3, profile_display_name: "나" }),
          order({ id: 2, order_number: "ORD-2", product_code: "compatibility_deep", product_name: "궁합 심층 리포트", profile_id: 3, profile_display_name: "나", partner_profile_id: 5, partner_profile_display_name: "상대", relation_type: "couple" }),
          order({ id: 3, order_number: "ORD-3", product_code: "credit_pack_5", product_name: "상담 이용권 5회", amount: 9900 }),
        ]);
      }
      if (path === "/api/v1/refunds") return json([]);
      return undefined;
    });
    render(<BillingScreen />);

    const rows = within(await screen.findByRole("list", { name: "주문 목록" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("기준: 나");
    expect(rows[1]).toHaveTextContent("기준: 나와 상대");
    expect(rows[2]).not.toHaveTextContent("기준");
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows 기준 명식 and the relation on the order detail", async () => {
    mockApi((_method, path) => {
      if (path === "/api/v1/orders/7") return json(order({ id: 7, product_code: "compatibility_deep", product_name: "궁합 심층 리포트", profile_id: 3, profile_display_name: "나", partner_profile_id: 5, partner_profile_display_name: "상대", relation_type: "friend" }));
      if (path === "/api/v1/products") return json(PRODUCTS);
      return undefined;
    });
    render(<PaymentStatusScreen orderId="7" productId="compatibility-report" status="success" server />);

    const info = await screen.findByRole("region", { name: "주문 정보" });
    expect(info).toHaveTextContent("기준 명식나와 상대");
    expect(info).toHaveTextContent("관계친구");
    expect(info).toHaveTextContent("주문번호ORD-A1EA2E295B6D");
  });
});

describe("refund history from GET /refunds", () => {
  it("maps the refund list with order number and product name", async () => {
    mockApi((_method, path) => (path === "/api/v1/refunds" ? json([{ id: 2, order_id: 7, order_number: "ORD-1B2C3D4E5F60", product_name: "상담 이용권 5회", amount: 1980, status: "COMPLETED", fulfillment_revoked: "REVOKED", reason: null, operator_note: null, created_at: "2026-10-01T09:00:00" }]) : undefined));
    expect(await listRefunds()).toEqual([{ id: "2", orderId: "7", orderNumber: "ORD-1B2C3D4E5F60", productName: "상담 이용권 5회", amount: 1980, reason: null, status: "COMPLETED", createdAt: "2026-10-01T09:00:00Z" }]);
  });

  it("loads every refund with one request instead of one per order and renders the rows", async () => {
    const calls = mockApi((_method, path) => {
      if (path === "/api/v1/orders") return json([order({ id: 7, order_number: "ORD-1B2C3D4E5F60" }), order({ id: 8, order_number: "ORD-8" }), order({ id: 9, order_number: "ORD-9" })]);
      if (path === "/api/v1/refunds") {
        return json([
          { id: 2, order_id: 7, order_number: "ORD-1B2C3D4E5F60", product_name: "상담 이용권 5회", amount: 1980, status: "COMPLETED", fulfillment_revoked: "REVOKED", reason: null, operator_note: null, created_at: "2026-09-28T03:00:00" },
          { id: 3, order_id: 8, order_number: "ORD-8", product_name: "연애 심층 리포트", amount: 4900, status: "REQUESTED", fulfillment_revoked: "NONE", reason: "단순 변심", operator_note: null, created_at: "2026-09-20T03:00:00" },
        ]);
      }
      return undefined;
    });
    render(<BillingScreen />);

    const rows = within(await screen.findByRole("list", { name: "환불 요청 목록" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("상담 이용권 5회");
    expect(rows[0]).toHaveTextContent("9월 28일 요청, 주문번호 ORD-1B2C3D4E5F60");
    expect(rows[0]).toHaveTextContent("1,980원");
    expect(rows[0]).toHaveTextContent("환불 완료");
    expect(rows[1]).toHaveTextContent("주문번호 ORD-8");
    expect(rows[1]).toHaveTextContent("4,900원");
    expect(rows[1]).toHaveTextContent("환불 요청됨");
    expect(rows[1]).toHaveTextContent("단순 변심");

    expect(calls.filter((call) => call.path === "/api/v1/refunds")).toHaveLength(1);
    expect(calls.some((call) => /^\/api\/v1\/orders\/\d+\/refunds$/.test(call.path))).toBe(false);
  });

  it("shows the empty refund state while payments are paused", async () => {
    mockApi((_method, path) => (path === "/api/v1/orders" || path === "/api/v1/refunds" ? json([]) : undefined));
    render(<BillingScreen />);
    expect(await screen.findByText("환불 요청이 없어요.")).toBeInTheDocument();
    expect(screen.getByText("결제는 준비 중이에요. 지난 주문과 환불 내역은 계속 볼 수 있어요.")).toBeInTheDocument();
  });

  it("keeps the orders visible when only the refund list fails", async () => {
    mockApi((_method, path) => (path === "/api/v1/orders" ? json([order({})]) : path === "/api/v1/refunds" ? json({ code: "INTERNAL_ERROR", message: "오류" }, 500) : undefined));
    render(<BillingScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("환불 내역을 불러오지 못했어요");
    expect(screen.getByRole("list", { name: "주문 목록" })).toBeInTheDocument();
  });
});
