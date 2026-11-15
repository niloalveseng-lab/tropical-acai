import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoMP } from "./mp";

export type PedidoPagamento = { id: string; status: string; total: number };
export type Decisao = "aprovar" | "aguardar" | "recusado" | "ignorar" | "valor_divergente";

/** O que fazer com o pedido diante de um pagamento consultado no Mercado Pago. */
export function decidir(pedido: PedidoPagamento, pg: PagamentoMP): Decisao {
  if (pg.external_reference !== pedido.id) return "ignorar";
  if (pg.status === "approved") {
    if (Math.abs(Number(pg.transaction_amount) - Number(pedido.total)) > 0.009) return "valor_divergente";
    return pedido.status === "aguardando_pagamento" ? "aprovar" : "ignorar"; // já aprovado ou cancelado: não mexe
  }
  if (pg.status === "rejected" || pg.status === "cancelled") return "recusado";
  return "aguardar"; // pending, in_process, authorized
}

const metodo = (pg: PagamentoMP) => (pg.payment_method_id === "pix" ? "pix_online" : "cartao_online");

/** Registra o pagamento e, se aprovado, libera o pedido para a loja. Pode ser chamado várias vezes sem duplicar. */
export async function aplicarPagamento(sb: SupabaseClient, pg: PagamentoMP): Promise<Decisao> {
  if (!pg.external_reference || !/^[0-9a-f-]{36}$/.test(pg.external_reference)) return "ignorar";
  const { data: pedido } = await sb.from("orders").select("id,status,total").eq("id", pg.external_reference).maybeSingle();
  if (!pedido) return "ignorar";
  const d = decidir(pedido as PedidoPagamento, pg);
  if (d === "ignorar") return d;

  const status = d === "aprovar" ? "approved" : d === "recusado" ? "rejected" : d === "valor_divergente" ? "divergente" : "pending";
  const { data: atual } = await sb.from("payments").select("id,dados").eq("provedor_id", String(pg.id)).maybeSingle();
  const dados = { ...(atual?.dados ?? {}), status_detail: pg.status_detail ?? null };
  if (atual) await sb.from("payments").update({ status, dados }).eq("id", atual.id);
  else await sb.from("payments").insert({ order_id: pedido.id, metodo: metodo(pg), valor: pg.transaction_amount, provedor: "mercadopago", provedor_id: String(pg.id), status, dados });

  if (d === "aprovar") {
    // Só muda se ainda estiver aguardando: dois avisos ao mesmo tempo não liberam duas vezes.
    await sb.from("orders").update({ status: "novo", pago: true, forma_pagamento: metodo(pg) }).eq("id", pedido.id).eq("status", "aguardando_pagamento");
  }
  if (d === "valor_divergente") console.error("[mp] valor pago diferente do pedido", pedido.id, pg.id, pg.transaction_amount, pedido.total);
  return d;
}
