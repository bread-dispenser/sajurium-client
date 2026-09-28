import { LandingScreen } from "@/components/saju-screens";

type HomeProps = {
  searchParams: Promise<{ calculation?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { calculation } = await searchParams;
  return <LandingScreen initialCalculationFailure={calculation === "fail"} />;
}
