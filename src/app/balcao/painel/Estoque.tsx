"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";
import { abaixo, carregarInsumos, carregarPrecos, CATEGORIAS, dataBr, FREQUENCIAS, num, onde, precoUn, qtd, UNIDADES, type Insumo, type ResumoPreco } from "./estoqueComum";

type PrecoHist = { id: number; data: string; preco_unit: number; fornecedor: string | null; origem: string };
type Mov = { id: number; tipo: string; quantidade: number; saldo: number; obs: string | null; created_at: string };
const TIPO_MOV: Record<string, string> = { compra: "Compra", contagem: "Contagem", perda: "Perda", ajuste: "Ajuste" };

export default function Estoque({ avisar }: { avisar: Aviso }) {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [modo, setModo] = useState<"ver" | "contagem" | "perda">("ver");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Insumo | "novo" | null>(null);
  const [historico, setHistorico] = useState<{ id: string; movs: Mov[]; precos: PrecoHist[] } | null>(null);
  const [precos, setPrecos] = useState<Map<string, ResumoPreco>>(new Map());
  const [salvando, setSalvando] = useState(false);
  const [inativos, setInativos] = useState(false);

  const carregar = useCallback(() => {
    carregarPrecos().then(setPrecos).catch(() => {});
    return carregarInsumos().then(setInsumos, (e) => avisar("erro", (e as Error).message));
  }, [avisar]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!insumos) return <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p>;
  const visiveis = insumos.filter((i) => inativos || i.ativo);
  const valorTotal = insumos.filter((i) => i.ativo).reduce((s, i) => s + Number(i.estoque) * Number(i.ultimo_custo ?? 0), 0);
  const baixos = insumos.filter((i) => i.ativo && abaixo(i));

  async function salvarModo() {
    const itens = Object.entries(valores).filter(([, v]) => v.trim() !== "").map(([insumo_id, v]) => ({ insumo_id, quantidade: num(v) }));
    if (!itens.length) return avisar("erro", modo === "contagem" ? "Preencha a quantidade contada de pelo menos um item." : "Informe a perda de pelo menos um item.");
    setSalvando(true);
    const { data, error } = await supabaseNavegador().rpc("registrar_contagem", { itens, p_tipo: modo, p_obs: null });
    setSalvando(false);
    if (error) return avisar("erro", error.message);
    avisar("ok", modo === "contagem" ? `Contagem salva (${data} item(ns) ajustado(s))` : "Perda registrada");
    setModo("ver"); setValores({}); carregar();
  }

  async function verHistorico(id: string, recarregar = false) {
    if (!recarregar && historico?.id === id) return setHistorico(null);
    const sb = supabaseNavegador();
    const [m, p] = await Promise.all([
      sb.from("estoque_movimentos").select("id,tipo,quantidade,saldo,obs,created_at").eq("insumo_id", id).order("id", { ascending: false }).limit(15),
      sb.from("insumo_precos").select("id,data,preco_unit,fornecedor,origem").eq("insumo_id", id).order("data", { ascending: false }).order("id", { ascending: false }).limit(12),
    ]);
    if (m.error) return avisar("erro", m.error.message);
    setHistorico({ id, movs: m.data as Mov[], precos: (p.data ?? []) as PrecoHist[] });
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Valor em estoque</div><div className="mt-1 text-2xl font-extrabold text-roxo">{brl(valorTotal)}</div><div className="text-xs text-roxo/60">pelo custo da última compra</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Abaixo do mínimo</div><div className={`mt-1 text-2xl font-extrabold ${baixos.length ? "text-amber-700" : "text-roxo"}`}>{baixos.length}</div><div className="truncate text-xs text-roxo/60">{baixos.map((b) => b.nome).join(", ") || "tudo certo"}</div></div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-sm lg:col-span-1">
          {modo === "ver" ? <>
            <button onClick={() => setModo("contagem")} className="botao flex-1 !min-h-[44px] !py-2 text-sm">Fazer contagem</button>
            <button onClick={() => setModo("perda")} className="flex-1 rounded-full bg-red-50 px-4 py-2.5 text-sm font-extrabold text-red-700">Registrar perda</button>
            <button onClick={() => setEditando("novo")} className="w-full rounded-full bg-roxo/10 px-4 py-2 text-sm font-bold text-roxo">+ Novo insumo</button>
          </> : <>
            <button onClick={() => { setModo("ver"); setValores({}); }} className="rounded-full bg-gray-100 px-4 py-2.5 text-sm font-bold">Cancelar</button>
            <button onClick={salvarModo} disabled={salvando} className="botao flex-1 !min-h-[44px] !py-2 text-sm">{salvando ? "Salvando…" : modo === "contagem" ? "Salvar contagem" : "Salvar perda"}</button>
          </>}
        </div>
      </div>

      {modo !== "ver" && <p className="rounded-2xl bg-lima/30 px-4 py-3 text-sm font-semibold text-roxo-escuro">{modo === "contagem" ? "Digite quanto tem de cada item agora. Deixe em branco o que não contou — fica como está." : "Digite quanto se perdeu (venceu, estragou, caiu). Sai do estoque e aparece como perda."}</p>}

      {editando && <EditarInsumo insumo={editando === "novo" ? null : editando} avisar={avisar} onFim={(ok) => { setEditando(null); if (ok) carregar(); }} />}

      {Object.entries(CATEGORIAS).map(([c, nome]) => {
        const l = visiveis.filter((i) => i.categoria === c);
        if (!l.length) return null;
        return (
          <Cartao key={c} titulo={nome}>
            <ul className="divide-y divide-roxo/10">
              {l.map((i) => (
                <li key={i.id} className={`py-2 ${i.ativo ? "" : "opacity-50"}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => verHistorico(i.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-bold">{i.nome}{!i.ativo && " (inativo)"}</span>
                      <span className="block text-xs text-roxo/60">mín. {qtd(i.minimo, i.unidade)} · {FREQUENCIAS[i.frequencia]}{i.fornecedor ? ` · ${i.fornecedor}` : ""}</span>
                      {precos.get(i.id) && (() => { const pr = precos.get(i.id)!; return (
                        <span className="block text-xs font-semibold"><span className="text-roxo/70">méd. {precoUn(pr.medio, i.unidade)}</span> · <span className="text-green-800">menor {precoUn(pr.menor, i.unidade)}</span> · <span className="text-red-800">maior {precoUn(pr.maior, i.unidade)}</span></span>
                      ); })()}
                    </button>
                    {modo === "ver" ? <>
                      <span className={`text-right font-extrabold ${abaixo(i) ? "text-amber-700" : "text-roxo"}`}>{qtd(i.estoque, i.unidade)}</span>
                      <button onClick={() => setEditando(i)} aria-label={`Editar ${i.nome}`} className="rounded-full bg-creme px-3 py-1.5 text-xs font-bold">Editar</button>
                    </> : (
                      <label className="flex items-center gap-1 text-sm font-bold text-roxo/60">
                        {modo === "contagem" && <span className="hidden text-xs sm:inline">era {qtd(i.estoque)}</span>}
                        <input inputMode="decimal" aria-label={`${modo === "contagem" ? "Contagem" : "Perda"} de ${i.nome}`} className="campo !w-24 !px-2 !py-2 text-right" placeholder={modo === "contagem" ? qtd(i.estoque) : "0"} value={valores[i.id] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [i.id]: e.target.value.replace(/[^\d,.]/g, "") }))} />
                        <span className="w-6">{i.unidade}</span>
                      </label>
                    )}
                  </div>
                  {historico?.id === i.id && (
                    <Precos insumo={i} lista={historico.precos} avisar={avisar} onSalvo={() => { carregar(); verHistorico(i.id, true); }} />
                  )}
                  {historico?.id === i.id && (
                    <ul className="mt-2 space-y-1 rounded-xl bg-creme p-2 text-xs">
                      {!historico.movs.length ? <li className="text-roxo/60">Sem movimentos ainda.</li> : historico.movs.map((m) => (
                        <li key={m.id} className="flex gap-2"><span className="w-24 shrink-0 text-roxo/60">{new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" })}</span><span className="flex-1 font-semibold">{TIPO_MOV[m.tipo]}{m.obs ? ` — ${m.obs}` : ""}</span><span className={Number(m.quantidade) < 0 ? "text-red-700" : "text-green-700"}>{Number(m.quantidade) > 0 ? "+" : ""}{qtd(m.quantidade)}</span><span className="w-16 text-right font-bold">= {qtd(m.saldo)}</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
        );
      })}
      <label className="flex items-center gap-2 px-1 text-sm font-semibold text-roxo/70"><input type="checkbox" className="h-4 w-4 accent-roxo" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />Mostrar inativos</label>
    </>
  );
}

function EditarInsumo({ insumo, avisar, onFim }: { insumo: Insumo | null; avisar: Aviso; onFim: (ok: boolean) => void }) {
  const [f, setF] = useState({
    nome: insumo?.nome ?? "", categoria: insumo?.categoria ?? "insumos", unidade: insumo?.unidade ?? "un",
    minimo: insumo ? String(insumo.minimo).replace(".", ",") : "", fornecedor: insumo?.fornecedor ?? "", frequencia: insumo?.frequencia ?? "semanal", ativo: insumo?.ativo ?? true,
  });
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const dados = { nome: f.nome.trim(), categoria: f.categoria, unidade: f.unidade, minimo: num(f.minimo), fornecedor: f.fornecedor.trim() || null, frequencia: f.frequencia, ativo: f.ativo };
    if (dados.nome.length < 2) return avisar("erro", "Informe o nome");
    const sb = supabaseNavegador();
    const { error } = insumo ? await sb.from("insumos").update(dados).eq("id", insumo.id) : await sb.from("insumos").insert(dados);
    if (error) return avisar("erro", error.code === "23505" ? "Já existe um insumo com esse nome." : error.message);
    avisar("ok", insumo ? "Insumo atualizado" : "Insumo cadastrado"); onFim(true);
  }
  return (
    <form onSubmit={salvar} className="space-y-3 rounded-3xl border-2 border-roxo/20 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-extrabold text-roxo">{insumo ? `Editar ${insumo.nome}` : "Novo insumo"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2"><span className="rotulo">Nome</span><input className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={60} required /></label>
        <label><span className="rotulo">Categoria</span><select className="campo" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span className="rotulo">Unidade</span><select className="campo" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label><span className="rotulo">Estoque mínimo</span><input inputMode="decimal" className="campo" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value.replace(/[^\d,.]/g, "") })} placeholder="0" /></label>
        <label><span className="rotulo">Compra</span><select className="campo" value={f.frequencia} onChange={(e) => setF({ ...f, frequencia: e.target.value })}>{Object.entries(FREQUENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="rotulo">Fornecedor (opcional)</span><input className="campo" value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} maxLength={60} placeholder="Ex.: Mais Sabor, Flor de Lis, Atacadão" /></label>
        <label className="flex items-end gap-2 pb-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-roxo" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />Ativo</label>
      </div>
      {insumo && <p className="text-xs text-roxo/60">Para corrigir a quantidade em estoque, use “Fazer contagem”.</p>}
      <div className="flex gap-2"><button type="button" onClick={() => onFim(false)} className="rounded-full bg-gray-100 px-5 font-bold">Cancelar</button><button className="botao flex-1">Salvar</button></div>
    </form>
  );
}

/** Histórico de preços do insumo + anotar um preço visto (cotação) sem comprar. */
function Precos({ insumo, lista, avisar, onSalvo }: { insumo: Insumo; lista: PrecoHist[]; avisar: Aviso; onSalvo: () => void }) {
  const [f, setF] = useState({ preco: "", onde: "" });
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const p = num(f.preco);
    if (!(p > 0)) return avisar("erro", "Informe o preço");
    const { error } = await supabaseNavegador().from("insumo_precos").insert({ insumo_id: insumo.id, data: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" }), preco_unit: p, fornecedor: f.onde.trim() || null, origem: "cotacao" });
    if (error) return avisar("erro", error.message);
    avisar("ok", "Preço anotado"); onSalvo();
  }
  async function apagar(id: number) {
    const { error } = await supabaseNavegador().from("insumo_precos").delete().eq("id", id).eq("origem", "cotacao");
    if (error) avisar("erro", error.message); else onSalvo();
  }
  return (
    <div className="mt-2 rounded-xl bg-white p-2 text-xs ring-1 ring-roxo/10">
      <div className="mb-1 font-extrabold text-roxo">Preços (por {insumo.unidade})</div>
      {!lista.length ? <p className="text-roxo/60">Nenhum preço ainda. Entram sozinhos a cada compra lançada.</p> : (
        <ul className="space-y-0.5">{lista.map((p) => (
          <li key={p.id} className="flex gap-2"><span className="w-16 shrink-0 text-roxo/60">{dataBr(p.data).slice(0, 5)}/{p.data.slice(2, 4)}</span><span className="flex-1">{onde(p.fornecedor)}{p.origem === "cotacao" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900">cotação</span>}</span><b>{precoUn(Number(p.preco_unit), insumo.unidade)}</b>
            {p.origem === "cotacao" && <button onClick={() => apagar(p.id)} aria-label="Apagar cotação" className="text-red-700">✕</button>}</li>
        ))}</ul>
      )}
      <form onSubmit={salvar} className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-roxo/70">Vi um preço:</span>
        <input inputMode="decimal" aria-label="Preço por unidade" placeholder={`R$/${insumo.unidade}`} className="campo !w-24 !px-2 !py-1.5 text-right text-xs" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value.replace(/[^\d,.]/g, "") })} />
        <input aria-label="Onde" placeholder="Onde (ex.: Atacadão)" className="campo !w-40 !px-2 !py-1.5 text-xs" value={f.onde} onChange={(e) => setF({ ...f, onde: e.target.value })} maxLength={60} />
        <button className="rounded-lg bg-roxo px-3 py-1.5 font-bold text-white">Anotar</button>
      </form>
    </div>
  );
}
