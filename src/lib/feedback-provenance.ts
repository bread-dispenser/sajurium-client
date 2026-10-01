import type { StoredFeedbackProvenance } from "./contracts";
import { readServerJourney, type ServerJourney } from "./api/service";

/** Fixed lineage of the topic preview fixtures. Only fixture targets may carry it. */
export const FIXTURE_FEEDBACK_PROVENANCE: StoredFeedbackProvenance = {
  profileSnapshotId: "profile_snapshot_fixture_primary",
  chartSnapshotIds: ["chart_fixture_primary"],
  modelVersion: null,
  promptVersion: null,
  templateVersion: "fixture-1",
};

export const UNKNOWN_FEEDBACK_PROVENANCE: StoredFeedbackProvenance = {
  profileSnapshotId: null,
  chartSnapshotIds: null,
  modelVersion: null,
  promptVersion: null,
  templateVersion: null,
};

/** Server reports have numeric ids; anything else is a fixture preview. */
export function isServerReportId(reportId: string) {
  return /^\d+$/.test(reportId);
}

/**
 * Provenance to store with report feedback on this device.
 *
 * A server report takes its profile and chart from the server journey, but only when that journey
 * produced this exact report; ids from another report would mislabel the feedback. The client never
 * learns the report's model, prompt or template version here, so those stay unknown.
 */
export function reportFeedbackProvenance(reportId: string, journey: ServerJourney | null = readServerJourney()): StoredFeedbackProvenance {
  if (!isServerReportId(reportId)) return FIXTURE_FEEDBACK_PROVENANCE;
  if (!journey || journey.reportId !== reportId) return UNKNOWN_FEEDBACK_PROVENANCE;
  return {
    ...UNKNOWN_FEEDBACK_PROVENANCE,
    profileSnapshotId: journey.profileId || null,
    chartSnapshotIds: journey.chartId ? [journey.chartId] : null,
  };
}
