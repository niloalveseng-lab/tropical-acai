"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabaseNavegador } from "@/lib/supabase/client";
import { emAberto, proximo, ROTULO, type Status } from "@/lib/pedidos/status";
import { brl, hora, linkMapa, linkWhatsApp, PAGAMENTO, textoComanda, type PedidoBalcao } from "@/lib/pedidos/comanda";

const CAMPOS = "id,numero,codigo,canal,status,tipo,cliente_nome,cliente_telefone,endereco,bairro,entrega_lat,entrega_lng,distancia_km,subtotal,taxa_entrega,total,forma_pagamento,pago,troco_para,observacao,motivo_cancelamento,created_at,updated_at,order_items(nome,descricao,quantidade,total,detalhes)";

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

export default function Balcao() {
  const router = useRouter();
  const sb = supabaseNavegador;
  const [eu, setEu] = useState<{ id: string; email: string; funcao: string } | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoBalcao[]>([]);
  const [aba, setAba] = useState<"abertos" | "concluidos">("abertos");
  const [conexao, setConexao] = useState<"ok" | "caiu" | "...">("...");
  const [som, setSom] = useState(false);
  const [erro, setErro] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb().from("orders").select(CAMPOS)
      .or(`status.in.(novo,preparo,pronto,saiu),created_at.gte.${inicioDoDia()}`)
      .neq("status", "aguardando_pagamento")
      .order("created_at", { ascending: false }).limit(200);
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

  // Login e função
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) return router.replace("/entrar");
      const { data: funcao } = await sb().rpc("minha_funcao");
      if (!funcao) return setSemAcesso(true);
      setEu({ id: user.id, email: user.email ?? "", funcao: funcao as string });
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

  async function atualizar(p: PedidoBalcao, campos: Partial<Pick<PedidoBalcao, "status" | "pago" | "motivo_cancelamento">>) {
    setPedidos((l) => l.map((x) => (x.id === p.id ? { ...x, ...campos } : x)));
    const { error } = await sb().from("orders").update({ ...campos, operador: eu!.id, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) { setErro("Não foi possível atualizar o pedido #" + p.numero + ": " + error.message); carregar(); }
  }

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

  const lista = pedidos.filter((p) => (aba === "abertos" ? emAberto(p.status) : !emAberto(p.status)));
  // Abertos: os mais antigos primeiro (fila). Concluídos: os mais recentes primeiro.
  if (aba === "abertos") lista.reverse();
  const hoje = pedidos.filter((p) => p.created_at >= inicioDoDia() && p.status !== "cancelado");
  const faturado = hoje.reduce((s, p) => s + Number(p.total), 0);

  return (
    <main className="min-h-dvh bg-creme pb-16">
      <header className="sticky top-0 z-30 bg-roxo text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={92} height={38} />
          <span className="hidden text-sm font-bold opacity-80 sm:inline">Balcão</span>
          <span title={conexao === "ok" ? "Recebendo pedidos ao vivo" : "Reconectando — conferindo a cada 30 s"} className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${conexao === "ok" ? "bg-lima text-roxo-escuro" : "bg-amber-300 text-amber-950"}`}>
            <span className={`h-2 w-2 rounded-full ${conexao === "ok" ? "animate-pulse bg-roxo-escuro" : "bg-amber-800"}`} />{conexao === "ok" ? "Ao vivo" : "Reconectando"}
          </span>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {eu.funcao === "dono" && <Link href="/balcao/equipe" className="rounded-full bg-white/15 px-3 py-1.5 font-bold hover:bg-white/25">Equipe</Link>}
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

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Resumo rotulo="Novos" valor={String(novos)} destaque={novos > 0} />
          <Resumo rotulo="Pedidos hoje" valor={String(hoje.length)} />
          <Resumo rotulo="Vendido hoje" valor={brl(faturado)} />
        </div>

        <div role="tablist" className="mt-4 flex gap-2">
          {([["abertos", "Em andamento"], ["concluidos", "Concluídos hoje"]] as const).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`rounded-full px-4 py-2 text-sm font-extrabold ${aba === k ? "bg-roxo text-white" : "bg-white text-roxo"}`}>{v}</button>
          ))}
        </div>

        {!lista.length && <p className="mt-10 text-center font-semibold text-roxo/60">{aba === "abertos" ? "Nenhum pedido em andamento. Os novos aparecem aqui sozinhos." : "Nenhum pedido concluído hoje."}</p>}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {lista.map((p) => <Cartao key={p.id} p={p} onAtualizar={atualizar} />)}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return <div className={`rounded-2xl p-3 ${destaque ? "animate-pulse bg-amber-400 text-amber-950" : "bg-white text-roxo"}`}><div className="text-xl font-extrabold">{valor}</div><div className="text-xs font-bold opacity-70">{rotulo}</div></div>;
}

function imprimir(p: PedidoBalcao) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  w.document.write(`<html><head><title>Pedido #${p.numero}</title><style>@page{size:80mm auto;margin:3mm}body{font:13px/1.35 monospace;white-space:pre-wrap;margin:0}</style></head><body>${esc(textoComanda(p))}</body></html>`);
  w.document.close(); w.focus(); w.print();
}

function Cartao({ p, onAtualizar }: { p: PedidoBalcao; onAtualizar: (p: PedidoBalcao, c: Partial<Pick<PedidoBalcao, "status" | "pago" | "motivo_cancelamento">>) => void }) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const prox = proximo(p.status, p.tipo);
  const wa = linkWhatsApp(p), mapa = p.tipo === "entrega" ? linkMapa(p) : null;
  const minutos = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 60000);

  return (
    <motion.article layout initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}
      className={`flex flex-col rounded-3xl bg-white p-4 shadow-sm ring-2 ${p.status === "novo" ? "ring-amber-400" : "ring-transparent"}`}>
      <div className="flex items-start gap-2">
        <div>
          <div className="text-2xl font-extrabold text-roxo">#{p.numero}</div>
          <div className="text-xs font-semibold text-roxo/60">{hora(p.created_at)}{emAberto(p.status) && ` · há ${minutos < 60 ? minutos + " min" : Math.floor(minutos / 60) + " h"}`} · {p.canal === "site" ? "Site" : p.canal}</div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${COR[p.status]}`}>{ROTULO[p.status]}</span>
          <span className="rounded-full bg-roxo/10 px-2.5 py-1 text-xs font-extrabold text-roxo">{p.tipo === "entrega" ? `🛵 Entrega${p.distancia_km != null ? ` · ${Number(p.distancia_km).toFixed(1).replace(".", ",")} km` : ""}` : p.tipo === "retirada" ? "🏪 Retirada" : "Balcão"}</span>
        </div>
      </div>

      <div className="mt-3 font-bold">{p.cliente_nome}</div>
      {p.observacao && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{p.observacao}</p>}

      <ul className="mt-3 space-y-2 border-y border-roxo/10 py-3 text-sm">
        {p.order_items.map((i, k) => (
          <li key={k}>
            <div className="flex gap-2 font-bold"><span>{i.quantidade}×</span><span className="flex-1">{i.nome}</span><span>{brl(i.total)}</span></div>
            {i.descricao && <div className="pl-6 text-roxo/70">{i.descricao}</div>}
            {i.detalhes?.obs && <div className="ml-6 mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">OBS: {i.detalhes.obs}</div>}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1 text-sm">
        {Number(p.taxa_entrega) > 0 && <div className="flex justify-between text-roxo/70"><span>Taxa de entrega</span><span>{brl(p.taxa_entrega)}</span></div>}
        <div className="flex justify-between text-base font-extrabold"><span>Total</span><span>{brl(p.total)}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento}</span>
          {p.troco_para && <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-900">Troco p/ {brl(p.troco_para)} → levar {brl(Number(p.troco_para) - Number(p.total))}</span>}
          <button onClick={() => onAtualizar(p, { pago: !p.pago })} className={`ml-auto rounded-full px-2.5 py-1 text-xs font-extrabold ${p.pago ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{p.pago ? "✓ Pago" : "Marcar pago"}</button>
        </div>
      </div>

      {p.tipo === "entrega" && (p.endereco || p.bairro) && (
        <div className="mt-3 rounded-xl bg-creme p-2.5 text-sm">
          <div className="font-semibold">{p.endereco}</div>
          {p.bairro && <div className="text-roxo/70">{p.bairro}</div>}
          {mapa && <a href={mapa} target="_blank" rel="noreferrer" className="mt-1 inline-block font-bold text-roxo underline">Abrir no mapa ↗</a>}
        </div>
      )}
      {p.status === "cancelado" && p.motivo_cancelamento && <p className="mt-3 text-sm text-red-800">Motivo: {p.motivo_cancelamento}</p>}

      <div className="mt-auto pt-4">
        {cancelando ? (
          <form onSubmit={(e) => { e.preventDefault(); if (motivo.trim()) { onAtualizar(p, { status: "cancelado", motivo_cancelamento: motivo.trim() }); setCancelando(false); } }} className="space-y-2">
            <input autoFocus className="campo" placeholder="Motivo do cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <div className="flex gap-2"><button className="botao flex-1 !bg-red-700">Confirmar cancelamento</button><button type="button" onClick={() => setCancelando(false)} className="rounded-full bg-gray-100 px-4 font-bold">Voltar</button></div>
          </form>
        ) : (
          <div className="space-y-2">
            {prox && <button onClick={() => onAtualizar(p, { status: prox.status })} className={`w-full ${p.status === "novo" ? "botao-lima" : "botao"}`}>{prox.acao}</button>}
            <div className="flex flex-wrap gap-2 text-sm">
              {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex-1 rounded-full bg-whats px-3 py-2 text-center font-extrabold text-white">WhatsApp</a>}
              <button onClick={() => imprimir(p)} className="flex-1 rounded-full bg-roxo/10 px-3 py-2 font-extrabold text-roxo">Imprimir</button>
              {emAberto(p.status) && <button onClick={() => setCancelando(true)} className="rounded-full bg-red-50 px-3 py-2 font-extrabold text-red-700">Cancelar</button>}
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
