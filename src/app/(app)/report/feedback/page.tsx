import { notFound } from "next/navigation";
import { FeedbackScreen, FeedbackStartScreen } from "@/components/saju-screens";
import { isFeedbackId, isTopicId } from "@/lib/fixtures";

type FeedbackPageProps = {
  searchParams: Promise<{
    targetType?: string | string[];
    reportId?: string | string[];
    sessionId?: string | string[];
    messageId?: string | string[];
    topic?: string | string[];
    rating?: string | string[];
    report?: string | string[];
    reportKind?: string | string[];
  }>;
};

const SERVER_ID = /^\d+$/;

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { targetType, reportId, sessionId, messageId, topic, rating, report, reportKind } = await searchParams;
  const initialRating = isFeedbackId(rating) ? rating : null;
  const initialReported = report === "1";

  // 설정·안내 화면에서 대상 없이 들어오면 어디에 의견을 남기는지 안내한다.
  if (targetType === undefined && reportId === undefined && sessionId === undefined) return <FeedbackStartScreen />;

  // 상담 답변: 서버 상담 메시지 하나가 대상이다. 주제는 표시용이라 없으면 일반으로 본다.
  if (targetType === "consultation") {
    if (typeof sessionId !== "string" || typeof messageId !== "string" || !SERVER_ID.test(sessionId) || !SERVER_ID.test(messageId)) notFound();
    return <FeedbackScreen target={{ type: "consultation_message", sessionId, messageId }} topicId={isTopicId(topic) ? topic : "family"} initialRating={initialRating} initialReported={initialReported} />;
  }

  if (targetType !== "report" || typeof reportId !== "string" || !isTopicId(topic) || (!SERVER_ID.test(reportId) && reportId !== `rpt_fixture_${topic}`)) notFound();
  // 주제별 리포트는 서버 리포트지만 기본 리포트와 이름이 달라서, 링크가 어떤 리포트인지 알려준다.
  const topicReport = reportKind === "topic" && SERVER_ID.test(reportId);
  return <FeedbackScreen target={{ type: "report", reportId }} topicId={topic} initialRating={initialRating} initialReported={initialReported} topicReport={topicReport} />;
}
