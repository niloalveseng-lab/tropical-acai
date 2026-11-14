import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCardapio } from "@/lib/cardapio";
import { pedidosRepo } from "@/lib/pedidos/repo";
import { Acompanhar } from "./Acompanhar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu pedido · Tropical Açaí", robots: { index: false, follow: false } };

export default async function Pagina({ params }: { params: { codigo: string } }) {
  if (!/^[a-z0-9]{12}$/.test(params.codigo)) notFound();
  const [pedido, cardapio] = await Promise.all([pedidosRepo().buscar(params.codigo), getCardapio()]);
  if (!pedido) notFound();
  return <Acompanhar inicial={pedido} whatsapp={cardapio.loja.whatsapp} />;
}
