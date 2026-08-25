import { notFound } from "next/navigation";
import { PaymentStatusScreen } from "@/components/commerce-screens";
import type { DemoOrderStatus } from "@/lib/domain";
import { isProductId } from "@/lib/fixtures";

type OrderStatusPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ productId?: string | string[]; state?: string | string[] }>;
};

function isDemoOrderStatus(value: unknown): value is DemoOrderStatus {
  return value === "pending" || value === "success" || value === "failure";
}

export default async function OrderStatusPage({ params, searchParams }: OrderStatusPageProps) {
  const { orderId } = await params;
  const { productId, state } = await searchParams;
  if (!/^ord_[A-Za-z0-9_]{8,80}$/.test(orderId) || !isProductId(productId) || !isDemoOrderStatus(state)) notFound();
  const expectedOrderId = `ord_demo_${productId.replaceAll("-", "_")}`;
  if (orderId !== expectedOrderId) notFound();
  return <PaymentStatusScreen orderId={orderId} productId={productId} status={state} />;
}
