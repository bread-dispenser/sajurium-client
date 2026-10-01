import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { LibraryItemView } from "@/lib/contracts";
import { LibraryRowContent } from "@/components/core-screens";
import { markdownPreview, markdownTitle } from "@/lib/markdown";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";
const MARKDOWN_SYMBOLS = /#|\*\*|__|`|\[|\]\(|<\/?[a-z]/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Request-ID": "req_test" } });
}

const REPORT_CONTENT = [
  "### 오늘의 흐름",
  "",
  "**차분하게** 정리하는 날이에요. 새로운 일보다 _마무리_에 힘을 쓰면 좋아요.",
  "",
  "- 오전에는 미뤄 둔 연락을 정리해요",
  "- 오후에는 [기록](https://example.com)을 남겨요",
].join("\n");

const CONSULTATION_ANSWER = [
  "# 이직 고민",
  "",
  "**1. 계약 조건**",
  "",
  "연봉보다 역할과 계약 기간을 먼저 확인해 보세요.",
].join("\n");

const LONG_TITLE = `## ${"아주 긴 상담 제목이 계속 이어져요 ".repeat(12)}`;

function report(overrides: Record<string, unknown>) {
  return {
    id: 303,
    chart_snapshot_id: 202,
    user_id: 7,
    report_type: "basic",
    title: "기본 사주 리포트",
    content: REPORT_CONTENT,
    summary: null,
    content_json: null,
    generation_status: "READY",
    is_free_section: true,
    requires_payment: false,
    purchased: false,
    is_hidden: false,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function consultation(id: number, title: string | null, messages: { role: string; content: string }[]) {
  return {
    id,
    user_id: 7,
    profile_id: 101,
    session_title: title,
    consultation_type: "career",
    status: "ACTIVE",
    free_consultation_used: true,
    paid_consultation_count: 0,
    created_at: `2026-09-0${id}T00:00:00Z`,
    messages: messages.map((message, index) => ({ id: id * 10 + index, session_id: id, message_type: "text", created_at: "2026-09-02T00:00:00Z", ...message })),
  };
}

async function loadLibrary(reports: unknown[], sessions: ReturnType<typeof consultation>[]) {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/v1/reports") return json(reports);
    if (path === "/api/v1/consultations") return json(sessions.map((session) => ({ ...session, messages: undefined })));
    const match = path.match(/^\/api\/v1\/consultations\/(\d+)$/);
    if (match) return json(sessions.find((session) => session.id === Number(match[1])));
    return json({}, 404);
  });
  const { listLibrary } = await import("@/lib/api/service");
  const { items } = await listLibrary();
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

describe("library previews from listLibrary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("builds a plain report preview from content that starts with a heading", async () => {
    const items = await loadLibrary([report({})], []);
    const subtitle = items["report-303"].subtitle;
    expect(subtitle).toBe("오늘의 흐름. 차분하게 정리하는 날이에요. 새로운 일보다 마무리에 힘을 쓰면 좋아요. 오전에는 미뤄 둔 연락을 정리해요. 오후에는 기록을 남겨요");
    expect(subtitle).not.toMatch(MARKDOWN_SYMBOLS);
    expect(Array.from(subtitle).length).toBeLessThanOrEqual(120);
  });

  it("truncates a long report after stripping, within the existing 120 characters", async () => {
    const items = await loadLibrary([report({ content: `### 오늘의 흐름\n\n${"**차분하게** 정리하는 날이에요. ".repeat(20)}` })], []);
    const subtitle = items["report-303"].subtitle;
    expect(subtitle.startsWith("오늘의 흐름. 차분하게 정리하는 날이에요.")).toBe(true);
    expect(subtitle.endsWith("…")).toBe(true);
    expect(Array.from(subtitle).length).toBeLessThanOrEqual(120);
    expect(subtitle).not.toMatch(MARKDOWN_SYMBOLS);
  });

  it("prefers the report summary and strips it too", async () => {
    const items = await loadLibrary([report({ summary: "## 한 줄 요약\n**정리**의 날이에요" })], []);
    expect(items["report-303"].subtitle).toBe("한 줄 요약. 정리의 날이에요");
  });

  it("builds a plain consultation preview from an answer that starts with # and **1.", async () => {
    const items = await loadLibrary([], [consultation(4, "이직 고민", [{ role: "user", content: "이직해도 될까요?" }, { role: "assistant", content: CONSULTATION_ANSWER }])]);
    expect(items["consultation-4"].subtitle).toBe("이직 고민. 1. 계약 조건. 연봉보다 역할과 계약 기간을 먼저 확인해 보세요.");
    expect(items["consultation-4"].title).toBe("이직 고민");
  });

  it("falls back to readable copy when documents are empty or only syntax", async () => {
    const items = await loadLibrary(
      [report({ content: "", summary: "" }), report({ id: 304, content: "###\n---\n**", summary: null })],
      [consultation(5, null, [{ role: "assistant", content: "  \n\n" }]), consultation(6, "", [])],
    );
    expect(items["report-303"].subtitle).toBe("리포트를 열어 내용을 볼 수 있어요.");
    expect(items["report-304"].subtitle).toBe("리포트를 열어 내용을 볼 수 있어요.");
    expect(items["consultation-5"]).toMatchObject({ title: "상담 기록", subtitle: "상담을 이어볼 수 있어요." });
    expect(items["consultation-6"]).toMatchObject({ title: "상담 기록", subtitle: "상담을 이어볼 수 있어요." });
  });

  it("strips and shortens a very long markdown title without touching the stored messages", async () => {
    const session = consultation(7, LONG_TITLE, [{ role: "assistant", content: CONSULTATION_ANSWER }]);
    const items = await loadLibrary([report({ title: `# ${"긴 리포트 제목 ".repeat(30)}` })], [session]);
    for (const title of [items["consultation-7"].title, items["report-303"].title]) {
      expect(title).not.toMatch(MARKDOWN_SYMBOLS);
      expect(Array.from(title).length).toBeLessThanOrEqual(80);
      expect(title.endsWith("…")).toBe(true);
    }
    expect(session.messages[0].content).toBe(CONSULTATION_ANSWER);
    expect(session.session_title).toBe(LONG_TITLE);
  });
});

describe("markdown preview helpers", () => {
  it("truncates after stripping so the cut never lands in syntax", () => {
    const source = `**${"가".repeat(200)}**`;
    const preview = markdownPreview(source, 20);
    expect(preview).toBe(`${"가".repeat(19)}…`);
    expect(preview).not.toContain("*");
  });

  it("keeps a title on one line without adding punctuation", () => {
    expect(markdownTitle("# 이직 고민\n**연봉** 비교")).toBe("이직 고민 연봉 비교");
    expect(markdownTitle("")).toBe("");
  });
});

describe("LibraryRowContent", () => {
  afterEach(cleanup);

  function item(overrides: Partial<LibraryItemView>): LibraryItemView {
    return {
      id: "report-303",
      type: "report",
      title: "기본 사주 리포트",
      subtitle: "",
      href: "/report?reportId=303",
      access: "available",
      purchased: false,
      read: false,
      hidden: false,
      profile: { id: "7", displayName: "내 기록" },
      topic: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      allowedActions: ["open", "delete"],
      ...overrides,
    } as LibraryItemView;
  }

  function renderRow(value: LibraryItemView) {
    const { container } = render(<div><LibraryRowContent item={value} /></div>);
    return {
      title: container.querySelector(".sj-row-title") as HTMLElement,
      sub: container.querySelector(".sj-row-sub") as HTMLElement,
    };
  }

  it("shows a report starting with ### as plain text", () => {
    const { sub } = renderRow(item({ subtitle: REPORT_CONTENT }));
    expect(sub.textContent).toMatch(/^리포트, 오늘의 흐름\. 차분하게 정리하는 날이에요\./);
    expect(sub.textContent).not.toMatch(MARKDOWN_SYMBOLS);
  });

  it("shows a consultation starting with # and **1. as plain text", () => {
    const { title, sub } = renderRow(item({ id: "consultation-4", type: "consultation", title: "# 이직 고민", subtitle: CONSULTATION_ANSWER }));
    expect(title).toHaveTextContent("이직 고민");
    expect(sub).toHaveTextContent("상담, 이직 고민. 1. 계약 조건. 연봉보다 역할과 계약 기간을 먼저 확인해 보세요.");
    expect(`${title.textContent}${sub.textContent}`).not.toMatch(MARKDOWN_SYMBOLS);
  });

  it("shows only the type label when the content is empty", () => {
    const { title, sub } = renderRow(item({ title: "", subtitle: "" }));
    expect(sub.textContent).toBe("리포트");
    expect(title.textContent).toBe("리포트");
  });

  it("clamps a very long title instead of pushing the row wider", () => {
    const { title } = renderRow(item({ title: LONG_TITLE }));
    expect(title).toHaveClass("sj-row-title-clamp");
    expect(title.textContent).not.toContain("#");
    expect(Array.from(title.textContent ?? "").length).toBeLessThanOrEqual(80);
  });
});
