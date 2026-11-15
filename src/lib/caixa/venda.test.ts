import { describe, expect, it } from "vitest";
import { CARDAPIO_DEMO as c } from "@/data/cardapio-demo";
import { montarVenda, VendaError } from "./venda";

const agora = { diaSemana: 3, hora: 16, data: "2026-11-18" };
const size = c.sizes.find((s) => s.ativo)!, base = c.bases.find((b) => b.ativo)!;
const acai = { tipo: "acai" as const, sizeId: size.id, baseId: base.id, addonIds: [], qtd: 1 };

describe("venda no balcão", () => {
  it("recalcula o total e calcula o troco", () => {
    const v = montarVenda(c, { itens: [acai], pagamentos: [{ metodo: "dinheiro", valor: size.preco }], recebido: 50 }, agora);
    expect(v.total).toBe(size.preco);
    expect(v.forma).toBe("dinheiro");
    expect(v.troco).toBe(Math.round((50 - size.preco) * 100) / 100);
  });
  it("aceita pagamento dividido e marca como misto", () => {
    const v = montarVenda(c, { itens: [acai], pagamentos: [{ metodo: "pix", valor: 10 }, { metodo: "credito", valor: Math.round((size.preco - 10) * 100) / 100 }] }, agora);
    expect(v.forma).toBe("misto");
    expect(v.pagamentos).toHaveLength(2);
  });
  it("recusa pagamento que não fecha com o total", () => {
    expect(() => montarVenda(c, { itens: [acai], pagamentos: [{ metodo: "pix", valor: 1 }] }, agora)).toThrow(VendaError);
  });
  it("vende açaí no quilo descontando a tara", () => {
    const v = montarVenda(c, { itens: [{ tipo: "kg", pesoBrutoG: 520, taraG: 20, qtd: 1 }], pagamentos: [{ metodo: "pix", valor: 25 }] }, agora);
    expect(v.total).toBe(25);
    expect(v.linhas[0].detalhes.liquidoG).toBe(500);
  });
  it("recusa troco sem dinheiro e recebido menor que o devido", () => {
    expect(() => montarVenda(c, { itens: [acai], pagamentos: [{ metodo: "pix", valor: size.preco }], recebido: 50 }, agora)).toThrow(/dinheiro/);
    expect(() => montarVenda(c, { itens: [acai], pagamentos: [{ metodo: "dinheiro", valor: size.preco }], recebido: 1 }, agora)).toThrow(/menor/);
  });
});
