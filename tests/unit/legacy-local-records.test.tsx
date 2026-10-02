import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CompatibilityResultScreen, PersonFormScreen } from "@/components/people-compatibility-screens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const LOCAL_RESULT = {
  version: 1,
  results: [{
    id: "compat-0198f7a0-1234-7000-8000-123456789abc",
    relationshipType: "dating",
    personA: { profileId: "person-a", displayName: "서연", maskedBirthYear: "19**", birthTimeUnknown: false, chartSnapshotId: "chart-0198f7a0-1234-7000-8000-123456789abc" },
    personB: { profileId: "person-b", displayName: "지우", maskedBirthYear: "19**", birthTimeUnknown: true, chartSnapshotId: "chart-0198f7a0-1234-7000-8000-abcdef123456" },
    summary: "서로의 속도를 확인하는 관계예요.",
    strengths: ["서로 다른 관점을 나눌 수 있어요.", "생활 리듬을 존중할 수 있어요."],
    cautions: ["기대를 말로 확인해야 해요."],
    provenance: {
      chartSnapshotId: "chart-0198f7a0-1234-7000-8000-fedcba654321",
      interpretationVersion: "compatibility-fixture-1",
      modelVersion: null,
      promptVersion: null,
      templateVersion: "compatibility-free-1",
      generatedAt: "2026-08-25T00:00:00.000Z",
    },
    createdAt: "2026-08-25T00:00:00.000Z",
    dimensions: [
      "emotional-expression", "communication-style", "intimacy", "lifestyle-rhythm",
      "conflict-style", "values-goals", "long-term", "mutual-influence",
    ].map((id) => ({ id, title: id, summary: `${id} 요약` })),
    fixtureVersion: 1,
    fixture: true,
  }],
};

describe("records an older version left on this device", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });
  afterEach(cleanup);

  it("labels a locally stored compatibility result as device-only", async () => {
    window.localStorage.setItem("sajurium-compatibility", JSON.stringify(LOCAL_RESULT));
    render(<CompatibilityResultScreen resultId="compat-0198f7a0-1234-7000-8000-123456789abc" />);

    expect(await screen.findByRole("heading", { name: "서로의 속도를 확인하는 관계예요." })).toBeInTheDocument();
    expect(screen.getByText(/예전 버전에서 이 브라우저에만 저장한 궁합 결과예요/)).toBeInTheDocument();
  });

  it("does not block adding a person on a corrupt local people record", () => {
    window.localStorage.setItem("sajurium-people", "{not json");
    render(<PersonFormScreen />);

    expect(screen.queryByText("이 기기의 사람 정보를 읽을 수 없어요")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/이름/)).toBeInTheDocument();
  });
});
