export type CalendarBasis = "solar" | "lunar" | "leap";
export type TopicId = "love" | "career" | "money" | "family";
export type FeedbackId = "helpful" | "unclear" | "wrong";

export type BirthInfo = {
  nickname: string;
  calendar: CalendarBasis;
  birthDate: string;
  birthTime: string;
  unknownTime: boolean;
};

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

export type FlowReading = {
  period: string;
  headline: string;
  summary: string;
  relationship: string;
  career: string;
  money: string;
  caution: string;
  suggestion: string;
};

export type LibraryItemType = "report" | "consultation" | "compatibility";

export type LibraryItem = {
  id: string;
  type: LibraryItemType;
  title: string;
  subtitle: string;
  createdAt: string;
  href: string;
  hidden: boolean;
};

export type LibraryData = {
  version: 1;
  items: LibraryItem[];
};

export type ConsultationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  fixture: boolean;
};

export type ConsultationSession = {
  id: string;
  topic: TopicId;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConsultationMessage[];
};

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

export type PersonRelationship = "self" | "partner" | "family" | "friend" | "coworker";

export type PersonProfile = {
  id: string;
  name: string;
  relationship: PersonRelationship;
  birth: BirthInfo;
  createdAt: string;
};

export type PeopleData = {
  version: 1;
  freeLimit: 2;
  people: PersonProfile[];
};

export type CompatibilityRelationshipType = "dating" | "marriage" | "family" | "friend" | "business";

export type CompatibilityDimension = {
  id: string;
  title: string;
  summary: string;
};

export type CompatibilityPersonSnapshot = {
  name: string;
  relationship: PersonRelationship;
  birthYear: string;
  unknownTime: boolean;
};

export type CompatibilityResult = {
  id: string;
  personAId: string;
  personBId: string;
  personA: CompatibilityPersonSnapshot;
  personB: CompatibilityPersonSnapshot;
  relationshipType: CompatibilityRelationshipType;
  createdAt: string;
  summary: string;
  dimensions: CompatibilityDimension[];
  fixtureVersion: 1;
  fixture: true;
};

export type CompatibilityData = {
  version: 1;
  results: CompatibilityResult[];
};

export type ProductId = "consult-5" | "love-report" | "compatibility-report" | "career-report";

export type Product = {
  id: ProductId;
  title: string;
  price: number;
  description: string;
  inclusions: string[];
  preview: string;
};

export type DemoOrderStatus = "pending" | "success" | "failure";

export type DemoOrder = {
  id: string;
  productId: ProductId;
  status: DemoOrderStatus;
  createdAt: string;
};

export type CreditHistoryItem = {
  id: string;
  label: string;
  delta: number;
  createdAt: string;
};

export type CommerceData = {
  version: 1;
  orders: DemoOrder[];
  consultationCredits: number;
  creditHistory: CreditHistoryItem[];
};

export type NotificationPreferences = {
  dailyFlow: boolean;
  monthlyFlow: boolean;
  email: boolean;
};

export type SettingsData = {
  version: 1;
  notifications: NotificationPreferences;
};

export type FeedbackEntry = {
  id: string;
  topic: TopicId;
  rating: FeedbackId;
  reason: string;
  comment: string;
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
  savedAt: string;
  topic: TopicId;
  feedback: FeedbackId;
};

export type BirthDraft = {
  version: 1;
  birth: BirthInfo;
};

export type AppNavItem = {
  href: string;
  label: string;
  shortLabel: string;
};
