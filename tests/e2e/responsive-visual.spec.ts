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
    await expect(page.locator(".sj-shell")).toHaveScreenshot(`products-${viewport.name}.png`);
  });
}

test("primary screens stay within every supported viewport", async ({ page }) => {
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
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: typeof element.className === "string" ? element.className : "",
            right: Math.round(element.getBoundingClientRect().right),
            width: Math.round(element.getBoundingClientRect().width),
          })),
      );
      expect(overflow, `${route} overflows at ${viewport.name}`).toEqual([]);
    }
  }
});

test("mobile and tablet use the bottom tab bar while desktop uses the top menu", async ({ page }) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    const layout = await page.evaluate(() => {
      const tabbar = document.querySelector<HTMLElement>("nav.sj-tabbar");
      const topnav = document.querySelector<HTMLElement>("nav.sj-topnav");
      const topbar = document.querySelector<HTMLElement>(".sj-topbar");
      const content = document.querySelector<HTMLElement>(".sj-content");
      if (!tabbar || !topnav || !topbar || !content) return null;
      const tabBounds = tabbar.getBoundingClientRect();
      return {
        tabbarDisplay: getComputedStyle(tabbar).display,
        tabbarBottom: tabBounds.bottom,
        tabbarHeight: tabBounds.height,
        tabLinks: tabbar.querySelectorAll("a").length,
        topnavDisplay: getComputedStyle(topnav).display,
        topnavInTopbar: topbar.contains(topnav),
        topbarBottom: topbar.getBoundingClientRect().bottom,
        contentTop: content.getBoundingClientRect().top,
        contentPaddingBottom: Number.parseFloat(getComputedStyle(content).paddingBottom),
      };
    });
    expect(layout, `shell at ${width}px`).not.toBeNull();
    if (width < 1024) {
      expect(layout!.tabbarDisplay, `tab bar at ${width}px`).toBe("grid");
      expect(layout!.tabLinks).toBe(5);
      expect(layout!.tabbarBottom).toBeCloseTo(900, 0);
      expect(layout!.topnavDisplay, `top menu at ${width}px`).toBe("none");
      // 스크롤 끝의 콘텐츠가 하단 탭 뒤에 숨지 않도록 탭 높이보다 큰 아래 여백을 둔다.
      expect(layout!.contentPaddingBottom).toBeGreaterThanOrEqual(layout!.tabbarHeight);
    } else {
      expect(layout!.tabbarDisplay, `tab bar at ${width}px`).toBe("none");
      expect(layout!.topnavDisplay, `top menu at ${width}px`).toBe("flex");
      expect(layout!.topnavInTopbar).toBe(true);
      expect(layout!.topbarBottom).toBeLessThanOrEqual(layout!.contentTop + 1);
    }
  }
});

test("common shell styles remain explicit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  const mobileShell = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("nav.sj-tabbar");
    return nav && {
      label: nav.getAttribute("aria-label"),
      position: getComputedStyle(nav).position,
      width: getComputedStyle(nav).width,
      borderRadius: getComputedStyle(nav).borderRadius,
      borderTopWidth: getComputedStyle(nav).borderTopWidth,
      linkCount: nav.querySelectorAll("a").length,
      current: nav.querySelector("a[aria-current='page']")?.textContent,
      currentColor: getComputedStyle(nav.querySelector("a[aria-current='page']")!).color,
    };
  });
  expect(mobileShell).toEqual({ label: "주요 메뉴", position: "fixed", width: "390px", borderRadius: "0px", borderTopWidth: "1px", linkCount: 5, current: "홈", currentColor: "rgb(162, 38, 85)" });

  await page.locator(".sj-content a").first().focus();
  const focusRing = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as HTMLElement);
    return { outlineColor: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset };
  });
  expect(focusRing).toEqual({ outlineColor: "rgb(162, 38, 85)", outlineStyle: "solid", outlineWidth: "2px", outlineOffset: "3px" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/home");
  const desktopShell = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("nav.sj-topnav");
    const active = document.querySelector<HTMLElement>(".sj-topnav-link[aria-current='page']");
    const wordmark = document.querySelector<HTMLElement>(".sj-topbar .sj-wordmark");
    return {
      nav: nav && { label: nav.getAttribute("aria-label"), display: getComputedStyle(nav).display, linkCount: nav.querySelectorAll("a").length },
      active: active && { text: active.textContent, color: getComputedStyle(active).color, fontWeight: getComputedStyle(active).fontWeight, borderBottomColor: getComputedStyle(active).borderBottomColor },
      wordmarkFontSize: wordmark && getComputedStyle(wordmark).fontSize,
    };
  });
  expect(desktopShell).toEqual({
    nav: { label: "주요 메뉴", display: "flex", linkCount: 5 },
    active: { text: "홈", color: "rgb(24, 27, 33)", fontWeight: "700", borderBottomColor: "rgb(162, 38, 85)" },
    wordmarkFontSize: "20px",
  });

  // 서브 화면(로그인)은 모바일에서 하단 탭 없이 뒤로가기와 제목 헤더를 쓴다.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const subShell = await page.evaluate(() => {
    const content = document.querySelector<HTMLElement>(".sj-content");
    return {
      tabbar: Boolean(document.querySelector(".sj-tabbar")),
      title: document.querySelector(".sj-topbar-title")?.textContent,
      back: document.querySelector(".sj-topbar a[aria-label='이전 화면으로 돌아가기']")?.getAttribute("href"),
      content: content && { maxWidth: getComputedStyle(content).maxWidth },
    };
  });
  expect(subShell).toEqual({ tabbar: false, title: "로그인", back: "/", content: { maxWidth: "480px" } });
});
