import { describe, expect, it } from "vitest";
import { statusLoja } from "./horario";

const H = { "0": [14, 21], "1": null, "2": [14, 21], "3": [14, 21], "4": [14, 21], "5": [14, 22], "6": [14, 22] } as never;
const em = (diaSemana: number, hora: number) => ({ diaSemana, hora, data: "2026-11-14" });

describe("horário da loja", () => {
  it("aberta no sábado às 15h, até 22h", () => expect(statusLoja(H, em(6, 15))).toMatchObject({ aberta: true, texto: "Aberto agora · até 22h" }));
  it("antes de abrir: abre hoje", () => expect(statusLoja(H, em(6, 11)).texto).toBe("Fechado · abre hoje às 14h"));
  it("domingo depois das 21h pula a segunda e abre terça", () => expect(statusLoja(H, em(0, 21)).texto).toBe("Fechado · abre terça às 14h"));
  it("segunda fechada: abre amanhã", () => expect(statusLoja(H, em(1, 16)).texto).toBe("Fechado · abre amanhã às 14h"));
  it("fecha na hora cheia", () => expect(statusLoja(H, em(2, 21)).aberta).toBe(false));
});
