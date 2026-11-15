import { describe, expect, it } from "vitest";
import { emAberto, proximo } from "./status";

describe("fluxo do pedido", () => {
  it("retirada: novo → preparo → pronto → entregue", () => {
    expect(proximo("novo", "retirada")?.status).toBe("preparo");
    expect(proximo("preparo", "retirada")?.status).toBe("pronto");
    expect(proximo("pronto", "retirada")?.status).toBe("entregue");
    expect(proximo("entregue", "retirada")).toBeNull();
  });
  it("entrega passa por 'saiu para entrega'", () => {
    expect(proximo("preparo", "entrega")?.status).toBe("saiu");
    expect(proximo("saiu", "entrega")?.status).toBe("entregue");
  });
  it("cancelado não avança e não fica em aberto", () => {
    expect(proximo("cancelado", "retirada")).toBeNull();
    expect(emAberto("cancelado")).toBe(false);
    expect(emAberto("saiu")).toBe(true);
  });
});
