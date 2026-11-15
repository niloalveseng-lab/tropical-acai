"use client";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export type Aviso = (tipo: "ok" | "erro", texto: string) => void;
export const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
export const paraTexto = (v: number | null | undefined) => (v == null ? "" : Number(v).toFixed(2).replace(".", ","));

/* Linhas do banco usadas no painel */
export type Tamanho = { id: string; embalagem: string; rotulo: string; preco: number; acomp_inclusos: number; tara_g: number; ativo: boolean };
export type Base = { id: string; nome: string; ativo: boolean };
export type Grupo = { id: string; nome: string };
export type Addon = { id: string; group_id: string; nome: string; preco_adicional: number; conta_no_limite: boolean; ordem: number; ativo: boolean; esgotado_em: string | null };
export type Categoria = { id: string; nome: string };
export type Produto = { id: string; category_id: string; nome: string; descricao: string | null; kind: "simples" | "opcoes"; preco: number | null; tamanhos: { nome: string; preco: number; sabores?: number }[] | null; sabores: string[] | null; imagem_path: string | null; ordem: number; destaque: boolean; ativo: boolean; esgotado_em: string | null };
export type Promo = { id: string; nome: string; tamanho: string; preco: number; composicao: string[]; dias_semana: number[]; ativo: boolean };
export type Config = { whatsapp: string; endereco: string; horarios: Record<string, [number, number] | null>; preco_kg: number; acomp_extra: number | null; loja_lat: number; loja_lng: number; faixas_entrega: { ate_km: number; taxa: number }[]; pedido_minimo: number; aceita_agendamento: boolean; img_copo: string | null; img_pote: string | null };
export type Dados = { config: Config; tamanhos: Tamanho[]; bases: Base[]; grupos: Grupo[]; addons: Addon[]; categorias: Categoria[]; produtos: Produto[]; promos: Promo[] };

export async function carregarDados(): Promise<Dados> {
  const sb = supabaseNavegador();
  const [st, tam, bas, gru, add, cat, pro, prm] = await Promise.all([
    sb.from("settings").select("*").single(), sb.from("acai_sizes").select("*").order("ordem"), sb.from("acai_bases").select("*").order("ordem"),
    sb.from("addon_groups").select("*").order("ordem"), sb.from("addon_items").select("*").order("ordem").order("nome"),
    sb.from("categories").select("*").order("ordem"), sb.from("products").select("*").order("ordem").order("nome"), sb.from("promos").select("*"),
  ]);
  const erro = [st, tam, bas, gru, add, cat, pro, prm].find((r) => r.error)?.error;
  if (erro || !st.data) throw new Error("Não foi possível carregar o cardápio: " + (erro?.message ?? "sem configurações"));
  return {
    config: st.data as Config, tamanhos: tam.data as Tamanho[], bases: bas.data as Base[], grupos: gru.data as Grupo[], addons: add.data as Addon[],
    categorias: (cat.data as Categoria[]).filter((c) => c.id !== "acai" && c.id !== "promo"), produtos: pro.data as Produto[], promos: prm.data as Promo[],
  };
}

/** Endereço público de uma foto do cardápio. */
export const urlFoto = (path: string | null | undefined) =>
  !path ? null : path.startsWith("/") || path.startsWith("http") ? path : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cardapio/${path}`;

/** Reduz a foto (máx. 1200 px, JPEG) e envia para o Supabase Storage. Devolve o caminho salvo. */
export async function enviarFoto(arquivo: File, nome: string): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala); tela.height = Math.round(img.height * escala);
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob>((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível ler a imagem"))), "image/jpeg", 0.85));
  const caminho = `${nome.replace(/[^a-z0-9-]/gi, "_")}-${Date.now()}.jpg`;
  const { error } = await supabaseNavegador().storage.from("cardapio").upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error("Não foi possível enviar a foto: " + error.message);
  return caminho;
}

/* ---------- peças de tela ---------- */
export function Cartao({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5"><h2 className="text-lg font-extrabold text-roxo">{titulo}</h2>{dica && <p className="mb-3 text-sm text-roxo/60">{dica}</p>}<div className={dica ? "" : "mt-3"}>{children}</div></section>;
}

export function Chave({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => onChange(!ligado)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${ligado ? "bg-lima" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${ligado ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** Campo de dinheiro: guarda texto enquanto digita e avisa o número. */
export function CampoValor({ valor, onChange, rotulo, className = "" }: { valor: number | null; onChange: (v: number) => void; rotulo: string; className?: string }) {
  const [txt, setTxt] = useState(paraTexto(valor));
  useEffect(() => setTxt(paraTexto(valor)), [valor]);
  return <input aria-label={rotulo} inputMode="decimal" className={`campo !w-24 !px-2 !py-2 text-right ${className}`} value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^\d,]/g, ""))} onBlur={() => { const n = paraNumero(txt); setTxt(paraTexto(n)); if (n !== Number(valor)) onChange(n); }} />;
}

export function CampoInteiro({ valor, onChange, rotulo }: { valor: number; onChange: (v: number) => void; rotulo: string }) {
  const [txt, setTxt] = useState(String(valor));
  useEffect(() => setTxt(String(valor)), [valor]);
  return <input aria-label={rotulo} inputMode="numeric" className="campo !w-16 !px-2 !py-2 text-center" value={txt} onChange={(e) => setTxt(e.target.value.replace(/\D/g, ""))} onBlur={() => { const n = Number(txt) || 0; setTxt(String(n)); if (n !== valor) onChange(n); }} />;
}

export function CampoTexto({ valor, onChange, rotulo, className = "" }: { valor: string; onChange: (v: string) => void; rotulo: string; className?: string }) {
  const [txt, setTxt] = useState(valor);
  useEffect(() => setTxt(valor), [valor]);
  return <input aria-label={rotulo} className={`campo !px-2.5 !py-2 ${className}`} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => { const t = txt.trim(); if (t !== valor) { if (t) onChange(t); else setTxt(valor); } }} />;
}
