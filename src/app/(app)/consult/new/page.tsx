import { ConsultationNewScreen } from "@/components/consultation-screens";
import { isTopicId } from "@/lib/fixtures";

type ConsultNewPageProps = {
  searchParams: Promise<{ topic?: string | string[] }>;
};

export default async function ConsultNewPage({ searchParams }: ConsultNewPageProps) {
  const { topic } = await searchParams;
  const topicValue = Array.isArray(topic) ? topic[0] : topic;
  return <ConsultationNewScreen initialTopic={isTopicId(topicValue) ? topicValue : undefined} />;
}
