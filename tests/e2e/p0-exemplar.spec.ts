import { expect, test } from "@playwright/test";
import { getDailyFlow } from "../../src/lib/fixtures";

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 390, 768, 1280]) {
    test(`P0 ${colorScheme} ${width}: reading, controls and enlarged text remain accessible`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      for (const route of ["/", "/birth"]) {
        await page.goto(route);
        if (route === "/") {
          await expect(page.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}/);
          const date = await page.locator("time").getAttribute("datetime");
          const flow = getDailyFlow(date!);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(flow.headline);
          await expect(page.locator("dl")).toContainText(flow.caution);
          await expect(page.locator(".preview-question")).toContainText(flow.suggestedQuestion);
          await expect(page.locator(".today-preview-note")).toHaveText(flow.summary);
          const cta = page.getByRole("button", { name: /생년월일 입력하기/ });
          await expect(cta).toHaveCount(1);
          expect((await cta.boundingBox())!.y + (await cta.boundingBox())!.height).toBeLessThanOrEqual(width === 320 ? 568 : 900);
          await expect(page.getByRole("button", { name: "이 기기에 저장한 결과 이어보기" })).toHaveCount(0);
        } else {
          const date = await page.locator("#birth-date").boundingBox();
          const time = await page.locator("#birth-time").boundingBox();
          expect(time!.y).toBeGreaterThanOrEqual(date!.y + date!.height);
          expect(time!.width).toBeCloseTo(date!.width, 0);
          await page.locator("#nickname").focus();
          expect(await page.locator("#nickname").evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
        }
        await page.screenshot({ path: testInfo.outputPath(`${route === "/" ? "home" : "birth"}.png`), fullPage: true });
        for (const size of ["100%", "200%"]) {
          await page.evaluate(size => { document.documentElement.style.fontSize = size; }, size);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
          const clipped = await page.locator(".p0-scope :is(button, label, summary, h1, p)").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
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
  await expect(page.locator("#birth-error")).toHaveText("이름 또는 닉네임을 입력해 주세요.");
  await page.locator("#nickname").fill("긴이름을확인하는사용자이십글자");
  await page.locator("#birth-date").fill("1992-06-18");
  await page.locator("#birthplace").fill("서울");
  await page.getByRole("radio", { name: "음력", exact: true }).click();
  await page.getByLabel("음력 윤달", { exact: true }).check();
  await page.getByLabel("출생 시간을 몰라요").check();
  await expect(page.locator("#birth-time")).toBeDisabled();
  await page.getByText("계산에 필요한 추가 정보", { exact: true }).click();
  await page.getByLabel("프로필 유형").selectOption("other");
  await page.getByLabel("정보 주체의 동의를 확인했어요").check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("heading", { name: /차분히 준비하고 있어요/ })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeVisible();
  await page.getByRole("button", { name: "입력 정보 확인" }).click();
  await expect(page.locator("#nickname")).toHaveValue("긴이름을확인하는사용자이십글자");
  expect(await page.locator("#birth-title").evaluate(el => getComputedStyle(el.parentElement!).animationName)).toBe("none");
  await page.getByRole("radio", { name: "양력", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/, { timeout: 5000 });
});

test("reduced motion removes entry and active translation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of ["/", "/birth"]) {
    await page.goto(route);
    const action = page.locator(".p0-scope .primary-button");
    await action.focus();
    await page.keyboard.down("Space");
    expect(await action.evaluate(el => getComputedStyle(el).transform)).toBe("none");
    expect(await page.locator(".p0-scope").evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await action.blur();
    await page.keyboard.up("Space");
  }
});
test("server landing keeps disclosure and action visible before fixture hydration", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오늘의 예시를 준비하고 있어요");
  await expect(page.getByText(/실제 사주 계산이 아닌 체험용 예시예요/)).toBeVisible();
  await expect(page.getByRole("button", { name: /생년월일 입력하기/ })).toBeVisible();
  await context.close();
});

test("all fixture headlines and doubled text retain the reading flow", async ({ page }) => {
  const headlines = [...new Set(Array.from({ length: 31 }, (_, i) => getDailyFlow(`2026-09-${String(i + 1).padStart(2, "0")}`).headline))];
  expect(headlines).toHaveLength(4);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}/);
    for (const headline of [...headlines, headlines.join(" ")]) {
      await page.locator("h1").evaluate((el, text) => { el.textContent = text; }, headline);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const heading = await page.locator("h1").boundingBox();
      const action = await page.locator(".primary-button").boundingBox();
      expect(action!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    }
  }
});
