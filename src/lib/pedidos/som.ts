"use client";
/** Som de novo pedido: tons gerados no navegador (sem arquivo), volume e repetição ajustáveis, salvo neste aparelho. */

export type Tom = "campainha" | "sino" | "ding" | "alarme" | "apito" | "marimba";
export type ConfigSom = { ligado: boolean; volume: number; tom: Tom; repetir: number; telaAcesa: boolean };

export const TONS: { id: Tom; nome: string }[] = [
  { id: "campainha", nome: "Campainha (3 notas)" },
  { id: "sino", nome: "Sino de loja" },
  { id: "ding", nome: "Ding-dong" },
  { id: "marimba", nome: "Marimba" },
  { id: "apito", nome: "Bipe curto" },
  { id: "alarme", nome: "Alarme (mais forte)" },
];
export const REPETICOES = [0, 10, 20, 30, 60];

const PADRAO: ConfigSom = { ligado: true, volume: 80, tom: "campainha", repetir: 20, telaAcesa: true };
const CHAVE = "ta_som";

export function lerConfigSom(): ConfigSom {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    return s ? { ...PADRAO, ...s } : PADRAO;
  } catch { return PADRAO; }
}
export function salvarConfigSom(c: ConfigSom) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento: vale só nesta aba */ }
}

type Nota = { f: number; t: number; d: number; tipo?: OscillatorType; g?: number };
const PADROES: Record<Tom, Nota[]> = {
  campainha: [{ f: 880, t: 0, d: 0.25 }, { f: 1175, t: 0.18, d: 0.25 }, { f: 1568, t: 0.36, d: 0.3 }],
  sino: [{ f: 1318, t: 0, d: 1.2, tipo: "triangle" }, { f: 2637, t: 0, d: 0.6, g: 0.3 }, { f: 1318, t: 0.45, d: 1.2, tipo: "triangle" }, { f: 2637, t: 0.45, d: 0.6, g: 0.3 }],
  ding: [{ f: 1046, t: 0, d: 0.7, tipo: "triangle" }, { f: 784, t: 0.45, d: 0.9, tipo: "triangle" }],
  marimba: [{ f: 659, t: 0, d: 0.2 }, { f: 784, t: 0.12, d: 0.2 }, { f: 988, t: 0.24, d: 0.2 }, { f: 1318, t: 0.36, d: 0.35 }],
  apito: [{ f: 1760, t: 0, d: 0.12, tipo: "square", g: 0.35 }, { f: 1760, t: 0.2, d: 0.12, tipo: "square", g: 0.35 }],
  alarme: [0, 0.25, 0.5, 0.75, 1.0, 1.25].map((t, i) => ({ f: i % 2 ? 988 : 1319, t, d: 0.22, tipo: "sawtooth" as OscillatorType, g: 0.45 })),
};

/** Toca o tom escolhido. Volume 0–100 (curva suave para o controle ficar natural). */
export function tocarTom(ctx: AudioContext, tom: Tom, volume: number) {
  const v = Math.max(0, Math.min(1, volume / 100)) ** 1.6;
  if (v <= 0) return;
  const base = ctx.currentTime + 0.02;
  for (const n of PADROES[tom] ?? PADROES.campainha) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = n.tipo ?? "sine"; o.frequency.value = n.f;
    const pico = Math.max(0.0002, v * (n.g ?? 0.6));
    g.gain.setValueAtTime(0.0001, base + n.t);
    g.gain.exponentialRampToValueAtTime(pico, base + n.t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, base + n.t + n.d);
    o.connect(g).connect(ctx.destination);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(base + n.t); o.stop(base + n.t + n.d + 0.05);
  }
}
