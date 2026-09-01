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
    await page.getByRole("button", { name: "예시 답변 보기" }).click();
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

test("compatibility summaries and consultation rows keep three columns within 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/compatibility");
  const pairMetrics = await page.locator(".signal-pair-summary").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      columns: style.gridTemplateColumns.trim().split(/\s+/),
      right: rect.right,
      viewport: window.innerWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  expect(pairMetrics.columns).toHaveLength(3);
  expect(pairMetrics.right).toBeLessThanOrEqual(pairMetrics.viewport + 1);
  expect(pairMetrics.scrollWidth).toBeLessThanOrEqual(pairMetrics.clientWidth + 1);

  await page.goto("/consult");
  const consultationRows = await page.locator(".signal-topic-row").evaluateAll((rows) => rows.map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { columns: style.gridTemplateColumns.trim().split(/\s+/), right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  }));
  expect(consultationRows).not.toHaveLength(0);
  consultationRows.forEach((row) => {
    expect(row.columns).toHaveLength(3);
    expect(row.right).toBeLessThanOrEqual(row.viewport + 1);
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  });
});

test("date chips use readable small text and wrap without mobile overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/flow/month");
  const chips = await page.locator(".signal-atlas-date-chip").evaluateAll((elements) => elements.map((element) => {
    const small = element.querySelector("small");
    const rect = element.getBoundingClientRect();
    return {
      fontSize: small ? Number.parseFloat(getComputedStyle(small).fontSize) : 0,
      chipRight: rect.right,
      viewport: window.innerWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      smallScrollWidth: small?.scrollWidth ?? 0,
      smallClientWidth: small?.clientWidth ?? 0,
    };
  }));
  expect(chips).not.toHaveLength(0);
  chips.forEach((chip) => {
    expect(chip.fontSize).toBeGreaterThanOrEqual(11);
    expect(chip.chipRight).toBeLessThanOrEqual(chip.viewport + 1);
    expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth + 1);
    expect(chip.smallScrollWidth).toBeLessThanOrEqual(chip.smallClientWidth + 1);
  });
});

test("storage and account deletion copy describes the actual browser-only prototype", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("이 브라우저 저장", { exact: true })).toBeVisible();
  await expect(page.getByText("영구 보관", { exact: true })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByText(/이 프로토타입에서는 계정 삭제를 처리하지 않아요/)).toBeVisible();
  await expect(page.getByText(/개인정보 삭제에서 별도 진행/)).toHaveCount(0);
});

test("same-person compatibility selections normalize to distinct people", async ({ page }) => {
  await page.goto("/compatibility");
  const firstPerson = page.locator("#compatibility-person-a");
  const secondPerson = page.locator("#compatibility-person-b");
  const secondId = await secondPerson.inputValue();

  await firstPerson.selectOption(secondId);

  await expect(firstPerson).toHaveValue(secondId);
  await expect(secondPerson).not.toHaveValue(secondId);
  expect(await firstPerson.inputValue()).not.toBe(await secondPerson.inputValue());
  const selectedNames = await page.locator(".signal-pair-summary .signal-pair-person strong").allTextContents();
  expect(selectedNames).toHaveLength(2);
  expect(selectedNames[0]).not.toBe(selectedNames[1]);
});

test("generation policy links preserve the product href and same-page hash target", async ({ page }) => {
  await page.goto("/compatibility");
  await page.getByRole("button", { name: "예시 관계 요약 보기" }).click();
  await expect(page).toHaveURL(/\/compatibility\/result\//);

  const policyLink = page.getByRole("link", { name: "리포트 구성 보기" });
  await expect(policyLink).toHaveAttribute("href", "/products/compatibility-report#generation-policy");
  await expect(policyLink).not.toHaveAttribute("target", /.+/);
  await policyLink.click();

  await expect(page).toHaveURL("/products/compatibility-report#generation-policy");
  await expect(page.locator("#generation-policy")).toBeVisible();
  await expect(page.locator("#generation-policy h2")).toHaveText("생성 방식");
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
    { path: "/", selector: ".signal-landing .signal-primary-action", expected: /\/birth$/ },
    { path: "/birth", selector: ".signal-birth-form .signal-primary-action", expected: /\/report$/ },
    { path: "/home", selector: ".signal-atlas-consultation-cta a", expected: /\/consult\/new$/ },
    { path: "/consult", selector: "main.signal-consultation-home > a.signal-primary-action", expected: /\/consult\/new$/ },
    { path: "/compatibility", selector: ".signal-compatibility-form .signal-primary-action", expected: /\/compatibility\/result\// },
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

      await cta.click();
      await expect(page).toHaveURL(journey.expected, { timeout: 5_000 });
    }
  }
});
