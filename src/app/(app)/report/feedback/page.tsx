import { notFound } from "next/navigation";
import { FeedbackScreen } from "@/components/saju-screens";
import { isTopicId } from "@/lib/fixtures";

type FeedbackPageProps = {
  searchParams: Promise<{ topic?: string | string[] }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { topic } = await searchParams;
  if (!isTopicId(topic)) notFound();
  return <FeedbackScreen topicId={topic} />;
}
