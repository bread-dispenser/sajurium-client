import { beforeEach, describe, expect, it } from "vitest";
import type { CommerceData, CompatibilityData, ConsultationData, FeedbackData, LibraryData, PeopleData } from "@/lib/domain";
import { INITIAL_BIRTH, INITIAL_COMMERCE_DATA, INITIAL_CONSULTATION_DATA, INITIAL_PEOPLE_DATA, INITIAL_SETTINGS_DATA } from "@/lib/fixtures";
import {
  birthDraftStore,
  clearOwnedStorage,
  commerceStore,
  compatibilityStore,
  consultationStore,
  createTransactionStep,
  feedbackListStore,
  getOwnedStorageInventory,
  inspectStorageTransaction,
  libraryStore,
  peopleStore,
  profileStore,
  reportStore,
  runStorageTransaction,
  saveProfileAndClearBirthDraft,
  saveReportAndClearBirthDraft,
  settingsStore,
} from "@/lib/storage";

const CANONICAL_LIBRARY_DATA: LibraryData = {
  version: 1,
  items: [{
    id: "library-report-1",
    type: "report",
    title: "리포트",
    subtitle: "상세 리포트",
    href: "/report",
    access: "available",
    purchased: true,
    read: false,
    hidden: false,
    profile: { id: "profile-1", displayName: "서연" },
    topic: "career",
    createdAt: "2026-08-25T00:00:00.000Z",
    allowedActions: ["open", "mark_read", "hide"],
  }],
};

const CANONICAL_CONSULTATION_DATA: ConsultationData = {
  version: 1,
  draft: null,
  freeUsesRemaining: 1,
  sessions: [{
    id: "session-1",
    title: "진로 상담",
    status: "completed",
    context: {
      profileId: "profile-1",
      chartSnapshotId: "chart-1",
      periodKey: "2026",
      topic: "career",
      situation: null,
      referencedProfileIds: [],
    },
    summary: "상담 요약",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:01:00.000Z",
    messages: [{
      id: "message-1",
      role: "assistant",
      status: "completed",
      content: "상담 내용",
      createdAt: "2026-08-25T00:00:00.000Z",
      completedAt: "2026-08-25T00:01:00.000Z",
      provenance: {
        chartSnapshotId: "chart-1",
        interpretationVersion: "1",
        modelVersion: "model-1",
        promptVersion: "prompt-1",
        templateVersion: "template-1",
        generatedAt: "2026-08-25T00:01:00.000Z",
      },
    }],
  }],
};

const CANONICAL_COMMERCE_DATA: CommerceData = {
  version: 1,
  orders: [{
    orderId: "order-1",
    productId: "career-report",
    productVersion: "1",
    profileId: "profile-1",
    chartSnapshotId: "chart-1",
    periodKey: "2026",
    interpretationVersion: "fixture-1",
    status: "COMPLETED",
    amount: 9900,
    currency: "KRW",
    provider: "WEB",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:02:00.000Z",
  }],
  generations: [{
    id: "generation-1",
    orderId: "order-1",
    productId: "career-report",
    reportId: "report-1",
    status: "completed",
    attemptCount: 1,
    error: null,
    createdAt: "2026-08-25T00:02:00.000Z",
    updatedAt: "2026-08-25T00:03:00.000Z",
  }],
  consultationCredits: 5,
  creditHistory: [{
    id: "ledger-1",
    delta: 5,
    balanceAfter: 5,
    source: "order",
    sourceId: "order-1",
    reason: "purchase",
    description: "상담 이용권 구매",
    createdAt: "2026-08-25T00:02:00.000Z",
  }],
};

const CANONICAL_COMPATIBILITY_DATA: CompatibilityData = {
  version: 1,
  results: [{
    id: "compat-0198f7a0-1234-7000-8000-123456789abc",
    relationshipType: "dating",
    personA: { profileId: "person-a", displayName: "서연", maskedBirthYear: "19**", birthTimeUnknown: false, chartSnapshotId: "chart-0198f7a0-1234-7000-8000-123456789abc" },
    personB: { profileId: "person-b", displayName: "지우", maskedBirthYear: "19**", birthTimeUnknown: true, chartSnapshotId: "chart-0198f7a0-1234-7000-8000-abcdef123456" },
    summary: "서로의 속도를 확인하는 관계예요.",
    strengths: ["서로 다른 관점을 나눌 수 있어요.", "생활 리듬을 존중할 수 있어요."],
    cautions: ["기대를 말로 확인해야 해요."],
    provenance: {
      chartSnapshotId: "chart-0198f7a0-1234-7000-8000-fedcba654321",
      interpretationVersion: "compatibility-fixture-1",
      modelVersion: null,
      promptVersion: null,
      templateVersion: "compatibility-free-1",
      generatedAt: "2026-08-25T00:00:00.000Z",
    },
    createdAt: "2026-08-25T00:00:00.000Z",
    dimensions: [
      "emotional-expression", "communication-style", "intimacy", "lifestyle-rhythm",
      "conflict-style", "values-goals", "long-term", "mutual-influence",
    ].map((id) => ({ id, title: id, summary: `${id} 요약` })),
    fixtureVersion: 1,
    fixture: true,
  }],
};

describe("validated local stores", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("round-trips a valid saved report", () => {
    const value = {
      version: 1 as const,
      savedAt: "2026-08-24T10:00:00.000Z",
      birth: INITIAL_BIRTH,
      topic: "career" as const,
      feedback: "helpful" as const,
    };
    expect(reportStore.write(value)).toBe(true);
    expect(reportStore.read()).toEqual(value);
    expect(reportStore.inspect().status).toBe("ok");
  });

  it("reports corrupt data without pretending it is valid", () => {
    window.localStorage.setItem(peopleStore.key, "{broken");
    expect(peopleStore.inspect().status).toBe("corrupt");
    expect(peopleStore.read()).toBeNull();
    peopleStore.write(INITIAL_PEOPLE_DATA);
    expect(peopleStore.read()?.people).toHaveLength(2);
  });

  it("round-trips canonical library, consultation, and commerce values", () => {
    expect(libraryStore.write(CANONICAL_LIBRARY_DATA)).toBe(true);
    expect(consultationStore.write(CANONICAL_CONSULTATION_DATA)).toBe(true);
    expect(commerceStore.write(CANONICAL_COMMERCE_DATA)).toBe(true);
    expect(libraryStore.read()).toEqual(CANONICAL_LIBRARY_DATA);
    expect(consultationStore.read()).toEqual(CANONICAL_CONSULTATION_DATA);
    expect(commerceStore.read()).toEqual(CANONICAL_COMMERCE_DATA);
  });

  it("round-trips compatibility snapshots with immutable source identities and provenance", () => {
    expect(compatibilityStore.write(CANONICAL_COMPATIBILITY_DATA)).toBe(true);
    expect(peopleStore.write({
      ...INITIAL_PEOPLE_DATA,
      people: INITIAL_PEOPLE_DATA.people.map((person, index) => ({
        ...person,
        id: index === 0 ? "person-a" : "person-b",
      })),
    })).toBe(true);
    const editedPeople = peopleStore.read()!;
    editedPeople.people[0] = {
      ...editedPeople.people[0],
      profile: { ...editedPeople.people[0].profile, displayName: "수정된 이름", birthDate: "2001-01-01" },
    };
    expect(peopleStore.write(editedPeople)).toBe(true);
    const stored = compatibilityStore.read();
    expect(stored).toEqual(CANONICAL_COMPATIBILITY_DATA);
    expect(stored?.results[0].personA).toMatchObject({ displayName: "서연", maskedBirthYear: "19**" });
    expect(stored?.results[0].personA.chartSnapshotId).not.toBe(stored?.results[0].personB.chartSnapshotId);
    expect(stored?.results[0].provenance.chartSnapshotId).toBe(CANONICAL_COMPATIBILITY_DATA.results[0].provenance.chartSnapshotId);
  });

  it("rejects legacy and incomplete compatibility results", () => {
    const canonical = CANONICAL_COMPATIBILITY_DATA.results[0];
    const legacy = {
      version: 1,
      results: [{
        id: canonical.id,
        personAId: "person-a",
        personBId: "person-b",
        personA: { name: "서연", relationship: "self", birthYear: "1990", birthTimeUnknown: false },
        personB: { name: "지우", relationship: "partner", birthYear: "1992", birthTimeUnknown: true },
        relationshipType: "dating",
        createdAt: canonical.createdAt,
        summary: canonical.summary,
        dimensions: canonical.dimensions,
        fixtureVersion: 1,
        fixture: true,
      }],
    };
    expect(compatibilityStore.write(legacy as unknown as CompatibilityData)).toBe(false);
    expect(compatibilityStore.write({
      ...CANONICAL_COMPATIBILITY_DATA,
      results: [{ ...canonical, personB: { ...canonical.personB, chartSnapshotId: canonical.personA.chartSnapshotId } }],
    })).toBe(false);
    expect(compatibilityStore.write({
      ...CANONICAL_COMPATIBILITY_DATA,
      results: [{ ...canonical, strengths: [canonical.strengths[0]] }],
    })).toBe(false);
    expect(compatibilityStore.write({
      ...CANONICAL_COMPATIBILITY_DATA,
      results: [{ ...canonical, provenance: { ...canonical.provenance, templateVersion: "" } }],
    })).toBe(false);
    for (const invalid of [
      { ...canonical, id: "not opaque" },
      { ...canonical, relationshipType: "coworker" },
      { ...canonical, cautions: [] },
      { ...canonical, dimensions: canonical.dimensions.map((dimension) => ({ ...dimension, id: "duplicate" })) },
      { ...canonical, provenance: { ...canonical.provenance, promptVersion: undefined } },
    ]) {
      expect(compatibilityStore.write({ ...CANONICAL_COMPATIBILITY_DATA, results: [invalid] } as unknown as CompatibilityData)).toBe(false);
    }
  });

  it("accepts every canonical order state and rejects legacy order states", () => {
    const statuses = ["CREATED", "PAYMENT_PENDING", "PAID", "FULFILLING", "COMPLETED", "FAILED", "REFUNDED"] as const;
    for (const status of statuses) {
      expect(commerceStore.write({
        ...CANONICAL_COMMERCE_DATA,
        orders: [{ ...CANONICAL_COMMERCE_DATA.orders[0], status }],
      })).toBe(true);
    }
    for (const status of ["pending", "success", "failure"]) {
      window.localStorage.setItem(commerceStore.key, JSON.stringify({
        version: 1,
        orders: [{ id: "legacy-order", productId: "career-report", status, createdAt: "2026-08-25T00:00:00.000Z" }],
        generations: [],
        consultationCredits: 0,
        creditHistory: [],
      }));
      expect(commerceStore.inspect().status).toBe("corrupt");
    }
  });

  it("rejects missing canonical metadata and invalid derived library actions", () => {
    const missingMetadata = {
      version: 1,
      items: [{
        id: "legacy-library",
        type: "report",
        title: "legacy",
        subtitle: "",
        href: "/report",
        createdAt: "2026-08-25T00:00:00.000Z",
        hidden: false,
      }],
    };
    window.localStorage.setItem(libraryStore.key, JSON.stringify(missingMetadata));
    expect(libraryStore.inspect().status).toBe("corrupt");

    const purchasedWithDelete = {
      ...CANONICAL_LIBRARY_DATA,
      items: [{ ...CANONICAL_LIBRARY_DATA.items[0], allowedActions: ["open", "mark_read", "hide", "delete"] }],
    } as LibraryData;
    expect(libraryStore.write(purchasedWithDelete)).toBe(false);
  });

  it("rejects incomplete consultation message metadata and invalid timestamps", () => {
    const missingStatus = {
      ...CANONICAL_CONSULTATION_DATA,
      sessions: [{
        ...CANONICAL_CONSULTATION_DATA.sessions[0],
        messages: [{ id: "legacy-message", role: "assistant", content: "legacy", createdAt: "not-a-timestamp", fixture: true }],
      }],
    } as unknown as ConsultationData;
    expect(consultationStore.write(missingStatus)).toBe(false);
  });

  it("rejects duplicate canonical identities and inconsistent credit balances", () => {
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      orders: [CANONICAL_COMMERCE_DATA.orders[0], { ...CANONICAL_COMMERCE_DATA.orders[0] }],
    })).toBe(false);
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      generations: [CANONICAL_COMMERCE_DATA.generations[0], { ...CANONICAL_COMMERCE_DATA.generations[0] }],
    })).toBe(false);
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      creditHistory: [CANONICAL_COMMERCE_DATA.creditHistory[0], { ...CANONICAL_COMMERCE_DATA.creditHistory[0] }],
    })).toBe(false);
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      creditHistory: [{ ...CANONICAL_COMMERCE_DATA.creditHistory[0], balanceAfter: 4 }],
    })).toBe(false);
    window.localStorage.setItem(commerceStore.key, JSON.stringify({
      ...CANONICAL_COMMERCE_DATA,
      creditHistory: [{ id: "legacy-credit", label: "구매", delta: 5, createdAt: "2026-08-25T00:00:00.000Z" }],
    }));
    expect(commerceStore.inspect().status).toBe("corrupt");
  });

  it("rejects persisted people limits that violate the two-profile contract", () => {
    window.localStorage.setItem(peopleStore.key, JSON.stringify({ ...INITIAL_PEOPLE_DATA, freeLimit: 3 }));
    expect(peopleStore.inspect().status).toBe("corrupt");
  });

  it("rejects more than two persisted people even with freeLimit two", () => {
    const third = { ...INITIAL_PEOPLE_DATA.people[0], id: "person-third", name: "셋째" };
    const invalid = { ...INITIAL_PEOPLE_DATA, people: [...INITIAL_PEOPLE_DATA.people, third] } as PeopleData;
    expect(peopleStore.write(invalid)).toBe(false);
    window.localStorage.setItem(peopleStore.key, JSON.stringify(invalid));
    expect(peopleStore.inspect().status).toBe("corrupt");
  });

  it("rejects invalid people writes without mutating valid data", () => {
    peopleStore.write(INITIAL_PEOPLE_DATA);
    const invalid = { ...INITIAL_PEOPLE_DATA, freeLimit: 3 } as unknown as PeopleData;
    expect(peopleStore.write(invalid)).toBe(false);
    expect(peopleStore.read()).toEqual(INITIAL_PEOPLE_DATA);
  });

  it("requires immutable profile and chart lineage for stored feedback", () => {
    const feedback: FeedbackData = {
      version: 1,
      entries: [{
        id: "feedback-1",
        target: { type: "report", reportId: "report-1" },
        topic: "career",
        rating: "helpful",
        reason: "too_generic",
        comment: "",
        provenance: { profileSnapshotId: "profile-snapshot-1", chartSnapshotIds: ["chart-1"], modelVersion: null, promptVersion: null, templateVersion: "fixture-1" },
        reported: false,
        createdAt: "2026-08-25T00:00:00.000Z",
      }],
    };
    expect(feedbackListStore.write(feedback)).toBe(true);
    expect(feedbackListStore.read()).toEqual(feedback);
    const missingCharts = { ...feedback, entries: [{ ...feedback.entries[0], provenance: { ...feedback.entries[0].provenance, chartSnapshotIds: [] } }] } as FeedbackData;
    expect(feedbackListStore.write(missingCharts)).toBe(false);
  });

  it("notifies same-tab subscribers and removes settings", () => {
    let calls = 0;
    const unsubscribe = settingsStore.subscribe(() => { calls += 1; });
    settingsStore.write(INITIAL_SETTINGS_DATA);
    expect(calls).toBe(1);
    settingsStore.remove();
    expect(calls).toBe(2);
    expect(settingsStore.inspect().status).toBe("empty");
    unsubscribe();
  });

  it("keeps onboarding birth drafts out of persistent local storage", () => {
    birthDraftStore.write({ version: 1, birth: INITIAL_BIRTH });
    expect(window.sessionStorage.getItem(birthDraftStore.key)).not.toBeNull();
    expect(window.localStorage.getItem(birthDraftStore.key)).toBeNull();
  });

  it("rolls back every applied store when a transaction step fails", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    consultationStore.write(INITIAL_CONSULTATION_DATA);
    const nextCommerce = { ...INITIAL_COMMERCE_DATA, consultationCredits: 4 };
    const nextConsultation = { ...INITIAL_CONSULTATION_DATA, freeUsesRemaining: 0 };
    const originalSetItem = window.localStorage.setItem;
    let failConsultationOnce = true;
    window.localStorage.setItem = (key, value) => {
      if (key === consultationStore.key && failConsultationOnce) {
        failConsultationOnce = false;
        throw new Error("injected write failure");
      }
      originalSetItem.call(window.localStorage, key, value);
    };
    try {
      expect(runStorageTransaction([
        createTransactionStep(commerceStore, nextCommerce),
        createTransactionStep(consultationStore, nextConsultation),
      ])).toBe("rolled-back");
      expect(commerceStore.read()).toEqual(INITIAL_COMMERCE_DATA);
      expect(consultationStore.read()).toEqual(INITIAL_CONSULTATION_DATA);
    } finally {
      window.localStorage.setItem = originalSetItem;
    }
  });

  it("aborts before mutation when the before snapshot is unavailable", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const originalGetItem = window.localStorage.getItem;
    window.localStorage.getItem = (key) => {
      if (key === commerceStore.key) throw new Error("injected snapshot read failure");
      return originalGetItem.call(window.localStorage, key);
    };
    const step = createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 });
    window.localStorage.getItem = originalGetItem;
    expect(runStorageTransaction([step])).toBe("unreconciled");
    expect(commerceStore.read()).toEqual(INITIAL_COMMERCE_DATA);
    expect(getOwnedStorageInventory().find((item) => item.id === "transaction")?.status).toBe("empty");
  });

  it("rejects invalid transaction values before journaling or mutation", () => {
    peopleStore.write(INITIAL_PEOPLE_DATA);
    const invalid = { ...INITIAL_PEOPLE_DATA, freeLimit: 3 } as unknown as PeopleData;
    const step = createTransactionStep(peopleStore, invalid);
    expect(runStorageTransaction([step])).toBe("unreconciled");
    expect(peopleStore.read()).toEqual(INITIAL_PEOPLE_DATA);
    expect(getOwnedStorageInventory().find((item) => item.id === "transaction")?.status).toBe("empty");
  });

  it("rejects non-finite values before direct writes or transactions", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const before = window.localStorage.getItem(commerceStore.key);
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid = {
        ...CANONICAL_COMMERCE_DATA,
        creditHistory: [{ ...CANONICAL_COMMERCE_DATA.creditHistory[0], delta }],
      } as CommerceData;
      expect(commerceStore.write(invalid)).toBe(false);
      expect(runStorageTransaction([createTransactionStep(commerceStore, invalid)])).toBe("unreconciled");
      expect(window.localStorage.getItem(commerceStore.key)).toBe(before);
      expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
    }
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      orders: [{ ...CANONICAL_COMMERCE_DATA.orders[0], amount: Number.NEGATIVE_INFINITY }],
    })).toBe(false);
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      generations: [{ ...CANONICAL_COMMERCE_DATA.generations[0], attemptCount: Number.POSITIVE_INFINITY }],
    })).toBe(false);
    expect(commerceStore.write({
      ...CANONICAL_COMMERCE_DATA,
      creditHistory: [{ ...CANONICAL_COMMERCE_DATA.creditHistory[0], balanceAfter: Number.POSITIVE_INFINITY }],
    })).toBe(false);
  });

  it("rejects a copied transaction step whose authorized key was changed", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    window.localStorage.setItem("unowned-control", "keep");
    const prepared = createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 });
    const fabricated = { ...prepared, key: "unowned-control" } as typeof prepared;
    expect(runStorageTransaction([fabricated])).toBe("unreconciled");
    expect(window.localStorage.getItem("unowned-control")).toBe("keep");
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("rejects copied steps retargeted to owned keys or altered payloads", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    peopleStore.write(INITIAL_PEOPLE_DATA);
    const commerceBefore = window.localStorage.getItem(commerceStore.key);
    const peopleBefore = window.localStorage.getItem(peopleStore.key);
    const prepared = createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 });
    const retargeted = { ...prepared, key: peopleStore.key } as typeof prepared;
    const altered = { ...prepared, after: JSON.stringify({ version: 1, consultationCredits: 99 }) } as typeof prepared;
    expect(runStorageTransaction([retargeted])).toBe("unreconciled");
    expect(runStorageTransaction([altered])).toBe("unreconciled");
    expect(window.localStorage.getItem(commerceStore.key)).toBe(commerceBefore);
    expect(window.localStorage.getItem(peopleStore.key)).toBe(peopleBefore);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("rejects transaction steps minted by structural store lookalikes", () => {
    peopleStore.write(INITIAL_PEOPLE_DATA);
    const before = window.localStorage.getItem(peopleStore.key);
    const foreignStore = {
      key: peopleStore.key,
      scope: "local" as const,
      captureRaw: () => ({ status: "ok" as const, value: before }),
      encodeTransaction: () => ({ status: "ok" as const, raw: JSON.stringify({ version: 1, people: "corrupt" }) }),
    };
    expect(runStorageTransaction([createTransactionStep(foreignStore, INITIAL_PEOPLE_DATA)])).toBe("unreconciled");
    expect(window.localStorage.getItem(peopleStore.key)).toBe(before);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("rejects stale prepared steps without overwriting newer values", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const stale = createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 });
    const newer = { ...INITIAL_COMMERCE_DATA, consultationCredits: 7 };
    commerceStore.write(newer);
    expect(runStorageTransaction([stale])).toBe("unreconciled");
    expect(commerceStore.read()).toEqual(newer);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("rejects session-scoped steps without persisting their payloads", () => {
    const draft = { version: 1 as const, birth: INITIAL_BIRTH };
    birthDraftStore.write(draft);
    const before = window.sessionStorage.getItem(birthDraftStore.key);
    expect(runStorageTransaction([createTransactionStep(birthDraftStore, null)])).toBe("unreconciled");
    expect(window.sessionStorage.getItem(birthDraftStore.key)).toBe(before);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("classifies persisted session-scoped journals as corrupt without replay", () => {
    const draft = { version: 1 as const, birth: INITIAL_BIRTH };
    window.localStorage.setItem("sajurium-storage-transaction", JSON.stringify({
      version: 1,
      state: "pending",
      steps: [{
        key: birthDraftStore.key,
        scope: "session",
        before: null,
        beforeKnown: true,
        after: JSON.stringify(draft),
        afterKnown: true,
      }],
    }));
    expect(inspectStorageTransaction().status).toBe("corrupt");
    expect(window.sessionStorage.getItem(birthDraftStore.key)).toBeNull();
    expect(window.localStorage.getItem("sajurium-storage-transaction")).not.toBeNull();
  });

  it("rejects invalid preimages before creating a transaction journal", () => {
    window.localStorage.setItem(commerceStore.key, "{\"version\":1,\"consultationCredits\":\"corrupt\"}");
    const before = window.localStorage.getItem(commerceStore.key);
    expect(runStorageTransaction([createTransactionStep(commerceStore, INITIAL_COMMERCE_DATA)])).toBe("unreconciled");
    expect(window.localStorage.getItem(commerceStore.key)).toBe(before);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("preserves corrupt preimages in dedicated session-clearing saves", () => {
    const draft = { version: 1 as const, birth: INITIAL_BIRTH };
    const report = {
      version: 1 as const,
      savedAt: "2026-08-25T00:00:00.000Z",
      birth: INITIAL_BIRTH,
      topic: "career" as const,
      feedback: "helpful" as const,
    };
    birthDraftStore.write(draft);
    const draftBefore = window.sessionStorage.getItem(birthDraftStore.key);

    window.localStorage.setItem(profileStore.key, "{broken");
    expect(saveProfileAndClearBirthDraft(draft)).toBe("unreconciled");
    expect(window.localStorage.getItem(profileStore.key)).toBe("{broken");
    expect(window.sessionStorage.getItem(birthDraftStore.key)).toBe(draftBefore);

    window.localStorage.removeItem(profileStore.key);
    window.localStorage.setItem(reportStore.key, "{broken");
    expect(saveReportAndClearBirthDraft(report)).toBe("unreconciled");
    expect(window.localStorage.getItem(reportStore.key)).toBe("{broken");
    expect(window.sessionStorage.getItem(birthDraftStore.key)).toBe(draftBefore);

    window.localStorage.removeItem(reportStore.key);
    window.sessionStorage.setItem(birthDraftStore.key, "{broken");
    expect(saveProfileAndClearBirthDraft(draft)).toBe("unreconciled");
    expect(window.localStorage.getItem(profileStore.key)).toBeNull();
    expect(window.sessionStorage.getItem(birthDraftStore.key)).toBe("{broken");
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("rejects foreign or unknown persisted journal steps without mutation", () => {
    window.localStorage.setItem("unowned-control", "keep");
    window.localStorage.setItem("sajurium-storage-transaction", JSON.stringify({
      version: 1,
      state: "pending",
      steps: [{ key: "unowned-control", scope: "local", before: "keep", beforeKnown: true, after: null, afterKnown: true }],
    }));
    expect(reportStore.inspect().status).toBe("corrupt");
    expect(window.localStorage.getItem("unowned-control")).toBe("keep");
    expect(window.localStorage.getItem("sajurium-storage-transaction")).not.toBeNull();
  });

  it("rejects persisted journals with unknown before or after states", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const before = window.localStorage.getItem(commerceStore.key);
    for (const known of [{ beforeKnown: false, afterKnown: true }, { beforeKnown: true, afterKnown: false }]) {
      window.localStorage.setItem("sajurium-storage-transaction", JSON.stringify({
        version: 1,
        state: "pending",
        steps: [{ key: commerceStore.key, scope: "local", before, after: null, ...known }],
      }));
      expect(commerceStore.inspect().status).toBe("corrupt");
      expect(window.localStorage.getItem(commerceStore.key)).toBe(before);
      expect(window.localStorage.getItem("sajurium-storage-transaction")).not.toBeNull();
      window.localStorage.removeItem("sajurium-storage-transaction");
    }
  });

  it("does not replay schema-invalid journal snapshots", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const before = window.localStorage.getItem(commerceStore.key);
    window.localStorage.setItem("sajurium-storage-transaction", JSON.stringify({
      version: 1,
      state: "pending",
      steps: [{
        key: commerceStore.key,
        scope: "local",
        before,
        beforeKnown: true,
        after: JSON.stringify({ version: 1, consultationCredits: "invalid" }),
        afterKnown: true,
      }],
    }));
    expect(commerceStore.inspect().status).toBe("corrupt");
    expect(window.localStorage.getItem(commerceStore.key)).toBe(before);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).not.toBeNull();
  });

  it("rejects duplicate persisted entity identities", () => {
    const duplicate = {
      ...INITIAL_PEOPLE_DATA,
      people: [INITIAL_PEOPLE_DATA.people[0], { ...INITIAL_PEOPLE_DATA.people[0] }],
    } as PeopleData;
    expect(peopleStore.write(duplicate)).toBe(false);
    window.localStorage.setItem(peopleStore.key, JSON.stringify(duplicate));
    expect(peopleStore.inspect().status).toBe("corrupt");
  });

  it("promotes birth data without persisting session payloads in the journal", () => {
    const profile = { version: 1 as const, birth: INITIAL_BIRTH };
    birthDraftStore.write(profile);
    const originalRemoveItem = window.sessionStorage.removeItem;
    window.sessionStorage.removeItem = () => {
      throw new Error("injected session cleanup failure");
    };
    try {
      expect(saveProfileAndClearBirthDraft(profile)).toBe("rolled-back");
      expect(window.localStorage.getItem(profileStore.key)).toBeNull();
      expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
      expect(window.sessionStorage.getItem(birthDraftStore.key)).not.toBeNull();
    } finally {
      window.sessionStorage.removeItem = originalRemoveItem;
    }
    expect(saveProfileAndClearBirthDraft(profile)).toBe("committed");
    expect(profileStore.read()).toEqual(profile);
    expect(birthDraftStore.inspect().status).toBe("empty");
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("does not report committed when journal cleanup cannot be verified", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const next = { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 };
    const step = createTransactionStep(commerceStore, next);
    const originalRemoveItem = window.localStorage.removeItem;
    window.localStorage.removeItem = (key) => {
      if (key === "sajurium-storage-transaction") throw new Error("injected journal cleanup failure");
      originalRemoveItem.call(window.localStorage, key);
    };
    try {
      expect(runStorageTransaction([step])).toBe("unreconciled");
      expect(window.localStorage.getItem("sajurium-storage-transaction")).not.toBeNull();
    } finally {
      window.localStorage.removeItem = originalRemoveItem;
    }
    expect(commerceStore.read()).toEqual(next);
    expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
  });

  it("retains a recovery journal when rollback fails and recovers later", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    consultationStore.write(INITIAL_CONSULTATION_DATA);
    const originalSetItem = window.localStorage.setItem;
    let commerceWrites = 0;
    window.localStorage.setItem = (key, value) => {
      if (key === commerceStore.key) {
        commerceWrites += 1;
        if (commerceWrites > 1) throw new Error("injected rollback failure");
      }
      if (key === consultationStore.key) throw new Error("injected forward failure");
      originalSetItem.call(window.localStorage, key, value);
    };
    try {
      expect(runStorageTransaction([
        createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 3 }),
        createTransactionStep(consultationStore, { ...INITIAL_CONSULTATION_DATA, freeUsesRemaining: 0 }),
      ])).toBe("unreconciled");
    } finally {
      window.localStorage.setItem = originalSetItem;
    }
    expect(commerceStore.read()).toEqual(INITIAL_COMMERCE_DATA);
    expect(getOwnedStorageInventory().find((item) => item.id === "transaction")?.status).toBe("empty");
  });

  it("rolls back a step that mutates before verification fails", () => {
    commerceStore.write(INITIAL_COMMERCE_DATA);
    const step = createTransactionStep(commerceStore, { ...INITIAL_COMMERCE_DATA, consultationCredits: 2 });
    const originalGetItem = window.localStorage.getItem;
    let commerceReads = 0;
    window.localStorage.getItem = (key) => {
      if (key === commerceStore.key) {
        commerceReads += 1;
        if (commerceReads === 2) return "__verification_mismatch__";
      }
      return originalGetItem.call(window.localStorage, key);
    };
    try {
      expect(runStorageTransaction([step])).toBe("rolled-back");
    } finally {
      window.localStorage.getItem = originalGetItem;
    }
    expect(commerceStore.read()).toEqual(INITIAL_COMMERCE_DATA);
  });

  it("reports removal failures instead of claiming deletion", () => {
    profileStore.write({ version: 1, birth: INITIAL_BIRTH });
    const originalRemoveItem = window.localStorage.removeItem;
    window.localStorage.removeItem = (key) => {
      if (key === profileStore.key) throw new Error("injected removal failure");
      originalRemoveItem.call(window.localStorage, key);
    };
    try {
      expect(profileStore.remove()).toBe(false);
      expect(profileStore.read()?.birth).toEqual(INITIAL_BIRTH);
    } finally {
      window.localStorage.removeItem = originalRemoveItem;
    }
  });

  it("derives complete inventory including session and technical stores", () => {
    const inventory = getOwnedStorageInventory();
    expect(inventory).toHaveLength(12);
    expect(inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "birth-draft", scope: "session" }),
      expect.objectContaining({ id: "feedback-selection", scope: "local" }),
      expect.objectContaining({ id: "transaction", scope: "local" }),
    ]));
  });

  it("counts and deletes a credit-only commerce record", () => {
    commerceStore.write({ ...INITIAL_COMMERCE_DATA, consultationCredits: 5 });
    const commerce = getOwnedStorageInventory().find((item) => item.id === "commerce");
    expect(commerce).toEqual(expect.objectContaining({ status: "ok", count: 1 }));
    expect(clearOwnedStorage("commerce")).toBe(true);
    expect(commerceStore.inspect().status).toBe("empty");
  });
});
