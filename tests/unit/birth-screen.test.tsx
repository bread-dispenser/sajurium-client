import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { BirthScreen } from "@/components/saju-screens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" },
  });
}

function fillBirth() {
  fireEvent.change(screen.getByLabelText("부를 이름"), { target: { value: "서연" } });
  fireEvent.change(screen.getByLabelText("태어난 해"), { target: { value: "1992" } });
  fireEvent.change(screen.getByLabelText("태어난 달"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("태어난 날"), { target: { value: "18" } });
  fireEvent.click(screen.getByRole("button", { name: /^미시/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.change(screen.getByLabelText("출생지"), { target: { value: "서울" } });
  fireEvent.click(screen.getByRole("button", { name: "명식 계산하기" }));
}

describe("birth calculation failure surface", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("renders the ApiRequestError support reference in the failure alert", async () => {
    const responses = [
      json({ access_token: "jwt_1", token_type: "bearer", anonymous_token: "anon_1" }, 201),
      json({ code: "REPORT_FAILED", message: "서버에서 명식을 만들지 못했어요.", request_id: "req_birth_500", retryable: true }, 500),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift() ?? json({}, 500));

    render(<BirthScreen />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fillBirth();

    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("서버에서 명식을 만들지 못했어요.");
    expect(alert).toHaveTextContent("문의 시 참조 ID: req_birth_500");
  });

  it("keeps step one validation and maps a 시진 to the backend hour", async () => {
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      if (body) bodies.push(body);
      if (!body || !("birth_year" in body)) return json({ access_token: "jwt_1", token_type: "bearer", anonymous_token: "anon_1" }, 201);
      return json({ code: "REPORT_FAILED", message: "실패", request_id: "req_x", retryable: true }, 500);
    });

    render(<BirthScreen />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert")).toHaveTextContent("부를 이름을 입력해 주세요.");

    fireEvent.change(screen.getByLabelText("부를 이름"), { target: { value: "서연" } });
    fireEvent.change(screen.getByLabelText("태어난 해"), { target: { value: "2999" } });
    fireEvent.change(screen.getByLabelText("태어난 달"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("태어난 날"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1900년 이후");

    fireEvent.change(screen.getByLabelText("태어난 해"), { target: { value: "1992" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert")).toHaveTextContent("태어난 시간을 고르거나");

    fireEvent.click(screen.getByRole("button", { name: "정확한 시각 입력" }));
    fireEvent.change(screen.getByLabelText("태어난 시"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert")).toHaveTextContent("0시부터 23시");

    fireEvent.click(screen.getByRole("button", { name: "시진으로 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: /^자시/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("heading", { name: "이대로 계산할까요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "명식 계산하기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("출생지를 입력해 주세요.");
    fireEvent.change(screen.getByLabelText("출생지"), { target: { value: "서울" } });
    fireEvent.click(screen.getByRole("button", { name: "명식 계산하기" }));

    await screen.findByRole("heading", { name: "결과를 불러오지 못했어요" });
    const profile = bodies.find((body): body is Record<string, unknown> => typeof body === "object" && body !== null && "birth_year" in body);
    expect(profile).toMatchObject({ birth_year: 1992, birth_month: 1, birth_day: 1, birth_time_hour: 23, birth_time_minute: 0, birth_time_unknown: false });
  });
});
