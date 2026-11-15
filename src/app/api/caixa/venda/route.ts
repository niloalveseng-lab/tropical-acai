import { NextResponse } from "next/server";
import { getCardapio } from "@/lib/cardapio";
import { montarVenda, VendaError } from "@/lib/caixa/venda";
import { AcessoNegado, admin, exigirEquipe } from "@/lib/equipe/admin";
import { supabaseConfigurado } from "@/lib/supabase/server";

let seqDemo = 100;

export const dynamic = "force-dynamic";

/** Registra uma venda do balcão no caixa aberto. Preços refeitos aqui; o navegador não manda preço. */
export async function POST(req: Request) {
  try {
    if (!supabaseConfigurado()) { // demonstração: calcula, mas não grava
      const v = montarVenda(await getCardapio(), await req.json());
      return NextResponse.json({ id: "demo", numero: ++seqDemo, total: v.total, troco: v.troco }, { status: 201 });
    }
    const operador = await exigirEquipe();
    const venda = montarVenda(await getCardapio(), await req.json());
    const sb = admin();

    const { data: caixa } = await sb.from("cash_sessions").select("id").is("fechado_em", null).maybeSingle();
    if (!caixa) throw new VendaError("O caixa está fechado. Abra o caixa antes de vender.");

    const { data: o, error } = await sb.from("orders").insert({
      canal: "balcao", tipo: "balcao", status: venda.paraPreparo ? "preparo" : "entregue",
      cliente_nome: venda.cliente, subtotal: venda.total, taxa_entrega: 0, total: venda.total,
      forma_pagamento: venda.forma, pago: true, troco_para: venda.recebido,
      operador, cash_session_id: caixa.id,
    }).select("id,numero").single();
    if (error || !o) throw new Error("Falha ao gravar a venda: " + error?.message);

    const desfazer = async (msg: string) => { await sb.from("orders").delete().eq("id", o.id); throw new Error(msg); };
    const { error: e2 } = await sb.from("order_items").insert(venda.linhas.map((l) => ({
      order_id: o.id, nome: l.nome, descricao: l.descricao || null, quantidade: l.qtd, preco_unitario: l.precoUnitario, total: l.total,
      detalhes: l.detalhes, peso_liquido_g: typeof l.detalhes.liquidoG === "number" ? l.detalhes.liquidoG : null,
    })));
    if (e2) await desfazer("Falha ao gravar os itens: " + e2.message);
    const { error: e3 } = await sb.from("payments").insert(venda.pagamentos.map((p) => ({ order_id: o.id, metodo: p.metodo, valor: p.valor, provedor: "manual", status: "approved" })));
    if (e3) await desfazer("Falha ao gravar o pagamento: " + e3.message);

    return NextResponse.json({ id: o.id, numero: o.numero, total: venda.total, troco: venda.troco }, { status: 201 });
  } catch (e) {
    if (e instanceof AcessoNegado) return NextResponse.json({ erro: e.message }, { status: 403 });
    if (e instanceof VendaError) return NextResponse.json({ erro: e.message }, { status: 422 });
    console.error("[caixa/venda]", e);
    return NextResponse.json({ erro: "Não foi possível registrar a venda. Tente de novo." }, { status: 500 });
  }
}
