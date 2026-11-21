"use client";
import { supabaseNavegador } from "@/lib/supabase/client";

export type Insumo = {
  id: string; nome: string; categoria: string; unidade: string; estoque: number; minimo: number;
  fornecedor: string | null; frequencia: string; ultimo_custo: number | null; ativo: boolean;
};
export type ItemLista = { id: string; insumo_id: string | null; texto: string | null; pedido_por_nome: string | null; created_at: string };

export const CATEGORIAS: Record<string, string> = {
  acai_sorvete: "Açaí e sorvetes", cremes: "Cremes e mousses", frutas: "Frutas", insumos: "Complementos",
  descartaveis: "Descartáveis", mercado: "Mercado / bebidas", outros: "Outros",
};
export const FREQUENCIAS: Record<string, string> = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", quando_precisa: "Quando precisar" };
export const UNIDADES = ["kg", "g", "l", "ml", "un", "cx", "pct"] as const;
export const FORMAS: Record<string, string> = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito", credito: "Crédito", boleto: "Boleto", outro: "Outro" };
export const PAGO_COM: Record<string, string> = { caixa: "Dinheiro do caixa", conta_loja: "Conta/cartão da loja", dono: "Do seu bolso", esposa: "Do bolso da esposa" };
export const CAT_CONTA: Record<string, string> = {
  aluguel: "Aluguel", internet: "Internet", energia: "Energia", agua: "Água", imposto: "Impostos", pessoal: "Pessoal",
  fornecedor: "Fornecedor", manutencao: "Manutenção", outros: "Outros",
};

export const qtd = (n: number | null | undefined, un = "") => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${un ? " " + un : ""}`);
export const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
export const abaixo = (i: Insumo) => Number(i.minimo) > 0 && Number(i.estoque) <= Number(i.minimo);

export async function carregarInsumos(): Promise<Insumo[]> {
  const { data, error } = await supabaseNavegador().from("insumos").select("*").order("categoria").order("nome");
  if (error) throw new Error("Não foi possível carregar o estoque: " + error.message);
  return data as Insumo[];
}

/** Lê um número digitado no padrão brasileiro ("1,5" ou "1.234,5"). */
export const num = (s: string) => {
  const t = String(s).trim();
  if (!t) return 0;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) || 0;
};

/** Memória de preços (últimos 12 meses), por insumo. Só quem tem acesso ao financeiro recebe dados. */
export type ResumoPreco = { insumo_id: string; qtd: number; medio: number; menor: number; menor_onde: string | null; menor_data: string; maior: number; maior_onde: string | null; ultimo: number; ultimo_onde: string | null; ultimo_data: string };
export async function carregarPrecos(): Promise<Map<string, ResumoPreco>> {
  const { data } = await supabaseNavegador().rpc("precos_insumos");
  return new Map(((data ?? []) as ResumoPreco[]).map((p) => [p.insumo_id, { ...p, medio: Number(p.medio), menor: Number(p.menor), maior: Number(p.maior), ultimo: Number(p.ultimo) }]));
}
/** Nome curto do fornecedor para caber na linha ("Atacado das Balas (Lucivaldo…)" → "Atacado das Balas"). */
export const onde = (s: string | null | undefined) => (s ?? "").replace(/\s*\(.*\)\s*$/, "").trim() || "—";
/** Preço por unidade: centavos para itens baratos (copo R$ 0,165). */
export const precoUn = (n: number, un: string) => `${n < 1 ? "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/${un}`;
