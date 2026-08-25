import { notFound } from "next/navigation";
import { CheckoutScreen } from "@/components/commerce-screens";
import { isProductId } from "@/lib/fixtures";

type CheckoutPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { id } = await params;
  if (!isProductId(id)) notFound();
  return <CheckoutScreen productId={id} />;
}
