import { describe, expect, it } from "vitest";
import { Catalog, priceCart, priceItem } from "./pricing";

const hojeTer = { diaSemana: 2, hora: 15, data: "2026-10-06" }; // terça
const hojeSeg = { diaSemana: 1, hora: 15, data: "2026-10-05" }; // segunda

const c: Catalog = {
  settings: { acomp_extra: null, preco_kg: 49.99 },
  bases: [{ id: "tradicional", nome: "Tradicional", ativo: true }, { id: "zero", nome: "Zero", ativo: true }],
  sizes: [
    { id: "c300", embalagem: "Copo", rotulo: "300 ml", preco: 14.9, acomp_inclusos: 3, ativo: true },
    { id: "p1l", embalagem: "Pote", rotulo: "1 litro", preco: 38.9, acomp_inclusos: 7, ativo: true },
  ],
  addons: [
    { id: "banana", group_id: "frutas", nome: "Banana", preco_adicional: 0, conta_no_limite: true, ativo: true, esgotado_em: null },
    { id: "morango", group_id: "frutas", nome: "Morango", preco_adicional: 3, conta_no_limite: true, ativo: true, esgotado_em: null },
    { id: "granola", group_id: "compl", nome: "Granola", preco_adicional: 0, conta_no_limite: true, ativo: true, esgotado_em: null },
    { id: "pacoca", group_id: "compl", nome: "Leite em Pó", preco_adicional: 0, conta_no_limite: true, ativo: true, esgotado_em: "2026-10-06" },
    { id: "lc", group_id: "cob", nome: "Leite Condensado", preco_adicional: 0, conta_no_limite: true, ativo: true, esgotado_em: null },
    { id: "ovo", group_id: "esp", nome: "Creme de Ovomaltine", preco_adicional: 3, conta_no_limite: true, ativo: true, esgotado_em: null },
  ],
  products: [
    { id: "shake", nome: "Milkshake", kind: "opcoes", preco: null, tamanhos: [{ nome: "P 300 ml", preco: 15 }, { nome: "G 500 ml", preco: 20 }], sabores: ["Chocolate", "Morango"], escolha: null, ativo: true, esgotado_em: null },
    { id: "cascao", nome: "Sorvete no Cascão", kind: "opcoes", preco: null, tamanhos: [{ nome: "1 bola", preco: 5, sabores: 1 }, { nome: "2 bolas", preco: 7, sabores: 2 }], sabores: ["Nutella", "Oreo", "Abacaxi"], escolha: null, ativo: true, esgotado_em: null },
    { id: "batida", nome: "Batida de Açaí", kind: "opcoes", preco: null, tamanhos: [{ nome: "500 ml", preco: 18 }], sabores: null, escolha: { rotulo: "Servir em", opcoes: ["Copo", "Garrafa"] }, ativo: true, esgotado_em: null },
    { id: "pic", nome: "Picolé Coco", kind: "simples", preco: 6, tamanhos: null, sabores: null, escolha: null, ativo: true, esgotado_em: null },
  ],
  promos: [{ id: "copo-promocional", nome: "Copo Promocional", tamanho: "300 ml", preco: 10, composicao: ["Açaí", "Amendoim"], dias_semana: [2, 3, 4, 5], hora_inicio: null, hora_fim: null, ativo: true }],
};

describe("açaí montado", () => {
  it("cobra o tamanho + adicionais pagos", () => {
    const r = priceItem(c, { tipo: "acai", sizeId: "c300", baseId: "zero", addonIds: ["banana", "morango", "lc"], qtd: 2 }, hojeTer);
    expect(r.precoUnitario).toBe(17.9);
    expect(r.total).toBe(35.8);
    expect(r.descricao).toContain("Base Zero");
  });
  it("bloqueia acima do limite quando não há valor de extra", () => {
    expect(() => priceItem(c, { tipo: "acai", sizeId: "c300", baseId: "zero", addonIds: ["banana", "morango", "lc", "granola"], qtd: 1 }, hojeTer)).toThrow(/Máximo de 3/);
  });
  it("cobra extra quando configurado", () => {
    const c2 = { ...c, settings: { ...c.settings, acomp_extra: 2 } };
    const r = priceItem(c2, { tipo: "acai", sizeId: "c300", baseId: "zero", addonIds: ["banana", "morango", "lc", "granola", "ovo"], qtd: 1 }, hojeTer);
    expect(r.precoUnitario).toBe(14.9 + 3 + 3 + 2 * 2);
  });
  it("recusa item esgotado hoje", () => {
    expect(() => priceItem(c, { tipo: "acai", sizeId: "c300", baseId: "zero", addonIds: ["pacoca"], qtd: 1 }, hojeTer)).toThrow(/esgotado/);
    expect(() => priceItem(c, { tipo: "acai", sizeId: "c300", baseId: "zero", addonIds: ["pacoca"], qtd: 1 }, { ...hojeTer, data: "2026-10-07" })).not.toThrow();
  });
});

describe("copo promocional", () => {
  it("vende de terça a sexta por R$ 10", () => {
    expect(priceItem(c, { tipo: "promo", promoId: "copo-promocional", qtd: 3 }, hojeTer).total).toBe(30);
  });
  it("recusa na segunda", () => {
    expect(() => priceItem(c, { tipo: "promo", promoId: "copo-promocional", qtd: 1 }, hojeSeg)).toThrow(/indisponível/);
  });
});

describe("outros produtos", () => {
  it("cascão de 2 bolas exige 2 sabores", () => {
    expect(() => priceItem(c, { tipo: "produto", productId: "cascao", tamanho: "2 bolas", sabores: ["Oreo"], qtd: 1 }, hojeTer)).toThrow(/2 sabores/);
    expect(priceItem(c, { tipo: "produto", productId: "cascao", tamanho: "2 bolas", sabores: ["Oreo", "Nutella"], qtd: 1 }, hojeTer).total).toBe(7);
  });
  it("batida exige copo ou garrafa", () => {
    expect(() => priceItem(c, { tipo: "produto", productId: "batida", tamanho: "500 ml", qtd: 1 }, hojeTer)).toThrow(/Servir em/);
    expect(priceItem(c, { tipo: "produto", productId: "batida", tamanho: "500 ml", escolha: "Garrafa", qtd: 1 }, hojeTer).total).toBe(18);
  });
  it("picolé simples", () => {
    expect(priceItem(c, { tipo: "produto", productId: "pic", qtd: 4 }, hojeTer).total).toBe(24);
  });
});

describe("açaí no quilo e carrinho", () => {
  it("calcula pelo peso líquido a R$ 49,99/kg", () => {
    const r = priceItem(c, { tipo: "kg", pesoBrutoG: 368, taraG: 18, qtd: 1 }, hojeTer);
    expect(r.total).toBe(17.5); // 350 g × 49,99 = 17,4965
  });
  it("soma o carrinho", () => {
    const r = priceCart(c, [
      { tipo: "promo", promoId: "copo-promocional", qtd: 1 },
      { tipo: "produto", productId: "shake", tamanho: "G 500 ml", sabores: ["Chocolate"], qtd: 1 },
    ], hojeTer);
    expect(r.subtotal).toBe(30);
  });
  it("ignora preço vindo do navegador (não existe campo de preço no item)", () => {
    const fake = { tipo: "produto", productId: "pic", qtd: 1, preco: 0.01 } as never;
    expect(priceItem(c, fake, hojeTer).total).toBe(6);
  });
});
