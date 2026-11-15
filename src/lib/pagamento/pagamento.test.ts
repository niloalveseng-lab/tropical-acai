import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decidir } from "./confirmar";
import { assinaturaValida, type PagamentoMP } from "./mp";

const id = "11111111-2222-3333-4444-555555555555";
const pedido = { id, status: "aguardando_pagamento", total: 37.9 };
const pg = (x: Partial<PagamentoMP>): PagamentoMP => ({ id: 1, status: "approved", transaction_amount: 37.9, external_reference: id, ...x });

describe("confirmação do pagamento online", () => {
  it("aprova quando o valor confere e o pedido aguardava", () => expect(decidir(pedido, pg({}))).toBe("aprovar"));
  it("não aprova duas vezes nem reabre pedido cancelado", () => {
    expect(decidir({ ...pedido, status: "novo" }, pg({}))).toBe("ignorar");
    expect(decidir({ ...pedido, status: "cancelado" }, pg({}))).toBe("ignorar");
  });
  it("recusa valor diferente do pedido", () => expect(decidir(pedido, pg({ transaction_amount: 1 }))).toBe("valor_divergente"));
  it("ignora pagamento de outro pedido", () => expect(decidir(pedido, pg({ external_reference: "outro" }))).toBe("ignorar"));
  it("pendente aguarda, rejeitado marca recusado", () => {
    expect(decidir(pedido, pg({ status: "pending" }))).toBe("aguardar");
    expect(decidir(pedido, pg({ status: "rejected" }))).toBe("recusado");
  });
});

describe("assinatura do aviso do Mercado Pago", () => {
  const segredo = "s3gr3do", ts = "1700000000", req = "req-1", dataId = "123456";
  const v1 = createHmac("sha256", segredo).update(`id:${dataId};request-id:${req};ts:${ts};`).digest("hex");
  it("aceita assinatura correta", () => expect(assinaturaValida(`ts=${ts},v1=${v1}`, req, dataId, segredo)).toBe(true));
  it("rejeita assinatura errada ou ausente", () => {
    expect(assinaturaValida(`ts=${ts},v1=${"0".repeat(64)}`, req, dataId, segredo)).toBe(false);
    expect(assinaturaValida(null, req, dataId, segredo)).toBe(false);
  });
  it("sem segredo configurado não confere", () => expect(assinaturaValida("ts=1,v1=aa", req, dataId, "")).toBeNull());
});
