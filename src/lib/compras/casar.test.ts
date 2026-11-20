import { describe, expect, it } from "vitest";
import { casarLinhas, confereTotal, normalizar } from "./casar";

const insumos = [
  { id: "a", nome: "Açaí tradicional", unidade: "kg" },
  { id: "m", nome: "Morango", unidade: "kg" },
];

describe("casar linhas do comprovante", () => {
  it("normaliza igual ao banco", () => {
    expect(normalizar("  POLPA  AÇAÍ 10KG ")).toBe("polpa acai 10kg");
  });

  it("usa o que já aprendeu antes da IA", () => {
    const r = casarLinhas(
      [{ descricao: "POLPA AÇAÍ 10KG", quantidade: 2, valor_total: 500, insumo: "Morango", qtd_estoque: 2 }],
      insumos, [{ texto: "polpa acai 10kg", insumo_id: "a", fator: 10 }],
    );
    expect(r[0]).toMatchObject({ insumo_id: "a", qtd_estoque: 20, origem: "memoria" });
  });

  it("aceita a sugestão da IA pelo nome do insumo", () => {
    const r = casarLinhas([{ descricao: "MORANGO KG", quantidade: 1.25, valor_total: 18.75, insumo: "morango", qtd_estoque: 1.25 }], insumos, []);
    expect(r[0]).toMatchObject({ insumo_id: "m", qtd_estoque: 1.25, origem: "ia" });
  });

  it("deixa sem insumo o que não reconhece (ex.: detergente)", () => {
    const r = casarLinhas([{ descricao: "DETERGENTE", quantidade: 0, valor_total: 3.5, insumo: "Detergente" }], insumos, []);
    expect(r[0]).toMatchObject({ insumo_id: null, qtd_estoque: null, origem: null, quantidade: 1 });
  });

  it("confere o total", () => {
    expect(confereTotal([{ valor_total: 10.1 }, { valor_total: 5.2 }], 15.3).ok).toBe(true);
    expect(confereTotal([{ valor_total: 10 }], 12)).toMatchObject({ ok: false, diferenca: 2 });
  });
});
