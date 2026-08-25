import { expect, test } from "@playwright/test";

test("covers guest recovery, migration, merge, and account deletion review", async ({ page }) => {
  await page.goto("/account");
  await page.getByRole("button", { name: "만료 상황" }).click();
  await expect(page.getByText("임시 결과가 만료됐어요")).toBeVisible();
  await page.getByRole("button", { name: "출생 정보 재입력 완료로 보기" }).click();
  await page.getByRole("button", { name: /카카오 로그인과 결과 이전 체험/ }).click();
  await page.getByRole("button", { name: "선택 적용" }).click();
  await expect(page.getByRole("status").filter({ hasText: "프로필 하나로 병합" })).toBeVisible();
  await page.getByRole("button", { name: "계정 삭제 검토 시작" }).click();
  await page.getByRole("checkbox", { name: /일반 콘텐츠는 복구할 수 없고/ }).check();
  await page.getByLabel(/확인을 위해/).fill("계정 삭제");
  await page.getByRole("button", { name: "계정 삭제 확정" }).click();
  await expect(page.getByText("계정 삭제 화면을 완료했어요")).toBeVisible();
});

test("creates a new profile snapshot without overwriting prior reports", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "프로필 수정" }).click();
  await page.getByLabel("이름 또는 닉네임").fill("새로운 별칭");
  await page.getByRole("checkbox", { name: "출생 시간을 몰라요" }).check();
  await expect(page.getByText("시간을 추정해 채우지 않습니다")).toBeVisible();
  await page.getByRole("button", { name: "새 스냅샷으로 저장" }).click();
  await expect(page.getByRole("status")).toContainText("새 스냅샷을 만들었어요");
  await expect(page.getByText(/이전 정보로 생성됨/)).toBeVisible();
});

test("prevents duplicate purchase and processes one callback grant", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.getByText("중복 구매 감지")).toBeVisible();
  await page.getByRole("button", { name: "새 해석 버전 선택" }).click();
  await expect(page.getByText("새 구매 가능")).toBeVisible();
  await page.getByRole("button", { name: "같은 결제 콜백 보내기" }).click();
  await page.getByRole("button", { name: "같은 결제 콜백 보내기" }).click();
  await expect(page.getByText(/수신 2회 \/ 반영 1회/)).toBeVisible();
  await page.getByRole("checkbox", { name: /수동 복구 확인/ }).check();
  await page.getByRole("button", { name: /이용권 1회 수동 복구/ }).click();
  await expect(page.getByRole("button", { name: "수동 복구 반영됨" })).toBeDisabled();
});

test("creates, expires, and clears a local-only share link", async ({ page }) => {
  await page.goto("/share/links");
  await page.getByRole("checkbox", { name: /공개 범위를 확인했어요/ }).check();
  await page.getByRole("button", { name: "로컬 예시 링크 명시적으로 만들기" }).click();
  await expect(page.locator('input[readonly][value*="example.invalid/shared/compatibility"]')).toBeVisible();
  await page.getByRole("button", { name: "만료 상태 체험" }).click();
  await expect(page.getByRole("heading", { name: /현재 상태 · 만료/ })).toBeVisible();
  await page.getByRole("button", { name: "닫힌 예시 정리" }).click();
  await expect(page.getByText("표시할 링크가 없어요")).toBeVisible();
});

test("configures notification quiet hours and deep-link preview", async ({ page }) => {
  await page.goto("/notifications/policy");
  await page.getByRole("checkbox", { name: /조용한 시간 사용/ }).check();
  await page.getByRole("textbox", { name: "시작", exact: true }).fill("21:30");
  await page.getByRole("textbox", { name: "종료", exact: true }).fill("07:30");
  await page.getByRole("button", { name: "딥링크 도착 미리보기" }).click();
  await expect(page.getByText(/도착 화면 예시/)).toBeVisible();
  await expect(page.getByText(/같은 본문·같은 대상의 반복 알림은 합칩니다/)).toBeVisible();
});

test("operates P2 concept tabs without presenting real services", async ({ page }) => {
  await page.goto("/platform-labs");
  await page.getByRole("tab", { name: /가족/ }).click();
  await page.getByLabel("가족 별칭").fill("첫째");
  await page.getByRole("button", { name: "로컬 목록에 추가" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "첫째" })).toBeVisible();
  await page.getByRole("tab", { name: /전문가/ }).click();
  await expect(page.getByText(/실제 연결 버튼은 제공하지 않습니다/)).toBeVisible();
});

test("requires a reason before recording a risky admin operation", async ({ page }) => {
  await page.goto("/admin/operations");
  await page.getByLabel(/작업 사유/).fill("개인정보 삭제 요청 검토");
  await page.getByRole("button", { name: /삭제 요청 처리 표시/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "로컬 시뮬레이션 확정" }).click();
  await expect(page.getByRole("status")).toContainText("로컬 감사 목록에만 추가");
});

test("filters the analytics prototype without exposing sensitive data", async ({ page }) => {
  await page.goto("/admin/analytics");
  await page.getByLabel("기간").selectOption("최근 30일");
  await page.getByRole("checkbox", { name: /실패·오류 행만 보기/ }).check();
  await expect(page.getByRole("heading", { name: "제품·품질 운영 대시보드" })).toBeVisible();
  await expect(page.getByText(/출생 정보 원문과 상담 내용 전문을 넣지 않는다는/)).toBeVisible();
});

test("keeps the public compatibility page privacy-safe", async ({ page }) => {
  await page.goto("/shared/compatibility");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("body")).not.toContainText(/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/);
  await page.getByRole("tab", { name: "실천" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("작은 규칙");
});
