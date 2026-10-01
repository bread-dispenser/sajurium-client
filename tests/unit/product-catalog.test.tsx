import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CheckoutScreen, LiveProductDetailScreen, ProductListScreen } from "@/components/commerce-screens";
import { PRODUCT_IDS, UNLISTED_PRODUCT_CODES, listProducts } from "@/lib/api/service";
import { getProduct, isProductId } from "@/lib/fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

/**
 * Active product catalog seeded by the backend: sasaju `app/crud/product.py`
 * `CRUDProduct.ensure_seed` (checked at sasaju e528c1e, 9 codes). When the server adds or retires a product,
 * update this list; the mapping test below then fails until the client maps it in `PRODUCT_IDS`
 * or lists it on purpose in `UNLISTED_PRODUCT_CODES`.
 */
const SERVER_SEED_PRODUCTS = [
  { code: "report_basic", name: "기본 사주 리포트", product_type: "report", price: 0, description: "무료 기본 사주 리포트" },
  { code: "report_love_deep", name: "연애 심층 리포트", product_type: "report", price: 4900, description: "관계 성향과 반복 패턴을 차분히 살펴보는 리포트" },
  { code: "report_career_deep", name: "커리어 심층 리포트", product_type: "report", price: 4900, description: "업무 환경과 변화 조건을 정리해보는 리포트" },
  { code: "report_wealth_deep", name: "재물 심층 리포트", product_type: "report", price: 4900, description: "소비·저축·결정 기준을 시기별로 정리하는 리포트" },
  { code: "compatibility_deep", name: "궁합 심층 리포트", product_type: "compatibility", price: 5900, description: "두 사람의 관계를 여러 관점으로 살펴보는 리포트" },
  { code: "credit_pack_5", name: "상담 이용권 5회", product_type: "credit_pack", price: 9900, description: "고민별 질문과 답변을 이어서 살펴보는 상담 이용권" },
  { code: "credit_pack_1", name: "상담 이용권 1회", product_type: "credit_pack", price: 2500, description: "필요할 때 한 번 이용하는 상담 이용권" },
  { code: "report_family_deep", name: "가족 심층 리포트", product_type: "report", price: 4900, description: "가족 안에서의 역할과 거리감을 차분히 살펴보는 리포트" },
  { code: "report_decade_deep", name: "대운(10년) 심층 리포트", product_type: "report", price: 5900, description: "10년 단위 흐름을 구간별 근거와 함께 정리하는 리포트" },
] as const;

function catalog(overrides: Partial<Record<string, { price: number }>> = {}) {
  return SERVER_SEED_PRODUCTS.map((product, index) => ({
    id: index + 1,
    version: 1,
    currency: "KRW",
    is_active: true,
    ...product,
    ...overrides[product.code],
  }));
}

function price(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" } });
}

function serveCatalog(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/api/v1/products")) return json(body);
    return json({ balance: { balance: 0 }, ledger: { items: [] } });
  });
}

describe("client product mapping covers the server catalog", () => {
  it("maps or deliberately unlists every product code in the server seed", () => {
    const unhandled = SERVER_SEED_PRODUCTS
      .map((product) => product.code)
      .filter((code) => !(code in PRODUCT_IDS) && !UNLISTED_PRODUCT_CODES.has(code));
    expect(unhandled).toEqual([]);
  });

  it("maps every server code to a client product with detail and checkout content", () => {
    for (const id of Object.values(PRODUCT_IDS)) {
      expect(isProductId(id)).toBe(true);
      expect(getProduct(id).id).toBe(id);
    }
    expect(PRODUCT_IDS.credit_pack_1).toBe("consult-1");
    expect(getProduct("consult-1").kind).toBe("consultation_credit");
    expect(PRODUCT_IDS.report_family_deep).toBe("family-report");
    expect(PRODUCT_IDS.report_decade_deep).toBe("decade-report");
    expect(getProduct("family-report").kind).toBe("report");
    expect(getProduct("decade-report").kind).toBe("report");
  });

  it("checks all 9 server seed codes", () => {
    expect(SERVER_SEED_PRODUCTS).toHaveLength(9);
  });
});

describe("product list from the live catalog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt_live", anonymousToken: "anon_live" }));
  });
  afterEach(cleanup);

  it("keeps every sellable product from the 9-product server response, including credit_pack_1 and the family and decade reports", async () => {
    serveCatalog(catalog());
    const products = await listProducts();
    expect(products.map((product) => product.id).sort()).toEqual(
      ["career-report", "compatibility-report", "consult-1", "consult-5", "decade-report", "family-report", "love-report", "money-report"],
    );
    expect(products.find((product) => product.id === "family-report")).toMatchObject({ title: "가족 심층 리포트", priceAmount: 4900, kind: "report" });
    expect(products.find((product) => product.id === "decade-report")).toMatchObject({ title: "대운(10년) 심층 리포트", priceAmount: 5900, kind: "report" });
    expect(products.find((product) => product.id === "consult-1")).toMatchObject({ title: "상담 이용권 1회", priceAmount: 2500, kind: "consultation_credit" });
  });

  it("renders all eight purchasable products on /products, with the 1-credit pack under 상담 이용권", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    serveCatalog(catalog());

    render(<ProductListScreen />);

    const credits = await screen.findByRole("region", { name: "상담 이용권" });
    const creditOne = within(credits).getByRole("link", { name: /상담 이용권 1회/ });
    expect(creditOne).toHaveAttribute("href", "/products/consult-1");
    expect(creditOne).toHaveTextContent("2,500원");
    expect(within(credits).getByRole("link", { name: /상담 이용권 5회/ })).toHaveAttribute("href", "/products/consult-5");
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/products/") && link.getAttribute("href") !== "/products/credits")).toHaveLength(8);
    // report_basic is unlisted on purpose (it is the free basic report), so nothing warns.
    expect(warn).not.toHaveBeenCalled();
  });

  it("lists the family and decade reports with the server price under 심층 리포트, next to the other deep reports", async () => {
    serveCatalog(catalog({ report_family_deep: { price: 5100 }, report_decade_deep: { price: 6100 } }));

    render(<ProductListScreen />);

    const reports = await screen.findByRole("region", { name: "심층 리포트" });
    const family = within(reports).getByRole("link", { name: /가족 심층 리포트/ });
    expect(family).toHaveAttribute("href", "/products/family-report");
    expect(family).toHaveTextContent("5,100원");
    const decade = within(reports).getByRole("link", { name: /대운\(10년\) 심층 리포트/ });
    expect(decade).toHaveAttribute("href", "/products/decade-report");
    expect(decade).toHaveTextContent("6,100원");
    expect(within(reports).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/products/love-report", "/products/career-report", "/products/money-report", "/products/family-report", "/products/compatibility-report", "/products/decade-report",
    ]);
    expect(screen.getByRole("region", { name: "상담 이용권" })).not.toHaveTextContent("가족 심층 리포트");
  });

  it.each([
    ["family-report", "report_family_deep", "가족 심층 리포트"],
    ["decade-report", "report_decade_deep", "대운(10년) 심층 리포트"],
  ] as const)("shows the server price on the %s detail page", async (id, code, name) => {
    serveCatalog(catalog({ [code]: { price: 7300 } }));

    render(<LiveProductDetailScreen productId={id} />);

    expect(await screen.findByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.getAllByText("7,300원").length).toBeGreaterThan(0);
    expect(screen.queryByText(price(getProduct(id).priceAmount))).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "기본 리포트와 무엇이 다른가요" })).toBeInTheDocument();
  });

  it.each([
    ["family-report", "report_family_deep", "가족 심층 리포트"],
    ["decade-report", "report_decade_deep", "대운(10년) 심층 리포트"],
  ] as const)("shows the server price on the %s checkout as a report", async (id, code, name) => {
    serveCatalog(catalog({ [code]: { price: 7300 } }));

    render(<CheckoutScreen productId={id} />);

    await waitFor(() => expect(screen.getAllByText("7,300원")).toHaveLength(2));
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText("한 번 구매하면 보관함에 남아요")).toBeInTheDocument();
  });

  it("warns in development when an active server product has no client mapping", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    serveCatalog([...catalog(), { id: 99, code: "credit_pack_10", name: "상담 이용권 10회", product_type: "credit_pack", price: 17900, version: 1, currency: "KRW", is_active: true, description: null }]);
    await listProducts();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("credit_pack_10"));
  });

  it("shows the server price on the consult-1 detail page", async () => {
    // A price different from the client fixture proves the screen shows the server amount.
    serveCatalog(catalog({ credit_pack_1: { price: 2700 } }));

    render(<LiveProductDetailScreen productId="consult-1" />);

    expect(await screen.findByRole("heading", { name: "상담 이용권 1회" })).toBeInTheDocument();
    expect(screen.getByText("2,700원")).toBeInTheDocument();
    expect(screen.queryByText("2,500원")).not.toBeInTheDocument();
  });

  it("shows the server price on the consult-1 checkout", async () => {
    serveCatalog(catalog({ credit_pack_1: { price: 2700 } }));

    render(<CheckoutScreen productId="consult-1" />);

    await waitFor(() => expect(screen.getAllByText("2,700원")).toHaveLength(2));
    expect(screen.getByText("상담 이용권 1회")).toBeInTheDocument();
    expect(screen.getByText("구매하면 이용권이 바로 지급돼요")).toBeInTheDocument();
  });
});
