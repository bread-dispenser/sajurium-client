import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import NotFound from "@/app/not-found";
import SharedResultPage from "@/app/shared/[token]/page";

const notFound = vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("malformed share links", () => {
  beforeEach(() => {
    notFound.mockClear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 404 }));
  });

  it("shows the Korean share failure state with the 나도 명식 보기 recovery instead of a 404", async () => {
    render(await SharedResultPage({ params: Promise.resolve({ token: "abc" }) }));
    expect(notFound).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "공유 결과를 열 수 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("링크 주소가 잘렸거나 올바르지 않아요");
    expect(screen.getByRole("link", { name: "나도 명식 보기" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "사주리움" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });

  it("treats a truncated token the same way", async () => {
    render(await SharedResultPage({ params: Promise.resolve({ token: "V7m2Q9x4Ka8N" }) }));
    expect(screen.getByRole("heading", { name: "공유 결과를 열 수 없어요" })).toBeInTheDocument();
  });

  it("loads a well-formed token from the server", async () => {
    render(await SharedResultPage({ params: Promise.resolve({ token: "abcdefghijklmnop" }) }));
    expect(screen.getByRole("heading", { name: "공유 결과를 불러오고 있어요" })).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("app-level not found page", () => {
  it("shows Korean copy and a link home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.getByText("주소가 바뀌었거나 잘못 입력됐을 수 있어요. 홈에서 다시 시작해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로 가기" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/could not be found/i)).not.toBeInTheDocument();
  });
});
