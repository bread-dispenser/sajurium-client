import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SaveScreen } from "@/components/saju-screens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";
const OLD_SENTENCE = "입력 정보는 이 기기 안에만 저장돼요";

function serverReading(kind: "anonymous" | "account" = "anonymous") {
  window.localStorage.setItem(JOURNEY_KEY, JSON.stringify({ profileId: "11", chartId: "22", reportId: "33" }));
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(kind === "account" ? { kind: "account", accessToken: "jwt", anonymousToken: null } : { kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
}

function storageCard() {
  return screen.getByRole("region", { name: "어디에 저장되나요" });
}

/** Every sentence that mentions clearing must keep the server records out of it. */
function expectNoClearingDeletesServer() {
  const text = document.body.textContent ?? "";
  const sentences = text.split(".").filter((sentence) => /(지우|지워|삭제)/.test(sentence) && /(브라우저|기기)/.test(sentence) && /서버/.test(sentence));
  for (const sentence of sentences) expect(sentence).toMatch(/서버 기록은 지워지지 않아요$/);
}

describe("save screen storage copy", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("drops the device-only claim once the server has computed the chart", () => {
    serverReading();
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.queryByText(OLD_SENTENCE)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("이 기기 안에만");
  });

  it("separates the server record from the browser copy before saving", () => {
    serverReading();
    render(<SaveScreen topicId="career" feedback="helpful" />);

    const card = storageCard();
    expect(within(card).getByRole("heading", { name: "사주리움 서버" })).toBeInTheDocument();
    expect(within(card).getByText(/출생 정보와 계산한 명식, 기본 리포트가 이 익명 세션에 저장돼 있어요/)).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "이 브라우저" })).toBeInTheDocument();
    expect(within(card).getByText(/저장하면 출생 정보와 고른 관심 주제 사본이 남아요/)).toBeInTheDocument();
    expect(within(card).getByText(/가입하면 이 기록을 계정으로 옮겨/)).toBeInTheDocument();
    expect(within(card).getByText(/서버 기록은 지워지지 않아요/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "내 데이터 관리" })).toHaveAttribute("href", "/settings/privacy");
    expectNoClearingDeletesServer();
  });

  it("keeps the same distinction after saving a browser copy", () => {
    serverReading();
    render(<SaveScreen topicId="career" feedback="helpful" />);
    fireEvent.click(screen.getByRole("button", { name: "이 기기에 결과 저장" }));

    expect(screen.getByRole("heading", { name: "이 기기에 저장했어요" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("서버에 저장된 출생 정보와 계산 결과는 그대로예요");
    const card = storageCard();
    expect(within(card).getByRole("heading", { name: "사주리움 서버" })).toBeInTheDocument();
    expect(within(card).getByText(/고른 관심 주제 사본이 남아 있어요/)).toBeInTheDocument();
    expect(within(card).getByText(/서버 기록은 지워지지 않아요/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(OLD_SENTENCE);
    expectNoClearingDeletesServer();
  });

  it("tells someone who continues without saving that the server record stays", () => {
    serverReading();
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.getByRole("link", { name: "저장하지 않고 계속 보기" })).toHaveAttribute("href", "/report");
    expect(within(storageCard()).getByText(/이 기기에 저장하지 않아도 서버 기록은 남아요/)).toBeInTheDocument();
    expectNoClearingDeletesServer();
  });

  it("names the account instead of the anonymous session when signed in", () => {
    serverReading("account");
    render(<SaveScreen topicId="career" feedback="helpful" />);

    const card = storageCard();
    expect(within(card).getByText(/로그인한 계정에 저장돼 있어요/)).toBeInTheDocument();
    expect(within(card).queryByText(/익명 세션/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/가입하면/)).not.toBeInTheDocument();
    expect(within(card).getByText(/서버 기록은 지워지지 않아요/)).toBeInTheDocument();
  });

  it("says the copy stays on this browser when no server reading exists", () => {
    render(<SaveScreen topicId="career" feedback="helpful" />);

    const card = storageCard();
    expect(within(card).queryByRole("heading", { name: "사주리움 서버" })).not.toBeInTheDocument();
    expect(within(card).getByText(/아직 서버에서 계산한 결과가 없어요/)).toBeInTheDocument();
    expect(within(card).getByText(/서버로는 보내지 않아요/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/서버 기록/);
  });
});
