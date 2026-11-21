import { describe, expect, it } from "vitest";
import { z } from "zod";

const PERMISSOES = ["caixa", "cancelar", "esgotado", "historico", "relatorios", "cardapio", "loja", "estoque", "financeiro"] as const;
const schema = z.partialRecord(z.enum(PERMISSOES), z.boolean()).nullable();

describe("ajuste de acessos", () => {
  it("aceita só as chaves alteradas", () => {
    expect(schema.safeParse({ estoque: true }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
  });
  it("recusa chave desconhecida", () => {
    expect(schema.safeParse({ admin: true }).success).toBe(false);
  });
});
