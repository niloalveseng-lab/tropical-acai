import { randomBytes } from "node:crypto";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarPagamento } from "@/lib/pagamento/confirmar";
import { MINUTOS_PARA_PAGAR, mpConfigurado, pagamentosDoPedido } from "@/lib/pagamento/mp";
import type { PedidoMontado } from "./montar";

export type StatusPedido = "aguardando_pagamento" | "novo" | "preparo" | "pronto" | "saiu" | "entregue" | "cancelado";
/** O que a página pública de acompanhamento pode ver (sem telefone nem endereço completo). */
export type PedidoPublico = {
  codigo: string; numero: number; status: StatusPedido; tipo: "retirada" | "entrega";
  primeiroNome: string; criadoEm: string; agendado: boolean;
  itens: { nome: string; descricao: string; qtd: number; total: number }[];
  subtotal: number; taxaEntrega: number; total: number; pagamento: string;
  /** Só enquanto aguarda pagamento online. */
  pagar?: { tipo: "pix"; copiaCola: string; qrBase64: string | null; expiraEm: string } | { tipo: "cartao"; link: string; expiraEm: string };
};
/** Dados internos para criar a cobrança (não vão para o navegador). */
export type PedidoCriado = PedidoPublico & { id: string };
export type CobrancaSalva = { metodo: "pix_online" | "cartao_online"; valor: number; provedorId: string | null; dados: Record<string, unknown> };

/** Código do link: 12 caracteres sem letras ambíguas (≈ 60 bits), impossível de adivinhar. */
export function novoCodigo() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => abc[b % abc.length]).join("");
}

const publico = (codigo: string, numero: number, status: StatusPedido, criadoEm: string, p: PedidoMontado): PedidoPublico => ({
  codigo, numero, status, tipo: p.tipo, primeiroNome: p.nome.split(" ")[0], criadoEm, agendado: p.agendado,
  itens: p.linhas.map((l) => ({ nome: l.nome, descricao: l.descricao, qtd: l.qtd, total: l.total })),
  subtotal: p.subtotal, taxaEntrega: p.taxaEntrega, total: p.total, pagamento: p.pagamento,
});

export interface PedidosRepo {
  criar(p: PedidoMontado): Promise<PedidoCriado>;
  /** Guarda a cobrança online (QR Code do PIX ou link do cartão) junto do pedido. */
  salvarCobranca(id: string, c: CobrancaSalva): Promise<void>;
  /** Desfaz um pedido cuja cobrança não pôde ser criada. */
  apagar(id: string): Promise<void>;
  buscar(codigo: string): Promise<PedidoPublico | null>;
}

/* ---------- Demonstração: guarda na memória do servidor (some ao reiniciar) ---------- */
const g = globalThis as unknown as { __pedidosDemo?: { seq: number; mapa: Map<string, PedidoPublico> } };
const demo = (g.__pedidosDemo ??= { seq: 100, mapa: new Map() });

const repoDemo: PedidosRepo = {
  async criar(p) {
    const ped = publico(novoCodigo(), ++demo.seq, "novo", new Date().toISOString(), p);
    demo.mapa.set(ped.codigo, ped);
    return { ...ped, id: ped.codigo };
  },
  async salvarCobranca() {},
  async apagar(id) { demo.mapa.delete(id); },
  async buscar(codigo) { return demo.mapa.get(codigo) ?? null; },
};

/** Última conferência de cada pedido no Mercado Pago (evita consultar a cada 6 s). */
const conferidoEm = new Map<string, number>();

/** Consulta o Mercado Pago para um pedido que aguarda pagamento. Devolve true se o pedido mudou. */
async function conferirPagamento(sb: SupabaseClient, id: string, criadoEm: string): Promise<boolean> {
  const idade = Date.now() - new Date(criadoEm).getTime();
  const vencido = idade > (MINUTOS_PARA_PAGAR + 3) * 60_000;
  if (!vencido && Date.now() - (conferidoEm.get(id) ?? 0) < 12_000) return false;
  conferidoEm.set(id, Date.now());
  if (conferidoEm.size > 500) conferidoEm.clear();
  let mudou = false;
  if (mpConfigurado()) {
    try {
      for (const pg of await pagamentosDoPedido(id)) if ((await aplicarPagamento(sb, pg)) === "aprovar") mudou = true;
    } catch (e) { console.error("[mp] conferência falhou", id, e); if (vencido) return false; /* não cancela sem conseguir conferir */ }
  }
  if (!mudou && vencido) {
    const { data } = await sb.from("orders").update({ status: "cancelado", motivo_cancelamento: "Pagamento online não realizado no prazo" }).eq("id", id).eq("status", "aguardando_pagamento").select("id");
    mudou = !!data?.length;
  }
  return mudou;
}

/* ---------- Supabase (produção): grava com a chave de serviço, só no servidor ---------- */
function repoSupabase(): PedidosRepo {
  const sb = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return {
    async criar(p) {
      const codigo = novoCodigo();
      // Limpeza: pedidos que ficaram aguardando pagamento além do prazo (cliente fechou a página) são cancelados.
      await sb.from("orders").update({ status: "cancelado", motivo_cancelamento: "Pagamento online não realizado no prazo" })
        .eq("status", "aguardando_pagamento").lt("created_at", new Date(Date.now() - (MINUTOS_PARA_PAGAR + 15) * 60_000).toISOString());
      const { data: o, error } = await sb.from("orders").insert({
        codigo, canal: "site", status: p.online ? "aguardando_pagamento" : "novo", tipo: p.tipo,
        cliente_nome: p.nome, cliente_telefone: p.whatsapp,
        endereco: p.endereco, bairro: p.referencia,
        entrega_lat: p.destino?.lat ?? null, entrega_lng: p.destino?.lng ?? null, distancia_km: p.distanciaKm,
        subtotal: p.subtotal, taxa_entrega: p.taxaEntrega, total: p.total,
        forma_pagamento: p.pagamento, pago: false, troco_para: p.trocoPara,
        observacao: p.agendado ? "Pedido feito com a loja fechada (agendado para a abertura)" : null,
      }).select("id,numero,created_at").single();
      if (error || !o) throw new Error("Falha ao gravar o pedido: " + error?.message);
      const { error: e2 } = await sb.from("order_items").insert(p.linhas.map((l) => ({
        order_id: o.id, nome: l.nome, descricao: l.descricao, detalhes: l.detalhes, quantidade: l.qtd, preco_unitario: l.precoUnitario, total: l.total,
      })));
      if (e2) { await sb.from("orders").delete().eq("id", o.id); throw new Error("Falha ao gravar os itens: " + e2.message); }
      return { ...publico(codigo, o.numero, p.online ? "aguardando_pagamento" : "novo", o.created_at, p), id: o.id };
    },
    async salvarCobranca(id, c) {
      const { error } = await sb.from("payments").insert({ order_id: id, metodo: c.metodo, valor: c.valor, provedor: "mercadopago", provedor_id: c.provedorId, status: "pending", dados: c.dados });
      if (error) throw new Error("Falha ao gravar a cobrança: " + error.message);
    },
    async apagar(id) { await sb.from("orders").delete().eq("id", id); },
    async buscar(codigo) {
      const campos = "id,codigo,numero,status,tipo,cliente_nome,created_at,observacao,subtotal,taxa_entrega,total,forma_pagamento,order_items(nome,descricao,quantidade,total),payments(metodo,status,dados,created_at)";
      let { data: o } = await sb.from("orders").select(campos).eq("codigo", codigo).maybeSingle();
      if (!o) return null;
      if (o.status === "aguardando_pagamento") {
        // Confere com o Mercado Pago (caso o aviso automático não tenha chegado) e expira o que não foi pago.
        if (await conferirPagamento(sb, o.id, o.created_at)) ({ data: o } = await sb.from("orders").select(campos).eq("codigo", codigo).maybeSingle());
        if (!o) return null;
      }
      const ped: PedidoPublico = {
        codigo: o.codigo, numero: o.numero, status: o.status, tipo: o.tipo,
        primeiroNome: (o.cliente_nome ?? "").split(" ")[0], criadoEm: o.created_at, agendado: /agendado/.test(o.observacao ?? ""),
        itens: (o.order_items ?? []).map((i: { nome: string; descricao: string | null; quantidade: number; total: number }) => ({ nome: i.nome, descricao: i.descricao ?? "", qtd: i.quantidade, total: Number(i.total) })),
        subtotal: Number(o.subtotal), taxaEntrega: Number(o.taxa_entrega), total: Number(o.total), pagamento: o.forma_pagamento,
      };
      if (o.status === "aguardando_pagamento") {
        const expiraEm = new Date(new Date(o.created_at).getTime() + MINUTOS_PARA_PAGAR * 60_000).toISOString();
        const c = ((o.payments ?? []) as { status: string; dados: Record<string, string | null> | null }[]).find((x) => x.status === "pending" && (x.dados?.copiaCola || x.dados?.link));
        if (c?.dados?.copiaCola) ped.pagar = { tipo: "pix", copiaCola: c.dados.copiaCola, qrBase64: c.dados.qrBase64 ?? null, expiraEm };
        else if (c?.dados?.link) ped.pagar = { tipo: "cartao", link: c.dados.link, expiraEm };
      }
      return ped;
    },
  };
}

export function pedidosRepo(): PedidosRepo {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? repoSupabase() : repoDemo;
}
