import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const calculation = readFileSync("src/components/saju-screens.tsx", "utf8");
const consultation = readFileSync("src/components/consultation-screens.tsx", "utf8");

describe("network-free anti-slop structural regressions", () => {
  it("keeps descendant surface rules out of page/container class maps", () => {
    expect(css).not.toMatch(/\.consultation-form textarea/);
    expect(css).not.toMatch(/\.person-form input/);
    expect(css).not.toMatch(/\.person-form select/);
    expect(css).not.toMatch(/\.message-list article/);
    expect(css).toContain('[class~="consultation-form"] textarea');
    expect(css).toContain('[class~="person-form"] input');
    expect(css).toContain('[class~="person-form"] select');
    expect(css).toContain('[class~="message-list"] article');
  });

  it("keeps nested-card allowances limited to consultation topic rows", () => {
    expect(calculation.match(/data-slop-allow="nested-cards"/g)).toBeNull();
    expect(consultation.match(/data-slop-allow="nested-cards"/g)).toHaveLength(1);
    expect(consultation).toContain('className="consult-topic-list signal-row-list" data-slop-allow="nested-cards"');
  });
});
