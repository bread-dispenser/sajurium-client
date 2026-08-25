import { notFound } from "next/navigation";
import { TopicPreviewScreen } from "@/components/saju-screens";
import { isTopicId } from "@/lib/fixtures";

type TopicPageProps = {
  params: Promise<{ topic: string }>;
};

export default async function TopicPage({ params }: TopicPageProps) {
  const { topic } = await params;
  if (!isTopicId(topic)) notFound();
  return <TopicPreviewScreen topicId={topic} />;
}
