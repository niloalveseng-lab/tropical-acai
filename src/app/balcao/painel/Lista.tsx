"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { Cartao, type Aviso } from "./comum";
import { abaixo, carregarInsumos, CATEGORIAS, FREQUENCIAS, qtd, type Insumo, type ItemLista } from "./estoqueComum";

/** Lista de compras: a equipe marca o que está acabando; o dono vê tudo separado por frequência e manda pelo WhatsApp. */
export default function Lista({ avisar, euId, financeiro }: { avisar: Aviso; euId: string; financeiro: boolean }) {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [lista, setLista] = useState<ItemLista[]>([]);
  const [meuNome, setMeuNome] = useState("");
  const [avulso, setAvulso] = useState("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    try {
      const sb = supabaseNavegador();
      const [ins, l] = await Promise.all([carregarInsumos(), sb.from("lista_compras").select("id,insumo_id,texto,pedido_por_nome,created_at").is("comprado_em", null).order("created_at")]);
      setInsumos(ins.filter((i) => i.ativo)); setLista((l.data ?? []) as ItemLista[]);
    } catch (e) { avisar("erro", (e as Error).message); }
  }, [avisar]);
  useEffect(() => {
    carregar();
    supabaseNavegador().from("staff").select("nome").eq("user_id", euId).maybeSingle().then(({ data }) => setMeuNome(data?.nome ?? ""));
  }, [carregar, euId]);

  const naLista = useMemo(() => new Map(lista.filter((l) => l.insumo_id).map((l) => [l.insumo_id!, l])), [lista]);

  async function alternar(i: Insumo) {
    const sb = supabaseNavegador();
    const atual = naLista.get(i.id);
    const { error } = atual
      ? await sb.from("lista_compras").delete().eq("id", atual.id)
      : await sb.from("lista_compras").insert({ insumo_id: i.id, pedido_por: euId, pedido_por_nome: meuNome || null });
    if (error) return avisar("erro", "Não foi possível atualizar a lista: " + error.message);
    avisar("ok", atual ? `${i.nome} saiu da lista` : `${i.nome} na lista de compras`);
    carregar();
  }

  async function addAvulso(e: React.FormEvent) {
    e.preventDefault();
    if (avulso.trim().length < 2) return;
    const { error } = await supabaseNavegador().from("lista_compras").insert({ texto: avulso.trim(), pedido_por: euId, pedido_por_nome: meuNome || null });
    if (error) return avisar("erro", error.message);
    setAvulso(""); carregar();
  }
  async function tirar(id: string) {
    const { error } = await supabaseNavegador().from("lista_compras").delete().eq("id", id);
    if (error) avisar("erro", error.message); else carregar();
  }

  if (!insumos) return <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p>;

  // Monta a lista por frequência de compra (como vocês compram hoje).
  const insumoDe = (l: ItemLista) => (l.insumo_id ? insumos.find((i) => i.id === l.insumo_id) ?? null : null);
  const grupos: Record<string, ItemLista[]> = {};
  for (const l of lista) { const ins = insumoDe(l); (grupos[ins ? FREQUENCIAS[ins.frequencia] : "Outros"] ??= []).push(l); }
  const nomeItem = (l: ItemLista) => { const ins = insumoDe(l); return ins ? ins.nome + (ins.fornecedor ? ` (${ins.fornecedor})` : "") : l.texto ?? ""; };
  const sugeridos = financeiro ? insumos.filter((i) => abaixo(i) && !naLista.has(i.id)) : [];
  const texto = "*Lista de compras — Tropical Açaí*\n" + Object.entries(grupos).map(([g, itens]) => `\n*${g}*\n` + itens.map((x) => "• " + nomeItem(x)).join("\n")).join("\n");

  async function compartilhar() {
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else { await navigator.clipboard.writeText(texto); avisar("ok", "Lista copiada. Cole no WhatsApp."); }
    } catch { /* cancelado */ }
  }

  const filtrados = insumos.filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()));
  const porCategoria = Object.keys(CATEGORIAS).map((c) => [c, filtrados.filter((i) => i.categoria === c)] as const).filter(([, l]) => l.length);

  return (
    <>
      <Cartao titulo={`Na lista (${lista.length})`} dica="Toque nos itens abaixo para marcar o que está acabando. Quem compra vê tudo aqui.">
        {!lista.length ? <p className="text-sm font-semibold text-roxo/60">Nada na lista.</p> : (
          <div className="space-y-3">
            {Object.entries(grupos).map(([g, itens]) => (
              <div key={g}>
                <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-roxo/60">{g}</div>
                <ul className="flex flex-wrap gap-2">
                  {itens.map((l) => {
                    const ins = insumoDe(l);
                    return (
                      <li key={l.id} className="flex items-center gap-1 rounded-full bg-lima/30 py-1 pl-3 pr-1 text-sm font-bold text-roxo-escuro">
                        {ins?.nome ?? l.texto}{l.pedido_por_nome && <span className="text-xs font-semibold text-roxo/60">· {l.pedido_por_nome.split(" ")[0]}</span>}
                        <button onClick={() => tirar(l.id)} aria-label={`Tirar ${ins?.nome ?? l.texto} da lista`} className="grid h-6 w-6 place-items-center rounded-full bg-white/70 text-xs">✕</button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <button onClick={compartilhar} className="botao-lima w-full sm:w-auto">Enviar lista pelo WhatsApp</button>
          </div>
        )}
        <form onSubmit={addAvulso} className="mt-4 flex gap-2">
          <input className="campo !py-2 text-sm" placeholder="Outro item (ex.: detergente, pano)" value={avulso} onChange={(e) => setAvulso(e.target.value)} maxLength={80} />
          <button className="shrink-0 rounded-xl bg-roxo px-4 text-sm font-bold text-white disabled:opacity-40" disabled={avulso.trim().length < 2}>Adicionar</button>
        </form>
      </Cartao>

      {sugeridos.length > 0 && (
        <Cartao titulo="Abaixo do mínimo" dica="Pelo estoque do sistema. Toque para pôr na lista.">
          <div className="flex flex-wrap gap-2">{sugeridos.map((i) => (
            <button key={i.id} onClick={() => alternar(i)} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">+ {i.nome} <span className="font-semibold">({qtd(i.estoque, i.unidade)})</span></button>
          ))}</div>
        </Cartao>
      )}

      <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-lg font-extrabold text-roxo">O que está acabando?</h2>
          <input className="campo !w-48 !py-1.5 text-sm" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="space-y-4">
          {porCategoria.map(([c, itens]) => (
            <div key={c}>
              <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-roxo/60">{CATEGORIAS[c]}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {itens.map((i) => {
                  const on = naLista.has(i.id);
                  return (
                    <button key={i.id} aria-pressed={on} onClick={() => alternar(i)} className={`min-h-[52px] rounded-2xl border-2 px-3 py-2 text-left text-sm font-bold transition ${on ? "border-lima bg-lima/30 text-roxo-escuro" : "border-roxo/10 bg-creme text-roxo"}`}>
                      {on ? "✓ " : ""}{i.nome}
                      {financeiro && <span className={`block text-xs font-semibold ${abaixo(i) ? "text-amber-700" : "text-roxo/50"}`}>{qtd(i.estoque, i.unidade)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
