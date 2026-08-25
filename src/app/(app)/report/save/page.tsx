import { notFound } from "next/navigation";
import { SaveScreen } from "@/components/saju-screens";
import { isFeedbackId, isTopicId } from "@/lib/fixtures";

type SavePageProps = {
  searchParams: Promise<{ topic?: string | string[]; feedback?: string | string[] }>;
};

export default async function SavePage({ searchParams }: SavePageProps) {
  const { topic, feedback } = await searchParams;
  if (!isTopicId(topic)) notFound();
  const feedbackId = isFeedbackId(feedback) ? feedback : null;
  return <SaveScreen topicId={topic} feedback={feedbackId} />;
}
