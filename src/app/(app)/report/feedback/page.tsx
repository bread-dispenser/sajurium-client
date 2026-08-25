import { notFound } from "next/navigation";
import { FeedbackScreen } from "@/components/saju-screens";
import { isTopicId } from "@/lib/fixtures";

type FeedbackPageProps = {
  searchParams: Promise<{
    targetType?: string | string[];
    reportId?: string | string[];
    topic?: string | string[];
  }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { targetType, reportId, topic } = await searchParams;
  if (targetType !== "report" || typeof reportId !== "string" || !isTopicId(topic) || reportId !== `rpt_fixture_${topic}`) notFound();
  return <FeedbackScreen target={{ type: "report", reportId }} topicId={topic} />;
}
