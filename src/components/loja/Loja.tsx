"use client";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Cardapio, ProdutoLoja } from "@/lib/cardapio";
import { saudacao, statusLoja, type StatusLoja } from "@/lib/horario";
import type { Vendido } from "@/lib/loja";
import { agoraSousa, promoDisponivel, type CartItem } from "@/lib/pricing";
import { Folha } from "./Folha";
import { Montador } from "./Montador";
import { ProdutoFolha } from "./ProdutoFolha";
import { Sacola, type LinhaSacola } from "./Sacola";
import { brl, gravar, ler } from "./util";

const DIAS3 = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
type Aberto = { tipo: "acai"; emb: "Copo" | "Pote"; sizeId?: string } | { tipo: "produto"; produto: ProdutoLoja } | { tipo: "sacola" } | null;
const novoId = () => Math.random().toString(36).slice(2, 10);
const css = (v: Record<string, string>) => v as React.CSSProperties;

/** Fotos locais para os "mais pedidos" que não têm foto própria no cardápio. */
const FOTOS: [RegExp, string][] = [
  [/^Copo Promocional/i, "/img/promo.jpg"], [/^Açaí Copo/i, "/img/acai_copo.jpg"], [/^Açaí Pote/i, "/img/acai_pote.jpg"],
  [/^Batida/i, "/img/batida.jpg"], [/^Milkshake/i, "/img/milkshake.jpg"], [/^Sorvete/i, "/img/cascao.jpg"],
  [/^Picolé Açaí/i, "/img/pic_acai.jpg"], [/^Picolé Coco/i, "/img/pic_coco.jpg"], [/^Picolé Brownie/i, "/img/pic_brownie.jpg"],
];

function Foto({ src, sizes, className = "" }: { src: string | null; sizes: string; className?: string }) {
  return src ? <Image src={src} alt="" fill sizes={sizes} className={`object-cover ${className}`} />
    : <svg viewBox="0 0 48 48" aria-hidden="true" className="absolute inset-0 m-auto h-12 w-12 text-roxo/35"><rect x="14" y="5" width="20" height="28" rx="9" fill="currentColor" /><rect x="22" y="33" width="4" height="11" rx="2" fill="currentColor" /></svg>;
}

/** Cartão médio (produtos com opções: batida, milkshake, sorvete). */
function Cartao({ nome, descricao, preco, imagem, esgotado, onClick }: { nome: string; descricao?: string | null; preco: string; imagem: string | null; esgotado?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={esgotado} onClick={onClick}
      className="levanta pressionavel sombra-suave flex flex-col overflow-hidden rounded-[22px] bg-white text-left disabled:opacity-55">
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-roxo/10 to-lima/20">
        <Foto src={imagem} sizes="(max-width:640px) 50vw, 25vw" />
        {esgotado && <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold">Esgotado hoje</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3.5">
        <span className="font-bold leading-tight tracking-[-0.01em]">{nome}</span>
        {descricao && <span className="text-xs text-roxo/65">{descricao}</span>}
        <span className="mt-auto pt-1.5 text-sm font-extrabold tabular-nums text-roxo">{preco}</span>
      </div>
    </button>
  );
}

/** Cartão largo: categoria com um único produto (batida, milkshake, cascão) ocupa a linha inteira. */
function CartaoLargo({ p, esgotado, preco, onClick }: { p: ProdutoLoja; esgotado: boolean; preco: string; onClick: () => void }) {
  return (
    <button type="button" disabled={esgotado} onClick={onClick}
      className="levanta pressionavel sombra-suave mt-4 grid w-full grid-cols-[42%_1fr] overflow-hidden rounded-[24px] bg-white text-left disabled:opacity-55 sm:grid-cols-[320px_1fr]">
      <div className="relative min-h-[150px] bg-gradient-to-br from-roxo/10 to-lima/20 sm:min-h-[200px]"><Foto src={p.imagem} sizes="(max-width:640px) 42vw, 320px" /></div>
      <div className="flex flex-col justify-center gap-1 p-4 sm:p-7">
        <span className="text-lg font-black leading-tight tracking-[-0.025em] sm:text-2xl">{p.nome}</span>
        {p.descricao && <span className="text-sm text-roxo/65">{p.descricao}</span>}
        <span className="mt-2 text-sm font-extrabold tabular-nums text-roxo">{esgotado ? "Esgotado hoje" : preco}</span>
        {(p.sabores?.length ?? 0) > 0 && <span className="mt-1 hidden text-sm text-roxo-escuro/55 sm:block">{p.sabores!.join(", ")}</span>}
      </div>
    </button>
  );
}

/** Linha compacta (itens simples: picolé, bebida, bomboniere): toque no "+" e já vai para a sacola. */
function Linha({ p, esgotado, onAdd }: { p: ProdutoLoja; esgotado: boolean; onAdd: () => void }) {
  const [feito, setFeito] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <li className={`flex min-w-0 items-center gap-3 py-2.5 ${esgotado ? "opacity-55" : ""}`}>
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-roxo/10 to-lima/20"><Foto src={p.imagem} sizes="56px" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight tracking-[-0.01em]">{p.nome}</p>
        <p className="text-sm font-extrabold tabular-nums text-roxo">{esgotado ? <span className="font-bold text-roxo/60">Esgotado hoje</span> : brl(p.preco ?? 0)}</p>
      </div>
      <button type="button" disabled={esgotado} aria-label={`Adicionar ${p.nome} à sacola`}
        onClick={() => { onAdd(); setFeito(true); clearTimeout(t.current); t.current = setTimeout(() => setFeito(false), 1100); }}
        className="pressionavel relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-roxo text-white disabled:bg-roxo/30">
        {/* o "+" vira "✓" por um instante: confirma que entrou na sacola */}
        <span aria-hidden="true" className={`absolute text-2xl leading-none transition-[opacity,transform,filter] duration-200 ease-out-forte ${feito ? "scale-50 opacity-0 blur-[2px]" : ""}`}>+</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`absolute h-5 w-5 transition-[opacity,transform,filter] duration-200 ease-out-forte ${feito ? "" : "scale-50 opacity-0 blur-[2px]"}`}><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </li>
  );
}

export function Loja({ cardapio, maisVendidos = [] }: { cardapio: Cardapio; maisVendidos?: Vendido[] }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<LinhaSacola[]>([]);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [st, setSt] = useState<(StatusLoja & { hora: number; dia: number; data: string }) | null>(null);
  const [ultimo, setUltimo] = useState<{ codigo: string; itens: CartItem[] } | null>(null);
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null);

  useEffect(() => {
    setLinhas(ler<LinhaSacola[]>("sacola", []));
    setUltimo(ler<{ codigo: string; itens: CartItem[] } | null>("ultimo", null));
    const tick = () => { const a = agoraSousa(); setSt({ ...statusLoja(cardapio.loja.horarios, a), hora: a.hora, dia: a.diaSemana, data: a.data }); };
    tick(); const t = setInterval(tick, 60_000); return () => clearInterval(t);
  }, [cardapio.loja.horarios]);
  const salvar = (v: LinhaSacola[]) => { setLinhas(v); gravar("sacola", v); };
  const fechar = useCallback(() => setAberto(null), []);

  const tAviso = useRef<ReturnType<typeof setTimeout>>();
  function adicionar(item: CartItem, nome: string) {
    salvar([...linhas, { id: novoId(), item }]);
    setAberto(null);
    setAviso({ id: Date.now(), texto: `${nome} na sacola` });
    clearTimeout(tAviso.current); tAviso.current = setTimeout(() => setAviso(null), 2200);
  }
  const qtdTotal = linhas.reduce((s, l) => s + l.item.qtd, 0);
  const promo = cardapio.promos.find((p) => p.ativo);
  const promoOk = !!promo && !!st && promoDisponivel(promo, { diaSemana: st.dia, hora: st.hora, data: st.data });
  const menor = (e: string) => Math.min(...cardapio.sizes.filter((s) => s.ativo && s.embalagem === e).map((s) => s.preco));
  const copos = cardapio.sizes.filter((s) => s.ativo && s.embalagem === "Copo");
  const secoes = cardapio.categorias.map((c) => ({ ...c, itens: cardapio.products.filter((p) => p.ativo && p.category_id === c.id) })).filter((s) => s.itens.length);
  const esgotado = (p: ProdutoLoja) => !!st && p.esgotado_em === st.data;
  const abrirProduto = (p: ProdutoLoja) => p.kind === "simples" ? adicionar({ tipo: "produto", productId: p.id, qtd: 1 }, p.nome) : setAberto({ tipo: "produto", produto: p });

  // "Mais pedidos": cada um vira um atalho para pedir aquele item
  const vendidos = maisVendidos.map((v) => {
    const prod = [...cardapio.products].filter((p) => p.ativo && v.nome.startsWith(p.nome)).sort((a, b) => b.nome.length - a.nome.length)[0];
    const acai = /^Açaí (Copo|Pote) (.+)$/.exec(v.nome);
    const size = acai ? cardapio.sizes.find((s) => s.ativo && s.embalagem === acai[1] && s.rotulo === acai[2]) : undefined;
    const ehPromo = !!promo && v.nome.startsWith(promo.nome);
    const acao = ehPromo ? (promoOk ? () => adicionar({ tipo: "promo", promoId: promo!.id, qtd: 1 }, promo!.nome) : null)
      : acai ? () => setAberto({ tipo: "acai", emb: acai[1] as "Copo" | "Pote", sizeId: size?.id })
      : prod && !esgotado(prod) ? () => abrirProduto(prod) : null;
    return { ...v, foto: v.imagem ?? prod?.imagem ?? FOTOS.find(([re]) => re.test(v.nome))?.[1] ?? null, acao };
  });

  // Cabeçalho: se funde com a abertura e vira "vidro" quando o cardápio passa por baixo
  const fimHero = useRef<HTMLDivElement>(null);
  const [vidro, setVidro] = useState(false);
  useEffect(() => {
    const el = fimHero.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setVidro(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 96)), { rootMargin: "-96px 0px 0px 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);

  // Marcador da categoria em que a pessoa está (desliza entre os links)
  const ids = ["acai", ...secoes.map((s) => s.id)];
  const [ativa, setAtiva] = useState<string | null>(null);
  const travar = useRef(0);
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      if (Date.now() < travar.current) return;
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setAtiva(vis.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    const topo = () => { if (window.scrollY < 120) setAtiva(null); };
    window.addEventListener("scroll", topo, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", topo); };
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav = useRef<HTMLElement>(null);
  const [pilula, setPilula] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    const n = nav.current; const a = ativa && n?.querySelector<HTMLAnchorElement>(`a[href="#${ativa}"]`);
    if (!n || !a) { setPilula(null); return; }
    setPilula({ x: a.offsetLeft, w: a.offsetWidth });
    const alvo = a.offsetLeft - n.clientWidth / 2 + a.offsetWidth / 2;
    n.scrollTo({ left: alvo, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [ativa]);

  const curto = st ? (st.aberta ? st.texto.replace("Aberto agora · ", "Aberto · ") : "Fechado") : null;

  return (
    <MotionConfig reducedMotion="user">
      <header className={`sticky top-0 z-30 text-white transition-[background-color,box-shadow] duration-300 ease-out-forte ${vidro ? "bg-roxo-escuro/85 shadow-[0_8px_24px_-12px_rgb(42_10_68/.6)] backdrop-blur-xl backdrop-saturate-150" : "bg-roxo-escuro"}`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-1 pt-2.5">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={104} height={68} priority className="h-auto w-[92px] sm:w-[104px]" />
          {curto && (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-white/85" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${st?.aberta ? "bg-lima shadow-[0_0_0_3px_rgb(154_205_31/.25)]" : "bg-white/40"}`} aria-hidden="true" />{curto}
            </span>)}
          <button type="button" onClick={() => setAberto({ tipo: "sacola" })} aria-label={`Abrir sacola, ${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}`}
            className="pressionavel ml-auto flex min-h-[44px] items-center gap-2 rounded-full bg-lima pl-4 pr-2 font-extrabold text-roxo-escuro">
            Sacola
            <motion.span key={qtdTotal} initial={qtdTotal ? { scale: 1.35 } : false} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.45, bounce: 0.35 }}
              className={`grid h-7 min-w-7 place-items-center rounded-full px-1.5 text-xs tabular-nums ${qtdTotal ? "bg-roxo text-white" : "bg-roxo/10 text-roxo-escuro/60"}`}>{qtdTotal}</motion.span>
          </button>
        </div>
        <nav ref={nav} aria-label="Categorias" className="sem-barra relative mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2.5 pt-1 text-sm font-bold">
          <span aria-hidden="true" className="pointer-events-none absolute left-0 top-1 h-[34px] rounded-full bg-white/[0.14] transition-[transform,width,opacity] duration-300 ease-in-out-forte"
            style={{ transform: `translateX(${pilula?.x ?? 0}px)`, width: pilula?.w ?? 0, opacity: pilula ? 1 : 0 }} />
          {ids.map((id) => {
            const nome = id === "acai" ? "Açaí" : secoes.find((s) => s.id === id)!.nome;
            return <a key={id} href={`#${id}`} aria-current={ativa === id ? "true" : undefined}
              onClick={() => { setAtiva(id); travar.current = Date.now() + 900; }}
              className={`relative flex h-[34px] items-center whitespace-nowrap rounded-full px-3.5 transition-colors duration-200 ${ativa === id ? "text-white" : "text-white/65 hover:text-white"}`}>{nome}</a>;
          })}
        </nav>
      </header>

      {/* ---------- Abertura ---------- */}
      <section className="relative overflow-hidden bg-roxo-escuro text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 pb-10 pt-5 sm:grid-cols-[1.05fr_0.95fr] sm:items-center sm:gap-12 sm:pb-16 sm:pt-10">
          <div>
            <p className="entra text-sm font-semibold text-white/65" style={css({ "--dist": "0px" })}>{st ? saudacao(st.hora) : "Olá"}! Qual vai ser hoje?</p>
            <h1 className="mt-3 text-[2.6rem] font-black leading-[0.94] tracking-[-0.04em] sm:whitespace-nowrap sm:text-[3.1rem] lg:text-[3.6rem]">
              <span className="mascara"><span className="entra-linha" style={css({ "--d": "90ms" })}>Monte o seu açaí</span></span>
              <span className="mascara"><span className="entra-linha" style={css({ "--d": "170ms" })}>do seu jeito.</span></span>
            </h1>
            <p className="entra mt-5 max-w-[36ch] text-[15px] leading-relaxed text-white/72" style={css({ "--d": "280ms" })}>
              Escolha o tamanho e os acompanhamentos. Retire no balcão ou receba em casa.
            </p>

            {st && !st.aberta && !cardapio.loja.aceitaAgendamento && (
              <p role="status" className="entra mt-5 max-w-md rounded-2xl bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white/90 ring-1 ring-white/10" style={css({ "--d": "300ms" })}>
                Estamos fechados agora{st.proxima ? ` · ${st.texto.replace(/^Fechado · /, "")}` : ""}. Dá para ver o cardápio, e os pedidos voltam no horário de funcionamento.
              </p>)}

            <div className="entra mt-7" style={css({ "--d": "360ms", "--dist": "6px" })}>
              <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                {copos.map((s) => (
                  <button key={s.id} type="button" onClick={() => setAberto({ tipo: "acai", emb: "Copo", sizeId: s.id })}
                    className="pressionavel group flex flex-col items-start rounded-2xl bg-white/[0.07] px-3.5 py-3 text-left ring-1 ring-white/12 transition-colors duration-200 hover:bg-white/[0.12]">
                    <span className="text-[11px] font-bold text-white/55">Copo</span>
                    <span className="text-lg font-extrabold leading-tight tracking-[-0.02em]">{s.rotulo}</span>
                    <span className="mt-1 text-sm font-bold tabular-nums text-lima">{brl(s.preco)}</span>
                  </button>))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold">
                <button type="button" onClick={() => setAberto({ tipo: "acai", emb: "Pote" })} className="text-white/85 underline decoration-white/30 underline-offset-[6px] transition-colors hover:decoration-lima">Prefere no pote? A partir de {brl(menor("Pote"))}</button>
                <a href="#cardapio" className="text-white/60 hover:text-white">Ver o cardápio</a>
              </div>
            </div>

            {ultimo && linhas.length === 0 && (
              <div className="entra mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10" style={css({ "--d": "420ms" })}>
                <p className="min-w-0 flex-1 text-sm font-semibold text-white/85">Quer repetir o último pedido?</p>
                <button className="pressionavel rounded-full bg-lima px-4 py-2 text-sm font-extrabold text-roxo-escuro" onClick={() => { salvar(ultimo.itens.map((item) => ({ id: novoId(), item }))); setAberto({ tipo: "sacola" }); }}>Pedir de novo</button>
                <a className="text-sm font-bold text-white/70 underline underline-offset-4" href={`/pedido/${ultimo.codigo}`}>Ver pedido</a>
              </div>)}
          </div>

          <div className="entra-foto relative aspect-[5/4] overflow-hidden rounded-[28px] sm:aspect-[4/5]" style={css({ "--d": "40ms" })}>
            <Image src="/img/hero.jpg" alt="Açaí no copo com camadas de creme e morangos por cima" fill priority sizes="(max-width:640px) 100vw, 460px" className="object-cover object-[50%_40%]" />
          </div>
        </div>
        <div ref={fimHero} aria-hidden="true" className="absolute bottom-0 h-px w-full" />
      </section>

      <main id="cardapio" className="bg-leite pb-28">
        {promo && (
          <section className="mx-auto max-w-5xl px-4 pt-10">
            <div className="sombra-suave grid overflow-hidden rounded-[28px] bg-white sm:grid-cols-[0.9fr_1.1fr]">
              <div className="relative min-h-[200px] sm:min-h-[280px]"><Image src="/img/promo.jpg" alt="" fill sizes="(max-width:640px) 100vw, 440px" className="object-cover" /></div>
              <div className="flex flex-col justify-center gap-2 p-5 sm:p-8">
                <p className="text-sm font-bold text-polpa">Promoção de {promo.dias_semana.map((d) => DIAS3[d]).join(", ").replace(/, ([^,]*)$/, " e $1")}</p>
                <h2 className="text-[1.75rem] font-black leading-[1.02] tracking-[-0.03em] sm:text-4xl">{promo.nome}</h2>
                <p className="max-w-[40ch] text-roxo-escuro/70">{promo.tamanho} com {promo.composicao.join(", ").replace(/, ([^,]*)$/, " e $1")}.</p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <span className="text-4xl font-black tabular-nums tracking-[-0.03em]">{brl(promo.preco)}</span>
                  <button type="button" disabled={!promoOk} onClick={() => adicionar({ tipo: "promo", promoId: promo.id, qtd: 1 }, promo.nome)} className="botao-lima pressionavel disabled:bg-roxo/10 disabled:text-roxo-escuro/60">
                    {promoOk ? "Quero esse" : `Só de ${DIAS3[Math.min(...promo.dias_semana)]} a ${DIAS3[Math.max(...promo.dias_semana)]}`}
                  </button>
                </div>
              </div>
            </div>
          </section>)}

        {vendidos.length > 0 && (
          <section aria-labelledby="top" className="pt-12">
            <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-4">
              <h2 id="top" className="text-2xl font-black tracking-[-0.03em]">Mais pedidos</h2>
              <span className="text-sm text-roxo-escuro/55">nos últimos 30 dias</span>
            </div>
            <ol className="sem-barra mx-auto mt-4 flex max-w-5xl snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:grid sm:grid-cols-6 sm:overflow-visible">
              {vendidos.map((v, i) => {
                const corpo = (
                  <>
                    <div className="relative aspect-square overflow-hidden rounded-[18px] bg-gradient-to-br from-roxo/10 to-lima/20"><Foto src={v.foto} sizes="(max-width:640px) 45vw, 170px" /></div>
                    <div className="flex items-start gap-2.5 px-1 pb-1 pt-2.5">
                      <span className="text-[1.65rem] font-black leading-none tabular-nums tracking-[-0.04em] text-polpa/35" aria-hidden="true">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-bold leading-tight tracking-[-0.01em]">{v.nome}</span>
                        {v.quantidade != null && <span className="text-xs text-roxo-escuro/55">{v.quantidade} pedidos</span>}
                      </span>
                    </div>
                  </>);
                return (
                  <li key={v.nome} className="relative w-[44%] shrink-0 snap-start sm:w-auto">
                    <span className="sr-only">{i + 1}º lugar: </span>
                    {v.acao ? <button type="button" onClick={v.acao} className="levanta pressionavel block w-full rounded-[22px] text-left">{corpo}</button> : <div className="opacity-70">{corpo}</div>}
                  </li>);
              })}
            </ol>
          </section>)}

        <section id="acai" className="mx-auto max-w-5xl scroll-mt-28 px-4 pt-12">
          <h2 className="text-2xl font-black tracking-[-0.03em]">Açaí</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
            {(["Copo", "Pote"] as const).map((e) => (
              <button key={e} type="button" onClick={() => setAberto({ tipo: "acai", emb: e })}
                className="levanta pressionavel group relative aspect-[3/4] overflow-hidden rounded-[26px] text-left text-white sm:aspect-[16/11]">
                <Foto src={cardapio.imagens[e]} sizes="(max-width:640px) 50vw, 480px" />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-roxo-escuro/90 via-roxo-escuro/30 via-45% to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4 sm:p-6">
                  <span className="text-xl font-black leading-tight tracking-[-0.03em] sm:text-3xl">Açaí no {e}</span>
                  <span className="text-xs text-white/75 sm:text-sm">{e === "Copo" ? "300, 400 ou 500 ml" : "300 ml a 1 litro"}</span>
                  <span className="mt-1 text-sm font-extrabold tabular-nums text-lima">a partir de {brl(menor(e))}</span>
                </span>
              </button>))}
          </div>
        </section>

        {secoes.map((s) => {
          const compacta = s.itens.every((p) => p.kind === "simples");
          return (
            <section key={s.id} id={s.id} className="mx-auto max-w-5xl scroll-mt-28 px-4 pt-12">
              <h2 className="text-2xl font-black tracking-[-0.03em]">{s.nome}</h2>
              {compacta ? (
                <ul className="sombra-suave mt-4 grid grid-cols-1 divide-y divide-roxo/[0.07] rounded-[24px] bg-white px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 sm:[&>li]:border-b sm:[&>li]:border-roxo/[0.07]">
                  {s.itens.map((p) => <Linha key={p.id} p={p} esgotado={esgotado(p)} onAdd={() => abrirProduto(p)} />)}
                </ul>
              ) : s.itens.length === 1 ? (
                <CartaoLargo p={s.itens[0]} esgotado={esgotado(s.itens[0])} onClick={() => abrirProduto(s.itens[0])}
                  preco={s.itens[0].kind === "simples" ? brl(s.itens[0].preco ?? 0) : `a partir de ${brl(Math.min(...(s.itens[0].tamanhos ?? []).map((t) => t.preco)))}`} />
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                  {s.itens.map((p) => <Cartao key={p.id} nome={p.nome} descricao={p.descricao} imagem={p.imagem} esgotado={esgotado(p)}
                    preco={p.kind === "simples" ? brl(p.preco ?? 0) : `a partir de ${brl(Math.min(...(p.tamanhos ?? []).map((t) => t.preco)))}`} onClick={() => abrirProduto(p)} />)}
                </div>)}
            </section>);
        })}
      </main>

      <Folha aberta={aberto?.tipo === "acai"} onFechar={fechar} titulo="Monte seu açaí" larga>
        {aberto?.tipo === "acai" && <Montador cardapio={cardapio} embalagemInicial={aberto.emb} tamanhoInicial={aberto.sizeId} onAdicionar={(i) => adicionar(i, "Açaí")} />}
      </Folha>
      <Folha aberta={aberto?.tipo === "produto"} onFechar={fechar} titulo={aberto?.tipo === "produto" ? aberto.produto.nome : ""}>
        {aberto?.tipo === "produto" && <ProdutoFolha cardapio={cardapio} produto={aberto.produto} onAdicionar={(i) => adicionar(i, aberto.produto.nome)} />}
      </Folha>
      <Folha aberta={aberto?.tipo === "sacola"} onFechar={fechar} titulo="Sua sacola">
        <Sacola cardapio={cardapio} linhas={linhas}
          onQtd={(id, qtd) => salvar(linhas.map((l) => (l.id === id ? { ...l, item: { ...l.item, qtd } as CartItem } : l)))}
          onRemover={(id) => salvar(linhas.filter((l) => l.id !== id))}
          onEnviado={(codigo, pagarEm) => { salvar([]); if (pagarEm) window.location.href = pagarEm; else router.push(`/pedido/${codigo}`); }} />
      </Folha>

      {/* Aviso "na sacola": fica acima da barra "Ver sacola" (antes cobria o botão) */}
      <AnimatePresence>
        {aviso && <motion.div key={aviso.id} role="status" initial={{ y: 16, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 8, opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center ${aberto === null && linhas.length > 0 ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] sm:bottom-6" : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"}`}>
          <span className="flex items-center gap-2 rounded-full bg-roxo-escuro px-5 py-3 text-sm font-bold text-white shadow-[0_12px_32px_-8px_rgb(42_10_68/.55)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-lima"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>{aviso.texto}
          </span>
        </motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {aberto === null && linhas.length > 0 && (
          <motion.button key="ver" initial={{ y: "140%" }} animate={{ y: 0 }} exit={{ y: "140%", transition: { duration: 0.2 } }} transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            type="button" onClick={() => setAberto({ tipo: "sacola" })}
            className="botao-lima pressionavel fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md justify-between shadow-[0_12px_32px_-10px_rgb(42_10_68/.5)] sm:hidden">
            <span>Ver sacola</span><span className="tabular-nums">{qtdTotal} {qtdTotal === 1 ? "item" : "itens"}</span>
          </motion.button>)}
      </AnimatePresence>
    </MotionConfig>
  );
}
