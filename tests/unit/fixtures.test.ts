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
    expect(getProduct("consult-5").priceAmount).toBe(4900);
    expect(INITIAL_PEOPLE_DATA.freeLimit).toBe(2);
    expect(INITIAL_PEOPLE_DATA.people).toHaveLength(2);
  });

  it("classifies restricted consultation topics", () => {
    const restrictedQuestions = [
      "사망 시기를 알려줘",
      "암 진단과 수명을 알려줘",
      "임신 여부를 확정해줘",
      "범죄 재판 결과를 확정해줘",
      "주식 투자 수익을 보장해줘",
      "이번 주 로또 당첨 결과를 알려줘",
      "상대방의 속마음을 알려줘",
      "배우자가 외도하는지 알려줘",
    ];
    restrictedQuestions.forEach((question) => expect(isRestrictedConsultationQuestion(question)).toBe(true));
    expect(isRestrictedConsultationQuestion("이직 조건을 정리하고 싶어요")).toBe(false);
  });
});
