"use client";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { Cardapio } from "@/lib/cardapio";
import { agoraSousa, priceItem, type CartItem } from "@/lib/pricing";
import { CopoAnimado } from "./CopoAnimado";
import { Preco } from "./Preco";
import { brl, corDoItem } from "./util";

const chip = (ativo: boolean) =>
  `rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition active:scale-95 ${ativo ? "border-roxo bg-roxo text-white" : "border-roxo/15 bg-white text-roxo-escuro hover:border-roxo/40"}`;

export function Montador({ cardapio, embalagemInicial, tamanhoInicial, onAdicionar }: { cardapio: Cardapio; embalagemInicial: "Copo" | "Pote"; tamanhoInicial?: string; onAdicionar: (item: CartItem) => void }) {
  const hoje = agoraSousa().data;
  const tamanhos = (e: string) => cardapio.sizes.filter((s) => s.ativo && s.embalagem === e);
  const [emb, setEmb] = useState<"Copo" | "Pote">(embalagemInicial);
  const [sizeId, setSizeId] = useState(tamanhos(embalagemInicial).find((t) => t.id === tamanhoInicial)?.id ?? tamanhos(embalagemInicial)[0]?.id ?? "");
  const [baseId, setBaseId] = useState(cardapio.bases.find((b) => b.ativo)?.id ?? "");
  const [ids, setIds] = useState<string[]>([]);
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const [obsAberta, setObsAberta] = useState(false);

  const size = cardapio.sizes.find((s) => s.id === sizeId)!;
  const escolhidos = ids.map((id) => cardapio.addons.find((a) => a.id === id)!).filter(Boolean);
  const gratis = escolhidos.filter((a) => a.conta_no_limite).length;
  const extras = Math.max(0, gratis - size.acomp_inclusos);
  const item: CartItem = { tipo: "acai", sizeId, baseId, addonIds: ids, qtd, obs: obs.trim() || undefined };
  const preco = useMemo(() => { try { return priceItem(cardapio, item).total; } catch { return null; } }, [cardapio, sizeId, baseId, ids, qtd]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (id: string) => setIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const trocarEmb = (e: "Copo" | "Pote") => { setEmb(e); setSizeId(tamanhos(e)[0]?.id ?? ""); };

  const disponiveis = cardapio.addons.filter((a) => a.ativo);
  const pagos = disponiveis.filter((a) => a.preco_adicional > 0);
  const progresso = Math.min(1, gratis / Math.max(1, size.acomp_inclusos));

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[220px_minmax(0,1fr)] sm:grid-rows-1">
        {/* Copo ao vivo */}
        <div className="flex min-w-0 items-center gap-4 border-b border-roxo/10 bg-gradient-to-b from-roxo/10 to-transparent px-4 py-3 sm:flex-col sm:justify-center sm:border-b-0 sm:border-r sm:py-6">
          <div className="h-28 shrink-0 sm:h-56"><CopoAnimado embalagem={emb} vagas={size.acomp_inclusos} camadas={escolhidos.map((a) => ({ id: a.id, nome: a.nome, cor: corDoItem(a.nome) }))} /></div>
          <div className="min-w-0 flex-1 sm:w-full sm:flex-none sm:text-center">
            <p className="text-sm font-bold" aria-live="polite">
              {gratis} de {size.acomp_inclusos} inclusos
              {extras > 0 && cardapio.settings.acomp_extra != null && <span className="ml-1 rounded-full bg-lima px-2 py-0.5 text-xs text-roxo-escuro">+{extras} extra · {brl(extras * cardapio.settings.acomp_extra)}</span>}
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-roxo/15"><motion.div className="h-full rounded-full bg-lima" initial={false} animate={{ width: `${progresso * 100}%` }} /></div>
            <p className="mt-1.5 truncate text-xs text-roxo/70">{escolhidos.length ? escolhidos.map((a) => a.nome).join(" · ") : "Toque nos itens e veja seu açaí encher"}</p>
          </div>
        </div>

        {/* Escolhas */}
        <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto px-4 py-4">
          <fieldset><legend className="rotulo">Embalagem</legend>
            <div className="flex flex-wrap gap-2">{(["Copo", "Pote"] as const).map((e) => <button key={e} type="button" aria-pressed={emb === e} className={chip(emb === e)} onClick={() => trocarEmb(e)}>{e}</button>)}</div>
          </fieldset>
          <fieldset><legend className="rotulo">Tamanho</legend>
            <div className="flex flex-wrap gap-2">{tamanhos(emb).map((s) => (
              <button key={s.id} type="button" aria-pressed={sizeId === s.id} className={chip(sizeId === s.id)} onClick={() => setSizeId(s.id)}>
                {s.rotulo} · {brl(s.preco)} <span className={`ml-1 text-xs ${sizeId === s.id ? "text-lima" : "text-roxo/60"}`}>{s.acomp_inclusos} inclusos</span>
              </button>))}</div>
          </fieldset>
          <fieldset><legend className="rotulo">Base</legend>
            <div className="flex flex-wrap gap-2">{cardapio.bases.filter((b) => b.ativo).map((b) => <button key={b.id} type="button" aria-pressed={baseId === b.id} className={chip(baseId === b.id)} onClick={() => setBaseId(b.id)}>{b.nome}</button>)}</div>
          </fieldset>

          {cardapio.grupos.map((g) => {
            const itens = disponiveis.filter((a) => a.group_id === g.id && a.preco_adicional === 0);
            if (!itens.length) return null;
            return (
              <fieldset key={g.id}><legend className="rotulo">{g.nome}</legend>
                <div className="flex flex-wrap gap-2">{itens.map((a) => {
                  const fora = a.esgotado_em === hoje, on = ids.includes(a.id);
                  return <button key={a.id} type="button" disabled={fora} aria-pressed={on} onClick={() => alternar(a.id)} className={`${chip(on)} disabled:cursor-not-allowed disabled:opacity-45 disabled:line-through`}>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ring-1 ring-black/10" style={{ background: corDoItem(a.nome) }} />{a.nome}{fora && " · esgotado hoje"}
                  </button>;
                })}</div>
              </fieldset>
            );
          })}

          {pagos.length > 0 && (
            <fieldset className="rounded-2xl bg-roxo/5 p-3"><legend className="rotulo px-1">Turbine o seu <span className="font-semibold normal-case tracking-normal text-roxo/60">· não ocupam vaga dos inclusos</span></legend>
              <div className="flex flex-wrap gap-2">{pagos.map((a) => {
                const fora = a.esgotado_em === hoje, on = ids.includes(a.id);
                return <button key={a.id} type="button" disabled={fora} aria-pressed={on} onClick={() => alternar(a.id)} className={`${chip(on)} disabled:opacity-45`}>
                  {a.nome} <span className={`ml-1 text-xs font-extrabold ${on ? "text-lima" : "text-lima-tinta"}`}>+{brl(a.preco_adicional)}</span>
                </button>;
              })}</div>
            </fieldset>
          )}

          {obsAberta
            ? <label className="block"><span className="rotulo">Observação</span><textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} rows={2} placeholder="Ex.: cobertura à parte" className="campo" /></label>
            : <button type="button" onClick={() => setObsAberta(true)} className="text-sm font-semibold text-roxo underline underline-offset-4">Adicionar observação</button>}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-roxo/10 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center rounded-full border-2 border-roxo/15">
          <button type="button" aria-label="Diminuir quantidade" className="h-11 w-11 text-xl font-bold" onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-6 text-center font-extrabold tabular-nums">{qtd}</span>
          <button type="button" aria-label="Aumentar quantidade" className="h-11 w-11 text-xl font-bold" onClick={() => setQtd((q) => Math.min(20, q + 1))}>+</button>
        </div>
        <button type="button" disabled={preco == null} onClick={() => onAdicionar(item)} className="botao flex-1">
          Adicionar · {preco != null ? <Preco valor={preco} /> : "—"}
        </button>
      </div>
    </>
  );
}
