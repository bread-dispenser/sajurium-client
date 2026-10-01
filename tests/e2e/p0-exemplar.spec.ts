import { expect, test } from "@playwright/test";
import { getDailyFlow } from "../../src/lib/fixtures";

const LANDING_HEADLINE = /태어난 순간을\s*여덟 글자로 펼쳐봅니다/;

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 390, 768, 1280]) {
    test(`P0 ${colorScheme} ${width}: reading, controls and enlarged text remain accessible`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      for (const route of ["/", "/birth"]) {
        await page.goto(route);
        if (route === "/") {
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(LANDING_HEADLINE);
          await expect(page.getByText(/버전이 기록된 명식 계산/)).toBeVisible();
          const cta = page.getByRole("link", { name: "내 명식 계산하기" });
          await expect(cta).toHaveCount(1);
          await expect(cta).toHaveAttribute("href", "/birth");
          await expect(cta).toBeVisible();
          // 새 첫 화면은 CTA 앞에 예시 명식을 둔다. 320x568에서는 첫 화면 아래로 내려가므로 스크롤해서 누를 수 있는지만 본다.
          if (width === 320) {
            await cta.scrollIntoViewIfNeeded();
            await expect(cta).toBeInViewport();
          } else {
            const ctaBox = (await cta.boundingBox())!;
            expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(900);
          }
          await expect(page.getByRole("button", { name: "이 기기에 저장한 결과 이어보기" })).toHaveCount(0);
        } else {
          const date = await page.locator(".sj-date-grid").first().boundingBox();
          const time = await page.getByRole("group", { name: "시진" }).boundingBox();
          expect(time!.y).toBeGreaterThanOrEqual(date!.y + date!.height);
          expect(time!.width).toBeCloseTo(date!.width, 0);
          await page.locator("#nickname").focus();
          expect(await page.locator("#nickname").evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
        }
        await page.screenshot({ path: testInfo.outputPath(`${route === "/" ? "home" : "birth"}.png`), fullPage: true });
        for (const size of ["100%", "200%"]) {
          await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          const clipped = await page.locator(".sj-public :is(button, label, summary, h1, p, a)").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
          expect(clipped).toEqual([]);
        }
      }
    });
  }
}

test("birth preserves validation, conditional fields and failure values without replaying entry", async ({ page }) => {
  await page.goto("/birth?calculation=fail");
  await page.locator("#nickname").fill("");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#birth-error")).toHaveText("부를 이름을 입력해 주세요.");
  await page.locator("#nickname").fill("긴이름을확인하는사용자이십글자");
  await page.getByLabel("태어난 해").fill("1992");
  await page.getByLabel("태어난 달").fill("6");
  await page.getByLabel("태어난 날").fill("18");
  await page.getByRole("button", { name: "음력", exact: true }).click();
  await expect(page.getByRole("button", { name: "음력", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "음력 윤달", exact: true }).click();
  await expect(page.getByRole("button", { name: "음력 윤달", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.").check();
  await expect(page.getByRole("button", { name: /^미시/ })).toBeDisabled();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("출생지").fill("서울");
  await page.getByText("계산에 필요한 추가 정보", { exact: true }).click();
  await page.getByLabel("프로필 유형").selectOption("other");
  await page.getByLabel("정보 주체의 동의를 확인했어요").check();
  await page.getByRole("button", { name: "명식 계산하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /긴이름을확인하는사용자이십글자님의 명식을\s*계산하고 있어요/ })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeVisible();
  await page.getByRole("button", { name: "입력 정보 확인" }).click();
  await expect(page.locator("#birthplace")).toHaveValue("서울");
  await page.getByRole("button", { name: "부를 이름 수정" }).click();
  await expect(page.locator("#nickname")).toHaveValue("긴이름을확인하는사용자이십글자");
  await expect(page.getByLabel("태어난 해")).toHaveValue("1992");
  await expect(page.getByLabel("시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.")).toBeChecked();
  await expect.poll(() => page.locator("#birth-title").evaluate(el => getComputedStyle(el.parentElement!).animationName)).toBe("none");
  await page.getByRole("button", { name: "양력", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "명식 계산하기", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5000 });
});

test("reduced motion removes entry and active translation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/birth"]) {
    await page.goto(route);
    const action = page.locator(".sj-public .sj-button").first();
    await action.focus();
    await page.keyboard.down("Space");
    expect(await action.evaluate(el => getComputedStyle(el).transform)).toBe("none");
    expect(await page.locator(".sj-public").evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await action.blur();
    await page.keyboard.up("Space");
  }
});

test("server landing keeps disclosure and action visible before hydration", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(LANDING_HEADLINE);
  await expect(page.getByText(/버전이 기록된 명식 계산/)).toBeVisible();
  await expect(page.getByRole("link", { name: "내 명식 계산하기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "내 명식 계산하기" })).toHaveAttribute("href", "/birth");
  await context.close();
});

test("long and doubled headlines retain the reading flow", async ({ page }) => {
  // 첫 화면에서 오늘 흐름 미리보기는 사라졌지만, 긴 한국어 문장을 표제에 넣어도 넘침 없이 CTA가 표제 뒤에 오는지는 계속 본다.
  const headlines = [...new Set(Array.from({ length: 31 }, (_, i) => getDailyFlow(`2026-09-${String(i + 1).padStart(2, "0")}`).headline))];
  expect(headlines.length).toBeGreaterThan(0);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(LANDING_HEADLINE);
    for (const headline of [...headlines, headlines.join(" ")]) {
      await page.locator("h1").evaluate((el, text) => { el.textContent = text; }, headline);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const heading = await page.locator("h1").boundingBox();
      const action = await page.getByRole("link", { name: "내 명식 계산하기" }).boundingBox();
      expect(action!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    }
  }
});
