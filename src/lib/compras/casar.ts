/** Liga cada linha do comprovante a um insumo do estoque. Primeiro pelo que já foi aprendido, depois pela sugestão da IA. */

export type InsumoBase = { id: string; nome: string; unidade: string };
export type Apelido = { texto: string; insumo_id: string; fator: number };
export type LinhaLida = { descricao: string; quantidade: number; valor_total: number; unidade?: string | null; insumo?: string | null; qtd_estoque?: number | null };
export type LinhaCasada = { descricao: string; quantidade: number; valor_total: number; insumo_id: string | null; qtd_estoque: number | null; origem: "memoria" | "ia" | null };

/** Igual a normalizar_texto() do banco: minúsculas, sem acento, espaços simples. */
export function normalizar(t: string | null | undefined) {
  return (t ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

export function casarLinhas(linhas: LinhaLida[], insumos: InsumoBase[], apelidos: Apelido[]): LinhaCasada[] {
  const porApelido = new Map(apelidos.map((a) => [a.texto, a]));
  const porNome = new Map(insumos.map((i) => [normalizar(i.nome), i]));
  const existe = new Set(insumos.map((i) => i.id));
  return linhas.map((l) => {
    const quantidade = Number(l.quantidade) > 0 ? Number(l.quantidade) : 1;
    const base = { descricao: (l.descricao ?? "").trim() || "Item", quantidade, valor_total: Math.max(0, Number(l.valor_total) || 0) };
    const ap = porApelido.get(normalizar(l.descricao));
    if (ap && existe.has(ap.insumo_id)) return { ...base, insumo_id: ap.insumo_id, qtd_estoque: arred(quantidade * Number(ap.fator)), origem: "memoria" as const };
    const ins = l.insumo ? porNome.get(normalizar(l.insumo)) : undefined;
    if (ins) {
      const q = Number(l.qtd_estoque) > 0 ? Number(l.qtd_estoque) : quantidade;
      return { ...base, insumo_id: ins.id, qtd_estoque: arred(q), origem: "ia" as const };
    }
    return { ...base, insumo_id: null, qtd_estoque: null, origem: null };
  });
}

/** Soma dos itens confere com o total do comprovante? (tolerância de 1 centavo por item, por arredondamento). */
export function confereTotal(linhas: { valor_total: number }[], total: number) {
  const soma = Math.round(linhas.reduce((s, l) => s + (Number(l.valor_total) || 0), 0) * 100) / 100;
  return { soma, diferenca: Math.round((total - soma) * 100) / 100, ok: Math.abs(total - soma) <= Math.max(0.01 * linhas.length, 0.01) };
}
