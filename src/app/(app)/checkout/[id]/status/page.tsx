import { notFound } from "next/navigation";
import { PaymentStatusScreen } from "@/components/commerce-screens";
import type { DemoOrderStatus } from "@/lib/domain";
import { isProductId } from "@/lib/fixtures";

type PaymentStatusPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string | string[] }>;
};

function isDemoOrderStatus(value: unknown): value is DemoOrderStatus {
  return value === "pending" || value === "success" || value === "failure";
}

export default async function PaymentStatusPage({ params, searchParams }: PaymentStatusPageProps) {
  const { id } = await params;
  const { state } = await searchParams;
  if (!isProductId(id) || !isDemoOrderStatus(state)) notFound();
  return <PaymentStatusScreen productId={id} status={state} />;
}
