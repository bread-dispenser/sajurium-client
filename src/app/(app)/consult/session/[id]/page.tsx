import { LiveConsultationSessionScreen } from "@/components/consultation-screens";
import { notFound } from "next/navigation";

type ConsultationSessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConsultationSessionPage({ params }: ConsultationSessionPageProps) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <LiveConsultationSessionScreen sessionId={id} />;
}
