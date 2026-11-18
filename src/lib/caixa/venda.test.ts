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

describe("pedido de WhatsApp com entrega pelo caixa", () => {
  const loja = { lat: -6.7490513, lng: -38.24237, faixas: [{ ate_km: 1, taxa: 5 }, { ate_km: 2, taxa: 7 }, { ate_km: 3, taxa: 8 }, { ate_km: 4, taxa: 10 }], pedidoMinimo: 20 };
  const grande = { ...acai, qtd: 2 };
  const perto = { endereco: "Rua A, 10", lat: -6.7520, lng: -38.2430 }; // ~0,35 km
  const base = { itens: [grande], canal: "whatsapp", tipo: "entrega", cliente: "Maria", telefone: "(83) 99999-1234", entrega: perto };

  it("calcula a taxa pela distância e soma no total", () => {
    const sub = Math.round(size.preco * 2 * 100) / 100;
    const v = montarVenda(c, { ...base, pagamentos: [{ metodo: "pix", valor: sub + 5 }] }, agora, loja);
    expect(v.taxa).toBe(5);
    expect(v.total).toBe(Math.round((sub + 5) * 100) / 100);
    expect(v.entrega?.distanciaKm).toBeLessThan(1);
    expect(v.telefone).toBe("83999991234");
    expect(v.status).toBe("preparo");
  });
  it("cobra na entrega: sem pagamento agora, fica a receber", () => {
    const v = montarVenda(c, { ...base, cobrarDepois: true, formaPrevista: "dinheiro", recebido: 100 }, agora, loja);
    expect(v.pago).toBe(false);
    expect(v.pagamentos).toHaveLength(0);
    expect(v.troco).toBe(Math.round((100 - v.total) * 100) / 100);
  });
  it("recusa fora da área, abaixo do mínimo e sem nome", () => {
    expect(() => montarVenda(c, { ...base, entrega: { endereco: "Longe", lat: -6.80, lng: -38.24 }, cobrarDepois: true, formaPrevista: "pix" }, agora, loja)).toThrow(/Entregamos até 4 km/);
    expect(() => montarVenda(c, { ...base, itens: [{ tipo: "produto", productId: "pic0", qtd: 1 }], cobrarDepois: true, formaPrevista: "pix" }, agora, loja)).toThrow(/mínimo/);
    expect(() => montarVenda(c, { ...base, cliente: "", cobrarDepois: true, formaPrevista: "pix" }, agora, loja)).toThrow(/nome/);
  });
  it("venda no balcão não aceita cobrar depois", () => {
    expect(() => montarVenda(c, { itens: [acai], cobrarDepois: true, formaPrevista: "pix" }, agora, loja)).toThrow(/na hora/);
  });
});
