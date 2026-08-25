import { notFound } from "next/navigation";
import { ProductDetailScreen } from "@/components/commerce-screens";
import { isProductId } from "@/lib/fixtures";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  if (!isProductId(id)) notFound();
  return <ProductDetailScreen productId={id} />;
}
