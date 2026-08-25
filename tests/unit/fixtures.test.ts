import { describe, expect, it } from "vitest";
import {
  getDailyFlow,
  getMonthlyFlow,
  getProduct,
  getTopic,
  getTopicPreview,
  isProductId,
  isRestrictedConsultationQuestion,
  isTopicId,
  INITIAL_PEOPLE_DATA,
} from "@/lib/fixtures";

describe("fixture repository", () => {
  it("returns stable daily and monthly readings for the same key", () => {
    expect(getDailyFlow("2026-08-24")).toEqual(getDailyFlow("2026-08-24"));
    expect(getMonthlyFlow("2026-08")).toEqual(getMonthlyFlow("2026-08"));
  });

  it("validates topic and product identifiers", () => {
    expect(isTopicId("career")).toBe(true);
    expect(isTopicId("unknown")).toBe(false);
    expect(isProductId("love-report")).toBe(true);
    expect(isProductId("real-payment")).toBe(false);
    expect(getTopic("love").title).toContain("연애");
    expect(getTopicPreview("career").headline).toContain("기준");
    expect(getProduct("consult-5").price).toBe(4900);
    expect(INITIAL_PEOPLE_DATA.freeLimit).toBe(2);
    expect(INITIAL_PEOPLE_DATA.people).toHaveLength(2);
  });

  it("classifies restricted consultation topics", () => {
    expect(isRestrictedConsultationQuestion("암 진단과 수명을 알려줘")).toBe(true);
    expect(isRestrictedConsultationQuestion("이직 조건을 정리하고 싶어요")).toBe(false);
  });
});
