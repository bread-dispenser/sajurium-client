import { notFound } from "next/navigation";
import { FeedbackScreen } from "@/components/saju-screens";
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
  }>;
};

const SERVER_ID = /^\d+$/;

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { targetType, reportId, sessionId, messageId, topic, rating, report } = await searchParams;
  const initialRating = isFeedbackId(rating) ? rating : null;
  const initialReported = report === "1";

  // 상담 답변: 서버 상담 메시지 하나가 대상이다. 주제는 표시용이라 없으면 일반으로 본다.
  if (targetType === "consultation") {
    if (typeof sessionId !== "string" || typeof messageId !== "string" || !SERVER_ID.test(sessionId) || !SERVER_ID.test(messageId)) notFound();
    return <FeedbackScreen target={{ type: "consultation_message", sessionId, messageId }} topicId={isTopicId(topic) ? topic : "family"} initialRating={initialRating} initialReported={initialReported} />;
  }

  if (targetType !== "report" || typeof reportId !== "string" || !isTopicId(topic) || (!SERVER_ID.test(reportId) && reportId !== `rpt_fixture_${topic}`)) notFound();
  return <FeedbackScreen target={{ type: "report", reportId }} topicId={topic} initialRating={initialRating} initialReported={initialReported} />;
}
