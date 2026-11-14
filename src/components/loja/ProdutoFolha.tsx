"use client";
import { useMemo, useState } from "react";
import type { Cardapio, ProdutoLoja } from "@/lib/cardapio";
import { priceItem, PricingError, type CartItem } from "@/lib/pricing";
import { Preco } from "./Preco";
import { brl } from "./util";

const chip = (ativo: boolean) =>
  `rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition active:scale-95 ${ativo ? "border-roxo bg-roxo text-white" : "border-roxo/15 bg-white hover:border-roxo/40"}`;

export function ProdutoFolha({ cardapio, produto, onAdicionar }: { cardapio: Cardapio; produto: ProdutoLoja; onAdicionar: (item: CartItem) => void }) {
  const [tamanho, setTamanho] = useState(produto.tamanhos?.[0]?.nome);
  const [sabores, setSabores] = useState<string[]>([]);
  const [escolha, setEscolha] = useState(produto.escolha?.opcoes[0]);
  const [qtd, setQtd] = useState(1);
  const n = produto.tamanhos?.find((t) => t.nome === tamanho)?.sabores ?? 1;
  const item: CartItem = { tipo: "produto", productId: produto.id, tamanho, sabores: produto.sabores?.length ? sabores : undefined, escolha, qtd };
  const { total, falta } = useMemo(() => {
    try { return { total: priceItem(cardapio, item).total, falta: null as string | null }; }
    catch (e) { return { total: null, falta: e instanceof PricingError ? e.message : "Indisponível" }; }
  }, [cardapio, tamanho, sabores, escolha, qtd]); // eslint-disable-line react-hooks/exhaustive-deps

  const sabor = (s: string) => setSabores((v) => v.includes(s) ? v.filter((x) => x !== s) : n === 1 ? [s] : v.length < n ? [...v, s] : v);
  const trocarTamanho = (t: string) => { setTamanho(t); const lim = produto.tamanhos?.find((x) => x.nome === t)?.sabores ?? 1; setSabores((v) => v.slice(0, lim)); };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {produto.descricao && <p className="text-sm text-roxo/75">{produto.descricao}</p>}
        {produto.tamanhos && <fieldset><legend className="rotulo">Tamanho</legend>
          <div className="flex flex-wrap gap-2">{produto.tamanhos.map((t) => <button key={t.nome} type="button" aria-pressed={tamanho === t.nome} className={chip(tamanho === t.nome)} onClick={() => trocarTamanho(t.nome)}>{t.nome} · {brl(t.preco)}</button>)}</div></fieldset>}
        {produto.escolha && <fieldset><legend className="rotulo">{produto.escolha.rotulo}</legend>
          <div className="flex flex-wrap gap-2">{produto.escolha.opcoes.map((o) => <button key={o} type="button" aria-pressed={escolha === o} className={chip(escolha === o)} onClick={() => setEscolha(o)}>{o}</button>)}</div></fieldset>}
        {!!produto.sabores?.length && <fieldset><legend className="rotulo">{n > 1 ? `Escolha ${n} sabores (${sabores.length}/${n})` : "Sabor"}</legend>
          <div className="flex flex-wrap gap-2">{produto.sabores.map((s) => <button key={s} type="button" aria-pressed={sabores.includes(s)} className={chip(sabores.includes(s))} onClick={() => sabor(s)}>{s}</button>)}</div></fieldset>}
      </div>
      <div className="flex items-center gap-3 border-t border-roxo/10 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center rounded-full border-2 border-roxo/15">
          <button type="button" aria-label="Diminuir quantidade" className="h-11 w-11 text-xl font-bold" onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-6 text-center font-extrabold tabular-nums">{qtd}</span>
          <button type="button" aria-label="Aumentar quantidade" className="h-11 w-11 text-xl font-bold" onClick={() => setQtd((q) => Math.min(20, q + 1))}>+</button>
        </div>
        <button type="button" disabled={total == null} onClick={() => onAdicionar(item)} className="botao flex-1">{total != null ? <>Adicionar · <Preco valor={total} /></> : falta}</button>
      </div>
    </>
  );
}
