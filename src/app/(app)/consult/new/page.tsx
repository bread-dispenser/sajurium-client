import { ConsultationNewScreen } from "@/components/consultation-screens";

type ConsultNewPageProps = {
  searchParams: Promise<{ response?: string | string[] }>;
};

export default async function ConsultNewPage({ searchParams }: ConsultNewPageProps) {
  const { response } = await searchParams;
  return <ConsultationNewScreen failFirstResponse={response === "fail"} />;
}
