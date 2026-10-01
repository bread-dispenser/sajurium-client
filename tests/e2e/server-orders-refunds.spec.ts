import { expect, test, type Page } from "@playwright/test";
import { createServerReport } from "./birth-helpers";

// Every test here talks to the real backend that `build:integration` points at, with payments off
// (`PAYMENTS_ENABLED=false`): order and refund reads must keep working, order creation must not.
const API = process.env.SAJURIUM_E2E_API_URL ?? "http://localhost:8000";

function trackApiRequests(page: Page) {
  const paths: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(API).origin) paths.push(`${request.method()} ${url.pathname}`);
  });
  return paths;
}

async function accessToken(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null")?.accessToken as string);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("loads the refund history with a single GET /refunds and no per-order requests", async ({ page, request }) => {
  const paths = trackApiRequests(page);
  const refunds = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/refunds" && response.request().method() === "GET");
  await page.goto("/billing");

  expect((await refunds).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "주문 0건" })).toBeVisible();
  await expect(page.getByText("결제는 준비 중이에요. 지난 주문과 환불 내역은 계속 볼 수 있어요.")).toBeVisible();
  await expect(page.getByText("아직 주문이 없어요. 리포트나 이용권을 사면 여기에 쌓여요.")).toBeVisible();
  await expect(page.getByText("환불 요청이 없어요.")).toBeVisible();

  expect(paths.filter((path) => path === "GET /api/v1/refunds")).toHaveLength(1);
  expect(paths.filter((path) => /\/api\/v1\/orders\/\d+\/refunds$/.test(path))).toEqual([]);

  // The same session reads both lists from the server while payments are off, and cannot order.
  const token = await accessToken(page);
  const headers = { Authorization: `Bearer ${token}` };
  const orders = await request.get(`${API}/api/v1/orders`, { headers });
  expect(orders.status()).toBe(200);
  expect(await orders.json()).toEqual([]);
  const refundList = await request.get(`${API}/api/v1/refunds`, { headers });
  expect(refundList.status()).toBe(200);
  expect(await refundList.json()).toEqual([]);
  const created = await request.post(`${API}/api/v1/orders`, { headers, data: { product_code: "credit_pack_1", idempotency_key: `e2e-${Date.now()}` } });
  expect(created.status()).toBe(503);
  expect(await created.json()).toMatchObject({ code: "PAYMENTS_DISABLED" });
});

test("chooses the reference profile in a paused report and compatibility checkout", async ({ page }) => {
  await createServerReport(page, "기준 확인");

  await page.goto("/checkout/love-report");
  const reportPicker = page.getByLabel("누구의 명식으로 볼까요");
  await expect(reportPicker).toBeVisible();
  await expect(reportPicker.locator("option:checked")).toHaveText("기준 확인, 본인");
  await expect(page.getByRole("region", { name: "주문 내용" })).toContainText("기준 명식");
  await expect(page.getByRole("region", { name: "주문 내용" })).toContainText("기준 확인");
  await expect(page.getByRole("status")).toContainText("결제와 주문은 준비 중이에요");
  await page.getByLabel("주문 내용과 환불 규정을 확인했고, 결제에 동의해요.").check();
  await expect(page.getByRole("button", { name: /결제하기/ })).toBeDisabled();

  // The family and decade reports are report products too: they need the same reference profile.
  for (const [productId, name] of [["family-report", "가족 심층 리포트"], ["decade-report", "대운(10년) 심층 리포트"]] as const) {
    await page.goto(`/checkout/${productId}`);
    const picker = page.getByLabel("누구의 명식으로 볼까요");
    await expect(picker).toBeVisible();
    await expect(picker.locator("option:checked")).toHaveText("기준 확인, 본인");
    const summary = page.getByRole("region", { name: "주문 내용" });
    await expect(summary).toContainText(name);
    await expect(summary).toContainText("기준 명식");
    await expect(page.getByRole("button", { name: /결제하기/ })).toBeDisabled();
  }

  // Only one saved profile: compatibility asks for a second person instead of a broken picker.
  await page.goto("/checkout/compatibility-report");
  await expect(page.getByText(/궁합은 두 사람이 필요해요/)).toBeVisible();
  await expect(page.getByRole("link", { name: "사람 추가" })).toHaveAttribute("href", "/people/new");
  await expect(page.getByRole("button", { name: /결제하기/ })).toBeDisabled();

  // Credit packs need no reference profile.
  await page.goto("/checkout/consult-5");
  await expect(page.getByRole("heading", { name: "주문 내용" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "기준 명식" })).toHaveCount(0);
});

test("lists the family and decade reports with their server prices among the deep reports", async ({ page }) => {
  await page.goto("/products");
  const reports = page.getByRole("region", { name: "심층 리포트" });
  const family = reports.getByRole("link", { name: /가족 심층 리포트/ });
  await expect(family).toBeVisible({ timeout: 15_000 });
  await expect(family).toContainText("4,900원");
  await expect(family).toHaveAttribute("href", "/products/family-report");
  const decade = reports.getByRole("link", { name: /대운\(10년\) 심층 리포트/ });
  await expect(decade).toContainText("5,900원");
  await expect(decade).toHaveAttribute("href", "/products/decade-report");
  // Six deep reports and two credit packs; the free basic report is not for sale.
  await expect(reports.getByRole("link")).toHaveCount(6);
  await expect(page.getByRole("region", { name: "상담 이용권" }).getByRole("link")).toHaveCount(2);

  await family.click();
  await expect(page.getByRole("heading", { level: 1, name: "가족 심층 리포트" })).toBeVisible();
  await expect(page.getByRole("button", { name: "4,900원 구매하기" })).toBeDisabled();
});
