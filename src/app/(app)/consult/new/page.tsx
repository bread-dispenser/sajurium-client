import { ConsultationNewScreen } from "@/components/consultation-screens";
import { isTopicId } from "@/lib/fixtures";

type ConsultNewPageProps = {
  searchParams: Promise<{ response?: string | string[]; topic?: string | string[] }>;
};

export default async function ConsultNewPage({ searchParams }: ConsultNewPageProps) {
  const { response, topic } = await searchParams;
  const topicValue = Array.isArray(topic) ? topic[0] : topic;
  return <ConsultationNewScreen failFirstResponse={response === "fail"} initialTopic={isTopicId(topicValue) ? topicValue : undefined} />;
}
