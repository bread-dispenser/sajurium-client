import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/", "/home", "/report", "/consult", "/compatibility", "/products", "/settings",
  "/login", "/notifications", "/calendar", "/reports/year", "/reports/decade",
  "/admin", "/share", "/life-log", "/account", "/profile", "/billing",
  "/share/links", "/notifications/policy", "/admin/operations", "/admin/analytics",
  "/platform-labs", "/shared/V7m2Q9x4Ka8Nz3Rt",
];

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
  await expect(page.getByRole("link", { name: /사주리움.*라이프 리딩 플랫폼/ })).toBeVisible();
  for (const label of ["플랫폼 홈", "내 사주", "고민 상담", "두 사람의 관계", "통합 보관함", "설정과 개인정보"]) {
    await expect(page.getByRole("navigation", { name: "전체 서비스" }).getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
});
