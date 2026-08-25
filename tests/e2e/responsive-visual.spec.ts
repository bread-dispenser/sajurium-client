import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile-320", width: 320, height: 720 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

for (const viewport of viewports) {
  test(`${viewport.name} has no horizontal overflow and matches the visual baseline`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/products");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
    await expect(page.locator(".app-frame")).toHaveScreenshot(`products-${viewport.name}.png`);
  });
}

test("tablet and desktop use the side navigation layout", async ({ page }) => {
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".bottom-navigation");
      const content = document.querySelector(".app-content");
      if (!nav || !content) return null;
      const navBounds = nav.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      return { navLeft: navBounds.left, navRight: navBounds.right, contentLeft: contentBounds.left, display: getComputedStyle(nav).display };
    });
    expect(layout).not.toBeNull();
    expect(layout!.navRight).toBeLessThanOrEqual(layout!.contentLeft + 1);
    expect(layout!.display).toBe("flex");
  }
});
