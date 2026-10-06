import { describe, expect, it } from "vitest";
import { lastFrame, parseFrame, precoPorPeso, STX, ETX } from "./toledo";

const frame = (s: string) => new Uint8Array([STX, ...Array.from(new TextEncoder().encode(s)), ETX]);

describe("Toledo Prix 3 Fit — protocolo", () => {
  it("lê peso estável em gramas (Prt3)", () => {
    expect(parseFrame("00452")).toEqual({ status: "estavel", gramas: 452 });
    expect(parseFrame("\x0201250\x03")).toEqual({ status: "estavel", gramas: 1250 });
  });
  it("reconhece instável, negativo e sobrecarga", () => {
    expect(parseFrame("IIIII").status).toBe("instavel");
    expect(parseFrame("NNNNN").status).toBe("negativo");
    expect(parseFrame("SSSSS").status).toBe("sobrecarga");
  });
  it("aceita formato Prt2 com ponto decimal", () => {
    expect(parseFrame("01.234")).toEqual({ status: "estavel", gramas: 1234 });
  });
  it("marca resposta estranha como inválida", () => {
    expect(parseFrame("abc").status).toBe("invalido");
  });
  it("extrai o último quadro de um buffer com lixo e quadros parciais", () => {
    const a = frame("IIIII"), b = frame("00500");
    const buf = new Uint8Array([0x31, ...Array.from(a), ...Array.from(b), STX, 0x30]);
    expect(lastFrame(buf)).toBe("00500");
    expect(lastFrame(new Uint8Array([STX, 0x30, 0x31]))).toBeNull();
  });
});

describe("açaí no quilo", () => {
  it("desconta a tara e arredonda em centavos", () => {
    // 520 g brutos − 20 g de copo = 500 g × R$ 49,99/kg = R$ 25,00 (24,995 arredonda p/ 25,00)
    expect(precoPorPeso(520, 20, 49.99)).toEqual({ liquidoG: 500, valor: 25 });
    expect(precoPorPeso(1000, 0, 49.99)).toEqual({ liquidoG: 1000, valor: 49.99 });
  });
  it("nunca fica negativo", () => {
    expect(precoPorPeso(10, 20, 49.99)).toEqual({ liquidoG: 0, valor: 0 });
  });
});
