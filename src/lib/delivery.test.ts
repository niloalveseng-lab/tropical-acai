import { describe, expect, it } from "vitest";
import { checarPedidoMinimo, cotarEntrega, distanciaKm } from "./delivery";

const loja = { lat: -6.7589, lng: -38.2311 };
const faixas = [{ ate_km: 1, taxa: 5 }, { ate_km: 2, taxa: 7 }, { ate_km: 3, taxa: 8 }, { ate_km: 4, taxa: 10 }];
// 0,009 grau de latitude ≈ 1 km
const aKm = (km: number) => ({ lat: loja.lat - 0.008993 * km, lng: loja.lng });

describe("entrega por raio", () => {
  it("mede distância em km", () => {
    expect(distanciaKm(loja, aKm(2))).toBeCloseTo(2, 1);
  });
  it.each([[0.4, 5], [1.5, 7], [2.5, 8], [3.9, 10]])("%s km cobra R$ %s", (km, taxa) => {
    const r = cotarEntrega(loja, aKm(km), faixas);
    expect(r.entrega && r.taxa).toBe(taxa);
  });
  it("não entrega acima de 4 km", () => {
    const r = cotarEntrega(loja, aKm(4.6), faixas);
    expect(r.entrega).toBe(false);
  });
});

describe("pedido mínimo de entrega", () => {
  it("exige R$ 20 em produtos", () => {
    expect(checarPedidoMinimo(19.9, 20)).toMatch(/Faltam R\$ 0,10/);
    expect(checarPedidoMinimo(20, 20)).toBeNull();
  });
});
