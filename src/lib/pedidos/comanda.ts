import { LOGO_CUPOM } from "./logoCupom";
/** Formatação do pedido para o balcão: mensagem de WhatsApp e comanda impressa. */
export type ItemBalcao = { nome: string; descricao: string | null; quantidade: number; total: number; detalhes: { obs?: string | null } | null };
export type PedidoBalcao = {
  id: string; numero: number; codigo: string | null; canal: string; status: import("./status").Status; tipo: string;
  cliente_nome: string | null; cliente_telefone: string | null; endereco: string | null; bairro: string | null;
  entrega_lat: number | null; entrega_lng: number | null; distancia_km: number | null;
  subtotal: number; taxa_entrega: number; total: number; forma_pagamento: string; pago: boolean; troco_para: number | null;
  observacao: string | null; motivo_cancelamento: string | null; entregador?: string | null; created_at: string; updated_at: string;
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

export function textoComanda(p: PedidoBalcao, colunas = 32, comNome = true) {
  const l: string[] = [];
  if (comNome) l.push("TROPICAL AÇAÍ");
  l.push(`PEDIDO #${p.numero}  ${hora(p.created_at)}${p.canal === "whatsapp" ? "  (WhatsApp)" : p.canal === "site" ? "  (Site)" : ""}`, p.tipo === "entrega" ? "ENTREGA" : p.tipo === "retirada" ? "RETIRADA" : "BALCÃO", "-".repeat(colunas));
  if (p.cliente_nome) l.push(`Cliente: ${p.cliente_nome}`);
  if (p.cliente_telefone) l.push(`Fone: ${p.cliente_telefone}`);
  if (p.tipo === "entrega") { if (p.endereco) l.push(`End.: ${p.endereco}`); if (p.bairro) l.push(`Ref.: ${p.bairro}`); }
  l.push("-".repeat(colunas));
  for (const i of p.order_items) {
    l.push(`${i.quantidade}x ${i.nome}  ${brl(i.total)}`);
    if (i.descricao) l.push(`   ${i.descricao}`);
    if (i.detalhes?.obs) l.push(`   OBS: ${i.detalhes.obs}`);
  }
  l.push("-".repeat(colunas), `Subtotal: ${brl(p.subtotal)}`);
  if (Number(p.taxa_entrega) > 0) l.push(`Entrega: ${brl(p.taxa_entrega)}`);
  l.push(`TOTAL: ${brl(p.total)}`, `Pagamento: ${PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}${p.pago ? " (PAGO)" : " - A COBRAR"}`);
  if (p.entregador) l.push(`Entregador: ${p.entregador}`);
  if (p.troco_para) l.push(`Troco para ${brl(p.troco_para)} → levar ${brl(Number(p.troco_para) - Number(p.total))}`);
  if (p.observacao) l.push("", p.observacao);
  return l.join("\n");
}

export const CAMPOS = "id,numero,codigo,canal,status,tipo,cliente_nome,cliente_telefone,endereco,bairro,entrega_lat,entrega_lng,distancia_km,subtotal,taxa_entrega,total,forma_pagamento,pago,troco_para,observacao,motivo_cancelamento,created_at,updated_at,entregador,order_items(nome,descricao,quantidade,total,detalhes)";

/** Largura do papel da impressora deste computador (58 ou 80 mm), guardada no navegador. */
export type Papel = 58 | 80;
export function papelSalvo(): Papel {
  try { return localStorage.getItem("ta_papel") === "80" ? 80 : 58; } catch { return 58; }
}
export function salvarPapel(p: Papel) { try { localStorage.setItem("ta_papel", String(p)); } catch { /* sem armazenamento */ } }

/**
 * Abre a comanda pronta para a impressora térmica.
 * A página tem exatamente a altura do texto (medida depois de montar), então a impressora
 * não puxa papel em branco antes nem depois. Margens zeradas; largura 58 ou 80 mm.
 */
export const AGRADECIMENTO = "Obrigado pela preferência!\nVolte sempre ao Tropical Açaí.";
const CONTATO = "@otropical.acai\nWhatsApp (83) 99352-6981\notropicalacai.com.br";

export function imprimir(p: PedidoBalcao, papel: Papel = papelSalvo()) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const util = papel === 58 ? 48 : 72; // área impressa em mm
  const fonte = papel === 58 ? 11 : 13;
  // Quantos caracteres cabem na linha (Courier ≈ 0,6 da altura da fonte), para os tracejados não quebrarem.
  const colunas = Math.floor((util * 96) / 25.4 / (fonte * 0.6)) - 1;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${p.numero}</title><style id="pg">@page{size:${papel}mm 100mm;margin:0}</style><style>html,body{margin:0;padding:0;background:#fff;color:#000}body{width:${util}mm;padding:0 ${(papel - util) / 2}mm;font:bold ${fonte}px/1.3 "Courier New",monospace}#t{white-space:pre-wrap;word-break:break-word}.c{text-align:center}#c{padding-bottom:6mm}#logo{display:block;width:${papel === 58 ? 40 : 48}mm;margin:1mm auto 1.5mm}.fim{margin-top:2mm;padding-top:1.5mm;border-top:1px dashed #000;white-space:pre-line}.fim b{font-size:${fonte + 1}px}.fim small{font-size:${fonte - 1}px;font-weight:normal}</style></head><body><div id="c"><img id="logo" src="${LOGO_CUPOM}" alt=""><div id="t">${esc(textoComanda(p, colunas, false))}</div><div class="c fim"><b>${esc(AGRADECIMENTO)}</b>\n<small>${esc(CONTATO)}</small></div></div></body></html>`);
  w.document.close();
  let feito = false;
  const pronto = () => {
    if (feito) return; feito = true;
    const alturaMm = Math.ceil((w.document.getElementById("c")!.getBoundingClientRect().height * 25.4) / 96) + 4;
    w.document.getElementById("pg")!.textContent = `@page{size:${papel}mm ${alturaMm}mm;margin:0}`;
    w.focus(); w.print();
    setTimeout(() => w.close(), 500);
  };
  // Espera o logo carregar para medir a altura certa (sem logo, imprime assim mesmo).
  const img = w.document.getElementById("logo") as HTMLImageElement | null;
  if (!img || img.complete) setTimeout(pronto, 50);
  else { img.onload = () => setTimeout(pronto, 50); img.onerror = () => { img.remove(); setTimeout(pronto, 50); }; setTimeout(pronto, 3000); }
}
