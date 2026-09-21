import { notFound } from "next/navigation";
import { PaymentStatusScreen } from "@/components/commerce-screens";
import type { DemoOrderStatus } from "@/lib/domain";
import { isProductId } from "@/lib/fixtures";

type OrderStatusPageProps = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ productId?: string | string[]; state?: string | string[]; source?: string | string[] }>;
};

function isDemoOrderStatus(value: unknown): value is DemoOrderStatus {
  return value === "pending" || value === "success" || value === "failure";
}

export default async function OrderStatusPage({ params, searchParams }: OrderStatusPageProps) {
  const { orderId } = await params;
  const { productId, state, source } = await searchParams;
  if (!isProductId(productId) || !isDemoOrderStatus(state)) notFound();
  if (source === "server") {
    if (!/^\d+$/.test(orderId)) notFound();
    return <PaymentStatusScreen orderId={orderId} productId={productId} status={state} server />;
  }
  if (!/^ord_[A-Za-z0-9_]{8,80}$/.test(orderId)) notFound();
  const expectedOrderId = `ord_demo_${productId.replaceAll("-", "_")}`;
  if (orderId !== expectedOrderId) notFound();
  return <PaymentStatusScreen orderId={orderId} productId={productId} status={state} />;
}
