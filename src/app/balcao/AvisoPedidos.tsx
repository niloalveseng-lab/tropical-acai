"use client";
/**
 * Aviso de pedido novo nas outras telas do balcão (Caixa, Painel, Equipe).
 * A tela de Pedidos já tem o próprio aviso; aqui é para quem está vendendo no Caixa
 * não perder um pedido do site/WhatsApp. Toca o mesmo som configurado em 🔔 Som.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { lerConfigSom, tocarTom } from "@/lib/pedidos/som";

type Novo = { id: string; numero: number; cliente_nome: string | null; canal: string };

export default function AvisoPedidos() {
  const rota = usePathname();
  const ativo = !!process.env.NEXT_PUBLIC_SUPABASE_URL && rota !== "/balcao";
  const [novos, setNovos] = useState<Novo[]>([]);
  const vistos = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const emCurso = useRef(false);

  const tocar = useCallback(() => {
    const c = lerConfigSom();
    if (!c.ligado) return;
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state !== "running") audio.current.resume().catch(() => {});
      tocarTom(audio.current, c.tom, c.volume);
    } catch { /* navegador sem áudio */ }
  }, []);

  const conferir = useCallback(async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      const { data, error } = await supabaseNavegador().from("orders").select("id,numero,cliente_nome,canal")
        .eq("status", "novo").order("created_at").limit(20).abortSignal(AbortSignal.timeout(15_000));
      if (error || !data) return;
      const lista = data as Novo[];
      if (vistos.current && lista.some((p) => !vistos.current!.has(p.id))) tocar();
      vistos.current = new Set(lista.map((p) => p.id));
      setNovos(lista);
    } catch { /* tenta de novo na próxima */ } finally { emCurso.current = false; }
  }, [tocar]);

  useEffect(() => {
    if (!ativo) return;
    let canal: ReturnType<ReturnType<typeof supabaseNavegador>["channel"]> | null = null;
    let aviso: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const { data } = await supabaseNavegador().auth.getSession();
      if (!data.session) return; // fora do login (ex.: tela de entrar)
      conferir();
      canal = supabaseNavegador().channel("aviso-pedidos-" + Date.now())
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { clearTimeout(aviso); aviso = setTimeout(conferir, 400); })
        .subscribe();
    })();
    const t = setInterval(conferir, 30_000);
    const voltou = () => document.visibilityState === "visible" && conferir();
    // O navegador só libera som depois de um toque na página.
    const liberar = () => { try { audio.current ??= new AudioContext(); audio.current.resume().catch(() => {}); } catch { /* sem áudio */ } };
    document.addEventListener("visibilitychange", voltou);
    window.addEventListener("pointerdown", liberar, { once: true });
    return () => {
      clearInterval(t); clearTimeout(aviso);
      if (canal) supabaseNavegador().removeChannel(canal);
      document.removeEventListener("visibilitychange", voltou);
      window.removeEventListener("pointerdown", liberar);
    };
  }, [ativo, conferir]);

  // Repete o som enquanto houver pedido sem aceitar (mesmo intervalo da tela de Pedidos).
  useEffect(() => {
    const c = lerConfigSom();
    if (!ativo || !novos.length || !c.ligado || !c.repetir) return;
    const t = setInterval(tocar, c.repetir * 1000);
    return () => clearInterval(t);
  }, [ativo, novos.length, tocar]);

  if (!ativo || !novos.length) return null;
  const p = novos[novos.length - 1];
  return (
    <Link href="/balcao" role="alert" className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl animate-pulse items-center gap-3 rounded-2xl bg-amber-400 px-4 py-3 font-extrabold text-amber-950 shadow-2xl ring-4 ring-amber-200">
      <span className="text-2xl">🔔</span>
      <span className="flex-1">{novos.length > 1 ? `${novos.length} pedidos novos` : "Pedido novo"} · #{p.numero}{p.cliente_nome ? ` · ${p.cliente_nome}` : ""}<span className="block text-xs font-bold">Toque para abrir os pedidos e aceitar</span></span>
      <span className="rounded-full bg-amber-950 px-3 py-1.5 text-sm text-white">Ver →</span>
    </Link>
  );
}
