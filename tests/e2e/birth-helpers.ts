import { expect, type Page } from "@playwright/test";

type BirthStepOne = { name: string; year?: string; month?: string; day?: string; sijin?: RegExp | null };

/** Fills the first birth step (name, date, sijin) and moves to the second step. `sijin: null` checks "time unknown". */
export async function fillBirthStepOne(page: Page, { name, year = "1992", month = "6", day = "18", sijin = /^미시/ }: BirthStepOne) {
  await page.getByLabel("부를 이름", { exact: true }).fill(name);
  await page.getByLabel("태어난 해").fill(year);
  await page.getByLabel("태어난 달").fill(month);
  await page.getByLabel("태어난 날").fill(day);
  if (sijin) await page.getByRole("button", { name: sijin }).click();
  else await page.getByLabel("시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.").check();
}

/** Completes both birth steps from /birth and submits the calculation. */
export async function submitBirth(page: Page, name = "서연", birthplace = "서울") {
  await fillBirthStepOne(page, { name });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("출생지").fill(birthplace);
  await page.getByRole("button", { name: "명식 계산하기", exact: true }).click();
}

/** Opens /birth, submits it and waits for the server report. */
export async function createServerReport(page: Page, name = "서연") {
  await page.goto("/birth");
  await submitBirth(page, name);
  await expect(page).toHaveURL(/\/report$/, { timeout: 15_000 });
}
