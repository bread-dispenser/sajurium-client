import type {
  AppNavGroup,
  AppNavItem,
  BasicReport,
  BirthInfo,
  ConsultationData,
  ConsultationDraft,
  CompatibilityDimension,
  CommerceData,
  FeedbackId,
  FlowReading,
  LibraryItem,
  PeopleData,
  Product,
  ProductId,
  ReportSection,
  SettingsData,
  FeedbackOption,
  Topic,
  TopicId,
  TopicPreview,
} from "./domain";

export const INITIAL_BIRTH: BirthInfo = {
  nickname: "서연",
  calendar: "solar",
  birthDate: "1992-06-18",
  birthTime: "14:30",
  unknownTime: false,
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

export const BASIC_REPORT: BasicReport = {
  currentFlow: "속도를 내기보다 기준을 다시 세우는 때로 보여요.",
  insights: [
    { id: "depth", title: "깊이 보는 사람", description: "겉보다 맥락을 읽고 신중하게 판단해요." },
    { id: "drive", title: "꾸준한 추진력", description: "기준이 서면 오래 집중하는 힘이 있어요." },
    { id: "balance", title: "섬세한 균형감", description: "관계의 분위기와 작은 변화를 잘 알아차려요." },
  ],
  caution: "혼자 충분히 검토하느라 타이밍을 놓칠 수 있어요.",
  suggestion: "결정 기준을 2~3개로 줄여보세요.",
};

export const REPORT_SECTIONS: readonly ReportSection[] = [
  {
    id: "temperament",
    title: "기본 성향",
    summary: "맥락을 충분히 이해한 뒤 움직일 때 강점이 잘 드러나요.",
    details: ["낯선 상황을 빠르게 단정하지 않아요.", "기준이 분명해지면 꾸준히 밀고 나가는 힘이 있어요."],
    evidence: "신중한 판단과 지속성에 관한 체험용 예시 조합을 근거로 보여주는 화면입니다.",
    access: "free",
  },
  {
    id: "relationship",
    title: "관계",
    summary: "가까워질수록 서로의 속도와 기대를 확인하는 편이 중요해요.",
    details: ["상대의 감정과 상황을 함께 고려해요.", "표현을 미루면 마음이 전달되지 않을 수 있어요."],
    evidence: "관계 성향과 현재 흐름에 관한 체험용 예시를 함께 표시합니다.",
    access: "free",
  },
  {
    id: "career",
    title: "직업과 커리어",
    summary: "납득할 수 있는 목표와 일하는 방식이 집중력을 좌우해요.",
    details: ["복잡한 일을 순서대로 정리하는 힘이 있어요.", "완벽한 조건을 기다리다 기회를 늦출 수 있어요."],
    evidence: "커리어 주제의 체험용 강점·주의 문장을 함께 보여줍니다.",
    access: "free",
  },
  {
    id: "money",
    title: "재물",
    summary: "큰 결정보다 반복 가능한 관리 기준을 세울 때 안정적이에요.",
    details: ["필요와 욕구를 구분하려는 편이에요.", "불안 때문에 필요한 기회까지 미루지 않도록 살펴보세요."],
    evidence: "재물 주제의 체험용 예시이며 실제 계산 결과가 아닙니다.",
    access: "paid",
  },
  {
    id: "long-flow",
    title: "장기 흐름",
    summary: "여러 해의 변화와 선택 기준을 함께 보는 심층 영역입니다.",
    details: ["장기 흐름과 구체적인 시기는 제공하지 않아요."],
    evidence: "이 내용은 실제 계산 결과가 아니며 현재 제공 범위에 포함되지 않습니다.",
    access: "paid",
  },
] as const;

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

export function getDailyFlow(date: string): FlowReading {
  const index = deterministicIndex(date, FLOW_HEADLINES.length);
  return {
    period: date,
    headline: FLOW_HEADLINES[index],
    summary: "이 내용은 날짜에 따라 정해진 체험용 예시이며 실제 사주 계산 결과가 아닙니다.",
    relationship: ["말보다 기대하는 방식을 먼저 확인해보세요.", "가까운 관계일수록 짧고 분명하게 표현해보세요."][index % 2],
    career: ["해야 할 일을 세 단계로 줄이면 집중하기 쉬워요.", "새 제안은 조건을 적어본 뒤 판단해보세요."][index % 2],
    money: ["작은 지출 기준 하나를 지켜보세요.", "필요한 지출과 미룰 수 있는 지출을 나눠보세요."][index % 2],
    caution: "체험용 예시 문장을 중요한 결정의 유일한 근거로 사용하지 마세요.",
    suggestion: "오늘 확인할 조건 한 가지를 메모해보세요.",
  };
}

export function getMonthlyFlow(month: string): FlowReading {
  const index = deterministicIndex(month, FLOW_HEADLINES.length);
  return {
    ...getDailyFlow(`${month}-01`),
    period: month,
    headline: FLOW_HEADLINES[(index + 1) % FLOW_HEADLINES.length],
    summary: "같은 달에는 언제 다시 열어도 동일한 체험용 예시 내용을 표시합니다.",
    suggestion: "이번 달에 유지할 기준과 바꿔볼 기준을 하나씩 적어보세요.",
  };
}

export const INITIAL_LIBRARY_ITEMS: readonly LibraryItem[] = [
  {
    id: "fixture-basic-report",
    type: "report",
    title: "무료 사주 요약",
    subtitle: "기본 성향과 현재 흐름",
    createdAt: "2026-08-24T10:00:00.000Z",
    href: "/report",
    hidden: false,
  },
  {
    id: "fixture-paid-report",
    type: "report",
    title: "연애 심층 리포트",
    subtitle: "구매한 리포트 · 숨김으로만 관리",
    createdAt: "2026-08-24T09:00:00.000Z",
    href: "/products/love-report",
    hidden: false,
  },
  {
    id: "fixture-consultation",
    type: "consultation",
    title: "일과 변화에 대한 상담",
    subtitle: "기기에 저장된 대화 예시",
    createdAt: "2026-08-23T10:00:00.000Z",
    href: "/consult",
    hidden: false,
  },
  {
    id: "fixture-compatibility",
    type: "compatibility",
    title: "두 사람의 관계 요약",
    subtitle: "두 사람의 관계 분석",
    createdAt: "2026-08-22T10:00:00.000Z",
    href: "/compatibility",
    hidden: false,
  },
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

export function getFixtureConsultationResponse(draft: ConsultationDraft) {
  const preview = getTopicPreview(draft.topic);
  return [
    "이 답변은 실제 AI 상담이나 사주 계산이 아닌 체험용 예시입니다.",
    preview.introduction,
    `지금 점검할 부분은 “${preview.caution}”입니다.`,
    draft.situation.trim()
      ? "적어주신 상황을 결정의 유일한 근거로 삼지 말고, 실제 조건과 상대방의 의사를 함께 확인해보세요."
      : "현재 상황을 조금 더 구체적으로 적으면 어떤 조건을 확인해야 하는지 정리하기 쉬워요.",
  ].join("\\n\\n");
}

export function isRestrictedConsultationQuestion(question: string) {
  return /(죽|사망|수명|질병|암 |진단|치료|주식|코인|종목|투자.*추천|당첨|범죄)/i.test(question);
}

export const INITIAL_PEOPLE_DATA: PeopleData = {
  version: 1,
  freeLimit: 2,
  people: [
    {
      id: "person-self",
      name: "서연",
      relationship: "self",
      birth: INITIAL_BIRTH,
      createdAt: "2026-08-24T09:00:00.000Z",
    },
    {
      id: "person-partner",
      name: "민준",
      relationship: "partner",
      birth: { ...INITIAL_BIRTH, nickname: "민준", birthDate: "1991-03-12", birthTime: "", unknownTime: true },
      createdAt: "2026-08-23T09:00:00.000Z",
    },
  ],
};

export const COMPATIBILITY_DIMENSIONS: readonly CompatibilityDimension[] = [
  { id: "communication", title: "소통", summary: "서로 결론에 도달하는 속도가 달라 확인 질문이 중요해요." },
  { id: "affection", title: "애정 표현", summary: "표현 방식보다 상대가 편하게 받아들이는 방식을 함께 살펴보세요." },
  { id: "lifestyle", title: "생활 리듬", summary: "혼자 쉬는 시간과 함께 보내는 시간의 기준을 정하면 좋아요." },
  { id: "conflict", title: "갈등", summary: "감정이 커지기 전에 사실과 기대를 나누어 말하는 편이 유리해요." },
  { id: "long-term", title: "장기 관계", summary: "중요한 선택에서 서로 포기할 수 없는 조건을 확인해보세요." },
] as const;

export const PRODUCTS: readonly Product[] = [
  { id: "consult-5", title: "상담 5회 이용권", price: 4900, description: "고민별 질문과 답변을 이어서 살펴보는 상담 상품", inclusions: ["질문 5회 표시", "상담 보관함", "후속 질문"], preview: "실제 AI 답변과 유료 이용권 지급은 포함되지 않습니다." },
  { id: "love-report", title: "연애 심층 리포트", price: 9900, description: "관계 성향과 반복 패턴을 차분히 살펴보는 리포트", inclusions: ["관계 성향", "반복 패턴", "시기 미리보기"], preview: "서연님의 관계에서는 속도와 기대를 확인하는 항목이 미리보기로 표시돼요." },
  { id: "compatibility-report", title: "궁합 심층 리포트", price: 12900, description: "두 사람의 관계를 여러 관점으로 살펴보는 리포트", inclusions: ["소통", "애정 표현", "생활 리듬", "갈등", "장기 관계"], preview: "저장된 두 사람의 이름만 화면에 반영하며 실제 궁합은 계산하지 않아요." },
  { id: "money-report", title: "재물 흐름 리포트", price: 9900, description: "소비·저축·결정 기준을 시기별로 정리하는 리포트", inclusions: ["재물 습관", "변화 조건", "시기별 점검"], preview: "필요한 지출과 미룰 수 있는 지출을 나누는 화면 예시예요." },
  { id: "year-report", title: "연간 흐름 리포트", price: 14900, description: "한 해의 방향과 관계·일·생활 흐름을 네 장면으로 읽는 리포트", inclusions: ["연간 방향", "분기별 장면", "관계와 일"], preview: "2026년 흐름을 네 장면으로 나눈 고정 예시를 먼저 확인해요." },
  { id: "decade-report", title: "10년 장기 흐름 리포트", price: 19900, description: "긴 호흡의 변화를 세 구간으로 살펴보는 리포트", inclusions: ["10년 방향", "세 구간 전환", "생활 기반"], preview: "장기 변화를 세 구간으로 읽는 정적 예시이며 실제 대운 계산은 하지 않아요." },
  { id: "career-report", title: "커리어 심층 리포트", price: 9900, description: "업무 환경과 변화 조건을 정리해보는 리포트", inclusions: ["업무 성향", "조직 환경", "변화 조건"], preview: "기준이 분명할수록 꾸준한 힘이 드러나는 미리보기예요." },
] as const;

export const INITIAL_COMMERCE_DATA: CommerceData = {
  version: 1,
  orders: [],
  consultationCredits: 0,
  creditHistory: [],
};

export const INITIAL_SETTINGS_DATA: SettingsData = {
  version: 1,
  notifications: { dailyFlow: false, monthlyFlow: false, email: false },
};

export function isProductId(value: unknown): value is ProductId {
  return typeof value === "string" && PRODUCTS.some((product) => product.id === value);
}

export function getProduct(productId: ProductId): Product {
  const product = PRODUCTS.find((candidate) => candidate.id === productId);
  if (!product) throw new Error(`Unknown product fixture: ${productId}`);
  return product;
}

const HOME_NAV_ITEM: AppNavItem = { href: "/home", label: "플랫폼 홈", shortLabel: "홈", description: "오늘의 흐름과 전체 서비스를 한곳에서 확인" };
const REPORT_NAV_ITEM: AppNavItem = { href: "/report", label: "내 사주", shortLabel: "사주", description: "기기에 저장된 출생 정보로 예시 리포트 확인" };
const CONSULT_NAV_ITEM: AppNavItem = { href: "/consult", label: "고민 상담", shortLabel: "상담", description: "고민 주제별 질문과 체험용 답변 관리" };
const COMPATIBILITY_NAV_ITEM: AppNavItem = { href: "/compatibility", label: "두 사람의 관계", shortLabel: "궁합", description: "저장한 두 사람으로 관계 예시 살펴보기" };
const LIBRARY_NAV_ITEM: AppNavItem = { href: "/library", label: "통합 보관함", shortLabel: "보관함", description: "리포트·상담·관계 결과를 모아 관리" };

export const APP_PRIMARY_NAV_ITEMS: readonly AppNavItem[] = [
  HOME_NAV_ITEM,
  REPORT_NAV_ITEM,
  CONSULT_NAV_ITEM,
  COMPATIBILITY_NAV_ITEM,
  LIBRARY_NAV_ITEM,
] as const;

export const APP_NAV_GROUPS: readonly AppNavGroup[] = [
  { label: "개요", items: [HOME_NAV_ITEM] },
  { label: "사주와 흐름", items: [
    REPORT_NAV_ITEM,
    { href: "/flow/today", label: "오늘의 흐름", shortLabel: "오늘", description: "날짜에 따라 일관된 체험용 흐름 확인" },
    { href: "/flow/month", label: "이번 달 흐름", shortLabel: "이번 달", description: "월별 관계·일·재물 흐름 예시 확인" },
    { href: "/calendar", label: "시기 캘린더", shortLabel: "캘린더", description: "날짜별 관계·일·재물 흐름 프로토타입" },
    { href: "/reports/year", label: "연간 리포트", shortLabel: "연간", description: "한 해의 방향을 네 장면으로 읽는 예시" },
    { href: "/reports/decade", label: "10년 리포트", shortLabel: "10년", description: "장기 변화를 세 구간으로 읽는 예시" },
  ] },
  { label: "상담과 관계", items: [
    CONSULT_NAV_ITEM,
    { href: "/people", label: "사람 보관함", shortLabel: "사람", description: "관계를 살펴볼 인물 정보를 이 기기에 저장" },
    COMPATIBILITY_NAV_ITEM,
  ] },
  { label: "기록과 상품", items: [
    LIBRARY_NAV_ITEM,
    { href: "/products", label: "리포트와 이용권", shortLabel: "상품", description: "상품 미리보기와 주문 상태 예시 확인" },
    { href: "/products/credits", label: "이용권 내역", shortLabel: "이용권", description: "체험용 상담 이용권과 변동 기록 확인" },
    { href: "/billing", label: "결제·복구 센터", shortLabel: "결제", description: "주문·지급·환불·멱등성·복구 상태 프로토타입" },
    { href: "/share", label: "공유 카드", shortLabel: "공유", description: "개인정보를 선택해 안전한 공유 카드 미리보기" },
    { href: "/share/links", label: "공유 링크 관리", shortLabel: "공유 링크", description: "만료·비활성화·민감정보 제한 프로토타입" },
    { href: "/shared/compatibility", label: "공개 관계 결과", shortLabel: "공개 결과", description: "민감정보를 제외한 공개 관계 요약 화면" },
    { href: "/life-log", label: "라이프 로그", shortLabel: "기록", description: "실제 사건과 선택을 시간순으로 기록하는 예시" },
  ] },
  { label: "계정과 관리", items: [
    { href: "/account", label: "계정 전환·삭제", shortLabel: "계정", description: "비회원 이전·중복 병합·삭제 검토 프로토타입" },
    { href: "/profile", label: "내 프로필", shortLabel: "프로필", description: "전체 출생 정보·관심사·스냅샷 수정 프로토타입" },
    { href: "/login", label: "로그인", shortLabel: "로그인", description: "소셜 로그인과 계정 전환 화면 프로토타입" },
    { href: "/notifications", label: "알림 센터", shortLabel: "알림", description: "흐름·리포트·결제 알림과 수신 선호 체험" },
    { href: "/notifications/policy", label: "알림 정책", shortLabel: "알림 정책", description: "조용한 시간·중복 억제·딥링크 정책 프로토타입" },
    { href: "/settings", label: "설정과 개인정보", shortLabel: "설정", description: "기기 저장 정보·알림 선호·안내 관리" },
    { href: "/settings/feedback", label: "피드백과 신고", shortLabel: "피드백", description: "저장한 평가와 품질 신고 내용 관리" },
  ] },
  { label: "운영", items: [
    { href: "/admin", label: "관리자 워크스페이스", shortLabel: "관리자", description: "사용자·주문·리포트·상담·품질 운영 프로토타입" },
    { href: "/admin/operations", label: "운영 상세", shortLabel: "운영", description: "템플릿·프롬프트·환불·복구·감사 프로토타입" },
    { href: "/admin/analytics", label: "분석 대시보드", shortLabel: "분석", description: "퍼널·전환·실패·품질 지표 프로토타입" },
  ] },
  { label: "플랫폼 랩스", items: [
    { href: "/platform-labs", label: "장기 확장 실험", shortLabel: "랩스", description: "검증·가족·자동 리포트·구독·전문가·글로벌 체험" },
  ] },
] as const;

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
