import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("keeps example journeys local and discloses unavailable real services", async ({ page }) => {
  const appOrigin = new URL(page.url()).origin;
  const serviceRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== appOrigin || url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      serviceRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/");
  await expect(page.getByText("이 화면은 실제 사주 계산이 아닌 체험용 예시 콘텐츠를 보여줘요.")).toBeVisible();

  await page.goto("/consult/new");
  await expect(page.getByText("실제 AI 답변 생성이나 유료 이용권 차감은 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?" }).click();
  await page.getByRole("button", { name: "예시 답변 보기" }).click();
  await expect(page).toHaveURL(/\/consult\/session\//);

  await page.goto("/compatibility");
  await expect(page.getByText("실제 궁합 계산이 아닌 미리 준비한 여러 관점의 예시 결과를 보여줍니다.")).toBeVisible();

  await page.goto("/checkout/love-report");
  await expect(page.getByText("· 실제 결제 서비스나 결제 수단에 연결되지 않아요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "실제 결제 · 이용 불가" })).toBeDisabled();
  expect(serviceRequests).toEqual([]);
});

test("persists a fixture consultation and follow-up", async ({ page }) => {
  await page.goto("/checkout/consult-5/status?state=success");
  await page.getByRole("button", { name: "이 상태를 기기에 기록" }).click();
  await page.goto("/consult/new");
  await page.getByRole("button", { name: "이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?" }).click();
  await page.getByLabel("현재 상황").fill("업무 역할과 근무 방식이 고민됩니다.");
  await page.getByRole("button", { name: "예시 답변 보기" }).click();
  await expect(page).toHaveURL(/\/consult\/session\//, { timeout: 5_000 });
  const sessionPath = new URL(page.url()).pathname;
  await expect(page.locator(".message-list article")).toHaveCount(2);
  await expect(page.getByText("사주리움 · 체험용 예시")).toBeVisible();
  await page.locator(".follow-up-suggestions button").first().click();
  await page.getByRole("button", { name: "예시 답변 추가" }).click();
  await expect(page.locator(".message-list article")).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sajurium-commerce") ?? "{}").consultationCredits)).toBe(4);
  await page.getByRole("button", { name: "이 상담 삭제" }).click();
  await page.getByRole("button", { name: "상담 삭제 확정" }).click();
  await expect(page).toHaveURL(/\/consult$/);
  const deletion = await page.evaluate((deletedSessionPath) => ({
    sessions: JSON.parse(localStorage.getItem("sajurium-consultations") ?? "{\"sessions\":[]}").sessions.length,
    links: JSON.parse(localStorage.getItem("sajurium-library") ?? "{\"items\":[]}").items.filter((item: { href: string }) => item.href === deletedSessionPath).length,
  }), sessionPath);
  expect(deletion).toEqual({ sessions: 0, links: 0 });
});

test("blocks restricted consultation questions and restores the draft", async ({ page }) => {
  await page.goto("/consult/new");
  await page.getByRole("textbox", { name: "질문" }).fill("암 진단과 수명을 알려줘");
  await expect(page.getByText("제한되는 질문이에요")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "질문" })).toHaveValue("암 진단과 수명을 알려줘");
  await page.getByRole("button", { name: "예시 답변 보기" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("확정적인 답을 제공하지 않아요");
});

test("creates a local fixture compatibility result", async ({ page }) => {
  await page.goto("/compatibility");
  await page.getByRole("button", { name: "예시 관계 요약 보기" }).click();
  await expect(page).toHaveURL(/\/compatibility\/result\//);
  await expect(page.locator(".compatibility-dimensions article")).toHaveCount(5);
  await expect(page.getByText(/출생 시간 미상 상태/)).toBeVisible();
  await expect(page.getByRole("button", { name: "심층 궁합 · 이용 불가" })).toBeDisabled();
});

test("enforces the two-person limit and keeps compatibility snapshots after deletion", async ({ page }) => {
  await page.goto("/compatibility");
  await page.getByRole("button", { name: "예시 관계 요약 보기" }).click();
  await expect(page).toHaveURL(/\/compatibility\/result\//);
  const resultPath = new URL(page.url()).pathname;
  await page.goto("/people");
  await expect(page.locator(".limit-summary")).toContainText("2 / 2");
  await expect(page.getByRole("link", { name: "새 인물 추가" })).toHaveCount(0);
  await page.locator(".people-list article").filter({ hasText: "민준" }).getByRole("button", { name: "삭제" }).click();
  await page.locator(".people-list article").filter({ hasText: "민준" }).getByRole("button", { name: "인물 삭제 확정" }).click();
  await expect(page.getByRole("link", { name: "새 인물 추가" })).toBeVisible();
  await page.goto(resultPath);
  await expect(page.locator("#compatibility-result-title")).toContainText("서연");
  await expect(page.locator("#compatibility-result-title")).toContainText("민준");

  await page.goto("/people/new");
  await page.getByLabel("이름 또는 별칭").fill("지우");
  await page.getByRole("button", { name: "인물 저장" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("권한이나 동의");
  await page.getByLabel("이 정보를 저장할 권한이나 상대방의 동의를 확인했어요").check();
  await page.getByRole("button", { name: "인물 저장" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.locator(".limit-summary")).toContainText("2 / 2");
});

test("records demo commerce state without enabling real payment", async ({ page }) => {
  await page.goto("/checkout/consult-5");
  await expect(page.getByRole("button", { name: "실제 결제 · 이용 불가" })).toBeDisabled();
  await page.getByRole("link", { name: "성공 상태 보기" }).click();
  await page.getByRole("button", { name: "이 상태를 기기에 기록" }).click();
  await expect(page.getByRole("status")).toContainText("체험 상태");
  await page.getByRole("button", { name: "이 상태를 기기에 기록" }).click();
  await expect(page.getByRole("status")).toContainText("이미 있어 추가 지급하지 않았어요");
  await page.goto("/products/credits");
  await expect(page.getByRole("heading").filter({ hasText: "5회" })).toBeVisible();
  await expect(page.locator(".credit-history article")).toHaveCount(1);
});

test("clears every service-owned local key from settings", async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => localStorage.setItem("sajurium-library", JSON.stringify({ version: 1, items: [] })));
  await page.reload();
  await expect(page.locator(".data-inventory article")).toHaveCount(12);
  await expect(page.getByText("항상 마스킹됩니다")).toBeVisible();
  await page.getByRole("button", { name: "전체 기기 저장 정보 삭제" }).click();
  await page.getByRole("button", { name: "모두 삭제 확정" }).click();
  await expect(page.getByRole("status")).toContainText("모두 삭제");
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("sajurium-")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("sajurium-")),
  }))).toEqual({ local: [], session: [] });
});

test("confirms individual settings and feedback deletion", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("sajurium-profile", JSON.stringify({
      version: 1,
      birth: { nickname: "서연", calendar: "solar", gender: "female", birthDate: "1992-06-18", birthTime: "14:30", unknownTime: false },
    }));
    localStorage.setItem("sajurium-feedback-list", JSON.stringify({
      version: 1,
      entries: [{ id: "feedback-confirm", topic: "career", rating: "helpful", reason: "구체적이고 이해하기 쉬워요", comment: "", reported: false, createdAt: "2026-08-25T00:00:00.000Z" }],
    }));
});

  await page.goto("/settings");
  const profileRow = page.locator(".data-inventory article").filter({ hasText: "저장 프로필" });
  await profileRow.getByRole("button", { name: "삭제" }).click();
  await expect(profileRow.getByRole("button", { name: "삭제 확정" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sajurium-profile"))).not.toBeNull();
  await profileRow.getByRole("button", { name: "취소" }).click();
  expect(await page.evaluate(() => localStorage.getItem("sajurium-profile"))).not.toBeNull();
  await profileRow.getByRole("button", { name: "삭제" }).click();
  await profileRow.getByRole("button", { name: "삭제 확정" }).click();
  expect(await page.evaluate(() => localStorage.getItem("sajurium-profile"))).toBeNull();

  await page.goto("/settings/feedback");
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByRole("button", { name: "피드백 삭제 확정" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sajurium-feedback-list"))).toContain("feedback-confirm");
  await page.getByRole("button", { name: "취소" }).click();
  await page.getByRole("button", { name: "삭제" }).click();
  await page.getByRole("button", { name: "피드백 삭제 확정" }).click();
  await expect(page.getByRole("heading", { name: "저장된 피드백이 없어요" })).toBeVisible();

  await page.goto("/library");
  const libraryItem = page.locator(".library-list article").filter({ hasText: "무료 사주 요약" });
  await libraryItem.getByRole("button", { name: "삭제" }).click();
  await expect(libraryItem.getByRole("button", { name: "보관함 항목 삭제 확정" })).toBeVisible();
  await libraryItem.getByRole("button", { name: "취소" }).click();
  await expect(libraryItem.getByRole("heading", { name: "무료 사주 요약" })).toBeVisible();
  await libraryItem.getByRole("button", { name: "삭제" }).click();
  await libraryItem.getByRole("button", { name: "보관함 항목 삭제 확정" }).click();
  await expect(page.getByRole("heading", { name: "무료 사주 요약" })).toHaveCount(0);
});

test("surfaces corrupt domain stores before explicit recovery", async ({ page }) => {
  const cases = [
    { key: "sajurium-saju-report", route: "/", title: "저장한 리포트를 읽을 수 없어요" },
    { key: "sajurium-profile", route: "/home", title: "출생 정보를 읽을 수 없어요" },
    { key: "sajurium-consultations", route: "/consult", title: "상담 데이터를 읽을 수 없어요" },
    { key: "sajurium-people", route: "/people", title: "사람 데이터를 읽을 수 없어요" },
    { key: "sajurium-compatibility", route: "/compatibility", title: "궁합 데이터를 읽을 수 없어요" },
    { key: "sajurium-library", route: "/library", title: "보관함 데이터를 읽을 수 없어요" },
    { key: "sajurium-commerce", route: "/products", title: "체험 구매 기록을 읽을 수 없어요" },
    { key: "sajurium-settings", route: "/settings", title: "환경설정을 읽을 수 없어요" },
    { key: "sajurium-feedback-list", route: "/settings/feedback", title: "피드백 데이터를 읽을 수 없어요" },
  ];
  for (const entry of cases) {
    await page.evaluate(({ key }) => {
      localStorage.clear();
      localStorage.setItem(key, "{broken");
    }, entry);
    await page.goto(entry.route);
    await expect(page.getByRole("heading", { name: entry.title })).toBeVisible();
    await page.getByRole("button", { name: "손상 데이터 초기화" }).click();
    await expect(page.getByRole("heading", { name: entry.title })).toHaveCount(0);
  }
});

test("recovers a corrupt transaction record before reading settings stores", async ({ page }) => {
  const before = await page.evaluate(() => {
    const settings = JSON.stringify({ version: 1, notifications: { dailyFlow: true, monthlyFlow: false, email: false } });
    localStorage.setItem("sajurium-settings", settings);
    localStorage.setItem("unowned-key", "keep-me");
    localStorage.setItem("sajurium-storage-transaction", JSON.stringify({
      version: 1,
      state: "pending",
      steps: [{
        key: "sajurium-birth-draft",
        scope: "session",
        before: null,
        beforeKnown: true,
        after: JSON.stringify({
          version: 1,
          birth: { nickname: "민감정보", calendar: "solar", gender: "female", birthDate: "1992-06-18", birthTime: "14:30", unknownTime: false },
        }),
        afterKnown: true,
      }],
    }));
    return settings;
  });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "저장 복구 기록을 확인해야 해요" })).toBeVisible();
  await expect(page.locator(".data-inventory")).toHaveCount(0);
  await page.getByRole("button", { name: "손상 데이터 초기화" }).click();
  await expect(page.getByRole("heading", { name: /이 기기에 저장된/ })).toBeVisible();
  expect(await page.evaluate(() => ({
    journal: localStorage.getItem("sajurium-storage-transaction"),
    draft: sessionStorage.getItem("sajurium-birth-draft"),
    settings: localStorage.getItem("sajurium-settings"),
    unowned: localStorage.getItem("unowned-key"),
  }))).toEqual({ journal: null, draft: null, settings: before, unowned: "keep-me" });
});

test("shows pending and failure as non-payment example states", async ({ page }) => {
  await page.goto("/checkout/love-report/status?state=pending");
  await expect(page.getByRole("heading")).toContainText("결제 대기 상태 안내");
  await expect(page.getByText("실제 결제액")).toBeVisible();
  await page.goto("/checkout/love-report/status?state=failure");
  await expect(page.getByRole("heading")).toContainText("결제 실패 상태 안내");
  await expect(page.getByText("결제 수단이나 주문에는 아무 변화가 없습니다.")).toBeVisible();
});

test("rolls back linked consultation writes when library persistence fails", async ({ page }) => {
  await page.goto("/consult/new");
  await page.getByRole("button", { name: "이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?" }).click();
  const before = await page.evaluate(() => ({
    consultation: localStorage.getItem("sajurium-consultations"),
    library: localStorage.getItem("sajurium-library"),
  }));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failLibraryOnce = true;
    Object.defineProperty(window, "__restoreSetItem", { value: () => { Storage.prototype.setItem = original; }, configurable: true });
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "sajurium-library" && failLibraryOnce) {
        failLibraryOnce = false;
        throw new Error("injected library failure");
      }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "예시 답변 보기" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("모든 변경을 취소했어요");
  const state = await page.evaluate(() => {
    (window as typeof window & { __restoreSetItem?: () => void }).__restoreSetItem?.();
    return {
      consultation: localStorage.getItem("sajurium-consultations"),
      library: localStorage.getItem("sajurium-library"),
      journal: localStorage.getItem("sajurium-storage-transaction"),
    };
  });
  expect(state).toEqual({ ...before, journal: null });
});

test("reports partial failure instead of claiming full local deletion", async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => {
    localStorage.setItem("sajurium-profile", JSON.stringify({ version: 1, birth: { nickname: "남김", calendar: "solar", birthDate: "1990-01-01", birthTime: "12:00", unknownTime: false } }));
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, "__restoreRemoveItem", { value: () => { Storage.prototype.removeItem = original; }, configurable: true });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === "sajurium-profile") throw new Error("injected remove failure");
      return original.call(this, key);
    };
  });
  await page.reload();
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, "__restoreRemoveItem", { value: () => { Storage.prototype.removeItem = original; }, configurable: true });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === "sajurium-profile") throw new Error("injected remove failure");
      return original.call(this, key);
    };
  });
  await page.getByRole("button", { name: "전체 기기 저장 정보 삭제" }).click();
  await page.getByRole("button", { name: "모두 삭제 확정" }).click();
  await expect(page.getByRole("status")).toContainText("일부 기기 저장 정보를 삭제하지 못했어요: profile");
  expect(await page.evaluate(() => {
    (window as typeof window & { __restoreRemoveItem?: () => void }).__restoreRemoveItem?.();
    return localStorage.getItem("sajurium-profile");
  })).not.toBeNull();
});

test("disables destructive settings actions for unavailable owned storage", async ({ page }) => {
  const commerce = JSON.stringify({ version: 1, orders: [], consultationCredits: 3, creditHistory: [] });
  const settings = JSON.stringify({ version: 1, notifications: { dailyFlow: false, monthlyFlow: false, email: false } });
  await page.evaluate(({ commerceRaw, settingsRaw }) => {
    localStorage.setItem("sajurium-commerce", commerceRaw);
    localStorage.setItem("sajurium-settings", settingsRaw);
  }, { commerceRaw: commerce, settingsRaw: settings });
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Object.defineProperty(window, "__restoreCommerceRead", { value: () => { Storage.prototype.getItem = original; }, configurable: true });
    Storage.prototype.getItem = function getItem(key) {
      if (key === "sajurium-commerce") throw new Error("injected commerce read denial");
      return original.call(this, key);
    };
  });
  await page.goto("/settings");
  const row = page.locator(".data-inventory article").filter({ hasText: "체험 주문·이용권" });
  await expect(row.getByText("사용 불가")).toBeVisible();
  await expect(row.getByRole("button", { name: "다시 확인" })).toBeVisible();
  await expect(page.locator(".data-inventory article").filter({ hasText: "환경설정" }).getByRole("button", { name: "삭제" })).toBeDisabled();
  await expect(page.locator(".data-inventory").getByRole("button", { name: "초기화" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전체 기기 저장 정보 삭제 · 사용 불가" })).toBeDisabled();
  expect(await page.evaluate(() => {
    (window as typeof window & { __restoreCommerceRead?: () => void }).__restoreCommerceRead?.();
    return { commerce: localStorage.getItem("sajurium-commerce"), settings: localStorage.getItem("sajurium-settings") };
  })).toEqual({ commerce, settings });
});

test("keeps corrupt recovery visible when reset removal fails", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("sajurium-saju-report", "{broken");
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, "__restoreCorruptRemove", { value: () => { Storage.prototype.removeItem = original; }, configurable: true });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === "sajurium-saju-report") throw new Error("injected corrupt reset failure");
      return original.call(this, key);
    };
  });
  await page.reload();
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, "__restoreCorruptRemove", { value: () => { Storage.prototype.removeItem = original; }, configurable: true });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === "sajurium-saju-report") throw new Error("injected corrupt reset failure");
      return original.call(this, key);
    };
  });
  await page.getByRole("button", { name: "손상 데이터 초기화" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("초기화하지 못했어요");
  expect(await page.evaluate(() => {
    (window as typeof window & { __restoreCorruptRemove?: () => void }).__restoreCorruptRemove?.();
    return localStorage.getItem("sajurium-saju-report");
  })).toBe("{broken");
});
