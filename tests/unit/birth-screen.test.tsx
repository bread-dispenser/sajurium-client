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

    render(<BirthScreen initialCalculationFailure={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이름 또는 닉네임"), { target: { value: "서연" } });
    fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "1992-06-18" } });
    fireEvent.change(screen.getByLabelText("출생지"), { target: { value: "서울" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("서버에서 명식을 만들지 못했어요.");
    expect(alert).toHaveTextContent("문의 시 참조 ID: req_birth_500");
  });

  it("keeps the failure screen free of an alert when no request error was recorded", async () => {
    render(<BirthScreen initialCalculationFailure />);
    fireEvent.change(screen.getByLabelText("이름 또는 닉네임"), { target: { value: "서연" } });
    fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "1992-06-18" } });
    fireEvent.change(screen.getByLabelText("출생지"), { target: { value: "서울" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(await screen.findByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
