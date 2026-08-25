import { mkdir, writeFile } from "node:fs/promises";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const url = process.env.LIGHTHOUSE_URL ?? "http://localhost:3100/home";
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"] });

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  if (!result) throw new Error("Lighthouse returned no result");
  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, category]) => [key, category.score ?? 0]),
  );
  const thresholds = { performance: 0.7, accessibility: 0.9, "best-practices": 0.9, seo: 0.9 };
  const failures = Object.entries(thresholds)
    .filter(([key, threshold]) => (scores[key] ?? 0) < threshold)
    .map(([key, threshold]) => `${key}: ${scores[key] ?? 0} < ${threshold}`);

  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/lighthouse-report.json", result.report);
  console.log(JSON.stringify({ url, scores, thresholds }, null, 2));
  if (failures.length > 0) throw new Error(`Lighthouse thresholds failed: ${failures.join(", ")}`);
} finally {
  await chrome.kill();
}
