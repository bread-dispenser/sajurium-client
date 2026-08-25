import type {
  CompatibilityPersonSnapshot as ContractCompatibilityPersonSnapshot,
  CompatibilitySnapshot,
  ConsultationContext,
  ConsultationMessageView,
  ConsultationSessionView,
  CreditLedgerEntry,
  DailyFlowView,
  FeedbackProvenance,
  FeedbackTarget,
  FeedbackView,
  GenerationView,
  LibraryItemType,
  LibraryItemView,
  MonthlyFlowView,
  NotificationPreferenceView,
  OrderView,
  OwnerRelationship,
  ProductView,
  ProfileInput,
  TopicId as ContractTopicId,
} from "./contracts";

export type TopicId = Extract<ContractTopicId, "love" | "career" | "money" | "family">;
export type FeedbackId = "helpful" | "unclear" | "wrong";
export type FeedbackReason = FeedbackView["reason"];

export type BirthInfo = ProfileInput;

export type Topic = {
  id: TopicId;
  title: string;
  description: string;
};

export type FeedbackOption = {
  id: FeedbackId;
  symbol: string;
  title: string;
  description: string;
};

export type TopicPreview = {
  headline: string;
  introduction: string;
  strength: string;
  caution: string;
  flow: string;
};

export type ReportInsight = {
  id: string;
  title: string;
  description: string;
};

export type BasicReport = {
  currentFlow: string;
  insights: ReportInsight[];
  caution: string;
  suggestion: string;
};

export type ReportSection = {
  id: string;
  title: string;
  summary: string;
  details: string[];
  evidence: string;
  access: "free" | "paid";
};

export type DailyFlow = DailyFlowView;
export type MonthlyFlow = MonthlyFlowView;

export type { LibraryItemType };
export type LibraryItem = LibraryItemView;

export type LibraryData = {
  version: 1;
  items: LibraryItem[];
};

export type ConsultationMessage = ConsultationMessageView;
export type ConsultationSession = ConsultationSessionView;
export type { ConsultationContext };

export type ConsultationDraft = {
  topic: TopicId;
  question: string;
  situation: string;
};

export type ConsultationData = {
  version: 1;
  draft: ConsultationDraft | null;
  sessions: ConsultationSession[];
  freeUsesRemaining: number;
};

export type PersonRelationship = OwnerRelationship;

export type PersonProfile = {
  id: string;
  profile: ProfileInput;
  createdAt: string;
};

export type PeopleData = {
  version: 1;
  freeLimit: 2;
  people: PersonProfile[];
};

export type CompatibilityRelationshipType = CompatibilitySnapshot["relationshipType"];

export type CompatibilityDimension = {
  id: string;
  title: string;
  summary: string;
};

export type CompatibilityPersonSnapshot = ContractCompatibilityPersonSnapshot;

export type CompatibilityResult = CompatibilitySnapshot & {
  dimensions: CompatibilityDimension[];
  fixtureVersion: 1;
  fixture: true;
};

export type CompatibilityData = {
  version: 1;
  results: CompatibilityResult[];
};

export type ProductId = "consult-5" | "love-report" | "compatibility-report" | "career-report" | "money-report" | "year-report" | "decade-report";

export type Product = ProductView & {
  id: ProductId;
  preview: string;
};

/** Query-only selector used by the static checkout demonstration route. */
export type DemoOrderStatus = "pending" | "success" | "failure";
export type DemoOrder = OrderView;
export type OrderDuplicateKey = Pick<OrderView, "productId" | "profileId" | "chartSnapshotId" | "periodKey" | "interpretationVersion">;
export type CreditHistoryItem = CreditLedgerEntry;

export type CommerceData = {
  version: 1;
  orders: OrderView[];
  generations: GenerationView[];
  consultationCredits: number;
  creditHistory: CreditLedgerEntry[];
};

export type SettingsData = {
  version: 1;
  notifications: NotificationPreferenceView[];
};

export type FeedbackEntry = {
  id: string;
  target: FeedbackTarget;
  topic: TopicId;
  rating: FeedbackId;
  reason: FeedbackReason;
  comment: string;
  provenance: FeedbackProvenance;
  reported: boolean;
  createdAt: string;
};

export type FeedbackData = {
  version: 1;
  entries: FeedbackEntry[];
};

export type SavedReport = {
  version: 1;
  savedAt: string;
  birth: BirthInfo;
  topic: TopicId;
  feedback: FeedbackId | null;
};

export type FeedbackRecord = {
  version: 1;
  target: FeedbackTarget;
  topic: TopicId;
  rating: FeedbackId;
  reason: FeedbackReason;
  comment: string;
  provenance: FeedbackProvenance;
  reported: boolean;
  createdAt: string;
};

export type BirthDraft = {
  version: 1;
  birth: BirthInfo;
};

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
};

export type AppNavGroup = {
  label: string;
  items: readonly AppNavItem[];
};
