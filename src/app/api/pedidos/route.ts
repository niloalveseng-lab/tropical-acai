import { NextResponse } from "next/server";
import { getCardapio } from "@/lib/cardapio";
import { permitido } from "@/lib/limite";
import { montarPedido, PedidoError } from "@/lib/pedidos/montar";
import { pedidosRepo } from "@/lib/pedidos/repo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!permitido("pedido:" + ip, 8, 10 * 60_000)) return NextResponse.json({ erro: "Muitos pedidos em pouco tempo. Aguarde alguns minutos ou chame no WhatsApp." }, { status: 429 });

  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "Pedido inválido" }, { status: 400 }); }

  try {
    const cardapio = await getCardapio();
    const pedido = montarPedido(cardapio, corpo);
    const salvo = await pedidosRepo().criar(pedido);
    return NextResponse.json({ pedido: salvo }, { status: 201 });
  } catch (e) {
    if (e instanceof PedidoError) return NextResponse.json({ erro: e.message }, { status: 422 });
    console.error("Erro ao criar pedido", e);
    return NextResponse.json({ erro: "Não conseguimos registrar o pedido agora. Tente de novo ou chame no WhatsApp." }, { status: 500 });
  }
}
