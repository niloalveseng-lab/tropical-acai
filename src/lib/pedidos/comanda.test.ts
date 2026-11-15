import { describe, expect, it } from "vitest";
import { foneWa, linkMapa, linkWhatsApp, textoComanda, type PedidoBalcao } from "./comanda";

const base: PedidoBalcao = {
  id: "1", numero: 7, codigo: "abc", canal: "site", status: "preparo", tipo: "entrega",
  cliente_nome: "Maria Souza", cliente_telefone: "(83) 99999-1234", endereco: "Rua A, 10", bairro: "Perto da praça",
  entrega_lat: -6.76, entrega_lng: -38.23, distancia_km: 1.2, subtotal: 30, taxa_entrega: 7, total: 37,
  forma_pagamento: "dinheiro", pago: false, troco_para: 50, observacao: null, motivo_cancelamento: null,
  created_at: "2026-11-14T18:30:00Z", updated_at: "2026-11-14T18:30:00Z",
  order_items: [{ nome: "Açaí Copo 500 ml", descricao: "Base Tradicional · Granola", quantidade: 1, total: 30, detalhes: { obs: "sem gelo" } }],
};

describe("comanda do balcão", () => {
  it("normaliza o telefone para o WhatsApp", () => {
    expect(foneWa("(83) 99999-1234")).toBe("5583999991234");
    expect(foneWa("5583999991234")).toBe("5583999991234");
    expect(foneWa("123")).toBeNull();
  });
  it("monta link do WhatsApp com a mensagem do status", () => {
    const u = linkWhatsApp(base)!;
    expect(u).toContain("wa.me/5583999991234");
    expect(decodeURIComponent(u)).toContain("Olá, Maria! Aqui é do Tropical Açaí. Pedido #7: seu pedido foi aceito");
  });
  it("usa a localização marcada no mapa", () => {
    expect(linkMapa(base)).toBe("https://www.google.com/maps?q=-6.76,-38.23");
  });
  it("calcula o troco na comanda e mostra observação do item", () => {
    const t = textoComanda(base);
    expect(t).toContain("PEDIDO #7  15:30");
    expect(t).toContain("OBS: sem gelo");
    expect(t).toMatch(/levar R\$\s13,00/);
  });
});
