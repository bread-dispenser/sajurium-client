import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/design-system.css", "utf8");
const calculation = readFileSync("src/components/saju-screens.tsx", "utf8");
const consultation = readFileSync("src/components/consultation-screens.tsx", "utf8");

describe("network-free anti-slop structural regressions", () => {
  it("keeps design-system selectors flat instead of reaching into page containers", () => {
    // Each rule targets one component class; no descendant combinators such as `.form input`.
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((chunk) => chunk.split(/[;}]/).at(-1)!.trim())
      .filter((selector) => selector && !selector.startsWith("@") && !/^(from|to|\d+%)$/.test(selector));
    expect(selectors.length).toBeGreaterThan(100);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        expect(part.trim(), selector).not.toMatch(/\.[\w-]+(\[[^\]]*\])?(:[\w-]+(\([^)]*\))?)*\s+[.#\w[]/);
      }
    }
  });

  it("never nests a card inside a card on calculation or consultation screens", () => {
    for (const source of [calculation, consultation]) {
      expect(source.match(/data-slop-allow="nested-cards"/g)).toBeNull();
    }
    // 상담 유형은 카드 목록이 아니라 한 줄 세그먼트로 고른다.
    expect(consultation).toContain('className="sj-segmented"');
    expect(consultation).not.toContain("consult-topic-list");
  });

  it("restores list markers for markdown answer lists after the global list reset", () => {
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = css.match(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`));
      expect(match, selector).not.toBeNull();
      return match![1];
    };
    expect(rule("ul.sj-md-list")).toMatch(/list-style(-type)?:\s*disc/);
    expect(rule("ol.sj-md-list")).toMatch(/list-style(-type)?:\s*decimal/);
    expect(rule(".sj-md-list")).not.toMatch(/list-style(-type)?:\s*none/);
    expect(rule(".sj-md-item")).toMatch(/display:\s*list-item/);
    expect(rule(".sj-md-item::marker")).toMatch(/color:\s*var\(--sj-muted\)/);
  });
});
