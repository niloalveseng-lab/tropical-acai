import { describe, expect, it } from "vitest";
import { CARDAPIO_DEMO as C } from "@/data/cardapio-demo";
import { montarPedido, PedidoError } from "./montar";

const sab15h = { diaSemana: 6, hora: 15, data: "2026-11-14" };
const ter15h = { diaSemana: 2, hora: 15, data: "2026-11-10" };
const seg15h = { diaSemana: 1, hora: 15, data: "2026-11-09" };
const aKm = (km: number) => ({ lat: C.loja.lat - 0.008993 * km, lng: C.loja.lng });
const base = { nome: "Maria", whatsapp: "(83) 99999-0000", pagamento: "pix" as const };
const acai500 = { tipo: "acai" as const, sizeId: "c500", baseId: "tradicional", addonIds: ["frutas-banana", "cremes-pistache", "compl-granola", "compl-oreo", "cob-leite-condensado", "frutas-morango"], qtd: 1 };

describe("pedido pelo site", () => {
  it("retirada: açaí 500 ml com 5 inclusos + morango = R$ 22,90, sem taxa", () => {
    const p = montarPedido(C, { ...base, tipo: "retirada", itens: [acai500] }, sab15h);
    expect(p.total).toBe(22.9);
    expect(p.taxaEntrega).toBe(0);
    expect(p.whatsapp).toBe("83999990000");
  });
  it("critério 2: copo 300 ml com 4 gratuitos + morango + Ovomaltine = R$ 22,90", () => {
    const item = { tipo: "acai" as const, sizeId: "c300", baseId: "zero", addonIds: ["frutas-banana", "compl-granola", "compl-oreo", "cob-chocolate", "frutas-morango", "esp-creme-de-ovomaltine"], qtd: 1 };
    expect(montarPedido(C, { ...base, tipo: "retirada", itens: [item] }, sab15h).total).toBe(22.9);
  });
  it("entrega a 2,5 km soma R$ 8,00", () => {
    const p = montarPedido(C, { ...base, tipo: "entrega", endereco: "Rua A, 10", destino: aKm(2.5), itens: [acai500] }, sab15h);
    expect(p.taxaEntrega).toBe(8);
    expect(p.total).toBe(30.9);
  });
  it("entrega a 4,6 km é recusada e oferece retirada", () => {
    expect(() => montarPedido(C, { ...base, tipo: "entrega", endereco: "Rua A, 10", destino: aKm(4.6), itens: [acai500] }, sab15h)).toThrow(/retirar no balcão/);
  });
  it("entrega abaixo do mínimo informa quanto falta; retirada não tem mínimo", () => {
    const item = { tipo: "acai" as const, sizeId: "c500", baseId: "zero", addonIds: [], qtd: 1 }; // 19,90
    expect(() => montarPedido(C, { ...base, tipo: "entrega", endereco: "Rua A, 10", destino: aKm(1.5), itens: [item] }, sab15h)).toThrow(/Faltam R\$ 0,10/);
    expect(montarPedido(C, { ...base, tipo: "retirada", itens: [item] }, sab15h).total).toBe(19.9);
  });
  it("entrega sem ponto no mapa é recusada", () => {
    expect(() => montarPedido(C, { ...base, tipo: "entrega", endereco: "Rua A, 10", itens: [acai500] }, sab15h)).toThrow(/mapa/);
  });
  it("copo promocional: vende na terça, recusa no sábado mesmo forçando a requisição", () => {
    const promo = { tipo: "promo" as const, promoId: "copo-promocional", qtd: 2 };
    expect(montarPedido(C, { ...base, tipo: "retirada", itens: [promo] }, ter15h).total).toBe(20);
    expect(() => montarPedido(C, { ...base, tipo: "retirada", itens: [promo] }, sab15h)).toThrow(PedidoError);
  });
  it("ignora preço e total enviados pelo navegador", () => {
    const p = montarPedido(C, { ...base, tipo: "retirada", total: 1, itens: [{ tipo: "produto", productId: "pic4", qtd: 1, preco: 0.01 }] }, sab15h);
    expect(p.total).toBe(6);
  });
  it("não aceita açaí no quilo pelo site", () => {
    expect(() => montarPedido(C, { ...base, tipo: "retirada", itens: [{ tipo: "kg", pesoBrutoG: 500, taraG: 0, qtd: 1 }] }, sab15h)).toThrow(PedidoError);
  });
  it("loja fechada: pedido fica agendado", () => {
    const p = montarPedido(C, { ...base, tipo: "retirada", itens: [acai500] }, seg15h);
    expect(p.agendado).toBe(true);
    expect(p.avisoHorario).toMatch(/abre amanhã/);
  });
  it("valida nome, WhatsApp e troco", () => {
    expect(() => montarPedido(C, { ...base, nome: "", tipo: "retirada", itens: [acai500] }, sab15h)).toThrow(/nome/);
    expect(() => montarPedido(C, { ...base, whatsapp: "9999", tipo: "retirada", itens: [acai500] }, sab15h)).toThrow(/WhatsApp/);
    expect(() => montarPedido(C, { ...base, pagamento: "dinheiro", trocoPara: 10, tipo: "retirada", itens: [acai500] }, sab15h)).toThrow(/troco/);
  });
});
