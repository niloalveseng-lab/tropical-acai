import { NextResponse } from "next/server";
import { getCardapio } from "@/lib/cardapio";
import { permitido } from "@/lib/limite";
import { criarLinkCartao, criarPix, mpConfigurado } from "@/lib/pagamento/mp";
import { montarPedido, PedidoError } from "@/lib/pedidos/montar";
import { pedidosRepo } from "@/lib/pedidos/repo";

export const dynamic = "force-dynamic";

/** Endereço público do site (para o Mercado Pago avisar e devolver o cliente). */
function siteDe(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || (host ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}` : new URL(req.url).origin);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!permitido("pedido:" + ip, 8, 10 * 60_000)) return NextResponse.json({ erro: "Muitos pedidos em pouco tempo. Aguarde alguns minutos ou chame no WhatsApp." }, { status: 429 });

  let corpo: unknown;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "Pedido inválido" }, { status: 400 }); }

  try {
    const cardapio = await getCardapio();
    const pedido = montarPedido(cardapio, corpo);
    if (pedido.online && !(mpConfigurado() && cardapio.loja.pagamentoOnline)) throw new PedidoError("O pagamento pelo site está indisponível agora. Escolha pagar na entrega ou na retirada.");

    const repo = pedidosRepo();
    const { id, ...salvo } = await repo.criar(pedido);
    if (!pedido.online) return NextResponse.json({ pedido: salvo }, { status: 201 });

    // Pagamento pelo site: cria a cobrança; o pedido só aparece para a loja depois de aprovado.
    try {
      const d = { orderId: id, numero: salvo.numero, total: pedido.total, nome: pedido.nome, codigo: salvo.codigo, site: siteDe(req), email: pedido.email ?? `cliente${pedido.whatsapp}@pedidos.tropicalacai.com.br` };
      if (pedido.pagamento === "pix_online") {
        const pix = await criarPix(d);
        await repo.salvarCobranca(id, { metodo: "pix_online", valor: pedido.total, provedorId: pix.id, dados: { copiaCola: pix.copiaCola, qrBase64: pix.qrBase64 } });
        return NextResponse.json({ pedido: salvo }, { status: 201 });
      }
      const cartao = await criarLinkCartao(d);
      await repo.salvarCobranca(id, { metodo: "cartao_online", valor: pedido.total, provedorId: null, dados: { preferencia: cartao.preferencia, link: cartao.link } });
      return NextResponse.json({ pedido: salvo, redirecionar: cartao.link }, { status: 201 });
    } catch (e) {
      console.error("Erro ao criar cobrança online", e);
      await repo.apagar(id);
      return NextResponse.json({ erro: "Não conseguimos gerar o pagamento pelo site agora. Tente de novo ou escolha pagar na entrega/retirada." }, { status: 502 });
    }
  } catch (e) {
    if (e instanceof PedidoError) return NextResponse.json({ erro: e.message }, { status: 422 });
    console.error("Erro ao criar pedido", e);
    return NextResponse.json({ erro: "Não conseguimos registrar o pedido agora. Tente de novo ou chame no WhatsApp." }, { status: 500 });
  }
}
