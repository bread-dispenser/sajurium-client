import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SaveScreen } from "@/components/saju-screens";
import { INITIAL_BIRTH } from "@/lib/fixtures";
import type { BirthInfo } from "@/lib/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const JOURNEY_KEY = "sajurium.server-journey.v1";
const DRAFT_KEY = "sajurium-birth-draft";
const REPORT_KEY = "sajurium-saju-report";
const REAL_BIRTH: BirthInfo = { ...INITIAL_BIRTH, displayName: "지민", birthDate: "1995-03-04", birthTime: "09:10", birthplace: "부산" };
const OLD_SENTENCE = "입력 정보는 이 기기 안에만 저장돼요";

function writeDraft(birth: BirthInfo = REAL_BIRTH) {
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, birth }));
}

function storedReport() {
  return JSON.parse(window.localStorage.getItem(REPORT_KEY) ?? "null");
}

function serverReading(kind: "anonymous" | "account" = "anonymous", { draft = true } = {}) {
  if (draft) writeDraft();
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
    writeDraft();
    render(<SaveScreen topicId="career" feedback="helpful" />);

    const card = storageCard();
    expect(within(card).queryByRole("heading", { name: "사주리움 서버" })).not.toBeInTheDocument();
    expect(within(card).getByText(/아직 서버에서 계산한 결과가 없어요/)).toBeInTheDocument();
    expect(within(card).getByText(/서버로는 보내지 않아요/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/서버 기록/);
  });
});

describe("save screen without a real birth record", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(cleanup);

  it("never stores the example birth when a server session has no draft on this device", () => {
    serverReading("anonymous", { draft: false });
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.queryByRole("button", { name: "이 기기에 결과 저장" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "결과는 서버에 저장돼 있어요" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("이미 서버에 저장돼 있어요");
    const card = storageCard();
    expect(within(card).getByRole("heading", { name: "사주리움 서버" })).toBeInTheDocument();
    expect(within(card).getByText(/사본으로 남길 출생 정보가 없어요/)).toBeInTheDocument();
    expect(within(card).queryByText(/저장하면 출생 정보와/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "결과 계속 보기" })).toHaveAttribute("href", "/report");
    expect(document.body.textContent).not.toContain(INITIAL_BIRTH.displayName);
    expect(window.localStorage.getItem(REPORT_KEY)).toBeNull();
    expectNoClearingDeletesServer();
  });

  it("offers no device copy for a signed-in account without a draft either", () => {
    serverReading("account", { draft: false });
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.queryByRole("button", { name: "이 기기에 결과 저장" })).not.toBeInTheDocument();
    expect(within(storageCard()).getByText(/로그인한 계정에 저장돼 있어요/)).toBeInTheDocument();
    expect(window.localStorage.getItem(REPORT_KEY)).toBeNull();
  });

  it("guides to the birth form and writes nothing without a session or a device record", () => {
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.getByRole("heading", { level: 1, name: "저장할 결과가 아직 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "출생 정보 입력하기" })).toHaveAttribute("href", "/birth");
    expect(screen.queryByRole("button", { name: "이 기기에 결과 저장" })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(INITIAL_BIRTH.displayName);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("still saves the real draft with a server session", () => {
    serverReading();
    render(<SaveScreen topicId="career" feedback="helpful" />);
    fireEvent.click(screen.getByRole("button", { name: "이 기기에 결과 저장" }));

    expect(screen.getByRole("heading", { name: "이 기기에 저장했어요" })).toBeInTheDocument();
    expect(storedReport()).toMatchObject({ birth: REAL_BIRTH, topic: "career", feedback: "helpful" });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("still saves the real draft on a device-only reading", () => {
    writeDraft();
    render(<SaveScreen topicId="career" feedback="helpful" />);
    fireEvent.click(screen.getByRole("button", { name: "이 기기에 결과 저장" }));

    expect(screen.getByRole("heading", { name: "이 기기에 저장했어요" })).toBeInTheDocument();
    expect(storedReport()).toMatchObject({ birth: REAL_BIRTH, topic: "career", feedback: "helpful" });
  });

  it("keeps showing a copy saved earlier after the draft is gone", () => {
    serverReading("anonymous", { draft: false });
    window.localStorage.setItem(REPORT_KEY, JSON.stringify({ version: 1, savedAt: "2026-09-01T00:00:00.000Z", birth: REAL_BIRTH, topic: "career", feedback: "helpful" }));
    render(<SaveScreen topicId="career" feedback="helpful" />);

    expect(screen.getByRole("heading", { name: "이 기기에 저장했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 기기에 결과 저장" })).not.toBeInTheDocument();
  });
});
