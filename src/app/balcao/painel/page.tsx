"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEquipe } from "@/lib/equipe/useEquipe";
import { carregarDados, type Aviso, type Dados } from "./comum";
import Esgotado from "./Esgotado";
import Cardapio from "./Cardapio";
import LojaConfig from "./LojaConfig";
import Relatorios from "./Relatorios";

const ABAS = [
  { id: "esgotado", nome: "Esgotado hoje", gerente: false },
  { id: "cardapio", nome: "Cardápio e preços", gerente: true },
  { id: "loja", nome: "Loja e entrega", gerente: true },
  { id: "relatorios", nome: "Relatórios", gerente: true },
] as const;

export default function Painel() {
  const eu = useEquipe();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("esgotado");
  const [dados, setDados] = useState<Dados | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const avisar: Aviso = useCallback((tipo, texto) => {
    setAviso({ tipo, texto }); clearTimeout(timer.current);
    if (tipo === "ok") timer.current = setTimeout(() => setAviso(null), 2500);
  }, []);
  const recarregar = useCallback(() => carregarDados().then(setDados, (e) => avisar("erro", (e as Error).message)), [avisar]);
  useEffect(() => { if (eu) recarregar(); }, [eu, recarregar]);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <main className="grid min-h-dvh place-items-center p-6 text-center">O painel precisa do banco de dados (Supabase) configurado.</main>;
  if (!eu || !dados) return <main className="grid min-h-dvh place-items-center text-roxo">{aviso?.texto ?? "Carregando…"}</main>;
  const gerente = eu.funcao !== "atendente";
  const abas = ABAS.filter((a) => gerente || !a.gerente);

  return (
    <main className="min-h-dvh bg-creme pb-24">
      <header className="sticky top-0 z-30 bg-roxo text-white shadow-lg">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={92} height={38} />
          <span className="font-extrabold">Painel</span>
          <div className="ml-auto flex gap-2">
            <Link href="/balcao" className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Pedidos</Link>
            <Link href="/balcao/caixa" className="rounded-full bg-white/15 px-3 py-1.5 font-bold">Caixa</Link>
            <Link href="/" target="_blank" className="rounded-full bg-lima px-3 py-1.5 font-extrabold text-roxo-escuro">Ver site ↗</Link>
          </div>
        </div>
        <div role="tablist" className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3">
          {abas.map((a) => <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${aba === a.id ? "bg-white text-roxo" : "bg-white/15 text-white"}`}>{a.nome}</button>)}
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        {aba === "esgotado" && <Esgotado dados={dados} avisar={avisar} recarregar={recarregar} />}
        {aba === "cardapio" && gerente && <Cardapio dados={dados} avisar={avisar} recarregar={recarregar} />}
        {aba === "loja" && gerente && <LojaConfig dados={dados} avisar={avisar} recarregar={recarregar} />}
        {aba === "relatorios" && gerente && <Relatorios avisar={avisar} />}
      </div>

      {aviso && (
        <div role="status" className={`fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl ${aviso.tipo === "erro" ? "bg-red-700 text-white" : "bg-roxo text-white"}`}>
          <span className="flex-1">{aviso.tipo === "ok" ? "✓ " : ""}{aviso.texto}</span>
          {aviso.tipo === "erro" && <button onClick={() => setAviso(null)} aria-label="Fechar aviso" className="text-lg">×</button>}
        </div>
      )}
    </main>
  );
}
