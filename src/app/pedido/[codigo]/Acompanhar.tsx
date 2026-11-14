"use client";
import { motion, MotionConfig } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PedidoPublico } from "@/lib/pedidos/repo";
import { brl } from "@/components/loja/util";

const PAG: Record<string, string> = { pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro", pix_online: "PIX (pago online)", cartao_online: "Cartão (pago online)" };

export function Acompanhar({ inicial, whatsapp }: { inicial: PedidoPublico; whatsapp: string }) {
  const [p, setP] = useState(inicial);
  const fim = p.status === "entregue" || p.status === "cancelado";
  useEffect(() => {
    if (fim) return;
    const t = setInterval(async () => {
      try { const r = await fetch(`/api/pedidos/${p.codigo}`, { cache: "no-store" }); if (r.ok) setP((await r.json()).pedido); } catch { /* tenta de novo no próximo ciclo */ }
    }, 6000);
    return () => clearInterval(t);
  }, [p.codigo, fim]);

  const passos = ["Recebido", "Em preparo", p.tipo === "entrega" ? "Saiu para entrega" : "Pronto para retirar", "Entregue"];
  const atual = { novo: 0, preparo: 1, pronto: 2, saiu: 2, entregue: 3, cancelado: -1 }[p.status];
  const msg = `Olá! Sou ${p.primeiroNome}, pedido #${p.numero} feito pelo site.`;

  return (
    <MotionConfig reducedMotion="user">
      <header className="bg-roxo"><div className="mx-auto flex max-w-xl items-center px-4 py-3"><Link href="/"><Image src="/img/logo.png" alt="Tropical Açaí — voltar ao cardápio" width={116} height={48} priority /></Link></div></header>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-roxo/70">Pedido #{p.numero}</p>
          <h1 className="mt-1 text-2xl font-extrabold" aria-live="polite">
            {p.status === "cancelado" ? "Pedido cancelado" : atual === 3 ? `Bom apetite, ${p.primeiroNome}!` : `Recebemos seu pedido, ${p.primeiroNome}!`}
          </h1>
          {p.agendado && atual === 0 && <p className="mt-2 text-sm font-semibold text-roxo/80">A loja está fechada agora. Começamos a preparar assim que abrir.</p>}
          {p.status === "cancelado" && <p className="mt-2 text-sm text-roxo/80">Fale com a gente no WhatsApp para entender o que houve.</p>}
        </motion.div>

        {p.status !== "cancelado" && (
          <ol className="rounded-3xl bg-white p-5 shadow-sm">
            {passos.map((nome, i) => { const feito = i <= atual, agora = i === atual; return (
              <li key={nome} className="relative flex gap-4 pb-6 last:pb-0">
                {i < passos.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 bg-roxo/15"><motion.span className="block w-full bg-lima" initial={false} animate={{ height: i < atual ? "100%" : "0%" }} transition={{ duration: 0.5 }} /></span>}
                <motion.span initial={false} animate={{ scale: agora ? [1, 1.18, 1] : 1, backgroundColor: feito ? "#9ACD1F" : "#E7DDEF" }} transition={agora && atual < 3 ? { scale: { repeat: Infinity, duration: 1.6 } } : {}}
                  className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold text-roxo-escuro">{feito ? "✓" : i + 1}</motion.span>
                <span className={`pt-1 ${feito ? "font-extrabold" : "text-roxo/60"}`}>{nome}{agora && atual < 3 && <span className="ml-2 text-xs font-bold text-lima-tinta">agora</span>}</span>
              </li>); })}
          </ol>)}

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-roxo/70">Seu pedido</h2>
          <ul className="mt-2 divide-y divide-roxo/10">
            {p.itens.map((i, k) => <li key={k} className="flex gap-3 py-2.5"><div className="min-w-0 flex-1"><p className="font-bold">{i.qtd}× {i.nome}</p>{i.descricao && <p className="text-sm text-roxo/70">{i.descricao}</p>}</div><p className="font-bold tabular-nums">{brl(i.total)}</p></li>)}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-roxo/10 pt-3 text-sm">
            {p.taxaEntrega > 0 && <div className="flex justify-between"><dt>Entrega</dt><dd className="tabular-nums">{brl(p.taxaEntrega)}</dd></div>}
            <div className="flex justify-between text-lg font-extrabold"><dt>Total</dt><dd className="tabular-nums">{brl(p.total)}</dd></div>
            <div className="flex justify-between text-roxo/70"><dt>{p.tipo === "entrega" ? "Entrega" : "Retirada no balcão"}</dt><dd>{PAG[p.pagamento] ?? p.pagamento}</dd></div>
          </dl>
        </section>

        <a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="botao w-full bg-whats">Falar no WhatsApp sobre este pedido</a>
        <Link href="/" className="block text-center text-sm font-bold text-roxo underline underline-offset-4">Voltar ao cardápio</Link>
      </main>
    </MotionConfig>
  );
}
