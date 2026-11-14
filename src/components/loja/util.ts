export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Cor de cada acompanhamento na ilustração do copo. */
const CORES: [RegExp, string][] = [
  [/banana/i, "#F6E27A"], [/cereja/i, "#B3123A"], [/kiwi/i, "#8BC34A"], [/pistache/i, "#A9C77B"],
  [/ovomaltine/i, "#9C6B3F"], [/avel[ãa]/i, "#7A4B2A"], [/buenissimo/i, "#EBD3A8"], [/ninho/i, "#FFF3D6"],
  [/abacaxi/i, "#F9E07F"], [/maracuj[áa]/i, "#F7C948"], [/lim[ãa]o/i, "#D6EE9A"], [/leite em p[óo]/i, "#FFF8E7"],
  [/amendoim/i, "#D9A860"], [/castanha/i, "#C89B6D"], [/m&m/i, "#F25C54"], [/chocobol/i, "#6B3F2A"], [/oreo/i, "#2B2B2B"],
  [/marshmallow/i, "#FBD3E0"], [/granulado/i, "#5A3524"], [/beijos/i, "#F28CB1"], [/fini banana/i, "#FFE066"],
  [/farinha/i, "#F3E3C3"], [/granola/i, "#C9A26B"], [/gotas/i, "#4A2A1A"], [/tubetes/i, "#E9C46A"], [/bis/i, "#7B4A2E"],
  [/ouro branco/i, "#F5E6C8"], [/condensado/i, "#FFF1C9"], [/chocolate/i, "#4E2A1E"], [/uva/i, "#7E57C2"],
  [/caramelo/i, "#D98E2B"], [/morango/i, "#E8434F"],
];
export const corDoItem = (nome: string) => CORES.find(([re]) => re.test(nome))?.[1] ?? "#D9C7EA";

export const soDigitos = (v: string) => v.replace(/\D/g, "");
export function mascaraFone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem("ta_" + chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
export function gravar(chave: string, valor: unknown) {
  try { localStorage.setItem("ta_" + chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível */ }
}
