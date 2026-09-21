import { expect, test } from "@playwright/test";

const coverage = {
  "ACC-001": "/account", "ACC-002": "/login", "ACC-003": "/account",
  "PROF-001": "/profile", "PROF-002": "/profile", "PROF-003": "/profile", "PROF-004": "/profile",
  "CHART-001": "/report", "CHART-002": "/admin/operations", "CHART-003": "/settings/about-ai", "CHART-004": "/admin/operations",
  "HOME-001": "/home", "HOME-002": "/home", "HOME-003": "/home",
  "REPORT-001": "/report", "REPORT-002": "/report", "REPORT-003": "/report", "REPORT-004": "/admin/operations",
  "FLOW-001": "/flow/today", "FLOW-002": "/flow/month", "FLOW-003": "/reports/year", "FLOW-004": "/admin/operations",
  "CONSULT-001": "/consult", "CONSULT-002": "/consult/new", "CONSULT-003": "/consult/new", "CONSULT-004": "/consult",
  "CONSULT-005": "/consult", "CONSULT-006": "/consult", "CONSULT-007": "/billing", "CONSULT-008": "/consult/new",
  "PEOPLE-001": "/people/new", "PEOPLE-002": "/people", "PEOPLE-003": "/people",
  "COMP-001": "/compatibility", "COMP-002": "/compatibility", "COMP-003": "/compatibility",
  "COMP-004": "/products/compatibility-report", "COMP-005": "/admin/operations",
  "CALENDAR-001": "/calendar", "CALENDAR-002": "/calendar", "CALENDAR-003": "/calendar",
  "PRODUCT-001": "/products", "PRODUCT-002": "/products/love-report", "PRODUCT-003": "/products/love-report", "PRODUCT-004": "/billing", "PRODUCT-005": "/billing",
  "PAYMENT-001": "/billing", "PAYMENT-002": "/billing", "PAYMENT-003": "/billing", "PAYMENT-004": "/billing", "PAYMENT-005": "/billing",
  "LIBRARY-001": "/library", "LIBRARY-002": "/library", "LIBRARY-003": "/library", "LIBRARY-004": "/library",
  "SHARE-001": "/share", "SHARE-002": "/share", "SHARE-003": "/share/links",
  "NOTIFICATION-001": "/notifications", "NOTIFICATION-002": "/notifications/policy", "NOTIFICATION-003": "/notifications/policy",
  "FEEDBACK-001": "/report/feedback?targetType=report&reportId=rpt_fixture_love&topic=love", "FEEDBACK-002": "/report/feedback?targetType=report&reportId=rpt_fixture_love&topic=love", "FEEDBACK-003": "/admin/operations",
  "ADMIN-001": "/admin/operations", "ADMIN-002": "/admin/operations", "ADMIN-003": "/admin/operations", "ADMIN-004": "/admin/operations",
  "ADMIN-005": "/admin/operations", "ADMIN-006": "/admin/analytics",
} as const;

const explicitlyUnavailable = new Set([
  "/admin/analytics",
  "/admin/operations",
  "/billing",
  "/calendar",
  "/notifications/policy",
  "/platform-labs",
  "/profile",
]);

test("maps every PRD feature requirement to an implemented or explicit unavailable surface", async ({ page }) => {
  const ids = Object.keys(coverage);
  expect(ids).toHaveLength(70);
  expect(new Set(ids).size).toBe(ids.length);

  for (const route of [...new Set(Object.values(coverage))]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should load`).toBe(true);
    await expect(page.locator("h1").first(), `${route} should have a primary heading`).toBeVisible();
    await expect(page.locator("body"), `${route} should not expose TODO copy`).not.toContainText(/TODO/);
    if (explicitlyUnavailable.has(route)) {
      await expect(page.locator("body"), `${route} should disclose that it is unavailable`).toContainText(/준비 중|제공되지 않아요/);
    }
  }
});
