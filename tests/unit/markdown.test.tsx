import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { Markdown, markdownToPlainText, parseMarkdown } from "@/lib/markdown";
import { LiveConsultationSessionScreen, splitAnswer } from "@/components/consultation-screens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const AUTH_KEY = "sajurium.sasaju-auth.v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderMarkdown(text: string) {
  return render(<div data-testid="md"><Markdown text={text} /></div>).getByTestId("md");
}

describe("markdown renderer", () => {
  afterEach(cleanup);

  it("renders every heading level as an h3 by default, never as h1 or h2", () => {
    const root = renderMarkdown("# 하나\n\n## 둘\n\n###### 여섯 ###");
    const headings = within(root).getAllByRole("heading");
    expect(headings.map((heading) => heading.tagName)).toEqual(["H3", "H3", "H3"]);
    expect(headings.map((heading) => heading.textContent)).toEqual(["하나", "둘", "여섯"]);
    expect(headings[0]).toHaveClass("sj-h3");
    expect(root.textContent).not.toContain("#");
  });

  it("lets the caller choose the heading level for the page outline", () => {
    const root = render(<div data-testid="md"><Markdown text="# 제목" headingLevel={4} /></div>).getByTestId("md");
    expect(within(root).getByRole("heading", { level: 4 })).toHaveTextContent("제목");
  });

  it("renders bold and emphasis with both marker styles, including nesting", () => {
    const root = renderMarkdown("**굵게** 그리고 __밑줄 굵게__, *기울임*과 _강조_ 그리고 **겉 *안쪽* 끝**");
    const strongs = root.querySelectorAll("strong");
    expect([...strongs].map((node) => node.textContent)).toEqual(["굵게", "밑줄 굵게", "겉 안쪽 끝"]);
    const ems = root.querySelectorAll("em");
    expect([...ems].map((node) => node.textContent)).toEqual(["기울임", "강조", "안쪽"]);
    expect(root.textContent).not.toMatch(/[*_]/);
  });

  it("keeps lone asterisks and snake_case words as plain text", () => {
    const root = renderMarkdown("3 * 4 는 12예요. file_name_here 그대로예요.");
    expect(root).toHaveTextContent("3 * 4 는 12예요. file_name_here 그대로예요.");
    expect(root.querySelector("em")).toBeNull();
  });

  it("renders unordered and ordered lists", () => {
    const root = renderMarkdown("- 하나\n* 둘\n+ 셋\n\n3. 셋째\n4. 넷째");
    const ul = root.querySelector("ul")!;
    expect([...ul.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["하나", "둘", "셋"]);
    const ol = root.querySelector("ol")!;
    expect(ol).toHaveAttribute("start", "3");
    expect([...ol.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["셋째", "넷째"]);
  });

  it("renders a rule, splits paragraphs on blank lines and keeps single line breaks", () => {
    const root = renderMarkdown("첫 문단 첫 줄\n첫 문단 둘째 줄\n\n---\n\n둘째 문단");
    const paragraphs = root.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].querySelectorAll("br")).toHaveLength(1);
    expect(root.querySelectorAll("hr")).toHaveLength(1);
    expect(root.textContent).not.toContain("---");
  });

  it("turns quotes into plain paragraphs and inline code into plain text", () => {
    const root = renderMarkdown("> 인용한 문장이에요\n\n`코드` 표시는 빼요");
    expect(root.querySelector("blockquote")).toBeNull();
    expect(root.querySelector("code")).toBeNull();
    expect(root.querySelectorAll("p")[0]).toHaveTextContent("인용한 문장이에요");
    expect(root.querySelectorAll("p")[1]).toHaveTextContent("코드 표시는 빼요");
    expect(root.textContent).not.toMatch(/[>`]/);
  });

  it("keeps link text only and never renders an anchor", () => {
    const root = renderMarkdown("[자세히 보기](https://example.com) 와 [위험](javascript:alert(1)) 그리고 <javascript:alert(2)>");
    expect(root.querySelector("a")).toBeNull();
    expect(root).toHaveTextContent("자세히 보기 와 위험 그리고");
    expect(root.textContent).not.toContain("javascript");
    expect(root.textContent).not.toContain("https://example.com");
  });

  it("never interprets raw HTML, scripts or event handlers", () => {
    const alertSpy = vi.fn();
    (window as unknown as { pwned: () => void }).pwned = alertSpy;
    const root = renderMarkdown("<script>window.pwned()</script>안전한 문장\n\n<img src=x onerror=\"window.pwned()\">이미지 대신 글\n\n<b>굵은 태그</b>와 &lt;b&gt; 표시");
    expect(root.querySelector("script")).toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("b")).toBeNull();
    expect(root.innerHTML).not.toContain("onerror");
    expect(root.textContent).not.toContain("pwned");
    expect(root).toHaveTextContent("안전한 문장");
    expect(root).toHaveTextContent("이미지 대신 글");
    expect(root).toHaveTextContent("굵은 태그와 <b> 표시");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("handles empty and whitespace-only input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
    expect(markdownToPlainText("# \n---\n")).toBe("");
  });
});

describe("markdownToPlainText", () => {
  it("removes syntax but keeps meaning, Korean text and line boundaries", () => {
    const source = "### 오늘의 흐름\n**1. 계약 조건**을 먼저 보세요.\n\n- 서두르지 않기\n- [기록](https://x.y) 남기기\n\n1. 첫째\n2. 둘째\n\n---\n> `메모`는 _짧게_ 써요 <br/>";
    expect(markdownToPlainText(source)).toBe("오늘의 흐름\n1. 계약 조건을 먼저 보세요.\n서두르지 않기\n기록 남기기\n1. 첫째\n2. 둘째\n메모는 짧게 써요");
  });

  it("drops unmatched bold markers instead of showing them", () => {
    expect(markdownToPlainText("**끝나지 않은 강조")).toBe("끝나지 않은 강조");
  });
});

describe("consultation answer split", () => {
  it("uses a heading or the first paragraph as a plain lead", () => {
    const fromHeading = splitAnswer("# 이직 고민\n\n**1. 계약 조건**부터 볼게요.");
    expect(fromHeading.lead).toBe("이직 고민");
    expect(fromHeading.rest).toHaveLength(1);

    const fromParagraph = splitAnswer("**지금은** 준비의 시기예요.\n\n- 하나");
    expect(fromParagraph.lead).toBe("지금은 준비의 시기예요.");
    expect(fromParagraph.rest[0].type).toBe("list");
  });

  it("keeps the first-sentence lead for a single paragraph answer", () => {
    const { lead, rest } = splitAnswer("**지금은** 쉬어 가도 좋아요. 다음 달부터 천천히 움직여 보세요.");
    expect(lead).toBe("지금은 쉬어 가도 좋아요.");
    expect(rest).toEqual([{ type: "paragraph", lines: [[{ type: "text", value: "다음 달부터 천천히 움직여 보세요." }]] }]);
  });

  it("does not invent a lead when the answer starts with a list", () => {
    expect(splitAnswer("- 하나\n- 둘").lead).toBe("");
  });
});

describe("live consultation session", () => {
  const answer = [
    "# 제목",
    "",
    "지금은 방향을 정리하는 시기예요.",
    "",
    "**1. 계약 조건**",
    "",
    "- 연봉보다 *역할*을 먼저 확인해요",
    "- 계약 기간을 확인해요",
    "",
    "---",
    "",
    "<script>window.pwned()</script>[링크](javascript:alert(1))는 글자만 보여요.",
  ].join("\n");
  const longAnswer = Array.from({ length: 40 }, (_, index) => `## 문단 ${index + 1}\n\n${"아주 긴 상담 문장이 이어져요. ".repeat(30)}`).join("\n\n");

  function session(messages: { id: number; role: string; content: string }[]) {
    return {
      id: 4,
      user_id: 7,
      profile_id: 101,
      session_title: "이직 고민",
      consultation_type: "career",
      status: "ACTIVE",
      free_consultation_used: true,
      paid_consultation_count: 0,
      created_at: "2026-09-28T06:00:00Z",
      messages: messages.map((message) => ({ ...message, session_id: 4, message_type: "text", created_at: "2026-09-28T06:00:00Z" })),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(AUTH_KEY, JSON.stringify({ kind: "anonymous", accessToken: "jwt", anonymousToken: "anon" }));
  });
  afterEach(cleanup);

  function mockServer(body: unknown) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/consultations/4")) return json(body);
      if (url.endsWith("/api/v1/credits")) return json({ balance: 3 });
      if (url.endsWith("/api/v1/credit-ledger")) return json([]);
      return json({}, 404);
    });
  }

  it("renders a markdown answer without raw symbols and keeps the question separate", async () => {
    const question = "**이직**해도 될까요? # 진짜로요";
    mockServer(session([
      { id: 1, role: "user", content: question },
      { id: 2, role: "assistant", content: answer },
      { id: 3, role: "user", content: "추가 질문이에요" },
      { id: 4, role: "assistant", content: "## 이어서\n\n- **계약서**를 다시 읽어요" },
    ]));
    render(<LiveConsultationSessionScreen sessionId="4" />);

    const answers = await screen.findAllByRole("article", { name: "사주리움의 답변" });
    expect(answers).toHaveLength(2);
    const [first, followUp] = answers;

    // 답변: 제목은 굵은 리드가 되고, 나머지 구조는 요소로 보인다.
    expect(first.querySelector(".sj-answer-lead")).toHaveTextContent("제목");
    expect(within(first).getByText("1. 계약 조건").tagName).toBe("STRONG");
    expect(within(first).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["연봉보다 역할을 먼저 확인해요", "계약 기간을 확인해요"]);
    expect(within(first).getByText("역할").tagName).toBe("EM");
    expect(first.querySelector("hr")).not.toBeNull();
    expect(first.querySelector("script")).toBeNull();
    expect([...first.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["문제 신고"]);
    expect(first).toHaveTextContent("링크는 글자만 보여요.");
    for (const article of answers) {
      expect(article.textContent).not.toMatch(/#|\*\*|^-|---|<script|javascript/);
      expect(article.textContent).not.toContain("이직해도 될까요");
      expect(article.textContent).not.toContain("추가 질문이에요");
    }

    // 이어진 답변의 제목은 페이지 h1/h2가 아닌 h3로 보인다.
    expect(followUp.querySelector(".sj-answer-lead")).toHaveTextContent("이어서");
    expect(within(followUp).getByText("계약서").tagName).toBe("STRONG");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "상담 대화" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "상담 대화" })).toBeInTheDocument();

    // 질문은 사용자가 쓴 그대로, 답변과 섞이지 않는다.
    const bubbles = document.querySelectorAll(".sj-bubble-me");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveTextContent(`내 질문: ${question}`);
    expect(bubbles[0].textContent).not.toContain("계약 조건");
    expect(bubbles[0].closest(".sj-answer")).toBeNull();
  });

  it("renders a long answer completely with in-answer headings", async () => {
    mockServer(session([{ id: 1, role: "user", content: "길게 알려 주세요" }, { id: 2, role: "assistant", content: longAnswer }]));
    render(<LiveConsultationSessionScreen sessionId="4" />);

    const article = await screen.findByRole("article", { name: "사주리움의 답변" });
    expect(article.querySelector(".sj-answer-lead")).toHaveTextContent("문단 1");
    expect(within(article).getAllByRole("heading", { level: 3 })).toHaveLength(39);
    expect(article.querySelectorAll("p.sj-body")).toHaveLength(40);
    expect(article.textContent).not.toContain("#");
  });
});
