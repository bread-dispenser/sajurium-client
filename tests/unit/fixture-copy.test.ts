import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fixed-fixture provenance", () => {
  it("contains no input-derived calculation or accuracy claims", () => {
    const runtime = readFileSync("src/components/saju-screens.tsx", "utf8");
    const compatibility = readFileSync("src/components/people-compatibility-screens.tsx", "utf8");
    const design = readFileSync("../design/saju-mobile-v2.pen", "utf8");
    const surfaces = `${runtime}\n${compatibility}\n${design}`;
    for (const prohibited of [
      "입력 정보 기반 요약",
      "현재 정보 기준",
      "시간 없이 가능한 범위만 안내해요",
      "선택하지 않은 정보는 결과에 포함되지 않아요",
      "시간에 포함되는 해석",
      "일부 정확도가 제한",
      "시주 기반 해석",
      "입력한 정보 안에서 보이는 경향",
    ]) {
      expect(surfaces).not.toContain(prohibited);
    }
    expect(surfaces).toContain("입력값과 관계없이 같은 예시 문장을 보여드려요");
    expect(surfaces).toContain("실제 명식·역법·사주 계산은 하지 않아요");
  });
});
