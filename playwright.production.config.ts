import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/production",
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "https://sajurium.justn.me",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "off",
    screenshot: "only-on-failure",
  },
});
