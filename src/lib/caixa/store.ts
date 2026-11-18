"use client";
import { supabaseNavegador } from "@/lib/supabase/client";

export type Sessao = { id: string; aberto_em: string; valor_abertura: number };
export type Resumo = { abertura: number; por_metodo: Record<string, number>; balcao_qtd: number; balcao_total: number; site_qtd: number; site_total: number; site_dinheiro: number; sangrias: number; suprimentos: number; dinheiro_esperado: number; a_receber?: number; entregas_qtd?: number; taxas_entrega?: number };
export type Tara = { nome: string; g: number };

/** Operações do caixa. Em produção fala com o Supabase; sem banco, guarda na memória (demonstração). */
export interface CaixaStore {
  sessaoAberta(): Promise<Sessao | null>;
  abrir(operador: string, valor: number): Promise<void>;
  movimento(sessao: string, tipo: "sangria" | "suprimento", valor: number, motivo: string | null): Promise<void>;
  resumo(sessao: string): Promise<Resumo>;
  fechar(sessao: string, operador: string, contado: number, obs: string | null): Promise<void>;
  taras(): Promise<Tara[]>;
  /** Só na demonstração: soma a venda no resumo. */
  registrarDemo?(pagamentos: { metodo: string; valor: number }[], total: number): void;
}

const falha = (o: string, e: { message: string }) => new Error(`${o}: ${e.message}`);

const real: CaixaStore = {
  async sessaoAberta() {
    const { data, error } = await supabaseNavegador().from("cash_sessions").select("id,aberto_em,valor_abertura").is("fechado_em", null).maybeSingle();
    if (error) throw falha("Não foi possível consultar o caixa", error);
    return data ? { ...data, valor_abertura: Number(data.valor_abertura) } : null;
  },
  async abrir(operador, valor) {
    const { error } = await supabaseNavegador().from("cash_sessions").insert({ aberto_por: operador, valor_abertura: valor });
    // Se outra pessoa abriu ao mesmo tempo, o caixa já está aberto: segue normalmente.
    if (error && !/duplicate|um_caixa_aberto/i.test(error.message)) throw falha("Não foi possível abrir o caixa", error);
  },
  async movimento(sessao, tipo, valor, motivo) {
    const { error } = await supabaseNavegador().from("cash_movements").insert({ session_id: sessao, tipo, valor, motivo });
    if (error) throw falha("Não foi possível registrar", error);
  },
  async resumo(sessao) {
    const { data, error } = await supabaseNavegador().rpc("resumo_caixa", { p_session: sessao });
    if (error || !data) throw falha("Não foi possível calcular o resumo", error ?? { message: "sem dados" });
    return data as Resumo;
  },
  async fechar(sessao, operador, contado, obs) {
    const { error } = await supabaseNavegador().from("cash_sessions").update({ fechado_por: operador, fechado_em: new Date().toISOString(), valor_contado: contado, observacao: obs }).eq("id", sessao);
    if (error) throw falha("Não foi possível fechar", error);
  },
  async taras() {
    const { data } = await supabaseNavegador().from("acai_sizes").select("embalagem,rotulo,tara_g").gt("tara_g", 0).order("ordem");
    return (data ?? []).map((x) => ({ nome: `${x.embalagem} ${x.rotulo}`, g: x.tara_g }));
  },
};

function demo(): CaixaStore {
  let s: Sessao | null = null;
  let r: Resumo = { abertura: 0, por_metodo: {}, balcao_qtd: 0, balcao_total: 0, site_qtd: 0, site_total: 0, site_dinheiro: 0, sangrias: 0, suprimentos: 0, dinheiro_esperado: 0 };
  const esperado = () => Math.round((r.abertura + (r.por_metodo.dinheiro ?? 0) + r.suprimentos - r.sangrias) * 100) / 100;
  return {
    async sessaoAberta() { return s; },
    async abrir(_o, valor) { s = { id: "demo", aberto_em: new Date().toISOString(), valor_abertura: valor }; r = { ...r, abertura: valor, por_metodo: {}, balcao_qtd: 0, balcao_total: 0, sangrias: 0, suprimentos: 0 }; },
    async movimento(_s, tipo, valor) { if (tipo === "sangria") r.sangrias += valor; else r.suprimentos += valor; },
    async resumo() { return { ...r, dinheiro_esperado: esperado() }; },
    async fechar() { s = null; },
    async taras() { return [{ nome: "Copo 300 ml", g: 8 }, { nome: "Copo 500 ml", g: 12 }]; },
    registrarDemo(pagamentos, total) { r.balcao_qtd++; r.balcao_total += total; for (const p of pagamentos) r.por_metodo[p.metodo] = (r.por_metodo[p.metodo] ?? 0) + p.valor; },
  };
}

let memo: CaixaStore | null = null;
export const caixaStore = (ehDemo: boolean): CaixaStore => (ehDemo ? (memo ??= demo()) : real);
