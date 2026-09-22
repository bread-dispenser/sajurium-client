import { expect, test } from "@playwright/test";
import { INITIAL_BIRTH, INITIAL_COMMERCE_DATA, INITIAL_SETTINGS_DATA } from "@/lib/fixtures";

async function submitBirth(page: import("@playwright/test").Page) {
  await page.getByLabel("이름 또는 닉네임").fill("서연");
  await page.getByLabel("생년월일").fill("1992-06-18");
  await page.getByLabel("출생지").fill("서울");
  await page.getByRole("button", { name: "다음" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("discloses the live-service boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/버전이 기록된 명식 계산/)).toBeVisible();

  await page.goto("/consult/new");
  await expect(page.getByText(/성공한 경우에만 서버 이용권이 차감/)).toBeVisible();

  await page.goto("/compatibility");
  await expect(page.getByRole("heading", { name: "서버 명식으로 궁합 보기" })).toBeVisible();
  await expect(page.getByText(/두 프로필의 최신 계산 스냅샷/)).toBeVisible();

  await page.goto("/checkout/love-report");
  await expect(page.getByText(/가격·통화·상품 버전은 서버가 다시 확정/)).toBeVisible();
  await expect(page.getByRole("button", { name: "서버 주문 만들기" })).toBeEnabled();
});

test("persists a server consultation locally for immediate continuity", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
  await page.goto("/consult/new");
  await page.getByRole("button", { name: "이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?" }).click();
  await page.getByLabel("현재 상황").fill("업무 역할과 근무 방식이 고민됩니다.");
  await page.getByRole("button", { name: "상담 답변 보기" }).click();
  await expect(page).toHaveURL(/\/consult\/session\//, { timeout: 30_000 });
  const sessionPath = new URL(page.url()).pathname;
  await expect(page.locator(".message-list article")).toHaveCount(2);
  await expect(page.locator(".message-list article.assistant p").first()).not.toBeEmpty();
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
  await page.getByRole("button", { name: "상담 답변 보기" }).click();
  await expect(page.locator(".form-error[role=alert]")).toContainText("확정적인 답을 제공하지 않아요");
});

test("creates a server order from the server catalog without requiring a chart", async ({ page }) => {
  await page.goto("/checkout/consult-5");
  await page.getByRole("button", { name: "서버 주문 만들기" }).click();
  await expect(page).toHaveURL(/\/orders\/\d+.*source=server/);
  await expect(page.getByRole("heading", { name: "주문이 안전하게 생성됐어요" })).toBeVisible();
});

test("clears every service-owned local key from settings", async ({ page }) => {
  await page.goto("/settings");
  await page.evaluate(() => localStorage.setItem("sajurium-library", JSON.stringify({ version: 1, items: [] })));
  await page.reload();
  await expect(page.locator(".data-inventory article")).toHaveCount(12);
  await expect(page.getByText(/전체 프로필에서 관리하세요/)).toBeVisible();
  await page.getByRole("button", { name: "전체 기기 저장 정보 삭제" }).click();
  await page.getByRole("button", { name: "모두 삭제 확정" }).click();
  await expect(page.getByRole("status")).toContainText("모두 삭제");
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith("sajurium-")),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith("sajurium-")),
  }))).toEqual({ local: [], session: [] });
});

test("confirms individual settings and feedback deletion", async ({ page }) => {
  await page.evaluate((birth) => {
    localStorage.setItem("sajurium-profile", JSON.stringify({ version: 1, birth }));
    localStorage.setItem("sajurium-feedback-list", JSON.stringify({
      version: 1,
      entries: [{
        id: "feedback-confirm",
        target: { type: "report", reportId: "rpt_fixture_career" },
        topic: "career",
        rating: "helpful",
        reason: "too_generic",
        comment: "",
        provenance: { profileSnapshotId: "profile_snapshot_fixture_primary", chartSnapshotIds: ["chart_fixture_primary"], modelVersion: null, promptVersion: null, templateVersion: "fixture-1" },
        reported: false,
        createdAt: "2026-08-25T00:00:00.000Z",
      }],
    }));
  }, INITIAL_BIRTH);

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

});

test("surfaces corrupt domain stores before explicit recovery", async ({ page }) => {
  const cases = [
    { key: "sajurium-saju-report", route: "/", title: "저장한 리포트를 읽을 수 없어요" },
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
  const before = await page.evaluate(({ settingsData, birth }) => {
    const settings = JSON.stringify(settingsData);
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
        after: JSON.stringify({ version: 1, birth: { ...birth, displayName: "민감정보" } }),
        afterKnown: true,
      }],
    }));
    return settings;
  }, { settingsData: INITIAL_SETTINGS_DATA, birth: INITIAL_BIRTH });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "저장 복구 기록을 확인해야 해요" })).toBeVisible();
  await expect(page.locator(".data-inventory")).toHaveCount(0);
  await page.getByRole("button", { name: "손상 데이터 초기화" }).click();
  await expect(page.getByRole("heading", { name: "설정과 데이터" })).toBeVisible();
  expect(await page.evaluate(() => ({
    journal: localStorage.getItem("sajurium-storage-transaction"),
    draft: sessionStorage.getItem("sajurium-birth-draft"),
    settings: localStorage.getItem("sajurium-settings"),
    unowned: localStorage.getItem("unowned-key"),
  }))).toEqual({ journal: null, draft: null, settings: before, unowned: "keep-me" });
});

test("rejects a demo order ID paired with another product", async ({ page }) => {
  const response = await page.goto("/orders/ord_demo_love_report?productId=consult-5&state=success");
  expect(response?.status()).toBe(404);
  expect(await page.evaluate(() => localStorage.getItem("sajurium-commerce"))).toBeNull();
});

test("validates known birth time before settings persistence", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("출생 시간", { exact: true }).fill("");
  await page.getByRole("button", { name: "출생 정보 저장" }).click();
  await expect(page.getByRole("status")).toContainText("출생 시간을 HH:mm 형식으로 입력");
  expect(await page.evaluate(() => localStorage.getItem("sajurium-profile"))).toBeNull();
});

test("shows pending and failure as non-payment example states", async ({ page }) => {
  await page.goto("/orders/ord_demo_love_report?productId=love-report&state=pending");
  await expect(page.getByRole("heading", { name: "결제 대기 상태 안내" })).toBeVisible();
  await expect(page.getByText("실제 결제액")).toBeVisible();
  await page.goto("/orders/ord_demo_love_report?productId=love-report&state=failure");
  await expect(page.getByRole("heading", { name: "결제 실패 상태 안내" })).toBeVisible();
  await expect(page.getByText("결제 수단이나 주문에는 아무 변화가 없습니다.")).toBeVisible();
});

test("rolls back linked consultation writes when library persistence fails", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "내 흐름 살펴보기" }).click();
  await submitBirth(page);
  await expect(page).toHaveURL(/\/report$/);
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
  await page.getByRole("button", { name: "상담 답변 보기" }).click();
  // 이 단언은 상담 생성 왕복 뒤에 온다 — 실제 LLM이면 수 초가 걸린다.
  await expect(page.locator(".form-error[role=alert]")).toContainText("모든 변경을 취소했어요", { timeout: 30_000 });
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
  await page.evaluate((birth) => {
    localStorage.setItem("sajurium-profile", JSON.stringify({ version: 1, birth: { ...birth, displayName: "남김", birthDate: "1990-01-01", birthTime: "12:00" } }));
    const original = Storage.prototype.removeItem;
    Object.defineProperty(window, "__restoreRemoveItem", { value: () => { Storage.prototype.removeItem = original; }, configurable: true });
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === "sajurium-profile") throw new Error("injected remove failure");
      return original.call(this, key);
    };
  }, INITIAL_BIRTH);
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
  const commerce = JSON.stringify({ ...INITIAL_COMMERCE_DATA, consultationCredits: 3 });
  const settings = JSON.stringify(INITIAL_SETTINGS_DATA);
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
