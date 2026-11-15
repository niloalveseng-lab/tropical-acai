/** Formatação do pedido para o balcão: mensagem de WhatsApp e comanda impressa. */
export type ItemBalcao = { nome: string; descricao: string | null; quantidade: number; total: number; detalhes: { obs?: string | null } | null };
export type PedidoBalcao = {
  id: string; numero: number; codigo: string | null; canal: string; status: import("./status").Status; tipo: string;
  cliente_nome: string | null; cliente_telefone: string | null; endereco: string | null; bairro: string | null;
  entrega_lat: number | null; entrega_lng: number | null; distancia_km: number | null;
  subtotal: number; taxa_entrega: number; total: number; forma_pagamento: string; pago: boolean; troco_para: number | null;
  observacao: string | null; motivo_cancelamento: string | null; created_at: string; updated_at: string;
  order_items: ItemBalcao[];
};

export const PAGAMENTO: Record<string, string> = { pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro", pix_online: "PIX online", cartao_online: "Cartão online", debito: "Débito", credito: "Crédito", misto: "Misto" };
export const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });

/** Telefone salvo (ex.: 83993526981) → formato do wa.me com DDI 55. */
export function foneWa(f: string | null) {
  const d = (f ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") && d.length >= 12 ? d : "55" + d;
}

const MSG: Partial<Record<import("./status").Status, string>> = {
  preparo: "seu pedido foi aceito e já está sendo preparado 💜",
  pronto: "seu pedido está pronto para retirada! 🍧",
  saiu: "seu pedido saiu para entrega! 🛵",
  entregue: "pedido entregue. Obrigado pela preferência! 💜",
  cancelado: "infelizmente precisamos cancelar seu pedido.",
};

export function linkWhatsApp(p: PedidoBalcao) {
  const n = foneWa(p.cliente_telefone);
  if (!n) return null;
  const nome = (p.cliente_nome ?? "").split(" ")[0];
  const corpo = MSG[p.status] ?? "recebemos seu pedido.";
  const txt = `Olá, ${nome}! Aqui é do Tropical Açaí. Pedido #${p.numero}: ${corpo}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`;
}

export function linkMapa(p: PedidoBalcao) {
  if (p.entrega_lat != null && p.entrega_lng != null) return `https://www.google.com/maps?q=${p.entrega_lat},${p.entrega_lng}`;
  if (p.endereco) return `https://www.google.com/maps/search/${encodeURIComponent(p.endereco + ", Sousa - PB")}`;
  return null;
}

export function textoComanda(p: PedidoBalcao) {
  const l: string[] = [];
  l.push("TROPICAL AÇAÍ", `PEDIDO #${p.numero}  ${hora(p.created_at)}`, p.tipo === "entrega" ? "ENTREGA" : p.tipo === "retirada" ? "RETIRADA" : "BALCÃO", "-".repeat(32));
  if (p.cliente_nome) l.push(`Cliente: ${p.cliente_nome}`);
  if (p.cliente_telefone) l.push(`Fone: ${p.cliente_telefone}`);
  if (p.tipo === "entrega") { if (p.endereco) l.push(`End.: ${p.endereco}`); if (p.bairro) l.push(`Ref.: ${p.bairro}`); }
  l.push("-".repeat(32));
  for (const i of p.order_items) {
    l.push(`${i.quantidade}x ${i.nome}  ${brl(i.total)}`);
    if (i.descricao) l.push(`   ${i.descricao}`);
    if (i.detalhes?.obs) l.push(`   OBS: ${i.detalhes.obs}`);
  }
  l.push("-".repeat(32), `Subtotal: ${brl(p.subtotal)}`);
  if (Number(p.taxa_entrega) > 0) l.push(`Entrega: ${brl(p.taxa_entrega)}`);
  l.push(`TOTAL: ${brl(p.total)}`, `Pagamento: ${PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}${p.pago ? " (PAGO)" : ""}`);
  if (p.troco_para) l.push(`Troco para ${brl(p.troco_para)} → levar ${brl(Number(p.troco_para) - Number(p.total))}`);
  if (p.observacao) l.push("", p.observacao);
  return l.join("\n");
}

export const CAMPOS = "id,numero,codigo,canal,status,tipo,cliente_nome,cliente_telefone,endereco,bairro,entrega_lat,entrega_lng,distancia_km,subtotal,taxa_entrega,total,forma_pagamento,pago,troco_para,observacao,motivo_cancelamento,created_at,updated_at,order_items(nome,descricao,quantidade,total,detalhes)";

/** Abre a comanda em uma janela pronta para a impressora térmica de 80 mm. */
export function imprimir(p: PedidoBalcao) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  w.document.write(`<html><head><title>Pedido #${p.numero}</title><style>@page{size:80mm auto;margin:3mm}body{font:13px/1.35 monospace;white-space:pre-wrap;margin:0}</style></head><body>${esc(textoComanda(p))}</body></html>`);
  w.document.close(); w.focus(); w.print();
}
