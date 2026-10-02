import type {
  BirthInfo,
  ConsultationData,
  CommerceData,
  DailyFlow,
  FeedbackId,
  LibraryItem,
  MonthlyFlow,
  PeopleData,
  Product,
  ProductId,
  SettingsData,
  FeedbackOption,
  Topic,
  TopicId,
  TopicPreview,
} from "./domain";
import { withAllowedLibraryActions } from "./contracts";

export const INITIAL_BIRTH: BirthInfo = {
  displayName: "서연",
  calendar: "solar",
  leapMonth: false,
  birthDate: "1992-06-18",
  birthTime: "14:30",
  birthTimeUnknown: false,
  birthplace: "서울",
  timezone: "Asia/Seoul",
  calculationGender: "female",
  profileType: "self",
  ownerRelationship: "self",
  personalization: {
    interests: ["love"],
    relationshipStatus: null,
    occupationStatus: null,
    primaryConcern: null,
  },
  thirdPartyConsent: false,
};

export const TOPICS: readonly Topic[] = [
  { id: "love", title: "연애 · 관계", description: "마음을 주고받는 방식과 관계의 흐름" },
  { id: "career", title: "일 · 커리어", description: "나에게 맞는 환경과 변화의 조건" },
  { id: "money", title: "재물", description: "돈을 대하는 태도와 관리 패턴" },
  { id: "family", title: "가족 · 인간관계", description: "가까운 사이에서 지켜야 할 경계" },
] as const;

export const FEEDBACK_OPTIONS: readonly FeedbackOption[] = [
  { id: "helpful", symbol: "✓", title: "도움이 됐어요", description: "읽고 나니 내 흐름이 더 선명해졌어요." },
  { id: "unclear", symbol: "△", title: "조금 애매해요", description: "일부는 맞지만 더 구체적이면 좋겠어요." },
  { id: "wrong", symbol: "×", title: "맞지 않아요", description: "내 경험과 다르게 느껴졌어요." },
] as const;

export const TOPIC_PREVIEWS: Readonly<Record<TopicId, TopicPreview>> = {
  love: {
    headline: "가까워질수록\n속도를 맞추는 일이 중요해요",
    introduction: "상대를 오래 살핀 뒤 마음을 여는 편이라 관계가 시작되면 깊고 안정적으로 이어가요.",
    strength: "감정에 휩쓸리기보다 상대의 상황을 함께 고려하는 균형감이 있어요.",
    caution: "확신이 들 때까지 표현을 미루면 상대는 마음을 알아채기 어려울 수 있어요.",
    flow: "새로운 관계를 서두르기보다 서로의 생활 리듬과 기대하는 방식을 확인하는 편이 유리해요.",
  },
  career: {
    headline: "기준이 분명할수록\n꾸준한 힘이 드러나요",
    introduction: "빠른 변화보다 납득할 수 있는 목표와 안정적인 환경에서 집중력이 오래 이어져요.",
    strength: "복잡한 상황의 맥락을 읽고 해야 할 일을 차근차근 구조화하는 힘이 있어요.",
    caution: "모든 조건이 갖춰질 때까지 기다리면 좋은 제안을 지나칠 수 있어요.",
    flow: "당장 결론을 내리기보다 원하는 업무 방식과 포기할 수 없는 조건을 먼저 적어보세요.",
  },
  money: {
    headline: "작은 기준을 세우면\n흐름이 더 안정돼요",
    introduction: "충동적인 선택보다는 충분히 살피고 납득한 곳에 자원을 쓰는 편이에요.",
    strength: "필요와 욕구를 구분하고 장기적인 균형을 고려하는 감각이 있어요.",
    caution: "불안을 줄이려는 마음이 지나치면 필요한 기회까지 미룰 수 있어요.",
    flow: "큰 결정보다 이번 달에 지킬 수 있는 한 가지 소비 기준부터 세우는 편이 유리해요.",
  },
  family: {
    headline: "가까운 사이일수록\n부드러운 경계가 필요해요",
    introduction: "주변의 분위기와 마음을 세심하게 살피며 관계를 안정적으로 이어가려 해요.",
    strength: "말하지 않은 감정까지 알아차리고 서로의 입장을 함께 고려하는 힘이 있어요.",
    caution: "갈등을 피하려고 내 필요를 미루면 뒤늦게 피로가 커질 수 있어요.",
    flow: "상대의 기대를 짐작하기보다 내가 가능한 범위를 짧고 분명하게 말해보세요.",
  },
};

const FLOW_HEADLINES = [
  "빠르게 결정하기보다 조건을 확인할 때예요.",
  "익숙한 방식에서 작은 변화를 시도해볼 만해요.",
  "관계와 일의 경계를 정리하면 집중하기 쉬워요.",
  "새로운 일보다 이어오던 일을 마무리하기 좋아요.",
] as const;

function deterministicIndex(key: string, length: number) {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % length;
}

const FIXTURE_PROVENANCE = {
  chartSnapshotId: "chart_fixture_primary",
  interpretationVersion: "fixture-1",
  modelVersion: null,
  promptVersion: null,
  templateVersion: "fixture-1",
  generatedAt: "2026-08-24T10:00:00.000Z",
} as const;

export function getDailyFlow(date: string): DailyFlow {
  const index = deterministicIndex(date, FLOW_HEADLINES.length);
  return {
    kind: "daily",
    profileId: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X",
    date,
    headline: FLOW_HEADLINES[index],
    summary: "이 내용은 날짜에 따라 정해진 체험용 예시이며 실제 사주 계산 결과가 아닙니다.",
    priorityArea: (["relationship", "career", "money"] as const)[index % 3],
    caution: "체험용 예시 문장을 중요한 결정의 유일한 근거로 사용하지 마세요.",
    suggestedQuestion: "오늘 확인할 조건 한 가지를 메모해보세요.",
    provenance: FIXTURE_PROVENANCE,
  };
}

export function getMonthlyFlow(month: string): MonthlyFlow {
  const index = deterministicIndex(month, FLOW_HEADLINES.length);
  return {
    kind: "monthly",
    profileId: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X",
    month,
    headline: FLOW_HEADLINES[(index + 1) % FLOW_HEADLINES.length],
    overview: "같은 달에는 언제 다시 열어도 동일한 체험용 예시 내용을 표시합니다.",
    earlyPeriod: "초반에는 이어오던 일의 조건을 정리하고 속도를 조절해보세요.",
    middlePeriod: "중반에는 관계와 일에서 확인 질문을 먼저 건네는 편이 좋아요.",
    latePeriod: "후반에는 새 일을 벌이기보다 선택한 일을 마무리해보세요.",
    relationship: "기대하는 방식을 짐작하지 말고 짧게 확인해보세요.",
    career: "새 제안은 원하는 조건을 적은 뒤 판단해보세요.",
    money: "필요한 지출과 미룰 수 있는 지출을 나눠보세요.",
    cautionPeriods: [`${month}-08 ~ ${month}-11`, `${month}-23 ~ ${month}-25`],
    opportunityPeriods: [`${month}-14 ~ ${month}-18`],
    provenance: FIXTURE_PROVENANCE,
  };
}

export const INITIAL_LIBRARY_ITEMS: readonly LibraryItem[] = [
  withAllowedLibraryActions({
    id: "fixture-basic-report",
    type: "report",
    title: "무료 사주 요약",
    subtitle: "기본 성향과 현재 흐름",
    createdAt: "2026-08-24T10:00:00.000Z",
    href: "/report",
    access: "available",
    purchased: false,
    read: true,
    hidden: false,
    profile: { id: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X", displayName: "서연" },
    topic: null,
  }),
  withAllowedLibraryActions({
    id: "fixture-paid-report",
    type: "report",
    title: "연애 심층 리포트",
    subtitle: "구매한 리포트 · 숨김으로만 관리",
    createdAt: "2026-08-24T09:00:00.000Z",
    href: "/products/love-report",
    access: "available",
    purchased: true,
    read: false,
    hidden: false,
    profile: { id: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X", displayName: "서연" },
    topic: "love",
  }),
  withAllowedLibraryActions({
    id: "fixture-consultation",
    type: "consultation",
    title: "일과 변화에 대한 상담",
    subtitle: "기기에 저장된 대화 예시",
    createdAt: "2026-08-23T10:00:00.000Z",
    href: "/consult",
    access: "available",
    purchased: false,
    read: false,
    hidden: false,
    profile: { id: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X", displayName: "서연" },
    topic: "career",
  }),
  withAllowedLibraryActions({
    id: "fixture-compatibility",
    type: "compatibility",
    title: "두 사람의 관계 요약",
    subtitle: "두 사람의 관계 분석",
    createdAt: "2026-08-22T10:00:00.000Z",
    href: "/compatibility",
    access: "available",
    purchased: false,
    read: false,
    hidden: false,
    profile: { id: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X", displayName: "서연 · 민준" },
    topic: "love",
  }),
] as const;

export const RECOMMENDED_QUESTIONS: Readonly<Record<TopicId, readonly string[]>> = {
  love: ["관계에서 반복되는 패턴은 무엇인가요?", "새로운 관계에서 점검할 부분은 무엇인가요?", "마음을 표현할 때 어떤 점을 주의하면 좋을까요?"],
  career: ["이직을 고민할 때 어떤 조건을 먼저 봐야 하나요?", "나에게 맞는 업무 환경은 어떤 모습인가요?", "지금 변화를 준비할 때 점검할 부분은 무엇인가요?"],
  money: ["소비와 저축에서 반복되는 패턴은 무엇인가요?", "재정 결정을 내릴 때 어떤 기준이 필요한가요?", "불안 때문에 결정을 미루고 있지는 않은가요?"],
  family: ["가까운 관계에서 경계를 어떻게 표현하면 좋을까요?", "반복되는 갈등에서 점검할 부분은 무엇인가요?", "상대의 기대와 내 필요를 어떻게 구분할까요?"],
};

export const INITIAL_CONSULTATION_DATA: ConsultationData = {
  version: 1,
  draft: null,
  sessions: [],
  freeUsesRemaining: 1,
};

export function isRestrictedConsultationQuestion(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  return [
    /죽|사망|수명/i,
    /질병|암|진단|치료/i,
    /임신|출산/i,
    /범죄|재판|소송|판결|법정|유죄|무죄/i,
    /주식|코인|종목/i,
    /투자.{0,30}(?:추천|수익|보장|확정)|(?:추천|수익|보장|확정).{0,30}투자/i,
    /도박|복권|로또|카지노|베팅|당첨/i,
    /(?:타인|다른 사람|상대(?:방)?|그 사람).{0,20}(?:속마음|생각|마음|진심)|(?:속마음|생각|마음|진심).{0,20}(?:타인|다른 사람|상대(?:방)?|그 사람)/i,
    /외도|불륜|바람/i,
  ].some((pattern) => pattern.test(normalized));
}

export const INITIAL_PEOPLE_DATA: PeopleData = {
  version: 1,
  freeLimit: 2,
  people: [
    {
      id: "prf_01J62Z7M4Q8Y3T1K9A5C6N2R0X",
      profile: INITIAL_BIRTH,
      createdAt: "2026-08-24T09:00:00.000Z",
    },
    {
      id: "prf_01J62Z8B7H4W6D9P2F3K5M1Q0V",
      profile: {
        ...INITIAL_BIRTH,
        displayName: "민준",
        birthDate: "1991-03-12",
        birthTime: null,
        birthTimeUnknown: true,
        calculationGender: "male",
        profileType: "other",
        ownerRelationship: "partner",
        thirdPartyConsent: true,
      },
      createdAt: "2026-08-23T09:00:00.000Z",
    },
  ],
};

export const PRODUCTS: readonly Product[] = [
  {
    id: "consult-1", slug: "consult-1", version: "1", status: "active", kind: "consultation_credit", title: "상담 1회 이용권",
    description: "필요할 때 한 번 이용하는 상담 이용권", answersQuestions: ["지금 고민에서 먼저 확인할 현실 조건은 무엇인가요?"],
    requiredInputs: ["현재 프로필", "상담 주제", "질문 또는 상황"], requiresBirthTime: false, includedSections: ["질문 1회 표시", "상담 보관함"],
    generationMethod: "저장된 프로필과 사용자가 입력한 상담 맥락을 바탕으로 답변을 생성합니다.", priceAmount: 2500, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 재시도 또는 이용권 복구를 제공합니다.", preview: "선택한 고민 주제와 질문 맥락을 바탕으로 답변 구성을 미리 보여드려요.",
  },
  {
    id: "consult-5", slug: "consult-5", version: "1", status: "active", kind: "consultation_credit", title: "상담 5회 이용권",
    description: "고민별 질문과 답변을 이어서 살펴보는 상담 상품", answersQuestions: ["지금 고민에서 먼저 확인할 현실 조건은 무엇인가요?", "후속 질문으로 어떤 관점을 더 살펴볼 수 있나요?"],
    requiredInputs: ["현재 프로필", "상담 주제", "질문 또는 상황"], requiresBirthTime: false, includedSections: ["질문 5회 표시", "상담 보관함", "후속 질문"],
    generationMethod: "저장된 프로필과 사용자가 입력한 상담 맥락을 바탕으로 회차별 답변을 생성합니다.", priceAmount: 4900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 재시도 또는 이용권 복구를 제공합니다.", preview: "선택한 고민 주제와 질문 맥락을 바탕으로 답변 구성을 미리 보여드려요.",
  },
  {
    id: "love-report", slug: "love-report", version: "1", status: "active", kind: "report", title: "연애 심층 리포트",
    description: "관계 성향과 반복 패턴을 차분히 살펴보는 리포트", answersQuestions: ["관계에서 반복되는 기대와 반응은 무엇인가요?", "관계를 편안하게 만드는 대화 기준은 무엇인가요?"],
    requiredInputs: ["현재 프로필", "연애·관계 관심사 또는 고민"], requiresBirthTime: false, includedSections: ["관계 성향", "반복 패턴", "시기 미리보기"],
    generationMethod: "프로필 입력과 선택한 관계 관심사를 리포트 템플릿에 반영해 생성합니다.", priceAmount: 9900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 해석 버전으로 재시도합니다.", preview: "관계의 속도와 기대를 확인하는 맞춤 항목을 먼저 보여드려요.",
  },
  {
    id: "compatibility-report", slug: "compatibility-report", version: "1", status: "active", kind: "report", title: "궁합 심층 리포트",
    description: "두 사람의 관계를 여러 관점으로 살펴보는 리포트", answersQuestions: ["두 사람의 소통 방식은 어디에서 맞거나 엇갈리나요?", "장기 관계에서 함께 조율할 조건은 무엇인가요?"],
    requiredInputs: ["현재 프로필", "비교할 상대 프로필", "관계 유형"], requiresBirthTime: false, includedSections: ["소통", "애정 표현", "생활 리듬", "갈등", "장기 관계"],
    generationMethod: "동의받아 저장한 두 프로필과 관계 유형을 함께 반영해 생성합니다.", priceAmount: 12900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 재시도하거나 결제 상태를 복구합니다.", preview: "선택한 두 사람과 관계 유형에 맞춘 비교 항목을 먼저 보여드려요.",
  },
  {
    id: "money-report", slug: "money-report", version: "1", status: "active", kind: "report", title: "재물 흐름 리포트",
    description: "소비·저축·결정 기준을 시기별로 정리하는 리포트", answersQuestions: ["돈을 쓸 때 반복되는 판단 기준은 무엇인가요?", "변화기에는 어떤 재정 조건을 먼저 점검해야 하나요?"],
    requiredInputs: ["현재 프로필", "재물 관심사 또는 고민"], requiresBirthTime: false, includedSections: ["재물 습관", "변화 조건", "시기별 점검"],
    generationMethod: "프로필 입력과 재물 관심사를 기간별 리포트 템플릿에 반영해 생성합니다.", priceAmount: 9900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 해석 버전으로 재시도합니다.", preview: "필요한 지출과 미룰 수 있는 지출을 나누는 맞춤 점검 항목을 보여드려요.",
  },
  {
    id: "family-report", slug: "family-report", version: "1", status: "active", kind: "report", title: "가족 심층 리포트",
    description: "가족 안에서의 역할과 거리감을 차분히 살펴보는 리포트", answersQuestions: ["가족 관계에서 반복되는 패턴은 무엇인가요?", "가까운 사이에서 경계를 어떻게 표현하면 좋을까요?"],
    requiredInputs: ["기준 명식", "기준 연도"], requiresBirthTime: false, includedSections: ["가족 관계에서 반복되는 패턴", "시주로 보는 자녀·후배와의 관계"],
    generationMethod: "고른 사람의 명식을 가족 주제 화면과 같은 기준 연도로 읽어 심층 섹션을 엽니다.", priceAmount: 4900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 기준 연도로 재시도합니다.", preview: "가족 주제 화면에서 강점, 주의할 점, 지금의 흐름을 먼저 무료로 볼 수 있어요.",
  },
  {
    id: "year-report", slug: "year-report", version: "1", status: "active", kind: "report", title: "연간 흐름 리포트",
    description: "한 해의 방향과 관계·일·생활 흐름을 네 장면으로 읽는 리포트", answersQuestions: ["올해 집중할 생활 영역은 무엇인가요?", "분기마다 점검할 변화 신호는 무엇인가요?"],
    requiredInputs: ["현재 프로필", "조회 연도", "관심사 또는 고민"], requiresBirthTime: false, includedSections: ["연간 방향", "분기별 장면", "관계와 일"],
    generationMethod: "프로필 입력과 조회 연도, 관심사를 연간 리포트 템플릿에 반영해 생성합니다.", priceAmount: 14900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 연도와 해석 버전으로 재시도합니다.", preview: "선택한 연도의 흐름을 현재 관심사에 맞춘 네 장면으로 구성해 보여드려요.",
  },
  {
    id: "decade-report", slug: "decade-report", version: "1", status: "active", kind: "report", title: "대운(10년) 심층 리포트",
    description: "10년 단위 흐름을 구간별 근거와 함께 정리하는 리포트", answersQuestions: ["다음 대운으로 넘어가기 전에 무엇을 준비하면 좋을까요?", "구간마다 어떤 명식 요소가 흐름을 이끄나요?"],
    requiredInputs: ["기준 명식", "기준 연도"], requiresBirthTime: false, includedSections: ["다음 대운 준비", "구간별 심층 해설"],
    generationMethod: "고른 사람의 명식에서 대운 구간을 계산하고, 대운 화면과 같은 기준 연도로 구간별 해설을 엽니다.", priceAmount: 5900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 기준 연도로 재시도합니다.", preview: "대운 화면에서 지금의 대운과 전체 흐름을 먼저 무료로 볼 수 있어요.",
  },
  {
    id: "career-report", slug: "career-report", version: "1", status: "active", kind: "report", title: "커리어 심층 리포트",
    description: "업무 환경과 변화 조건을 정리해보는 리포트", answersQuestions: ["꾸준히 힘을 내기 좋은 업무 환경은 무엇인가요?", "변화를 결정하기 전에 확인할 조건은 무엇인가요?"],
    requiredInputs: ["현재 프로필", "커리어 관심사 또는 고민", "현재 직업 상태"], requiresBirthTime: false, includedSections: ["업무 성향", "조직 환경", "변화 조건"],
    generationMethod: "프로필 입력과 직업 상태, 커리어 관심사를 리포트 템플릿에 반영해 생성합니다.", priceAmount: 9900, priceCurrency: "KRW",
    refundPolicy: "생성 전에는 환불할 수 있고, 생성 실패 시 같은 해석 버전으로 재시도합니다.", preview: "현재 커리어 고민을 기준으로 업무 환경과 변화 조건을 먼저 보여드려요.",
  },
] as const;

export const INITIAL_COMMERCE_DATA: CommerceData = {
  version: 1,
  orders: [],
  generations: [],
  consultationCredits: 0,
  creditHistory: [],
};

export const INITIAL_SETTINGS_DATA: SettingsData = {
  version: 1,
  notifications: [
    {
      channel: "push",
      enabled: false,
      topics: {
        payment_completed: true,
        monthly_flow: false,
        important_period: false,
        report_completed: true,
        consultation_completed: true,
        low_credits: true,
        resume_consultation: false,
        interest_change: false,
      },
      quietHours: { enabled: true, start: "22:00", end: "08:00", timezone: "Asia/Seoul" },
      suppressDuplicates: true,
    },
    {
      channel: "email",
      enabled: false,
      topics: {
        payment_completed: true,
        monthly_flow: false,
        important_period: false,
        report_completed: true,
        consultation_completed: true,
        low_credits: true,
        resume_consultation: false,
        interest_change: false,
      },
      quietHours: { enabled: true, start: "22:00", end: "08:00", timezone: "Asia/Seoul" },
      suppressDuplicates: true,
    },
  ],
};

export function isProductId(value: unknown): value is ProductId {
  return typeof value === "string" && PRODUCTS.some((product) => product.id === value);
}

export function getProduct(productId: ProductId): Product {
  const product = PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product) throw new Error(`Unknown product fixture: ${productId}`);
  return product;
}

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && TOPICS.some((topic) => topic.id === value);
}

export function isFeedbackId(value: unknown): value is FeedbackId {
  return typeof value === "string" && FEEDBACK_OPTIONS.some((option) => option.id === value);
}

export function getTopic(topicId: TopicId): Topic {
  const topic = TOPICS.find((candidate) => candidate.id === topicId);
  if (!topic) throw new Error(`Unknown topic fixture: ${topicId}`);
  return topic;
}

export function getTopicPreview(topicId: TopicId): TopicPreview {
  return TOPIC_PREVIEWS[topicId];
}
