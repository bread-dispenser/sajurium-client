import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/home", "/report", "/consult", "/compatibility", "/products", "/settings"];

for (const route of routes) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page })
      .exclude("nextjs-portal")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking).toEqual([]);
  });
}

test("honors reduced motion and exposes visible keyboard focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const motion = await page.evaluate(() => {
    const element = document.querySelector(".primary-button");
    if (!element) return null;
    const style = getComputedStyle(element);
    const seconds = style.transitionDuration.endsWith("ms")
      ? Number.parseFloat(style.transitionDuration) / 1000
      : Number.parseFloat(style.transitionDuration);
    return { transitionSeconds: seconds };
  });
  expect(motion).not.toBeNull();
  expect(motion!.transitionSeconds).toBeLessThanOrEqual(0.001);
});

test("navigation accessible names include their visible labels", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("link", { name: /사주리움.*오늘의 마음을 읽는 시간/ })).toBeVisible();
  for (const label of ["홈", "사주", "상담", "궁합", "보관함"]) {
    await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
});
