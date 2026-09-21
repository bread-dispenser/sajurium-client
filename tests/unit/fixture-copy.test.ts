import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("service calculation provenance", () => {
  it("labels the live calculation path and its limits", () => {
    const runtime = readFileSync("src/components/saju-screens.tsx", "utf8");
    const compatibility = readFileSync("src/components/people-compatibility-screens.tsx", "utf8");
    const surfaces = `${runtime}\n${compatibility}`;
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
    expect(runtime).toContain("명식과 오행 계산");
    expect(runtime).toContain("버전이 기록된 계산 스냅샷");
    expect(runtime).toContain("출생 시간에 의존하는 시주와 대운 해석은 결과에서 제외했어요");
  });
});
