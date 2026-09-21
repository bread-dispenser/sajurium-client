import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

test("a consultation topic query overrides the draft topic and preserves draft text", async ({ page }) => {
  await page.goto("/consult/new");
  await page.getByRole("button", { name: /연애 · 관계/ }).click();
  await page.locator("#consult-question").fill("질문 텍스트를 보존해요");
  await page.locator("#consult-situation").fill("상황 텍스트도 보존해요");

  await page.goto("/consult/new?topic=money");
  await expect(page.locator(".signal-topic-option[aria-pressed='true']")).toContainText("재물");
  await expect(page.locator("#consult-question")).toHaveValue("질문 텍스트를 보존해요");
  await expect(page.locator("#consult-situation")).toHaveValue("상황 텍스트도 보존해요");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sajurium-consultations") ?? "null").draft)).toMatchObject({
    topic: "love",
    question: "질문 텍스트를 보존해요",
    situation: "상황 텍스트도 보존해요",
  });
});

test("restricted consultation taxonomy gives guidance, preserves the draft, and does not spend credits", async ({ page }) => {
  const restrictedQuestions = [
    "사망 시기를 알려줘",
    "암 진단과 수명을 알려줘",
    "임신 여부를 확정해줘",
    "범죄 재판 결과를 확정해줘",
    "주식 투자 수익을 보장해줘",
    "이번 주 로또 당첨 결과를 알려줘",
    "상대방의 속마음을 알려줘",
    "배우자가 외도하는지 알려줘",
  ];

  for (const question of restrictedQuestions) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/consult/new?topic=career");
    await page.locator("#consult-question").fill(question);
    await page.locator("#consult-situation").fill("이 상황 설명은 제한 제출 뒤에도 남아야 해요.");
    await expect(page.locator(".restricted-guidance")).toContainText("사망·질병 진단·임신 여부·재판 결과·투자 수익·도박 당첨·타인의 속마음·배우자의 외도");
    await page.getByRole("button", { name: "상담 답변 보기" }).click();
    await expect(page.locator(".signal-error")).toContainText("확정적인 답을 제공하지 않아요");

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sajurium-consultations") ?? "null"));
    expect(stored).toMatchObject({
      draft: { topic: "career", question, situation: "이 상황 설명은 제한 제출 뒤에도 남아야 해요." },
      freeUsesRemaining: 1,
      sessions: [],
    });
    expect(await page.evaluate(() => localStorage.getItem("sajurium-commerce"))).toBeNull();
  }
});

test("birth, people, and settings forms reject future dates with the shared bounds", async ({ page }) => {
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  });

  await page.goto("/birth");
  await page.getByLabel("이름 또는 닉네임").fill("미래 테스트");
  await page.getByLabel("출생지").fill("서울");
  await page.getByLabel("생년월일").fill(tomorrow);
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.locator("#birth-error")).toContainText("1900년 이후");

  await page.goto("/people/new");
  await page.getByLabel("이름 또는 별칭").fill("미래 인물");
  await page.getByLabel("생년월일").fill(tomorrow);
  await page.getByRole("button", { name: "인물 저장" }).click();
  await expect(page.locator(".signal-error")).toContainText("1900년 이후");

  await page.goto("/settings");
  await page.getByLabel("생년월일").fill(tomorrow);
  await page.getByRole("button", { name: "출생 정보 저장" }).click();
  await expect(page.getByRole("status")).toContainText("실제 존재하는 생년월일");
});

test("live compatibility state and consultation rows fit within 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/compatibility");
  await expect(page.getByRole("heading", { name: "서버 명식으로 궁합 보기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.goto("/consult");
  await expect(page.getByRole("heading", { name: /마음에 걸리는 일을/ })).toBeVisible();
  const consultationRows = await page.locator(".signal-topic-row").evaluateAll((rows) => rows.map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { columns: style.gridTemplateColumns.trim().split(/\s+/), right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  }));
  expect(consultationRows).not.toHaveLength(0);
  consultationRows.forEach((row) => {
    expect(row.columns).toHaveLength(2);
    expect(row.right).toBeLessThanOrEqual(row.viewport + 1);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  });
});

test("monthly server flow entry remains readable without mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/flow/month");
  await expect(page.getByRole("heading", { name: "흐름을 준비할 수 없어요" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("storage and account deletion copy separates device and server data", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("이 브라우저 저장", { exact: true })).toBeVisible();
  await expect(page.getByText("영구 보관", { exact: true })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByText(/서버 계정 삭제 요청과 이 브라우저의 기기 기록 삭제는 서로 다른 작업/)).toBeVisible();
  await expect(page.getByRole("link", { name: "계정과 데이터 관리" })).toHaveAttribute("href", "/account");
  await expect(page.getByText(/이 프로토타입에서는 계정 삭제를 처리하지 않아요/)).toHaveCount(0);
});

test("server product detail preserves its checkout route", async ({ page }) => {
  await page.goto("/products/compatibility-report");
  const checkoutLink = page.getByRole("link", { name: "서버 주문으로" });
  await expect(checkoutLink).toHaveAttribute("href", "/checkout/compatibility-report");
  await checkoutLink.click();
  await expect(page).toHaveURL("/checkout/compatibility-report");
});

test("exact birth date, time, and place stay out of privacy-safe previews", async ({ page }) => {
  for (const path of ["/people", "/compatibility", "/settings", "/products/love-report"]) {
    await page.goto(path);
    const visibleText = await page.locator("body").innerText();
    expect(visibleText, path).not.toContain("1992-06-18");
    expect(visibleText, path).not.toContain("1992. 06. 18.");
    expect(visibleText, path).not.toContain("14:30");
    expect(visibleText, path).not.toContain("서울");
  }
});

test("main journey CTAs remain scrollable and clickable above the mobile bottom navigation", async ({ page }) => {
  const journeys = [
    { path: "/", selector: "button[aria-label='생년월일 입력하기 · 내 흐름 살펴보기']", expected: /\/birth$/ },
    { path: "/birth", selector: "button[type='submit']", expected: /\/report$/ },
    { path: "/home", selector: ".signal-atlas-consultation-cta a", expected: /\/consult\/new$/ },
    { path: "/consult", selector: "main.signal-consultation-home > a.signal-primary-action", expected: /\/consult\/new$/ },
    { path: "/products/love-report", selector: ".signal-atlas-commerce-detail > a.signal-primary-cta", expected: /\/checkout\/love-report$/ },
  ];

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const journey of journeys) {
      await page.goto(journey.path);
      const cta = page.locator(journey.selector).first();
      await expect(cta, `${journey.path} at ${width}px`).toBeVisible();
      await cta.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
      const geometry = await cta.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(centerX, centerY);
        const bottomNavigation = document.querySelector(".bottom-navigation")?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          centerHit: hit === element || Boolean(hit && element.contains(hit)),
          centerCoveredByNavigation: Boolean(bottomNavigation && centerY >= bottomNavigation.top && centerY <= bottomNavigation.bottom),
        };
      });
      expect(geometry.width, `${journey.path} CTA width at ${width}px`).toBeGreaterThan(0);
      expect(geometry.height, `${journey.path} CTA height at ${width}px`).toBeGreaterThan(0);
      expect(geometry.centerHit, `${journey.path} CTA hit target at ${width}px`).toBe(true);
      expect(geometry.centerCoveredByNavigation, `${journey.path} CTA covered at ${width}px`).toBe(false);

      if (journey.path === "/birth") {
        await page.getByLabel("이름 또는 닉네임").fill("서연");
        await page.getByLabel("생년월일").fill("1992-06-18");
        await page.getByLabel("출생지").fill("서울");
      }
      await cta.click();
      await expect(page).toHaveURL(journey.expected, { timeout: 5_000 });
    }
  }
});

test("keyboard focus keeps the home consultation CTA above the mobile navigation", async ({ page }) => {
  await page.goto("/birth");
  await page.getByLabel("이름 또는 닉네임").fill("키보드 확인");
  await page.getByLabel("생년월일").fill("1992-06-18");
  await page.getByLabel("출생지").fill("서울");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/\/report$/);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.goto("/home");

    const consultationCta = page.locator(".signal-atlas-consultation-cta a");
    await consultationCta.focus();

    const geometry = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      const navigation = document.querySelector<HTMLElement>(".bottom-navigation");
      const focusedBounds = focused?.getBoundingClientRect();
      const navigationBounds = navigation?.getBoundingClientRect();
      const style = focused ? getComputedStyle(focused) : null;
      return {
        href: focused?.getAttribute("href"),
        focusedBottom: focusedBounds?.bottom ?? Number.POSITIVE_INFINITY,
        navigationTop: navigationBounds?.top ?? Number.NEGATIVE_INFINITY,
        outlineStyle: style?.outlineStyle,
        outlineWidth: style?.outlineWidth,
      };
    });

    expect(geometry.href, `focused CTA href at ${width}px`).toBe("/consult/new");
    expect(geometry.focusedBottom, `focused CTA visibility at ${width}px`).toBeLessThanOrEqual(geometry.navigationTop);
    expect(geometry.outlineStyle, `focused CTA outline at ${width}px`).toBe("solid");
    expect(geometry.outlineWidth, `focused CTA outline width at ${width}px`).toBe("2px");
  }
});
