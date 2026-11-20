"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabaseNavegador } from "@/lib/supabase/client";
import { emAberto, proximo, ROTULO, type Status } from "@/lib/pedidos/status";
import { brl, CAMPOS, hora, imprimir, linkMapa, linkWhatsApp, PAGAMENTO, papelSalvo, salvarPapel, type Papel, type PedidoBalcao } from "@/lib/pedidos/comanda";


/** 00:00 de hoje em Sousa-PB (UTC−3), em ISO. */
function inicioDoDia() {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}

/** Campainha gerada no navegador (sem arquivo de áudio). */
function tocar(ctx: AudioContext) {
  const t = ctx.currentTime;
  [0, 0.18, 0.36].forEach((dt, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = [880, 1175, 1568][i];
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.5, t + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
    o.connect(g).connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 0.3);
  });
}

const COR: Record<Status, string> = {
  aguardando_pagamento: "bg-gray-200 text-gray-700", novo: "bg-amber-400 text-amber-950", preparo: "bg-sky-200 text-sky-900",
  pronto: "bg-lima text-roxo-escuro", saiu: "bg-violet-200 text-violet-900", entregue: "bg-emerald-100 text-emerald-800", cancelado: "bg-red-100 text-red-800",
};

type Permissoes = Partial<Record<"caixa" | "cancelar" | "esgotado" | "historico" | "relatorios" | "cardapio" | "loja" | "equipe", boolean>>;
type Atualizar = (p: PedidoBalcao, c: Partial<Pick<PedidoBalcao, "status" | "pago" | "motivo_cancelamento" | "entregador">>) => void;

/** Data de hoje e de ontem em Sousa-PB (AAAA-MM-DD). */
const diaSousa = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const ontem = () => diaSousa(new Date(Date.now() - 86_400_000));
const CANAL: Record<string, string> = { site: "🌐 Site", balcao: "🏪 Balcão", whatsapp: "💬 WhatsApp" };
const TIPO: Record<string, string> = { entrega: "🛵 Entrega", retirada: "🛍️ Retirada", balcao: "Na loja" };

export default function Balcao() {
  const router = useRouter();
  const sb = supabaseNavegador;
  const [eu, setEu] = useState<{ id: string; email: string; funcao: string; pode: Permissoes } | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoBalcao[]>([]);
  const [aba, setAba] = useState<"abertos" | "concluidos" | "historico">("abertos");
  const [filtro, setFiltro] = useState<"todos" | "entrega" | "retirada" | "balcao">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [conexao, setConexao] = useState<"ok" | "caiu" | "...">("...");
  const [som, setSom] = useState(false);
  const [erro, setErro] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb().from("orders").select(CAMPOS)
      .or(`status.in.(novo,preparo,pronto,saiu),created_at.gte.${inicioDoDia()}`)
      .neq("status", "aguardando_pagamento")
      .order("created_at", { ascending: false }).limit(300);
    if (error) return setErro("Não foi possível carregar os pedidos: " + error.message);
    setErro("");
    const lista = (data ?? []) as unknown as PedidoBalcao[];
    // Toca quando aparece um pedido novo que ainda não tinha sido visto.
    if (vistos.current) {
      const chegou = lista.some((p) => p.status === "novo" && !vistos.current!.has(p.id));
      if (chegou && audio.current) tocar(audio.current);
    }
    vistos.current = new Set(lista.map((p) => p.id));
    setPedidos(lista);
  }, [sb]);

  // Login, função e permissões
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace("/entrar");
      const [{ data: funcao }, { data: pode }] = await Promise.all([sb().rpc("minha_funcao"), sb().rpc("minhas_permissoes")]);
      if (!funcao) return setSemAcesso(true);
      setEu({ id: user.id, email: user.email ?? "", funcao: funcao as string, pode: (pode ?? {}) as Permissoes });
    })();
  }, [sb, router]);

  // Pedidos em tempo real + conferência a cada 30 s (se a conexão cair)
  useEffect(() => {
    if (!eu) return;
    carregar();
    const canal = sb().channel("pedidos-balcao")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => carregar())
      .subscribe((s) => setConexao(s === "SUBSCRIBED" ? "ok" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "caiu" : "..."));
    const t = setInterval(carregar, 30_000);
    const volta = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", volta);
    return () => { sb().removeChannel(canal); clearInterval(t); document.removeEventListener("visibilitychange", volta); };
  }, [eu, sb, carregar]);

  // Enquanto houver pedido "Novo" sem aceitar, a campainha repete a cada 20 s.
  const novos = pedidos.filter((p) => p.status === "novo").length;
  useEffect(() => {
    document.title = novos ? `(${novos}) Novo pedido · Balcão` : "Balcão · Tropical Açaí";
    if (!novos || !som) return;
    const t = setInterval(() => audio.current && tocar(audio.current), 20_000);
    return () => clearInterval(t);
  }, [novos, som]);

  function ativarSom() {
    audio.current ??= new AudioContext();
    audio.current.resume(); tocar(audio.current); setSom(true);
  }

  const atualizar: Atualizar = async (p, campos) => {
    setPedidos((l) => l.map((x) => (x.id === p.id ? { ...x, ...campos } : x)));
    const { error } = await sb().from("orders").update({ ...campos, operador: eu!.id, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { setErro("Não foi possível atualizar o pedido #" + p.numero + ": " + error.message); carregar(); }
  };

  async function sair() { await sb().auth.signOut(); router.replace("/entrar"); }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <main className="grid min-h-dvh place-items-center bg-creme p-6 text-center">O balcão precisa do banco de dados (Supabase) configurado.</main>;
  if (semAcesso) return (
    <main className="grid min-h-dvh place-items-center bg-creme p-6 text-center">
      <div className="max-w-sm space-y-3"><h1 className="text-xl font-extrabold">Sem acesso ao balcão</h1>
        <p>Seu usuário ainda não foi cadastrado na equipe. Peça ao dono para cadastrar seu e-mail na página Equipe.</p>
        <button onClick={sair} className="botao">Sair</button></div>
    </main>
  );
  if (!eu) return <main className="grid min-h-dvh place-items-center bg-creme text-roxo">Carregando…</main>;

  const termo = busca.trim().toLowerCase();
  const filtrar = (l: PedidoBalcao[]) => l.filter((p) => (filtro === "todos" || p.tipo === filtro)
    && (!termo || String(p.numero) === termo.replace("#", "") || (p.cliente_nome ?? "").toLowerCase().includes(termo)));
  // Abertos: fila na ordem de chegada (o mais antigo em cima). Concluídos: o mais recente em cima.
  const lista = aba === "abertos" ? filtrar(pedidos.filter((p) => emAberto(p.status))).reverse() : filtrar(pedidos.filter((p) => !emAberto(p.status)));
  const hoje = pedidos.filter((p) => p.created_at >= inicioDoDia() && p.status !== "cancelado");
  const faturado = hoje.reduce((s, p) => s + Number(p.total), 0);
  const aReceber = pedidos.filter((p) => p.status !== "cancelado" && !p.pago).reduce((s, p) => s + Number(p.total), 0);
  const entregadores = Array.from(new Set(pedidos.map((p) => p.entregador).filter(Boolean))) as string[];

  return (
    <main className="min-h-dvh bg-creme pb-16">
      <header className="sticky top-0 z-30 bg-roxo text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={92} height={38} />
          <span title={conexao === "ok" ? "Recebendo pedidos ao vivo" : "Reconectando — conferindo a cada 30 s"} className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${conexao === "ok" ? "bg-lima text-roxo-escuro" : "bg-amber-300 text-amber-950"}`}>
            <span className={`h-2 w-2 rounded-full ${conexao === "ok" ? "animate-pulse bg-roxo-escuro" : "bg-amber-800"}`} />{conexao === "ok" ? "Ao vivo" : "Reconectando"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {eu.pode.caixa && <Link href="/balcao/caixa" className="rounded-full bg-lima px-3 py-1.5 font-extrabold text-roxo-escuro">Caixa</Link>}
            <Link href="/balcao/painel?aba=lista" className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">🛒 Lista</Link>
            <Link href="/balcao/painel" className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">Painel</Link>
            {eu.pode.equipe && <Link href="/balcao/equipe" className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">Equipe</Link>}
            <SeletorPapel />
            <button onClick={sair} className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">Sair</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4">
        {!som && (
          <button onClick={ativarSom} className="mt-4 w-full rounded-2xl bg-amber-400 px-4 py-3 text-left font-extrabold text-amber-950 shadow">
            🔔 Toque aqui para ativar o som de novos pedidos <span className="block text-sm font-semibold">O navegador só permite som depois de um toque. Deixe esta página aberta.</span>
          </button>
        )}
        {erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Resumo rotulo="Novos" valor={String(novos)} destaque={novos > 0} />
          <Resumo rotulo="Pedidos hoje" valor={String(hoje.length)} />
          <Resumo rotulo="Vendido hoje" valor={brl(faturado)} />
          <Resumo rotulo="A receber" valor={brl(aReceber)} />
        </div>

        <div role="tablist" className="mt-4 flex flex-wrap gap-2">
          {([["abertos", "Em andamento"], ["concluidos", "Concluídos hoje"], ...(eu.pode.historico ? [["historico", "Dias anteriores"]] : [])] as [typeof aba, string][]).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => { setAba(k); setAberto(null); }} className={`rounded-full px-4 py-2 text-sm font-extrabold ${aba === k ? "bg-roxo text-white" : "bg-white text-roxo"}`}>{v}</button>
          ))}
        </div>

        {aba === "historico" ? <Historico pode={eu.pode} onAtualizar={atualizar} entregadores={entregadores} /> : <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {([["todos", "Todos"], ["entrega", "Entregas"], ["retirada", "Retiradas"], ["balcao", "Na loja"]] as const).map(([k, v]) => (
              <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${filtro === k ? "bg-roxo/90 text-white" : "bg-white text-roxo ring-1 ring-roxo/15"}`}>{v}</button>
            ))}
            <input aria-label="Buscar pedido" className="campo !w-48 !py-1.5 text-sm sm:ml-auto" placeholder="Buscar nome ou nº" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {!lista.length
            ? <p className="mt-10 text-center font-semibold text-roxo/60">{aba === "abertos" ? "Nenhum pedido em andamento. Os novos aparecem aqui sozinhos." : "Nenhum pedido concluído hoje."}</p>
            : <ListaPedidos lista={lista} aberto={aberto} setAberto={setAberto} onAtualizar={atualizar} pode={eu.pode} entregadores={entregadores} />}
        </>}
      </div>
    </main>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return <div className={`rounded-2xl p-3 ${destaque ? "animate-pulse bg-amber-400 text-amber-950" : "bg-white text-roxo"}`}><div className="text-xl font-extrabold">{valor}</div><div className="text-xs font-bold opacity-70">{rotulo}</div></div>;
}

/** Pedidos em lista, um por linha. Toque na linha para ver os detalhes. */
function ListaPedidos({ lista, aberto, setAberto, onAtualizar, pode, entregadores }: { lista: PedidoBalcao[]; aberto: string | null; setAberto: (id: string | null) => void; onAtualizar: Atualizar; pode: Permissoes; entregadores: string[] }) {
  return (
    <ul className="mt-3 divide-y divide-roxo/10 overflow-hidden rounded-2xl bg-white shadow-sm">
      <AnimatePresence initial={false}>
        {lista.map((p) => <LinhaPedido key={p.id} p={p} aberto={aberto === p.id} onAlternar={() => setAberto(aberto === p.id ? null : p.id)} onAtualizar={onAtualizar} pode={pode} entregadores={entregadores} />)}
      </AnimatePresence>
    </ul>
  );
}

function LinhaPedido({ p, aberto, onAlternar, onAtualizar, pode, entregadores }: { p: PedidoBalcao; aberto: boolean; onAlternar: () => void; onAtualizar: Atualizar; pode: Permissoes; entregadores: string[] }) {
  const prox = proximo(p.status, p.tipo);
  const minutos = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 60000);
  const resumoItens = p.order_items.slice(0, 2).map((i) => `${i.quantidade}× ${i.nome}`).join(", ") + (p.order_items.length > 2 ? ` +${p.order_items.length - 2}` : "");
  return (
    <motion.li layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className={p.status === "novo" ? "bg-amber-50" : ""}>
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <button onClick={onAlternar} aria-expanded={aberto} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="w-12 shrink-0 text-lg font-extrabold text-roxo">#{p.numero}</span>
          <span className="w-16 shrink-0 text-xs font-semibold text-roxo/60">{hora(p.created_at)}{emAberto(p.status) && <span className={`block ${minutos >= 20 ? "font-extrabold text-red-700" : ""}`}>há {minutos < 60 ? minutos + " min" : Math.floor(minutos / 60) + " h"}</span>}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{p.cliente_nome || "Cliente no balcão"} <span className="text-xs font-semibold text-roxo/60">· {CANAL[p.canal] ?? p.canal} · {TIPO[p.tipo] ?? p.tipo}</span></span>
            <span className="block truncate text-xs text-roxo/70">{resumoItens}</span>
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block font-extrabold">{brl(p.total)}</span>
            <span className={`text-xs font-bold ${p.pago ? "text-emerald-700" : "text-amber-700"}`}>{p.pago ? "Pago" : "A receber"}</span>
          </span>
          <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold md:inline ${COR[p.status]}`}>{ROTULO[p.status]}</span>
        </button>
        {prox && <button onClick={() => onAtualizar(p, { status: prox.status })} className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold ${p.status === "novo" ? "bg-lima text-roxo-escuro" : "bg-roxo text-white"}`}>{prox.acao}</button>}
      </div>
      {aberto && <Detalhes p={p} onAtualizar={onAtualizar} pode={pode} entregadores={entregadores} />}
    </motion.li>
  );
}

function Detalhes({ p, onAtualizar, pode, entregadores }: { p: PedidoBalcao; onAtualizar: Atualizar; pode: Permissoes; entregadores: string[] }) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [entregador, setEntregador] = useState(p.entregador ?? "");
  const wa = linkWhatsApp(p), mapa = p.tipo === "entrega" ? linkMapa(p) : null;
  return (
    <div className="grid gap-4 border-t border-roxo/10 bg-creme/60 px-4 py-3 text-sm md:grid-cols-2">
      <div>
        <div className="mb-2 flex flex-wrap gap-1.5 md:hidden"><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${COR[p.status]}`}>{ROTULO[p.status]}</span></div>
        <ul className="space-y-1.5">
          {p.order_items.map((i, k) => (
            <li key={k}>
              <div className="flex gap-2 font-bold"><span>{i.quantidade}×</span><span className="flex-1">{i.nome}</span><span>{brl(i.total)}</span></div>
              {i.descricao && <div className="pl-6 text-roxo/70">{i.descricao}</div>}
              {i.detalhes?.obs && <div className="ml-6 mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">OBS: {i.detalhes.obs}</div>}
            </li>
          ))}
        </ul>
        {p.observacao && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{p.observacao}</p>}
        <div className="mt-2 space-y-0.5 border-t border-roxo/10 pt-2">
          {Number(p.taxa_entrega) > 0 && <div className="flex justify-between text-roxo/70"><span>Taxa de entrega{p.distancia_km != null ? ` (${Number(p.distancia_km).toFixed(1).replace(".", ",")} km)` : ""}</span><span>{brl(p.taxa_entrega)}</span></div>}
          <div className="flex justify-between text-base font-extrabold"><span>Total</span><span>{brl(p.total)}</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}</span>
            {p.troco_para && <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-900">Troco p/ {brl(p.troco_para)} → levar {brl(Number(p.troco_para) - Number(p.total))}</span>}
            {p.status !== "cancelado" && <button onClick={() => onAtualizar(p, { pago: !p.pago })} className={`ml-auto rounded-full px-2.5 py-1 text-xs font-extrabold ${p.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{p.pago ? "✓ Pago" : "Marcar como pago"}</button>}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {p.cliente_telefone && <div className="font-semibold">📞 {p.cliente_telefone}</div>}
        {p.tipo === "entrega" && (
          <div className="rounded-xl bg-white p-2.5">
            <div className="font-semibold">{p.endereco}</div>
            {p.bairro && <div className="text-roxo/70">{p.bairro}</div>}
            {mapa && <a href={mapa} target="_blank" rel="noreferrer" className="mt-1 inline-block font-bold text-roxo underline">Abrir no mapa ↗</a>}
            <label className="mt-2 flex items-center gap-2"><span className="text-xs font-bold text-roxo/70">Entregador</span>
              <input list="entregadores" className="campo !py-1.5 text-sm" placeholder="Nome de quem levou" value={entregador} maxLength={40}
                onChange={(e) => setEntregador(e.target.value)} onBlur={() => entregador.trim() !== (p.entregador ?? "") && onAtualizar(p, { entregador: entregador.trim() || null })} />
            </label>
            <datalist id="entregadores">{entregadores.map((n) => <option key={n} value={n} />)}</datalist>
          </div>
        )}
        {p.status === "cancelado" && p.motivo_cancelamento && <p className="text-red-800">Motivo do cancelamento: {p.motivo_cancelamento}</p>}
        {cancelando ? (
          <form onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) { onAtualizar(p, { status: "cancelado", motivo_cancelamento: motivo.trim() }); setCancelando(false); } }} className="space-y-2">
            <input autoFocus className="campo" placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="flex gap-2"><button className="botao flex-1 !bg-red-700">Confirmar cancelamento</button><button type="button" onClick={() => setCancelando(false)} className="rounded-full bg-gray-100 px-4 font-bold">Voltar</button></div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex-1 rounded-full bg-whats px-3 py-2 text-center font-extrabold text-white">WhatsApp</a>}
            <button onClick={() => imprimir(p)} className="flex-1 rounded-full bg-roxo/10 px-3 py-2 font-extrabold text-roxo">Imprimir</button>
            {pode.cancelar && p.status !== "cancelado" && <button onClick={() => setCancelando(true)} className="rounded-full bg-red-50 px-3 py-2 font-extrabold text-red-700">Cancelar</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pedidos de um dia anterior, com os totais do dia. */
function Historico({ pode, onAtualizar, entregadores }: { pode: Permissoes; onAtualizar: Atualizar; entregadores: string[] }) {
  const [dia, setDia] = useState(ontem());
  const [lista, setLista] = useState<PedidoBalcao[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async (d: string) => {
    setLista(null); setErro("");
    const ini = new Date(`${d}T00:00:00-03:00`).toISOString(), fim = new Date(new Date(`${d}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
    const { data, error } = await supabaseNavegador().from("orders").select(CAMPOS).gte("created_at", ini).lt("created_at", fim).neq("status", "aguardando_pagamento").order("numero", { ascending: true }).limit(1000);
    if (error) return setErro("Não foi possível carregar: " + error.message);
    setLista((data ?? []) as unknown as PedidoBalcao[]);
  }, []);
  useEffect(() => { carregar(dia); }, [dia, carregar]);
  const atualizarAqui: Atualizar = (p, c) => { setLista((l) => l?.map((x) => (x.id === p.id ? { ...x, ...c } : x)) ?? l); onAtualizar(p, c); };

  const validos = (lista ?? []).filter((p) => p.status !== "cancelado");
  const total = validos.reduce((s, p) => s + Number(p.total), 0);
  const entregas = validos.filter((p) => p.tipo === "entrega");
  const taxas = entregas.reduce((s, p) => s + Number(p.taxa_entrega), 0);
  const aReceber = validos.filter((p) => !p.pago).reduce((s, p) => s + Number(p.total), 0);
  const dataBr = dia.split("-").reverse().join("/");

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setDia(diaSousa(new Date(new Date(`${dia}T12:00:00-03:00`).getTime() - 86_400_000)))} className="rounded-full bg-white px-3 py-2 font-extrabold text-roxo" aria-label="Dia anterior">←</button>
        <input type="date" aria-label="Dia" className="campo !w-auto !py-1.5" value={dia} max={diaSousa()} onChange={(e) => e.target.value && setDia(e.target.value)} />
        <button disabled={dia >= diaSousa()} onClick={() => setDia(diaSousa(new Date(new Date(`${dia}T12:00:00-03:00`).getTime() + 86_400_000)))} className="rounded-full bg-white px-3 py-2 font-extrabold text-roxo disabled:opacity-40" aria-label="Próximo dia">→</button>
        {pode.relatorios && <Link href="/balcao/painel" className="ml-auto text-sm font-bold text-roxo underline">Relatório completo no Painel →</Link>}
      </div>
      {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}
      {!lista ? <p className="py-8 text-center font-semibold text-roxo/60">Carregando…</p> : <>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Resumo rotulo={`Vendido em ${dataBr}`} valor={brl(total)} />
          <Resumo rotulo="Pedidos" valor={String(validos.length)} />
          <Resumo rotulo={`Entregas (taxas ${brl(taxas)})`} valor={String(entregas.length)} />
          <Resumo rotulo="Ficou a receber" valor={brl(aReceber)} />
        </div>
        {!lista.length ? <p className="py-8 text-center font-semibold text-roxo/60">Nenhum pedido em {dataBr}.</p>
          : <ListaPedidos lista={lista} aberto={aberto} setAberto={setAberto} onAtualizar={atualizarAqui} pode={pode} entregadores={entregadores} />}
      </>}
    </div>
  );
}

/** Largura do papel da impressora deste computador (fica salva no navegador). */
function SeletorPapel() {
  const [papel, setPapel] = useState<Papel>(58);
  useEffect(() => setPapel(papelSalvo()), []);
  return (
    <label className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 font-bold" title="Largura do papel da impressora térmica">
      🖨️
      <select aria-label="Largura do papel da impressora" className="bg-transparent font-bold outline-none [&>option]:text-black" value={papel} onChange={(e) => { const v = Number(e.target.value) as Papel; setPapel(v); salvarPapel(v); }}>
        <option value={58}>58 mm</option>
        <option value={80}>80 mm</option>
      </select>
    </label>
  );
}
