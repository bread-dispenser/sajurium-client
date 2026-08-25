import { beforeEach, describe, expect, it } from "vitest";
import type { CommerceData, PeopleData } from "@/lib/domain";
import { INITIAL_BIRTH, INITIAL_COMMERCE_DATA, INITIAL_CONSULTATION_DATA, INITIAL_PEOPLE_DATA } from "@/lib/fixtures";
import {
  birthDraftStore,
  clearOwnedStorage,
  commerceStore,
  consultationStore,
  createTransactionStep,
  getOwnedStorageInventory,
  inspectStorageTransaction,
  peopleStore,
  profileStore,
  reportStore,
  runStorageTransaction,
  saveProfileAndClearBirthDraft,
  saveReportAndClearBirthDraft,
  settingsStore,
} from "@/lib/storage";

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

  it("notifies same-tab subscribers and removes settings", () => {
    let calls = 0;
    const unsubscribe = settingsStore.subscribe(() => { calls += 1; });
    settingsStore.write({ version: 1, notifications: { dailyFlow: true, monthlyFlow: false, email: false } });
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
        ...INITIAL_COMMERCE_DATA,
        creditHistory: [{ id: `invalid-${String(delta)}`, label: "invalid", delta, createdAt: "2026-08-25T00:00:00.000Z" }],
      } as CommerceData;
      expect(commerceStore.write(invalid)).toBe(false);
      expect(runStorageTransaction([createTransactionStep(commerceStore, invalid)])).toBe("unreconciled");
      expect(window.localStorage.getItem(commerceStore.key)).toBe(before);
      expect(window.localStorage.getItem("sajurium-storage-transaction")).toBeNull();
    }
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
