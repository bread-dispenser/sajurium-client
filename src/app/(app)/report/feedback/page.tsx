import { notFound } from "next/navigation";
import { FeedbackScreen } from "@/components/saju-screens";
import { isFeedbackId, isTopicId } from "@/lib/fixtures";

type FeedbackPageProps = {
  searchParams: Promise<{
    targetType?: string | string[];
    reportId?: string | string[];
    topic?: string | string[];
    rating?: string | string[];
    report?: string | string[];
  }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { targetType, reportId, topic, rating, report } = await searchParams;
  if (targetType !== "report" || typeof reportId !== "string" || !isTopicId(topic) || (!/^\d+$/.test(reportId) && reportId !== `rpt_fixture_${topic}`)) notFound();
  return <FeedbackScreen target={{ type: "report", reportId }} topicId={topic} initialRating={isFeedbackId(rating) ? rating : null} initialReported={report === "1"} />;
}
