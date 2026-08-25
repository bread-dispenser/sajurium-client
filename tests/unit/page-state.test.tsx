import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorruptState, EmptyState, LoadingState } from "@/components/page-state";

afterEach(cleanup);

describe("shared page states", () => {
  it("renders a loading state with a live heading", () => {
    render(<LoadingState title="fixture를 준비하고 있어요" />);
    expect(screen.getByRole("heading", { name: "fixture를 준비하고 있어요" })).toBeInTheDocument();
  });

  it("renders an actionable empty state", () => {
    render(<EmptyState title="비어 있어요" description="내용이 없습니다." action={{ href: "/home", label: "홈으로" }} />);
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/home");
  });

  it("keeps corrupt state visible when reset fails", () => {
    const reset = vi.fn(() => false);
    render(<CorruptState title="손상됨" description="초기화가 필요합니다." onReset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "손상 데이터 초기화" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("초기화하지 못했어요");
  });

  it("never offers destructive reset while storage is unavailable", () => {
    const reset = vi.fn(() => true);
    render(<CorruptState title="읽을 수 없음" description="손상됨" unavailable onReset={reset} />);
    expect(screen.getByRole("button", { name: "다시 확인하기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "손상 데이터 초기화" })).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });
});
