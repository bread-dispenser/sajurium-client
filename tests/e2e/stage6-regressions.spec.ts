import { expect, test } from "@playwright/test";
import { fillBirthStepOne, submitBirth } from "./birth-helpers";

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
  await page.getByRole("button", { name: "연애", exact: true }).click();
  await page.locator("#consult-question").fill("질문 텍스트를 보존해요");
  await page.locator("#consult-situation").fill("상황 텍스트도 보존해요");

  await page.goto("/consult/new?topic=money");
  await expect(page.locator(".sj-segment[aria-pressed='true']")).toContainText("재물");
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
    await expect(page.locator(".sj-banner-accent")).toContainText("사망·질병 진단·임신 여부·재판 결과·투자 수익·도박 당첨·타인의 속마음·배우자의 외도");
    await page.getByRole("button", { name: "질문 보내기" }).click();
    await expect(page.locator(".sj-error")).toContainText("확정적인 답을 제공하지 않아요");

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

  const [year, month, day] = tomorrow.split("-");

  await page.goto("/birth");
  await fillBirthStepOne(page, { name: "미래 테스트", year, month, day });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("#birth-error")).toContainText("1900년 이후");
  await expect(page.getByLabel("출생지")).toHaveCount(0);

  await page.goto("/people/new");
  await page.getByLabel("이름 또는 별칭").fill("미래 인물");
  await page.getByLabel("태어난 해").fill(year);
  await page.getByLabel("태어난 달").fill(month);
  await page.getByLabel("태어난 날").fill(day);
  await page.getByRole("button", { name: "사람 저장하기" }).click();
  await expect(page.locator(".sj-error")).toContainText("1900년 이후");

  await page.goto("/settings");
  await page.getByRole("button", { name: /출생 정보 수정/ }).click();
  await page.getByLabel("생년월일").fill(tomorrow);
  await page.getByRole("button", { name: "출생 정보 저장" }).click();
  await expect(page.getByRole("status")).toContainText("실제 존재하는 생년월일");
});

test("live compatibility state and consultation entry fit within 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/compatibility");
  await expect(page.getByRole("heading", { name: /만나는 자리를 살펴봐요/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  // 상담 주제 목록 행은 없어졌다. 대신 상담 첫 화면의 이용권 카드와 시작 버튼, 목록 행이 320px 안에 들어가는지 본다.
  await page.goto("/consult");
  await expect(page.getByRole("heading", { name: /마음에 걸리는 일을/ })).toBeVisible();
  await expect(page.locator(".sj-mobile-only a[href='/consult/new']")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const controls = await page.locator("main :is(a, button, li, .sj-card-dark)").evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent?.trim().slice(0, 20), right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    }));
  expect(controls).not.toHaveLength(0);
  controls.forEach((control) => {
    expect(control.right, control.text).toBeLessThanOrEqual(control.viewport + 1);
    expect(control.scrollWidth, control.text).toBeLessThanOrEqual(control.clientWidth + 1);
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
  await expect(page.getByText("영구 보관", { exact: true })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByText(/서버 계정 삭제 요청과 이 브라우저의 기기 기록 삭제는 서로 다른 작업/)).toBeVisible();
  await expect(page.getByRole("link", { name: "계정과 데이터 관리" })).toHaveAttribute("href", "/account");
  await expect(page.getByText(/이 프로토타입에서는 계정 삭제를 처리하지 않아요/)).toHaveCount(0);
});

test("server product detail discloses the paused checkout", async ({ page }) => {
  await page.goto("/products/compatibility-report");
  await expect(page.getByRole("status")).toContainText("결제와 주문은 준비 중이에요");
  await expect(page.getByRole("button", { name: /구매하기/ })).toBeDisabled();
  await expect(page.locator("main a[href^='/checkout/']")).toHaveCount(0);
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
    { path: "/", selector: "main a[href='/birth']", expected: /\/birth$/ },
    { path: "/birth", selector: "button[type='submit']", expected: /\/report$/ },
    { path: "/home", selector: "main a[href='/consult/new']", expected: /\/consult\/new$/ },
    { path: "/consult", selector: ".sj-mobile-only a[href='/consult/new']", expected: /\/consult\/new$/ },
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
        const bottomNavigation = document.querySelector(".sj-tabbar")?.getBoundingClientRect();
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
        // 출생 입력은 두 단계다. 1단계 제출 버튼을 누른 뒤 2단계 제출 버튼도 같은 조건으로 눌러 본다.
        await fillBirthStepOne(page, { name: "서연" });
        await cta.click();
        await page.getByLabel("출생지").fill("서울");
        await cta.scrollIntoViewIfNeeded();
        await expect(cta).toHaveText("명식 계산하기");
      }
      await cta.click();
      await expect(page).toHaveURL(journey.expected, { timeout: 5_000 });
    }
  }
});

test("keyboard focus keeps the home consultation CTA above the mobile navigation", async ({ page }) => {
  await page.goto("/birth");
  await submitBirth(page, "키보드 확인");
  await expect(page).toHaveURL(/\/report$/, { timeout: 15_000 });

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 720 : 844 });
    await page.goto("/home");

    const consultationCta = page.getByRole("main").getByRole("link", { name: "상담 시작하기" });
    await consultationCta.focus();

    const geometry = await page.evaluate(() => {
      const focused = document.activeElement as HTMLElement | null;
      const navigation = document.querySelector<HTMLElement>(".sj-tabbar");
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
