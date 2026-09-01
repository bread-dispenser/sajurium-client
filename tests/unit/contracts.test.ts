import { describe, expect, it } from "vitest";
import {
  GENERATION_STATUSES,
  ORDER_STATUSES,
  getAllowedLibraryActions,
  hasValidLeapMonthSemantics,
  isConsultationMessageStatus,
  isConsultationSessionStatus,
  isGenerationStatus,
  isJobStatus,
  isOrderStatus,
  parseBirthDate,
  maskBirthDate,
  maskBirthTime,
  maskBirthplace,
} from "@/lib/contracts";

describe("canonical frontend contracts", () => {
  it("keeps lunar leap-month semantics separate from calendar kind", () => {
    expect(hasValidLeapMonthSemantics({ calendar: "lunar", leapMonth: true })).toBe(true);
    expect(hasValidLeapMonthSemantics({ calendar: "lunar", leapMonth: false })).toBe(true);
    expect(hasValidLeapMonthSemantics({ calendar: "solar", leapMonth: false })).toBe(true);
    expect(hasValidLeapMonthSemantics({ calendar: "solar", leapMonth: true })).toBe(false);
  });

  it("masks profile birth details without retaining exact values", () => {
    expect(maskBirthDate("1992-08-17")).toBe("1992. **. **");
    expect(maskBirthDate("invalid")).toBe("****. **. **");
    expect(maskBirthTime("14:30", false)).toBe("14:**");
    expect(maskBirthTime("14:30", true)).toBe("시간 미상");
    expect(maskBirthTime(null, false)).toBe("시간 미상");
    expect(maskBirthplace("서울특별시")).toBe("서****");
    expect(maskBirthplace(" ")).toBe("***");
  });

  it("validates real birth dates against the shared bounds", () => {
    const now = new Date(2026, 8, 1, 12, 30);
    expect(parseBirthDate("1900-01-01", now)).not.toBeNull();
    expect(parseBirthDate("1899-12-31", now)).toBeNull();
    expect(parseBirthDate("2026-09-01", now)).not.toBeNull();
    expect(parseBirthDate("2026-09-02", now)).toBeNull();
    expect(parseBirthDate("2024-02-30", now)).toBeNull();
    expect(parseBirthDate("2024-02-29", now)).not.toBeNull();
  });

  it("never permits deleting a purchased library item", () => {
    expect(getAllowedLibraryActions({ access: "available", purchased: true, read: false, hidden: false })).toEqual([
      "open",
      "mark_read",
      "hide",
    ]);
    expect(getAllowedLibraryActions({ access: "available", purchased: false, read: true, hidden: true })).toEqual([
      "open",
      "unhide",
      "delete",
    ]);
    expect(getAllowedLibraryActions({ access: "locked", purchased: false, read: false, hidden: false })).toEqual([
      "hide",
      "delete",
    ]);
  });

  it("accepts only finite asynchronous and domain statuses", () => {
    expect(ORDER_STATUSES).toHaveLength(7);
    expect(GENERATION_STATUSES).toHaveLength(7);

    expect(isJobStatus("running")).toBe(true);
    expect(isJobStatus("pending")).toBe(false);
    expect(isConsultationSessionStatus("completed")).toBe(true);
    expect(isConsultationSessionStatus("archived")).toBe(false);
    expect(isConsultationMessageStatus("restricted")).toBe(true);
    expect(isConsultationMessageStatus("streaming")).toBe(false);
    expect(isOrderStatus("FULFILLING")).toBe(true);
    expect(isOrderStatus("CANCELED")).toBe(false);
    expect(isGenerationStatus("expired")).toBe(true);
    expect(isGenerationStatus("ready")).toBe(false);
    expect(isGenerationStatus(null)).toBe(false);
  });
});
