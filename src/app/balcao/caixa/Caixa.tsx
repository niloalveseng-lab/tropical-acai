"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cardapio, ProdutoLoja } from "@/lib/cardapio";
import { METODOS, NOME_METODO, type Metodo } from "@/lib/caixa/venda";
import { brl, CAMPOS, imprimir, type PedidoBalcao } from "@/lib/pedidos/comanda";
import { agoraSousa, priceItem, PricingError, promoDisponivel, type CartItem, type PricedItem } from "@/lib/pricing";
import { ToledoScale } from "@/lib/scale/toledo";
import { supabaseNavegador } from "@/lib/supabase/client";
import { caixaStore, type CaixaStore, type Resumo, type Sessao, type Tara } from "@/lib/caixa/store";
import { checarPedidoMinimo, cotarEntrega } from "@/lib/delivery";
import { LocalEntrega, type DadosEntrega } from "./Entrega";

type Linha = { chave: number; item: CartItem; preco: PricedItem };
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const cents = (v: number) => Math.round(v * 100) / 100;
const chip = (on: boolean) => `rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95 ${on ? "bg-roxo text-white" : "bg-white text-roxo ring-1 ring-roxo/15"}`;
const dinheiroInput = (v: string) => v.replace(/[^\d,]/g, "");

export default function Caixa({ cardapio: c }: { cardapio: Cardapio }) {
  const router = useRouter();
  const sb = supabaseNavegador;
  const store = useMemo(() => caixaStore(c.demo), [c.demo]);
  const [eu, setEu] = useState<{ id: string; funcao: string } | null>(null);
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const [aba, setAba] = useState("acai");
  const [carrinho, setCarrinho] = useState<Linha[]>([]);
  const [cliente, setCliente] = useState("");
  const [paraPreparo, setParaPreparo] = useState(false);
  const [canal, setCanal] = useState<"balcao" | "whatsapp">("balcao");
  const [tipo, setTipo] = useState<"balcao" | "retirada" | "entrega">("balcao");
  const [telefone, setTelefone] = useState("");
  const [entrega, setEntrega] = useState<DadosEntrega | null>(null);
  const [obs, setObs] = useState("");
  const [modal, setModal] = useState<null | "pagar" | "sangria" | "suprimento" | "fechar" | "entrega">(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; pedidoId?: string } | null>(null);
  const seq = useRef(1);

  useEffect(() => {
    if (c.demo) return setEu({ id: "demo", funcao: "dono" });
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace("/entrar");
      const [{ data: funcao }, { data: pode }] = await Promise.all([sb().rpc("minha_funcao"), sb().rpc("minhas_permissoes")]);
      if (!funcao || !(pode as Record<string, boolean> | null)?.caixa) return router.replace("/balcao");
      setEu({ id: user.id, funcao: funcao as string });
    })();
  }, [sb, router, c.demo]);

  const carregarSessao = useCallback(async () => {
    try { setSessao(await store.sessaoAberta()); } catch (e) { setAviso({ tipo: "erro", texto: (e as Error).message }); }
  }, [store]);
  useEffect(() => { if (eu) carregarSessao(); }, [eu, carregarSessao]);

  const subtotal = cents(carrinho.reduce((s, l) => s + l.preco.total, 0));
  const cot = tipo === "entrega" && entrega ? cotarEntrega({ lat: c.loja.lat, lng: c.loja.lng }, entrega, c.loja.faixas) : null;
  const taxa = cot?.entrega ? cot.taxa : 0;
  const total = cents(subtotal + taxa);
  const minimo = tipo === "entrega" && carrinho.length ? checarPedidoMinimo(subtotal, c.loja.pedidoMinimo) : null;
  const pendencia = !carrinho.length ? "Adicione itens"
    : tipo !== "balcao" && !cliente.trim() ? "Informe o nome do cliente"
    : tipo === "entrega" && !entrega ? "Marque o local da entrega"
    : minimo ?? "";
  function novoPedido() { setCarrinho([]); setCliente(""); setTelefone(""); setEntrega(null); setObs(""); setParaPreparo(false); setTipo("balcao"); setCanal("balcao"); }

  function adicionar(item: CartItem) {
    try {
      const preco = priceItem(c, item, agoraSousa());
      setCarrinho((l) => [...l, { chave: seq.current++, item, preco }]);
      setAviso(null);
      return true;
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof PricingError ? e.message : "Item inválido" });
      return false;
    }
  }

  async function imprimirPedido(id: string) {
    const { data } = await sb().from("orders").select(CAMPOS).eq("id", id).single();
    if (data) imprimir(data as unknown as PedidoBalcao);
  }

  if (!eu || sessao === undefined) return <main className="grid min-h-dvh place-items-center text-roxo">Carregando…</main>;

  const abas = [{ id: "acai", nome: "Açaí" }, { id: "kg", nome: "No quilo" }, ...(c.promos.some((p) => p.ativo) ? [{ id: "promo", nome: "Promoção" }] : []), ...c.categorias];

  return (
    <main className="min-h-dvh bg-creme">
      <header className="sticky top-0 z-30 bg-roxo text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={92} height={38} />
          <span className="font-extrabold">Caixa</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${sessao ? "bg-lima text-roxo-escuro" : "bg-amber-300 text-amber-950"}`}>{sessao ? "Aberto" : "Fechado"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sessao && <>
              <button onClick={() => setModal("suprimento")} className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Reforço</button>
              <button onClick={() => setModal("sangria")} className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Sangria</button>
              <button onClick={() => setModal("fechar")} className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Fechar caixa</button>
            </>}
            <Link href="/balcao/painel" className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Painel</Link>
            <Link href="/balcao" className="rounded-full bg-lima px-3 py-1.5 font-extrabold text-roxo-escuro">Pedidos</Link>
          </div>
        </div>
      </header>

      {c.demo && <p className="bg-amber-300 px-4 py-1.5 text-center text-xs font-bold text-amber-950">Demonstração — as vendas não são gravadas.</p>}
      {aviso && (
        <div role="alert" className={`mx-auto mt-3 flex max-w-7xl flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${aviso.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-lima/40 text-roxo-escuro"}`}>
          <span className="flex-1">{aviso.texto}</span>
          {aviso.pedidoId && !c.demo && <button onClick={() => imprimirPedido(aviso.pedidoId!)} className="rounded-full bg-roxo px-3 py-1.5 text-white">Imprimir comanda</button>}
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso" className="px-2 text-lg">×</button>
        </div>
      )}

      {!sessao ? <AbrirCaixa store={store} eu={eu.id} onAberto={carregarSessao} onErro={(t) => setAviso({ tipo: "erro", texto: t })} /> : (
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
          <section className="min-w-0">
            <div role="tablist" className="flex gap-2 overflow-x-auto pb-2">
              {abas.map((a) => <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-extrabold ${aba === a.id ? "bg-roxo text-white" : "bg-white text-roxo"}`}>{a.nome}</button>)}
            </div>
            <div className="mt-2 rounded-3xl bg-white/60 p-3 sm:p-4">
              {aba === "acai" && <MontarAcai c={c} onAdd={adicionar} />}
              {aba === "kg" && <Quilo store={store} c={c} onAdd={adicionar} onErro={(t) => setAviso({ tipo: "erro", texto: t })} />}
              {aba === "promo" && <Promos c={c} onAdd={adicionar} />}
              {!["acai", "kg", "promo"].includes(aba) && <Produtos key={aba} produtos={c.products.filter((p) => p.category_id === aba && p.ativo)} onAdd={adicionar} />}
            </div>
          </section>

          <aside className="flex flex-col rounded-3xl bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
            <h2 className="text-lg font-extrabold text-roxo">Venda</h2>
            {!carrinho.length ? <p className="py-8 text-center text-sm font-semibold text-roxo/50">Toque nos produtos para adicionar.</p> : (
              <ul className="mt-2 flex-1 space-y-2 overflow-y-auto text-sm">
                {carrinho.map((l) => (
                  <li key={l.chave} className="flex gap-2 rounded-xl bg-creme p-2.5">
                    <div className="min-w-0 flex-1"><div className="font-bold">{l.preco.qtd > 1 && `${l.preco.qtd}× `}{l.preco.nome}</div>{l.preco.descricao && <div className="text-xs text-roxo/70">{l.preco.descricao}</div>}</div>
                    <div className="text-right"><div className="font-extrabold">{brl(l.preco.total)}</div><button onClick={() => setCarrinho((x) => x.filter((y) => y.chave !== l.chave))} className="text-xs font-bold text-red-700 underline">remover</button></div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 space-y-3 border-t border-roxo/10 pt-3 text-sm">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-creme p-1" role="radiogroup" aria-label="Origem do pedido">
                {([["balcao", "🏪 Balcão"], ["whatsapp", "💬 WhatsApp"]] as const).map(([k, v]) => <button key={k} role="radio" aria-checked={canal === k} onClick={() => { setCanal(k); if (k === "whatsapp" && tipo === "balcao") setTipo("entrega"); if (k === "balcao") setTipo("balcao"); }} className={`rounded-lg py-2 font-extrabold ${canal === k ? "bg-roxo text-white" : "text-roxo"}`}>{v}</button>)}
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-creme p-1" role="radiogroup" aria-label="Tipo do pedido">
                {([["balcao", "Na loja"], ["retirada", "Retirada"], ["entrega", "Entrega"]] as const).map(([k, v]) => <button key={k} role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)} className={`rounded-lg py-2 font-extrabold ${tipo === k ? "bg-roxo text-white" : "text-roxo"}`}>{v}</button>)}
              </div>
              <input className="campo !py-2" placeholder={tipo === "balcao" ? "Nome do cliente (opcional)" : "Nome do cliente"} value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={60} />
              {tipo !== "balcao" && <input className="campo !py-2" inputMode="tel" placeholder="WhatsApp do cliente (opcional)" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} />}
              {tipo === "entrega" && (entrega ? (
                <div className="rounded-xl bg-creme p-2.5">
                  <div className="flex items-start gap-2"><span className="min-w-0 flex-1 font-bold">📍 {entrega.endereco}{entrega.referencia && <span className="block text-xs font-semibold text-roxo/70">{entrega.referencia}</span>}</span>
                    <button onClick={() => setModal("entrega")} className="text-xs font-bold text-roxo underline">alterar</button></div>
                  {cot && (cot.entrega ? <div className="mt-1 text-xs font-bold text-roxo/70">{cot.distanciaKm.toFixed(1).replace(".", ",")} km · taxa {brl(cot.taxa)}</div> : <div className="mt-1 text-xs font-bold text-red-700">{cot.motivo}</div>)}
                </div>
              ) : <button onClick={() => setModal("entrega")} className="w-full rounded-xl border-2 border-dashed border-roxo/30 py-2.5 font-extrabold text-roxo">📍 Marcar local da entrega</button>)}
              {tipo !== "balcao" && <input className="campo !py-2" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} />}
              {tipo === "balcao" && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5 accent-roxo" checked={paraPreparo} onChange={(e) => setParaPreparo(e.target.checked)} />Enviar para a fila de preparo</label>}
              {taxa > 0 && <div className="space-y-0.5 text-roxo/70"><div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div><div className="flex justify-between"><span>Entrega</span><span>{brl(taxa)}</span></div></div>}
              <div className="flex items-baseline justify-between"><span className="font-bold">Total</span><span className="text-3xl font-extrabold text-roxo">{brl(total)}</span></div>
              {pendencia && carrinho.length > 0 && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900">{pendencia}</p>}
              <div className="flex gap-2">
                <button disabled={!!pendencia || (tipo === "entrega" && !cot?.entrega)} onClick={() => setModal("pagar")} className="botao-lima flex-1">{tipo === "balcao" ? "Receber" : "Finalizar pedido"}</button>
                {(carrinho.length > 0 || cliente || entrega) && <button onClick={novoPedido} className="rounded-full bg-red-50 px-4 font-bold text-red-700">Limpar</button>}
              </div>
            </div>
          </aside>
        </div>
      )}

      {modal === "pagar" && <Pagar total={total} cobrarDepois={tipo === "entrega" ? "na entrega" : tipo === "retirada" ? "na retirada" : null} onFechar={() => setModal(null)} onConfirmar={async (pagamentos, recebido, formaPrevista) => {
        const corpo = {
          itens: carrinho.map((l) => l.item), pagamentos, recebido, cobrarDepois: !!formaPrevista, formaPrevista,
          cliente: cliente.trim() || undefined, telefone: telefone.trim() || undefined, paraPreparo, canal, tipo,
          entrega: tipo === "entrega" && entrega ? { endereco: entrega.endereco, referencia: entrega.referencia || undefined, lat: entrega.lat, lng: entrega.lng } : undefined,
          observacao: obs.trim() || undefined,
        };
        const r = await fetch("/api/caixa/venda", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return (j.erro as string) ?? "Erro ao registrar a venda";
        if (!formaPrevista) store.registrarDemo?.(pagamentos, j.total);
        novoPedido(); setModal(null);
        const nome = tipo === "balcao" ? "Venda" : "Pedido";
        setAviso({ tipo: "ok", texto: `${nome} #${j.numero} registrado · ${brl(j.total)}${j.taxa > 0 ? ` (entrega ${brl(j.taxa)})` : ""}${formaPrevista ? ` · cobrar ${tipo === "entrega" ? "na entrega" : "na retirada"}` : ""}${j.troco > 0 ? ` · TROCO ${brl(j.troco)}` : ""}`, pedidoId: j.id });
        return null;
      }} />}
      {modal === "entrega" && <Janela titulo="Local da entrega" onFechar={() => setModal(null)}><LocalEntrega c={c} inicial={entrega} onCancelar={() => setModal(null)} onSalvar={(d) => { setEntrega(d); setModal(null); }} /></Janela>}
      {(modal === "sangria" || modal === "suprimento") && sessao && <Movimento store={store} tipo={modal} sessao={sessao.id} onFechar={() => setModal(null)} onOk={(t) => { setModal(null); setAviso({ tipo: "ok", texto: t }); }} />}
      {modal === "fechar" && sessao && <FecharCaixa store={store} sessao={sessao} eu={eu.id} onFechar={() => setModal(null)} onOk={(t) => { setModal(null); setCarrinho([]); setAviso({ tipo: "ok", texto: t }); carregarSessao(); }} />}
    </main>
  );
}

/* ---------------- Janela ---------------- */
function Janela({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onFechar(); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-creme p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center"><h2 className="flex-1 text-xl font-extrabold text-roxo">{titulo}</h2><button onClick={onFechar} aria-label="Fechar" className="rounded-full bg-white px-3 py-1 text-xl font-bold">×</button></div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Abrir caixa ---------------- */
function AbrirCaixa({ store, eu, onAberto, onErro }: { store: CaixaStore; eu: string; onAberto: () => void; onErro: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function abrir(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true);
    try { await store.abrir(eu, num(valor)); onAberto(); } catch (e) { onErro((e as Error).message); }
    setOcupado(false);
  }
  return (
    <form onSubmit={abrir} className="mx-auto mt-10 max-w-sm space-y-4 rounded-3xl bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-extrabold text-roxo">Abrir o caixa</h1>
      <p className="text-sm text-roxo/70">Conte o dinheiro que está na gaveta para troco e informe o valor.</p>
      <label className="block text-left"><span className="rotulo">Troco inicial (R$)</span><input autoFocus className="campo text-center text-2xl font-extrabold" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(dinheiroInput(e.target.value))} /></label>
      <button className="botao w-full" disabled={ocupado}>{ocupado ? "Abrindo…" : "Abrir caixa"}</button>
    </form>
  );
}

/* ---------------- Açaí ---------------- */
function MontarAcai({ c, onAdd }: { c: Cardapio; onAdd: (i: CartItem) => boolean }) {
  const sizes = c.sizes.filter((s) => s.ativo), bases = c.bases.filter((b) => b.ativo);
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");
  const [baseId, setBaseId] = useState(bases[0]?.id ?? "");
  const [addons, setAddons] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const hoje = agoraSousa().data;
  const size = sizes.find((s) => s.id === sizeId);
  const contados = addons.filter((id) => c.addons.find((a) => a.id === id)?.conta_no_limite).length;
  const item: CartItem = { tipo: "acai", sizeId, baseId, addonIds: addons, qtd: 1, obs: obs || undefined };
  let preco: number | null = null;
  try { preco = priceItem(c, item).total; } catch { /* mostra no botão */ }

  return (
    <div className="space-y-4">
      {(["Copo", "Pote"] as const).map((emb) => sizes.some((s) => s.embalagem === emb) && (
        <div key={emb}><span className="rotulo">{emb}</span><div className="flex flex-wrap gap-2">
          {sizes.filter((s) => s.embalagem === emb).map((s) => <button key={s.id} onClick={() => setSizeId(s.id)} aria-pressed={sizeId === s.id} className={chip(sizeId === s.id)}>{s.rotulo}<span className="block text-xs font-semibold opacity-75">{brl(s.preco)} · {s.acomp_inclusos} acomp.</span></button>)}
        </div></div>
      ))}
      <div><span className="rotulo">Base</span><div className="flex flex-wrap gap-2">{bases.map((b) => <button key={b.id} onClick={() => setBaseId(b.id)} aria-pressed={baseId === b.id} className={chip(baseId === b.id)}>{b.nome}</button>)}</div></div>
      {size && <p className={`rounded-xl px-3 py-2 text-sm font-bold ${contados > size.acomp_inclusos ? "bg-amber-100 text-amber-900" : "bg-lima/30 text-roxo-escuro"}`}>
        Inclusos: {Math.min(contados, size.acomp_inclusos)} de {size.acomp_inclusos}{contados > size.acomp_inclusos && ` · ${contados - size.acomp_inclusos} extra(s) a ${brl(c.settings.acomp_extra ?? 0)}`}
      </p>}
      {c.grupos.map((g) => {
        const itens = c.addons.filter((a) => a.group_id === g.id && a.ativo);
        return itens.length > 0 && (
          <div key={g.id}><span className="rotulo">{g.nome}</span><div className="flex flex-wrap gap-2">
            {itens.map((a) => {
              const on = addons.includes(a.id), esgotado = a.esgotado_em === hoje;
              return <button key={a.id} disabled={esgotado} aria-pressed={on} onClick={() => setAddons((l) => (on ? l.filter((x) => x !== a.id) : [...l, a.id]))} className={`${chip(on)} disabled:opacity-40`}>{a.nome}{a.preco_adicional > 0 && <span className="ml-1 text-xs opacity-75">+{brl(a.preco_adicional)}</span>}{esgotado && " (esgotado)"}</button>;
            })}
          </div></div>
        );
      })}
      <input className="campo !py-2 text-sm" placeholder="Observação (opcional)" value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} />
      <button className="botao w-full" disabled={preco == null} onClick={() => { if (onAdd(item)) { setAddons([]); setObs(""); } }}>Adicionar {preco != null && `· ${brl(preco)}`}</button>
    </div>
  );
}

/* ---------------- Açaí no quilo ---------------- */
function Quilo({ store, c, onAdd, onErro }: { store: CaixaStore; c: Cardapio; onAdd: (i: CartItem) => boolean; onErro: (t: string) => void }) {
  const [peso, setPeso] = useState("");
  const [tara, setTara] = useState("0");
  const [taras, setTaras] = useState<Tara[]>([]);
  const [estado, setEstado] = useState("");
  const balanca = useRef<ToledoScale | null>(null);
  const suportada = useMemo(() => ToledoScale.suportado(), []);

  useEffect(() => {
    store.taras().then(setTaras);
    return () => { balanca.current?.desconectar().catch(() => {}); };
  }, [store]);

  async function ler() {
    try {
      if (!balanca.current?.conectada) { balanca.current = new ToledoScale(); setEstado("Conectando…"); await balanca.current.conectar(); }
      setEstado("Lendo…");
      const r = await balanca.current.lerEstavel();
      if (r.status === "estavel") { setPeso(String(r.gramas)); setEstado("Peso lido da balança ✓"); }
      else setEstado({ instavel: "Peso instável — aguarde parar de oscilar e leia de novo.", negativo: "Peso negativo — zere a balança.", sobrecarga: "Sobrecarga na balança.", invalido: "A balança não respondeu. Confira o cabo e o parâmetro C14 = Prt3." }[r.status]);
    } catch (e) { balanca.current = null; setEstado(""); onErro("Balança: " + (e as Error).message); }
  }

  const bruto = Math.round(Number(peso) || 0), t = Math.round(Number(tara) || 0), liquido = Math.max(0, bruto - t);
  const valor = cents((liquido / 1000) * c.settings.preco_kg);
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-roxo/70">{brl(c.settings.preco_kg)} por quilo</p>
      {suportada ? <button onClick={ler} className="botao w-full sm:w-auto">⚖️ Ler peso da balança</button> : <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">Este navegador não fala com a balança. Use o Chrome ou Edge no computador do balcão, ou digite o peso.</p>}
      {estado && <p className="text-sm font-semibold">{estado}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="rotulo">Peso na balança (g)</span><input className="campo text-2xl font-extrabold" inputMode="numeric" value={peso} onChange={(e) => setPeso(e.target.value.replace(/\D/g, ""))} placeholder="0" /></label>
        <label><span className="rotulo">Embalagem vazia (g)</span><input className="campo text-2xl font-extrabold" inputMode="numeric" value={tara} onChange={(e) => setTara(e.target.value.replace(/\D/g, ""))} /></label>
      </div>
      {taras.length > 0 && <div className="flex flex-wrap gap-2">{taras.map((x) => <button key={x.nome} onClick={() => setTara(String(x.g))} className={chip(t === x.g)}>{x.nome} · {x.g} g</button>)}<button onClick={() => setTara("0")} className={chip(t === 0)}>Sem embalagem</button></div>}
      <div className="rounded-2xl bg-white p-4 text-center"><div className="text-sm font-bold text-roxo/60">Líquido {liquido} g</div><div className="text-4xl font-extrabold text-roxo">{brl(valor)}</div></div>
      <button className="botao w-full" disabled={liquido <= 0} onClick={() => { if (onAdd({ tipo: "kg", pesoBrutoG: bruto, taraG: t, qtd: 1 })) { setPeso(""); setEstado(""); } }}>Adicionar</button>
    </div>
  );
}

/* ---------------- Promoções ---------------- */
function Promos({ c, onAdd }: { c: Cardapio; onAdd: (i: CartItem) => boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {c.promos.filter((p) => p.ativo).map((p) => {
        const ok = promoDisponivel(p);
        return <button key={p.id} disabled={!ok} onClick={() => onAdd({ tipo: "promo", promoId: p.id, qtd: 1 })} className="rounded-2xl bg-white p-4 text-left ring-1 ring-roxo/15 transition active:scale-95 disabled:opacity-50">
          <div className="font-extrabold text-roxo">{p.nome} · {brl(p.preco)}</div><div className="text-sm text-roxo/70">{p.tamanho} · {p.composicao.join(", ")}</div>{!ok && <div className="mt-1 text-xs font-bold text-amber-800">Indisponível hoje</div>}
        </button>;
      })}
    </div>
  );
}

/* ---------------- Produtos ---------------- */
function Produtos({ produtos, onAdd }: { produtos: ProdutoLoja[]; onAdd: (i: CartItem) => boolean }) {
  const [sel, setSel] = useState<ProdutoLoja | null>(null);
  const [tamanho, setTamanho] = useState("");
  const [sabores, setSabores] = useState<string[]>([]);
  const [escolha, setEscolha] = useState("");
  const hoje = agoraSousa().data;
  function abrir(p: ProdutoLoja) {
    if (p.kind === "simples") return void onAdd({ tipo: "produto", productId: p.id, qtd: 1 });
    setSel(p); setTamanho(p.tamanhos?.length === 1 ? p.tamanhos[0].nome : ""); setSabores([]); setEscolha("");
  }
  const t = sel?.tamanhos?.find((x) => x.nome === tamanho);
  const nSabores = sel?.sabores?.length ? t?.sabores ?? 1 : 0;
  const pronto = !!sel && !!t && sabores.length === nSabores && (!sel.escolha || !!escolha);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {produtos.map((p) => {
          const esgotado = p.esgotado_em === hoje;
          const preco = p.kind === "simples" ? brl(p.preco ?? 0) : p.tamanhos?.length ? `a partir de ${brl(Math.min(...p.tamanhos.map((x) => x.preco)))}` : "";
          return <button key={p.id} disabled={esgotado} onClick={() => abrir(p)} className="min-h-[72px] rounded-2xl bg-white p-3 text-left ring-1 ring-roxo/15 transition active:scale-95 disabled:opacity-40">
            <div className="text-sm font-extrabold leading-tight text-roxo">{p.nome}</div><div className="mt-1 text-xs font-semibold text-roxo/70">{esgotado ? "Esgotado hoje" : preco}</div>
          </button>;
        })}
      </div>
      {sel && (
        <Janela titulo={sel.nome} onFechar={() => setSel(null)}>
          <div className="space-y-4">
            <div><span className="rotulo">Tamanho</span><div className="flex flex-wrap gap-2">{sel.tamanhos?.map((x) => <button key={x.nome} aria-pressed={tamanho === x.nome} onClick={() => { setTamanho(x.nome); setSabores([]); }} className={chip(tamanho === x.nome)}>{x.nome} · {brl(x.preco)}</button>)}</div></div>
            {sel.escolha && <div><span className="rotulo">{sel.escolha.rotulo}</span><div className="flex flex-wrap gap-2">{sel.escolha.opcoes.map((o) => <button key={o} aria-pressed={escolha === o} onClick={() => setEscolha(o)} className={chip(escolha === o)}>{o}</button>)}</div></div>}
            {nSabores > 0 && <div><span className="rotulo">Sabor{nSabores > 1 ? `es (escolha ${nSabores})` : ""}</span><div className="flex flex-wrap gap-2">
              {sel.sabores!.map((s) => { const on = sabores.includes(s); return <button key={s} aria-pressed={on} onClick={() => setSabores((l) => (on ? l.filter((x) => x !== s) : nSabores === 1 ? [s] : l.length < nSabores ? [...l, s] : l))} className={chip(on)}>{s}</button>; })}
            </div></div>}
            <button className="botao w-full" disabled={!pronto} onClick={() => { if (onAdd({ tipo: "produto", productId: sel.id, tamanho, sabores: nSabores ? sabores : undefined, escolha: escolha || undefined, qtd: 1 })) setSel(null); }}>Adicionar {t && `· ${brl(t.preco)}`}</button>
          </div>
        </Janela>
      )}
    </>
  );
}

/* ---------------- Receber ---------------- */
function Pagar({ total, cobrarDepois, onFechar, onConfirmar }: { total: number; cobrarDepois: string | null; onFechar: () => void; onConfirmar: (p: { metodo: Metodo; valor: number }[], recebido?: number, formaPrevista?: Metodo) => Promise<string | null> }) {
  const [depois, setDepois] = useState(!!cobrarDepois);
  const [metodo, setMetodo] = useState<Metodo>("dinheiro");
  const [dividir, setDividir] = useState(false);
  const [metodo2, setMetodo2] = useState<Metodo>("pix");
  const [valor1, setValor1] = useState("");
  const [recebido, setRecebido] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const dividirOk = dividir && !depois;
  const v1 = dividirOk ? Math.min(cents(num(valor1)), total) : total;
  const v2 = cents(total - v1);
  const emDinheiro = (metodo === "dinheiro" ? v1 : 0) + (dividirOk && metodo2 === "dinheiro" ? v2 : 0);
  const rec = num(recebido);
  const troco = rec > 0 ? cents(rec - emDinheiro) : 0;
  const valido = (!dividirOk || (v1 > 0 && v2 > 0 && metodo !== metodo2)) && (rec === 0 || troco >= 0);
  const sugestoes = Array.from(new Set([emDinheiro, Math.ceil(emDinheiro / 5) * 5, Math.ceil(emDinheiro / 10) * 10, 20, 50, 100].filter((x) => x >= emDinheiro))).slice(0, 5);

  async function confirmar() {
    setOcupado(true); setErro("");
    const pagamentos = depois ? [] : dividirOk ? [{ metodo, valor: v1 }, { metodo: metodo2, valor: v2 }] : [{ metodo, valor: total }];
    const e = await onConfirmar(pagamentos, emDinheiro > 0 && rec > 0 ? rec : undefined, depois ? metodo : undefined);
    if (e) { setErro(e); setOcupado(false); }
  }
  const Metodos = ({ valor, onChange }: { valor: Metodo; onChange: (m: Metodo) => void }) => <div className="grid grid-cols-4 gap-2">{METODOS.map((m) => <button key={m} aria-pressed={valor === m} onClick={() => onChange(m)} className={chip(valor === m)}>{NOME_METODO[m]}</button>)}</div>;

  return (
    <Janela titulo={cobrarDepois ? "Pagamento do pedido" : "Receber"} onFechar={onFechar}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 text-center"><div className="text-sm font-bold text-roxo/60">Total</div><div className="text-4xl font-extrabold text-roxo">{brl(total)}</div></div>
        {cobrarDepois && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 text-sm" role="radiogroup" aria-label="Quando paga">
            <button role="radio" aria-checked={depois} onClick={() => setDepois(true)} className={`rounded-lg py-2 font-extrabold ${depois ? "bg-roxo text-white" : "text-roxo"}`}>Cobrar {cobrarDepois}</button>
            <button role="radio" aria-checked={!depois} onClick={() => setDepois(false)} className={`rounded-lg py-2 font-extrabold ${!depois ? "bg-roxo text-white" : "text-roxo"}`}>Já pagou</button>
          </div>
        )}
        {depois && <p className="text-sm font-semibold text-roxo/70">Como o cliente vai pagar {cobrarDepois}?</p>}
        <Metodos valor={metodo} onChange={setMetodo} />
        {!depois && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-roxo" checked={dividir} onChange={(e) => setDividir(e.target.checked)} />Dividir em duas formas</label>}
        {dividirOk && <>
          <label className="block"><span className="rotulo">Valor em {NOME_METODO[metodo]} (R$)</span><input className="campo" inputMode="decimal" value={valor1} onChange={(e) => setValor1(dinheiroInput(e.target.value))} placeholder="0,00" /></label>
          <div><span className="rotulo">Restante {brl(v2)} em</span><Metodos valor={metodo2} onChange={setMetodo2} /></div>
          {metodo === metodo2 && <p className="text-sm font-semibold text-amber-800">Escolha duas formas diferentes.</p>}
        </>}
        {emDinheiro > 0 && <div>
          <span className="rotulo">{depois ? "Troco para quanto? (opcional)" : "Dinheiro recebido (para o troco)"}</span>
          <input className="campo text-xl font-extrabold" inputMode="decimal" value={recebido} onChange={(e) => setRecebido(dinheiroInput(e.target.value))} placeholder={brl(emDinheiro)} />
          <div className="mt-2 flex flex-wrap gap-2">{sugestoes.map((s) => <button key={s} onClick={() => setRecebido(s.toFixed(2).replace(".", ","))} className={chip(rec === s)}>{brl(s)}</button>)}</div>
          {rec > 0 && <div className={`mt-3 rounded-2xl p-3 text-center text-2xl font-extrabold ${troco >= 0 ? "bg-lima/40 text-roxo-escuro" : "bg-red-50 text-red-800"}`}>{troco >= 0 ? (depois ? `Levar ${brl(troco)} de troco` : `Troco ${brl(troco)}`) : `Faltam ${brl(-troco)}`}</div>}
        </div>}
        {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}
        <button className="botao-lima w-full" disabled={!valido || ocupado} onClick={confirmar}>{ocupado ? "Registrando…" : depois ? "Registrar pedido" : "Confirmar venda"}</button>
      </div>
    </Janela>
  );
}

/* ---------------- Sangria / reforço ---------------- */
function Movimento({ store, tipo, sessao, onFechar, onOk }: { store: CaixaStore; tipo: "sangria" | "suprimento"; sessao: string; onFechar: () => void; onOk: (t: string) => void }) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const nome = tipo === "sangria" ? "Sangria (retirada de dinheiro)" : "Reforço (entrada de dinheiro)";
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (num(valor) <= 0) return setErro("Informe o valor.");
    try { await store.movimento(sessao, tipo, num(valor), motivo.trim() || null); } catch (e) { return setErro((e as Error).message); }
    onOk(`${tipo === "sangria" ? "Sangria" : "Reforço"} de ${brl(num(valor))} registrado.`);
  }
  return (
    <Janela titulo={nome} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <label className="block"><span className="rotulo">Valor (R$)</span><input autoFocus className="campo text-xl font-extrabold" inputMode="decimal" value={valor} onChange={(e) => setValor(dinheiroInput(e.target.value))} placeholder="0,00" /></label>
        <label className="block"><span className="rotulo">Motivo</span><input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "sangria" ? "Ex.: pagamento de fornecedor" : "Ex.: troco"} maxLength={120} /></label>
        {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}
        <button className="botao w-full">Registrar</button>
      </form>
    </Janela>
  );
}

/* ---------------- Fechar caixa ---------------- */
function FecharCaixa({ store, sessao, eu, onFechar, onOk }: { store: CaixaStore; sessao: Sessao; eu: string; onFechar: () => void; onOk: (t: string) => void }) {
  const [r, setR] = useState<Resumo | null>(null);
  const [contado, setContado] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => { store.resumo(sessao.id).then(setR, (e) => setErro((e as Error).message)); }, [store, sessao.id]);
  const dif = r && contado ? cents(num(contado) - Number(r.dinheiro_esperado)) : null;

  async function fechar() {
    if (!contado) return setErro("Conte o dinheiro da gaveta e informe o valor.");
    try { await store.fechar(sessao.id, eu, num(contado), obs.trim() || null); } catch (e) { return setErro((e as Error).message); }
    onOk(`Caixa fechado. ${dif === 0 ? "Conferiu certinho." : dif! > 0 ? `Sobrou ${brl(dif!)}.` : `Faltou ${brl(-dif!)}.`}`);
  }
  const L = ({ a, b, forte }: { a: string; b: string; forte?: boolean }) => <div className={`flex justify-between ${forte ? "text-base font-extrabold" : ""}`}><span>{a}</span><span>{b}</span></div>;

  return (
    <Janela titulo="Fechar caixa" onFechar={onFechar}>
      {!r ? <p>{erro || "Calculando…"}</p> : (
        <div className="space-y-4 text-sm">
          <div className="space-y-1 rounded-2xl bg-white p-4">
            <L a={`Vendas no balcão (${r.balcao_qtd})`} b={brl(r.balcao_total)} forte />
            {METODOS.map((m) => Number(r.por_metodo[m] ?? 0) > 0 && <L key={m} a={`· ${NOME_METODO[m]}`} b={brl(r.por_metodo[m])} />)}
            <L a={`Pedidos do site (${r.site_qtd})`} b={brl(r.site_total)} forte />
            {Number(r.entregas_qtd) > 0 && <L a={`Entregas (${r.entregas_qtd}) · taxas`} b={brl(Number(r.taxas_entrega))} />}
            {Number(r.a_receber) > 0 && <L a="⚠ Pedidos ainda a receber" b={brl(Number(r.a_receber))} forte />}
          </div>
          <div className="space-y-1 rounded-2xl bg-white p-4">
            <L a="Troco inicial" b={brl(r.abertura)} />
            <L a="Dinheiro do balcão" b={brl(r.por_metodo.dinheiro ?? 0)} />
            <L a="Dinheiro de pedidos do site (marcados pagos)" b={brl(r.site_dinheiro)} />
            <L a="Reforços" b={brl(r.suprimentos)} />
            <L a="Sangrias" b={`− ${brl(r.sangrias)}`} />
            <L a="Dinheiro esperado na gaveta" b={brl(r.dinheiro_esperado)} forte />
          </div>
          <label className="block"><span className="rotulo">Dinheiro contado na gaveta (R$)</span><input autoFocus className="campo text-xl font-extrabold" inputMode="decimal" value={contado} onChange={(e) => setContado(dinheiroInput(e.target.value))} placeholder="0,00" /></label>
          {dif != null && <div className={`rounded-2xl p-3 text-center text-lg font-extrabold ${dif === 0 ? "bg-lima/40 text-roxo-escuro" : "bg-amber-100 text-amber-900"}`}>{dif === 0 ? "Conferiu ✓" : dif > 0 ? `Sobrando ${brl(dif)}` : `Faltando ${brl(-dif)}`}</div>}
          <input className="campo" placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} />
          {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-800">{erro}</p>}
          <button className="botao w-full" onClick={fechar}>Fechar caixa</button>
        </div>
      )}
    </Janela>
  );
}
