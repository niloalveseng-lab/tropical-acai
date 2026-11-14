"use client";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Cardapio, ProdutoLoja } from "@/lib/cardapio";
import { saudacao, statusLoja, type StatusLoja } from "@/lib/horario";
import { agoraSousa, promoDisponivel, type CartItem } from "@/lib/pricing";
import { Folha } from "./Folha";
import { Montador } from "./Montador";
import { ProdutoFolha } from "./ProdutoFolha";
import { Sacola, type LinhaSacola } from "./Sacola";
import { brl, gravar, ler } from "./util";

const DIAS3 = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
type Aberto = { tipo: "acai"; emb: "Copo" | "Pote" } | { tipo: "produto"; produto: ProdutoLoja } | { tipo: "sacola" } | null;
const novoId = () => Math.random().toString(36).slice(2, 10);

function Cartao({ nome, descricao, preco, imagem, esgotado, onClick }: { nome: string; descricao?: string | null; preco: string; imagem: string | null; esgotado?: boolean; onClick: () => void }) {
  return (
    <motion.button type="button" disabled={esgotado} onClick={onClick} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-roxo/10 bg-white text-left shadow-sm disabled:opacity-55">
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-roxo/15 to-lima/25">
        {imagem ? <Image src={imagem} alt="" fill sizes="(max-width:640px) 50vw, 25vw" className="object-cover" />
          : <svg viewBox="0 0 48 48" aria-hidden="true" className="absolute inset-0 m-auto h-14 w-14 text-roxo/45"><rect x="14" y="5" width="20" height="28" rx="9" fill="currentColor" /><rect x="22" y="33" width="4" height="11" rx="2" fill="currentColor" /></svg>}
        {esgotado && <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold">Esgotado hoje</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <span className="font-bold leading-tight">{nome}</span>
        {descricao && <span className="text-xs text-roxo/70">{descricao}</span>}
        <span className="mt-auto pt-1 font-extrabold text-roxo">{preco}</span>
      </div>
    </motion.button>
  );
}

export function Loja({ cardapio, children }: { cardapio: Cardapio; children?: React.ReactNode }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<LinhaSacola[]>([]);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [st, setSt] = useState<(StatusLoja & { hora: number; dia: number; data: string }) | null>(null);
  const [ultimo, setUltimo] = useState<{ codigo: string; itens: CartItem[] } | null>(null);
  const [aviso, setAviso] = useState("");
  const [pulso, setPulso] = useState(0);

  useEffect(() => {
    setLinhas(ler<LinhaSacola[]>("sacola", []));
    setUltimo(ler<{ codigo: string; itens: CartItem[] } | null>("ultimo", null));
    const tick = () => { const a = agoraSousa(); setSt({ ...statusLoja(cardapio.loja.horarios, a), hora: a.hora, dia: a.diaSemana, data: a.data }); };
    tick(); const t = setInterval(tick, 60_000); return () => clearInterval(t);
  }, [cardapio.loja.horarios]);
  const salvar = (v: LinhaSacola[]) => { setLinhas(v); gravar("sacola", v); };
  const fechar = useCallback(() => setAberto(null), []);

  function adicionar(item: CartItem, nome: string) {
    salvar([...linhas, { id: novoId(), item }]);
    setAberto(null); setPulso((p) => p + 1); setAviso(`${nome} na sacola`);
    setTimeout(() => setAviso(""), 2200);
  }
  const qtdTotal = linhas.reduce((s, l) => s + l.item.qtd, 0);
  const promo = cardapio.promos.find((p) => p.ativo);
  const promoOk = !!promo && !!st && promoDisponivel(promo, { diaSemana: st.dia, hora: st.hora, data: st.data });
  const menor = (e: string) => Math.min(...cardapio.sizes.filter((s) => s.ativo && s.embalagem === e).map((s) => s.preco));
  const secoes = cardapio.categorias.map((c) => ({ ...c, itens: cardapio.products.filter((p) => p.ativo && p.category_id === c.id) })).filter((s) => s.itens.length);
  const abrirProduto = (p: ProdutoLoja) => p.kind === "simples" ? adicionar({ tipo: "produto", productId: p.id, qtd: 1 }, p.nome) : setAberto({ tipo: "produto", produto: p });

  return (
    <MotionConfig reducedMotion="user">
      <header className="sticky top-0 z-30 bg-roxo text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={116} height={48} priority />
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${st?.aberta ? "bg-lima text-roxo-escuro" : "bg-white/15"}`} aria-live="polite">{st?.texto ?? "Carregando horário…"}</span>
          <motion.button key={pulso} type="button" onClick={() => setAberto({ tipo: "sacola" })} initial={pulso ? { scale: 1.25 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}
            className="ml-auto flex min-h-[44px] items-center gap-2 rounded-full bg-lima px-4 font-extrabold text-roxo-escuro" aria-label={`Abrir sacola, ${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}`}>
            Sacola{qtdTotal > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-roxo px-1.5 text-xs text-white">{qtdTotal}</span>}
          </motion.button>
        </div>
        <nav aria-label="Categorias" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 text-sm font-bold [scrollbar-width:none]">
          {[{ id: "acai", nome: "Açaí" }, ...secoes].map((s) => <a key={s.id} href={`#${s.id}`} className="whitespace-nowrap rounded-full px-3 py-1.5 text-white/85 hover:bg-white/15">{s.nome}</a>)}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28">
        <section className="pt-6">
          <p className="text-sm font-bold text-roxo/70">{st ? saudacao(st.hora) : "Olá"}! Qual vai ser hoje?</p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Monte o seu <span className="font-script font-normal text-lima-tinta">açaí</span> do seu jeito</h1>
          {ultimo && linhas.length === 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
              <p className="min-w-0 flex-1 text-sm font-semibold">Quer repetir o último pedido?</p>
              <button className="rounded-full bg-roxo px-4 py-2 text-sm font-extrabold text-white" onClick={() => { salvar(ultimo.itens.map((item) => ({ id: novoId(), item }))); setAberto({ tipo: "sacola" }); }}>Pedir de novo</button>
              <a className="text-sm font-bold text-roxo underline underline-offset-4" href={`/pedido/${ultimo.codigo}`}>Ver pedido</a>
            </div>)}
        </section>

        {promo && (
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid overflow-hidden rounded-3xl bg-roxo text-white sm:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col justify-center gap-2 p-5 sm:p-7">
              <span className="w-fit rounded-full bg-lima px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-roxo-escuro">Promoção</span>
              <h2 className="text-2xl font-extrabold">{promo.nome}</h2>
              <p className="text-white/85">{promo.tamanho} com {promo.composicao.join(", ")}.</p>
              <p className="flex items-baseline gap-3"><span className="text-3xl font-extrabold">{brl(promo.preco)}</span><span className="text-sm text-white/75">{promo.dias_semana.map((d) => DIAS3[d]).join(" · ")}</span></p>
              <button type="button" disabled={!promoOk} onClick={() => adicionar({ tipo: "promo", promoId: promo.id, qtd: 1 }, promo.nome)} className="botao-lima mt-1 w-fit disabled:bg-white/15 disabled:text-white">
                {promoOk ? "Quero esse" : `Disponível de ${DIAS3[Math.min(...promo.dias_semana)]} a ${DIAS3[Math.max(...promo.dias_semana)]}`}
              </button>
            </div>
            <div className="relative min-h-[190px]"><Image src="/img/promo.jpg" alt="" fill sizes="(max-width:640px) 100vw, 480px" className="object-cover" /></div>
          </motion.section>)}

        {children /* mais pedidos (servidor) */}

        <section id="acai" className="scroll-mt-28 pt-10">
          <h2 className="text-2xl font-extrabold">Açaí</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cartao nome="Açaí no Copo" descricao="300, 400 ou 500 ml" preco={`a partir de ${brl(menor("Copo"))}`} imagem={cardapio.imagens.Copo} onClick={() => setAberto({ tipo: "acai", emb: "Copo" })} />
            <Cartao nome="Açaí no Pote" descricao="300 ml a 1 litro" preco={`a partir de ${brl(menor("Pote"))}`} imagem={cardapio.imagens.Pote} onClick={() => setAberto({ tipo: "acai", emb: "Pote" })} />
          </div>
        </section>

        {secoes.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-28 pt-10">
            <h2 className="text-2xl font-extrabold">{s.nome}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {s.itens.map((p) => <Cartao key={p.id} nome={p.nome} descricao={p.descricao} imagem={p.imagem} esgotado={!!st && p.esgotado_em === st.data}
                preco={p.kind === "simples" ? brl(p.preco ?? 0) : `a partir de ${brl(Math.min(...(p.tamanhos ?? []).map((t) => t.preco)))}`} onClick={() => abrirProduto(p)} />)}
            </div>
          </section>))}
      </main>

      <Folha aberta={aberto?.tipo === "acai"} onFechar={fechar} titulo="Monte seu açaí" larga>
        {aberto?.tipo === "acai" && <Montador cardapio={cardapio} embalagemInicial={aberto.emb} onAdicionar={(i) => adicionar(i, "Açaí")} />}
      </Folha>
      <Folha aberta={aberto?.tipo === "produto"} onFechar={fechar} titulo={aberto?.tipo === "produto" ? aberto.produto.nome : ""}>
        {aberto?.tipo === "produto" && <ProdutoFolha cardapio={cardapio} produto={aberto.produto} onAdicionar={(i) => adicionar(i, aberto.produto.nome)} />}
      </Folha>
      <Folha aberta={aberto?.tipo === "sacola"} onFechar={fechar} titulo="Sua sacola">
        <Sacola cardapio={cardapio} linhas={linhas}
          onQtd={(id, qtd) => salvar(linhas.map((l) => (l.id === id ? { ...l, item: { ...l.item, qtd } as CartItem } : l)))}
          onRemover={(id) => salvar(linhas.filter((l) => l.id !== id))}
          onEnviado={(codigo) => { salvar([]); router.push(`/pedido/${codigo}`); }} />
      </Folha>

      <AnimatePresence>
        {aviso && <motion.div role="status" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-roxo-escuro px-5 py-3 text-sm font-bold text-white shadow-xl">✓ {aviso}</motion.div>}
      </AnimatePresence>
      {aberto === null && linhas.length > 0 && (
        <motion.button initial={{ y: 80 }} animate={{ y: 0 }} type="button" onClick={() => setAberto({ tipo: "sacola" })}
          className="botao-lima fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md shadow-xl sm:hidden">Ver sacola · {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}</motion.button>)}
    </MotionConfig>
  );
}
