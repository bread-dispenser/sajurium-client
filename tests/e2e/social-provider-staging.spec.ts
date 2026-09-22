import { expect, test } from "@playwright/test";

test.skip(process.env.NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED !== "true", "Social providers are disabled in the default build.");

const cors = {
  "Access-Control-Allow-Origin": "http://localhost:3100",
  "Access-Control-Allow-Headers": "content-type,x-request-id",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

test("configured Google button exchanges its credential with the API", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: `
      window.google = {accounts:{id:{
        initialize(options){window.gsiCallback=options.callback},
        renderButton(parent){const button=document.createElement('button');button.textContent='Google로 계속';button.onclick=()=>window.gsiCallback({credential:'google-provider-id-token'});parent.append(button)},
        disableAutoSelect(){}
      }}};
    ` });
  });
  await page.route("**/api/v1/auth/social", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(route.request().postDataJSON()).toEqual({ provider: "google", id_token: "google-provider-id-token" });
    await route.fulfill({ status: 200, contentType: "application/json", headers: cors,
                          body: JSON.stringify({ access_token: "google-account-token", token_type: "bearer" }) });
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Google로 계속" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("social-login.png"), fullPage: true });
  await expect(page.locator("html")).toHaveJSProperty("scrollWidth", 320);
  await page.getByRole("button", { name: "Google로 계속" }).click();
  await expect(page.getByRole("status")).toContainText("로그인됐어요");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null")?.accessToken)).toBe("google-account-token");
});

test("configured Apple button checks state before exchanging its ID token", async ({ page }) => {
  await page.route("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js", async (route) => {
    await route.fulfill({ contentType: "application/javascript", body: `
      window.AppleID = {auth:{
        init(options){window.appleState=options.state},
        signIn(){return Promise.resolve({authorization:{state:window.appleState,id_token:'apple-provider-id-token'}})}
      }};
    ` });
  });
  await page.route("**/api/v1/auth/social", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    expect(route.request().postDataJSON()).toEqual({ provider: "apple", id_token: "apple-provider-id-token" });
    await route.fulfill({ status: 200, contentType: "application/json", headers: cors,
                          body: JSON.stringify({ access_token: "apple-account-token", token_type: "bearer" }) });
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Apple로 계속" }).click();
  await expect(page.getByRole("status")).toContainText("로그인됐어요");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sajurium.sasaju-auth.v1") ?? "null")?.accessToken)).toBe("apple-account-token");
});
