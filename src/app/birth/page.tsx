import { BirthScreen } from "@/components/saju-screens";

type BirthPageProps = {
  searchParams: Promise<{ calculation?: string | string[] }>;
};

export default async function BirthPage({ searchParams }: BirthPageProps) {
  const { calculation } = await searchParams;
  return <BirthScreen initialCalculationFailure={calculation === "fail"} />;
}
