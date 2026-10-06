/**
 * Regras de preço — usadas no navegador (mostrar o total) e SEMPRE refeitas
 * no servidor antes de gravar o pedido. O preço enviado pelo navegador é ignorado.
 */

export type AcaiSize = { id: string; embalagem: "Copo" | "Pote"; rotulo: string; preco: number; acomp_inclusos: number; ativo: boolean };
export type AddonItem = { id: string; group_id: string; nome: string; preco_adicional: number; conta_no_limite: boolean; ativo: boolean; esgotado_em: string | null };
export type Tamanho = { nome: string; preco: number; sabores?: number };
export type Product = { id: string; nome: string; kind: "simples" | "opcoes"; preco: number | null; tamanhos: Tamanho[] | null; sabores: string[] | null; escolha: { rotulo: string; opcoes: string[] } | null; ativo: boolean; esgotado_em: string | null };
export type Promo = { id: string; nome: string; tamanho: string; preco: number; composicao: string[]; dias_semana: number[]; hora_inicio: number | null; hora_fim: number | null; ativo: boolean };
export type Settings = { acomp_extra: number | null; preco_kg: number };

export type Catalog = { sizes: AcaiSize[]; bases: { id: string; nome: string; ativo: boolean }[]; addons: AddonItem[]; products: Product[]; promos: Promo[]; settings: Settings };

export type CartItem =
  | { tipo: "acai"; sizeId: string; baseId: string; addonIds: string[]; qtd: number; obs?: string }
  | { tipo: "produto"; productId: string; tamanho?: string; sabores?: string[]; escolha?: string; qtd: number; obs?: string }
  | { tipo: "promo"; promoId: string; qtd: number; obs?: string }
  | { tipo: "kg"; pesoBrutoG: number; taraG: number; qtd: 1 };

export type PricedItem = { nome: string; descricao: string; precoUnitario: number; total: number; qtd: number; detalhes: Record<string, unknown> };

export class PricingError extends Error {}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Data/hora em Sousa-PB (UTC−3, sem horário de verão). */
export function agoraSousa(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Fortaleza", weekday: "short", hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { diaSemana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")), hora: Number(g("hour")) % 24, data: `${g("year")}-${g("month")}-${g("day")}` };
}

const esgotadoHoje = (x: { esgotado_em: string | null }, hoje: string) => x.esgotado_em === hoje;

export function promoDisponivel(p: Promo, agora = agoraSousa()) {
  if (!p.ativo || !p.dias_semana.includes(agora.diaSemana)) return false;
  if (p.hora_inicio != null && agora.hora < p.hora_inicio) return false;
  if (p.hora_fim != null && agora.hora >= p.hora_fim) return false;
  return true;
}

export function priceItem(c: Catalog, item: CartItem, agora = agoraSousa()): PricedItem {
  if (!Number.isInteger(item.qtd) || item.qtd < 1 || item.qtd > 50) throw new PricingError("Quantidade inválida");

  if (item.tipo === "acai") {
    const size = c.sizes.find((s) => s.id === item.sizeId && s.ativo);
    if (!size) throw new PricingError("Tamanho indisponível");
    const base = c.bases.find((b) => b.id === item.baseId && b.ativo);
    if (!base) throw new PricingError("Base indisponível");
    const addons = item.addonIds.map((id) => {
      const a = c.addons.find((x) => x.id === id && x.ativo);
      if (!a) throw new PricingError("Acompanhamento indisponível");
      if (esgotadoHoje(a, agora.data)) throw new PricingError(`${a.nome} esgotado hoje`);
      return a;
    });
    const contados = addons.filter((a) => a.conta_no_limite).length;
    const extras = Math.max(0, contados - size.acomp_inclusos);
    if (extras > 0 && c.settings.acomp_extra == null) throw new PricingError(`Máximo de ${size.acomp_inclusos} acompanhamentos neste tamanho`);
    const unit = cents(size.preco + addons.reduce((s, a) => s + a.preco_adicional, 0) + extras * (c.settings.acomp_extra ?? 0));
    return {
      nome: `Açaí ${size.embalagem} ${size.rotulo}`,
      descricao: `Base ${base.nome} · ${addons.length ? addons.map((a) => a.nome).join(", ") : "sem acompanhamentos"}`,
      precoUnitario: unit, qtd: item.qtd, total: cents(unit * item.qtd),
      detalhes: { size: size.id, base: base.id, addons: addons.map((a) => a.id), extras, obs: item.obs ?? null },
    };
  }

  if (item.tipo === "promo") {
    const p = c.promos.find((x) => x.id === item.promoId);
    if (!p || !promoDisponivel(p, agora)) throw new PricingError("Promoção indisponível hoje");
    return { nome: p.nome, descricao: `${p.tamanho} · ${p.composicao.join(", ")}`, precoUnitario: p.preco, qtd: item.qtd, total: cents(p.preco * item.qtd), detalhes: { promo: p.id, obs: item.obs ?? null } };
  }

  if (item.tipo === "kg") {
    if (!(item.pesoBrutoG > 0 && item.pesoBrutoG <= 32000)) throw new PricingError("Peso inválido");
    const liquido = Math.max(0, Math.round(item.pesoBrutoG - item.taraG));
    if (liquido <= 0) throw new PricingError("Peso líquido zerado");
    const v = cents((liquido / 1000) * c.settings.preco_kg);
    return { nome: "Açaí no quilo", descricao: `${(liquido / 1000).toFixed(3).replace(".", ",")} kg × R$ ${c.settings.preco_kg.toFixed(2).replace(".", ",")}/kg`, precoUnitario: v, qtd: 1, total: v, detalhes: { pesoBrutoG: item.pesoBrutoG, taraG: item.taraG, liquidoG: liquido } };
  }

  const p = c.products.find((x) => x.id === item.productId && x.ativo);
  if (!p) throw new PricingError("Produto indisponível");
  if (esgotadoHoje(p, agora.data)) throw new PricingError(`${p.nome} esgotado hoje`);
  if (p.kind === "simples") {
    return { nome: p.nome, descricao: "", precoUnitario: p.preco!, qtd: item.qtd, total: cents(p.preco! * item.qtd), detalhes: { product: p.id, obs: item.obs ?? null } };
  }
  const t = p.tamanhos?.find((x) => x.nome === item.tamanho);
  if (!t) throw new PricingError("Escolha o tamanho");
  const sabores = item.sabores ?? [];
  if (p.sabores?.length) {
    const n = t.sabores ?? 1;
    if (sabores.length !== n || sabores.some((s) => !p.sabores!.includes(s))) throw new PricingError(`Escolha ${n} sabor${n > 1 ? "es" : ""}`);
  }
  if (p.escolha && !p.escolha.opcoes.includes(item.escolha ?? "")) throw new PricingError(`Escolha: ${p.escolha.rotulo}`);
  return {
    nome: `${p.nome} ${t.nome}`,
    descricao: [item.escolha, sabores.join(" + ")].filter(Boolean).join(" · "),
    precoUnitario: t.preco, qtd: item.qtd, total: cents(t.preco * item.qtd),
    detalhes: { product: p.id, tamanho: t.nome, sabores, escolha: item.escolha ?? null, obs: item.obs ?? null },
  };
}

export function priceCart(c: Catalog, items: CartItem[], agora = agoraSousa()) {
  if (!items.length) throw new PricingError("Carrinho vazio");
  const linhas = items.map((i) => priceItem(c, i, agora));
  return { linhas, subtotal: cents(linhas.reduce((s, l) => s + l.total, 0)) };
}
