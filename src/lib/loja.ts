import { createClient, supabaseConfigurado } from "@/lib/supabase/server";

export type InfoLoja = { whatsapp: string; endereco: string; lat: number; lng: number };

/** Valores usados enquanto o banco ainda não está ligado (desenvolvimento). */
export const LOJA_PADRAO: InfoLoja = {
  whatsapp: "5583993526981",
  endereco: "Av. Monsenhor Vicente Freitas, 445 – Sousa-PB",
  lat: -6.7490513, lng: -38.24237, // provisório até confirmar o pino no admin
};

export async function getInfoLoja(): Promise<InfoLoja> {
  if (!supabaseConfigurado()) return LOJA_PADRAO;
  const { data } = await createClient().from("settings").select("whatsapp,endereco,loja_lat,loja_lng").single();
  return data ? { whatsapp: data.whatsapp, endereco: data.endereco, lat: data.loja_lat, lng: data.loja_lng } : LOJA_PADRAO;
}

export type Vendido = { nome: string; quantidade: number | null; imagem: string | null };

/** Mais vendidos dos últimos 30 dias; completa com os produtos marcados como destaque. */
export async function getMaisVendidos(limite = 6): Promise<Vendido[]> {
  if (!supabaseConfigurado()) return [];
  const sb = createClient();
  const [{ data: top }, { data: destaques }] = await Promise.all([
    sb.rpc("mais_vendidos", { dias: 30, limite }),
    sb.from("products").select("nome,imagem_path").eq("destaque", true).eq("ativo", true).order("ordem"),
  ]);
  const lista: Vendido[] = (top ?? []).map((t: { nome: string; quantidade: number }) => ({ nome: t.nome, quantidade: t.quantidade, imagem: null }));
  for (const d of destaques ?? []) {
    if (lista.length >= limite) break;
    if (!lista.some((l) => l.nome.startsWith(d.nome))) lista.push({ nome: d.nome, quantidade: null, imagem: d.imagem_path });
  }
  return lista;
}
