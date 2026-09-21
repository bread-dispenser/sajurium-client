import { LandingScreen } from "@/components/saju-screens";

type HomeProps = {
  searchParams: Promise<{ calculation?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { calculation } = await searchParams;

  return <main className="app-shell p0-shell"><LandingScreen initialCalculationFailure={calculation === "fail"} /></main>;
}
