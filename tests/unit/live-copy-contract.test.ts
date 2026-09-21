import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
}

describe("live-route copy contract", () => {
  it("does not describe implemented account and server flows as nonexistent", () => {
    const settings = source("src/components/settings-screens.tsx");
    const saju = source("src/components/saju-screens.tsx");
    const layout = source("src/app/layout.tsx");

    for (const staleClaim of [
      "계정 기능이 없으므로 모든 설정은 현재 브라우저에만 적용됩니다.",
      "현재 계정 기능과 다른 기기 저장이 없어 실제 계정 삭제는 제공되지 않습니다.",
      "이 프로토타입에서는 계정 삭제를 처리하지 않아요.",
      "실제 사주 계산·상담·결제·상품 지급을 제공하지 않습니다.",
    ]) {
      expect(settings).not.toContain(staleClaim);
    }

    for (const staleClaim of [
      "계정 로그인 기능은 아직 준비 중이에요.",
      "계정 로그인과 결제 기능은 제공되지 않아요.",
    ]) {
      expect(saju).not.toContain(staleClaim);
    }

    expect(layout).not.toContain("실제 명식·역법·사주 계산은 하지 않으며");
  });

  it("keeps unsupported payment and social-provider boundaries explicit", () => {
    const settings = source("src/components/settings-screens.tsx");
    const saju = source("src/components/saju-screens.tsx");

    expect(settings).toContain("외부 결제 제공자 승인과 유료 상품 지급은 아직 제공하지 않습니다.");
    expect(saju).toContain("소셜 로그인 · 준비 중");
    expect(saju).toContain("외부 결제 제공자 연결은 아직 준비 중이에요.");
  });
});
