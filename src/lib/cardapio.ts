import type { Catalog, Product } from "@/lib/pricing";
import type { Faixa } from "@/lib/delivery";
import type { Horarios } from "@/lib/horario";
import { CARDAPIO_DEMO } from "@/data/cardapio-demo";
import { createClient, supabaseConfigurado } from "@/lib/supabase/server";

export type ProdutoLoja = Product & { category_id: string; descricao: string | null; imagem: string | null };
export type Loja = {
  whatsapp: string; endereco: string; lat: number; lng: number;
  horarios: Horarios; faixas: Faixa[]; pedidoMinimo: number; aceitaAgendamento: boolean;
};
/** Tudo o que o site precisa para montar o cardápio e calcular preços. */
export type Cardapio = Omit<Catalog, "products"> & {
  products: ProdutoLoja[];
  grupos: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  imagens: { Copo: string; Pote: string };
  loja: Loja;
  demo: boolean;
};

const img = (path: string | null | undefined) =>
  !path ? null : path.startsWith("/") || path.startsWith("http") ? path : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cardapio/${path}`;

export async function getCardapio(): Promise<Cardapio> {
  if (!supabaseConfigurado()) return CARDAPIO_DEMO;
  const sb = createClient();
  const [st, sizes, bases, grupos, addons, cats, prods, promos] = await Promise.all([
    sb.from("settings").select("*").single(),
    sb.from("acai_sizes").select("*").order("ordem"),
    sb.from("acai_bases").select("*").order("ordem"),
    sb.from("addon_groups").select("*").order("ordem"),
    sb.from("addon_items").select("*").order("ordem"),
    sb.from("categories").select("*").eq("ativo", true).order("ordem"),
    sb.from("products").select("*").order("ordem"),
    sb.from("promos").select("*"),
  ]);
  const falhou = [st, sizes, bases, grupos, addons, cats, prods, promos].find((r) => r.error);
  if (falhou || !st.data) throw new Error("Não foi possível carregar o cardápio: " + (falhou?.error?.message ?? "sem configurações"));
  const s = st.data;
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    demo: false,
    settings: { acomp_extra: n(s.acomp_extra), preco_kg: Number(s.preco_kg) },
    sizes: (sizes.data ?? []).map((x) => ({ id: x.id, embalagem: x.embalagem, rotulo: x.rotulo, preco: Number(x.preco), acomp_inclusos: x.acomp_inclusos, ativo: x.ativo })),
    bases: bases.data ?? [],
    grupos: (grupos.data ?? []).map((g) => ({ id: g.id, nome: g.nome })),
    addons: (addons.data ?? []).map((a) => ({ id: a.id, group_id: a.group_id, nome: a.nome, preco_adicional: Number(a.preco_adicional), conta_no_limite: a.conta_no_limite, ativo: a.ativo, esgotado_em: a.esgotado_em })),
    categorias: (cats.data ?? []).filter((c) => c.id !== "acai" && c.id !== "promo").map((c) => ({ id: c.id, nome: c.nome })),
    products: (prods.data ?? []).map((p) => ({ id: p.id, category_id: p.category_id, nome: p.nome, descricao: p.descricao, kind: p.kind, preco: n(p.preco), tamanhos: p.tamanhos, sabores: p.sabores, escolha: p.escolha, ativo: p.ativo, esgotado_em: p.esgotado_em, imagem: img(p.imagem_path) })),
    promos: (promos.data ?? []).map((p) => ({ ...p, preco: Number(p.preco) })),
    imagens: { Copo: img(s.img_copo) ?? "/img/acai_copo.jpg", Pote: img(s.img_pote) ?? "/img/acai_pote.jpg" },
    loja: { whatsapp: s.whatsapp, endereco: s.endereco, lat: s.loja_lat, lng: s.loja_lng, horarios: s.horarios, faixas: s.faixas_entrega, pedidoMinimo: Number(s.pedido_minimo), aceitaAgendamento: s.aceita_agendamento },
  };
}
