import { expect, test } from "@playwright/test";

test("completes the local-only login prototype", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("radio", { name: /Google/ }).check();
  await page.getByLabel("이메일").fill("reader@example.com");
  await page.getByRole("checkbox", { name: /서비스 이용약관/ }).check();
  await page.getByRole("checkbox", { name: /개인정보 안내/ }).check();
  await page.getByRole("button", { name: "로그인 이후 화면 보기" }).click();
  await expect(page.getByRole("heading", { name: /사주리움에/ })).toBeVisible();
  await expect(page.getByText("실제 로그인이 아닙니다")).toBeVisible();
});

test("filters and marks prototype notifications", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByText("읽지 않은 알림 2개")).toBeVisible();
  await page.getByRole("button", { name: "모두 읽음으로 표시" }).click();
  await page.getByRole("tab", { name: /읽지 않음/ }).click();
  await expect(page.getByRole("heading", { name: "읽지 않은 알림이 없습니다" })).toBeVisible();
});

test("changes calendar topic and selected date deterministically", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("radio", { name: "재물" }).check();
  await page.getByRole("button", { name: /2026-08-15/ }).click();
  await expect(page.getByText("2026-08-15 · 재물")).toBeVisible();
  await expect(page.getByText(/개인 출생 정보나 사주 원국을 사용하지 않았습니다/)).toBeVisible();
});

test("switches between year and decade report prototypes", async ({ page }) => {
  await page.goto("/reports/year");
  await page.getByLabel("리포트 기간 선택").selectOption("decade");
  await expect(page).toHaveURL(/\/reports\/decade$/);
  await expect(page.getByRole("heading", { name: "긴 호흡의 변화를 세 구간으로 읽기" })).toBeVisible();
  await expect(page.getByRole("button", { name: /심층 리포트 구매/ })).toBeDisabled();
});

test("filters and updates only local admin prototype rows", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("tab", { name: "주문" }).click();
  await page.getByLabel("검색").fill("ORD-1042");
  await page.getByRole("button", { name: /ORD-1042/ }).click();
  await page.getByRole("button", { name: "표시 상태만 전환" }).click();
  await expect(page.getByRole("status")).toContainText("서버에는 저장되지 않았습니다");
});

test("keeps sensitive share fields off until explicitly selected", async ({ page }) => {
  await page.goto("/share");
  const nameField = page.getByRole("checkbox", { name: /이름/ });
  const birthField = page.getByRole("checkbox", { name: /생년월일/ });
  await expect(nameField).not.toBeChecked();
  await expect(birthField).not.toBeChecked();
  await nameField.check();
  await expect(page.getByText("해온", { exact: true })).toBeVisible();
  await expect(page.getByText(/공개 URL·외부 업로드·서버 저장은 생성되지 않습니다/)).toBeVisible();
});

test("adds and filters an in-memory life-log event", async ({ page }) => {
  await page.goto("/life-log");
  await page.getByLabel("제목").fill("새로운 루틴을 시작함");
  await page.getByLabel("메모").fill("일주일 동안 작은 단위로 반복했다.");
  await page.getByRole("button", { name: "프로토타입 기록 추가" }).click();
  await expect(page.getByRole("heading", { name: "새로운 루틴을 시작함" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("브라우저를 닫으면 사라집니다");
});
