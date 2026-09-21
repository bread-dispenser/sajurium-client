import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile-320", width: 320, height: 720 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
];

for (const viewport of viewports) {
  test(`${viewport.name} has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/products");
    await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
  });

  test(`${viewport.name} matches the macOS visual baseline`, async ({ page }) => {
    test.skip(process.platform !== "darwin", "The committed visual baselines are captured on macOS.");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/products");
    await expect(page.locator(".app-frame")).toHaveScreenshot(`products-${viewport.name}.png`);
  });
}

test("primary Signal Atlas screens stay within every supported viewport", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of [
      "/",
      "/birth",
      "/home",
      "/flow/today",
      "/flow/month",
      "/login",
      "/consult",
      "/compatibility",
      "/products",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveJSProperty("scrollWidth", viewport.width);
      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .some((element) => element.getBoundingClientRect().right > window.innerWidth + 1),
      );
      expect(overflow, `${route} overflows at ${viewport.name}`).toBe(false);
    }
  }
});

test("tablet and desktop use the side navigation layout", async ({ page }) => {
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".platform-navigation");
      const content = document.querySelector(".app-content");
      if (!nav || !content) return null;
      const navBounds = nav.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      return { navRight: navBounds.right, contentLeft: contentBounds.left, display: getComputedStyle(nav).display };
    });
    expect(layout).not.toBeNull();
    expect(layout!.navRight).toBeLessThanOrEqual(layout!.contentLeft + 1);
    expect(layout!.display).toBe("flex");
  }
});

test("common Signal Atlas shell styles remain explicit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  const mobileShell = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".signal-atlas-mobile-navigation");
    return nav && {
      width: getComputedStyle(nav).width,
      borderRadius: getComputedStyle(nav).borderRadius,
      borderTopWidth: getComputedStyle(nav).borderTopWidth,
      linkCount: nav.querySelectorAll("a").length,
    };
  });
  expect(mobileShell).toEqual({ width: "390px", borderRadius: "0px", borderTopWidth: "1px", linkCount: 5 });

  await page.locator(".signal-atlas-content a").first().focus();
  const focusRing = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as HTMLElement);
    return { outlineColor: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset };
  });
  expect(focusRing).toEqual({ outlineColor: "rgb(162, 38, 85)", outlineStyle: "solid", outlineWidth: "2px", outlineOffset: "3px" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/home");
  const desktopShell = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(".signal-atlas-route-navigation");
    const active = document.querySelector<HTMLElement>(".signal-atlas-route-link.active");
    const wordmark = document.querySelector<HTMLElement>(".signal-atlas-wordmark > span");
    return {
      sidebar: nav && { maxHeight: getComputedStyle(nav).maxHeight, overflowY: getComputedStyle(nav).overflowY },
      active: active && { background: getComputedStyle(active).backgroundColor, color: getComputedStyle(active).color, fontWeight: getComputedStyle(active).fontWeight },
      wordmarkFontSize: wordmark && getComputedStyle(wordmark).fontSize,
    };
  });
  expect(desktopShell.sidebar).toEqual({ maxHeight: "792px", overflowY: "auto" });
  expect({ active: desktopShell.active, wordmarkFontSize: desktopShell.wordmarkFontSize }).toEqual({
    active: { background: "rgb(236, 239, 243)", color: "rgb(162, 38, 85)", fontWeight: "700" },
    wordmarkFontSize: "18px",
  });

  await page.goto("/login");
  const authShell = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".signal-atlas-auth-frame");
    const cta = document.querySelector<HTMLElement>(".signal-primary-cta, .signal-primary-action, .primary-button");
    return {
      frame: frame && { width: getComputedStyle(frame).width, paddingBottom: getComputedStyle(frame).paddingBottom },
      mobileNavigation: Boolean(document.querySelector(".signal-atlas-mobile-navigation")),
      platformNavigation: Boolean(document.querySelector(".signal-atlas-route-navigation")),
      ctaAfterDisplay: cta && getComputedStyle(cta, "::after").display,
    };
  });
  expect(authShell).toEqual({
    frame: { width: "430px", paddingBottom: "0px" },
    mobileNavigation: false,
    platformNavigation: false,
    ctaAfterDisplay: "none",
  });
});
