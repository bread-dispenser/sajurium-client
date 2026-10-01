import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveProductDetailScreen, ProductListScreen } from "@/components/commerce-screens";
import { ConnectionErrorState, CorruptState } from "@/components/page-state";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const STORAGE_COPY = /저장소 접근이 차단/;
const CONNECTION_COPY = "연결 상태를 확인한 뒤 다시 시도해 주세요.";

function json(body: unknown, status = 200, requestId = "req_server") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
  });
}

const CAREER = {
  id: 2,
  code: "report_career_deep",
  name: "커리어 심층 리포트",
  description: "일과 커리어 흐름",
  product_type: "report",
  price: 4900,
  currency: "KRW",
  version: 1,
  is_active: true,
};

function isProducts(url: string) {
  return url.includes("/api/v1/products");
}

describe("catalog load failures are connection failures, not storage failures", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt_live", anonymousToken: "anon_live" }));
  });
  afterEach(cleanup);

  it("shows connection copy on the product list when the catalog request fails, and retry refetches", async () => {
    let productCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isProducts(url)) {
        productCalls += 1;
        if (productCalls === 1) throw new TypeError("Failed to fetch");
        return json([CAREER]);
      }
      return json({ balance: { balance: 0 }, ledger: { items: [] } });
    });

    render(<ProductListScreen />);

    expect(await screen.findByRole("heading", { name: "상품 정보를 불러오지 못했어요" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(CONNECTION_COPY);
    expect(screen.queryByText(STORAGE_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 확인하기" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByText("커리어 심층 리포트")).toBeInTheDocument();
    expect(productCalls).toBe(2);
  });

  it("shows the server message and reference id on the product detail, and retry refetches", async () => {
    let productCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (isProducts(url)) {
        productCalls += 1;
        if (productCalls === 1) {
          return json({ code: "INTERNAL_ERROR", message: "서버에서 문제가 발생했어요.", request_id: "req_catalog500", retryable: true }, 500, "req_catalog500");
        }
        return json([CAREER]);
      }
      return json({});
    });

    render(<LiveProductDetailScreen productId="career-report" />);

    expect(await screen.findByRole("heading", { name: "상품을 불러오지 못했어요" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("서버에서 문제가 발생했어요.");
    expect(alert).toHaveTextContent("req_catalog500");
    expect(screen.queryByText(STORAGE_COPY)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));

    expect(await screen.findByRole("heading", { name: "커리어 심층 리포트" })).toBeInTheDocument();
    expect(productCalls).toBe(2);
  });

  it("shows connection copy on the product detail when the network is down", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    render(<LiveProductDetailScreen productId="career-report" />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(CONNECTION_COPY));
    expect(screen.queryByText(STORAGE_COPY)).not.toBeInTheDocument();
  });
});

describe("page state components", () => {
  afterEach(cleanup);

  it("ConnectionErrorState shows its own copy and calls retry", () => {
    const retry = vi.fn();
    render(<ConnectionErrorState title="불러오지 못했어요" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent(CONNECTION_COPY);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("CorruptState still shows storage copy when browser storage is unavailable", () => {
    render(<CorruptState title="읽을 수 없음" description="손상됨" unavailable onReset={() => true} />);
    expect(screen.getByText(STORAGE_COPY)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 확인하기" })).toBeInTheDocument();
  });
});
