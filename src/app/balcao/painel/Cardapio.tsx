"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, CampoInteiro, CampoTexto, CampoValor, Cartao, Chave, enviarFoto, urlFoto, type Addon, type Aviso, type Dados, type Produto, type Promo } from "./comum";

type Props = { dados: Dados; avisar: Aviso; recarregar: () => void };
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export default function Cardapio({ dados, avisar, recarregar }: Props) {
  const sb = supabaseNavegador();
  /** Grava e recarrega; mostra "Salvo" ou o erro. */
  async function salvar(tabela: string, id: string, campos: Record<string, unknown>) {
    const { error } = await sb.from(tabela).update(campos).eq("id", id);
    if (error) avisar("erro", "Não foi possível salvar: " + error.message); else avisar("ok", "Salvo");
    recarregar();
  }
  async function executar(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const { error } = await p;
    if (error) avisar("erro", error.message); else avisar("ok", ok);
    recarregar();
  }

  return (
    <>
      <p className="rounded-2xl bg-lima/30 px-4 py-3 text-sm font-semibold text-roxo-escuro">As alterações são salvas ao sair do campo e aparecem no site em até 1 minuto. No caixa, valem na próxima vez que a página for aberta.</p>

      <Cartao titulo="Tamanhos do açaí" dica="Preço, acompanhamentos inclusos e peso da embalagem vazia (usado no açaí no quilo).">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-roxo/60"><th className="pb-2">Tamanho</th><th>Preço (R$)</th><th>Inclusos</th><th>Embalagem (g)</th><th>No site</th></tr></thead>
          <tbody className="divide-y divide-roxo/10">{dados.tamanhos.map((t) => (
            <tr key={t.id} className={t.ativo ? "" : "opacity-50"}>
              <td className="py-2 font-bold">{t.embalagem} {t.rotulo}</td>
              <td><CampoValor rotulo={`Preço ${t.embalagem} ${t.rotulo}`} valor={Number(t.preco)} onChange={(v) => salvar("acai_sizes", t.id, { preco: v })} /></td>
              <td><CampoInteiro rotulo={`Inclusos ${t.embalagem} ${t.rotulo}`} valor={t.acomp_inclusos} onChange={(v) => salvar("acai_sizes", t.id, { acomp_inclusos: v })} /></td>
              <td><CampoInteiro rotulo={`Embalagem ${t.embalagem} ${t.rotulo}`} valor={t.tara_g} onChange={(v) => salvar("acai_sizes", t.id, { tara_g: v })} /></td>
              <td><Chave rotulo={`${t.embalagem} ${t.rotulo} no site`} ligado={t.ativo} onChange={(v) => salvar("acai_sizes", t.id, { ativo: v })} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-roxo/10 pt-3 text-sm">
          <span className="font-bold">Bases:</span>
          {dados.bases.map((b) => <label key={b.id} className="flex items-center gap-2 font-semibold">{b.nome}<Chave rotulo={`Base ${b.nome}`} ligado={b.ativo} onChange={(v) => salvar("acai_bases", b.id, { ativo: v })} /></label>)}
        </div>
      </Cartao>

      {dados.grupos.map((g) => (
        <Cartao key={g.id} titulo={`Acompanhamentos · ${g.nome}`} dica="Adicional R$ 0,00 = gratuito e conta nos inclusos. Com adicional = pago à parte e não ocupa vaga.">
          <ul className="divide-y divide-roxo/10">{dados.addons.filter((a) => a.group_id === g.id).map((a) => <LinhaAddon key={a.id} a={a} salvar={salvar} apagar={() => confirm(`Apagar "${a.nome}" do cardápio?`) && executar(sb.from("addon_items").delete().eq("id", a.id), "Apagado")} />)}</ul>
          <Novo rotulo="Novo acompanhamento" onCriar={(nome) => executar(sb.from("addon_items").insert({ group_id: g.id, nome, ordem: 999 }), `${nome} adicionado`)} />
        </Cartao>
      ))}

      {dados.promos.map((p) => <CartaoPromo key={p.id} p={p} salvar={salvar} />)}

      {dados.categorias.map((c) => (
        <Cartao key={c.id} titulo={c.nome}>
          <ul className="space-y-3">{dados.produtos.filter((p) => p.category_id === c.id).map((p) => <LinhaProduto key={p.id} p={p} salvar={salvar} avisar={avisar} apagar={() => confirm(`Apagar "${p.nome}" do cardápio? As vendas antigas continuam nos relatórios.`) && executar(sb.from("products").delete().eq("id", p.id), "Apagado")} />)}</ul>
          <Novo rotulo={`Novo item em ${c.nome}`} onCriar={(nome) => executar(sb.from("products").insert({ id: `${slug(nome)}-${Date.now().toString(36).slice(-4)}`, category_id: c.id, nome, kind: "simples", preco: 0, ativo: false, ordem: 999 }), `${nome} criado — defina o preço e ligue “No site”`)} />
        </Cartao>
      ))}
    </>
  );
}

type Salvar = (tabela: string, id: string, campos: Record<string, unknown>) => void;

function Novo({ rotulo, onCriar }: { rotulo: string; onCriar: (nome: string) => void }) {
  const [nome, setNome] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) { onCriar(nome.trim()); setNome(""); } }} className="mt-3 flex gap-2 border-t border-roxo/10 pt-3">
      <input aria-label={rotulo} className="campo !py-2 text-sm" placeholder={rotulo} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
      <button className="shrink-0 rounded-full bg-roxo px-4 text-sm font-extrabold text-white disabled:opacity-40" disabled={!nome.trim()}>Adicionar</button>
    </form>
  );
}

function LinhaAddon({ a, salvar, apagar }: { a: Addon; salvar: Salvar; apagar: () => void }) {
  return (
    <li className={`flex flex-wrap items-center gap-2 py-2 text-sm ${a.ativo ? "" : "opacity-50"}`}>
      <CampoTexto rotulo="Nome" className="min-w-0 flex-1 font-bold" valor={a.nome} onChange={(v) => salvar("addon_items", a.id, { nome: v })} />
      <span className="text-xs font-bold text-roxo/60">+R$</span>
      <CampoValor rotulo={`Adicional de ${a.nome}`} valor={Number(a.preco_adicional)} onChange={(v) => salvar("addon_items", a.id, { preco_adicional: v, conta_no_limite: v === 0 })} />
      <Chave rotulo={`${a.nome} no site`} ligado={a.ativo} onChange={(v) => salvar("addon_items", a.id, { ativo: v })} />
      <button onClick={apagar} aria-label={`Apagar ${a.nome}`} className="rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-700">×</button>
    </li>
  );
}

function CartaoPromo({ p, salvar }: { p: Promo; salvar: Salvar }) {
  return (
    <Cartao titulo={`Promoção · ${p.nome}`} dica={`${p.tamanho} · aparece no site só nos dias marcados.`}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-bold">Preço R$ <CampoValor rotulo="Preço da promoção" valor={Number(p.preco)} onChange={(v) => salvar("promos", p.id, { preco: v })} /></label>
        <label className="flex items-center gap-2 font-bold">Ativa <Chave rotulo="Promoção ativa" ligado={p.ativo} onChange={(v) => salvar("promos", p.id, { ativo: v })} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{DIAS.map((d, i) => {
        const on = p.dias_semana.includes(i);
        return <button key={d} aria-pressed={on} onClick={() => salvar("promos", p.id, { dias_semana: on ? p.dias_semana.filter((x) => x !== i) : [...p.dias_semana, i].sort() })} className={`rounded-xl px-3 py-2 text-sm font-bold ${on ? "bg-roxo text-white" : "bg-creme text-roxo ring-1 ring-roxo/15"}`}>{d}</button>;
      })}</div>
      <label className="mt-3 block text-sm"><span className="rotulo">O que vem (separado por vírgula)</span><CampoTexto rotulo="Composição" className="w-full" valor={p.composicao.join(", ")} onChange={(v) => salvar("promos", p.id, { composicao: v.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
    </Cartao>
  );
}

function LinhaProduto({ p, salvar, avisar, apagar }: { p: Produto; salvar: Salvar; avisar: Aviso; apagar: () => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const foto = urlFoto(p.imagem_path);
  async function trocarFoto(f: File | undefined) {
    if (!f) return;
    setEnviando(true);
    try { salvar("products", p.id, { imagem_path: await enviarFoto(f, p.id) }); } catch (e) { avisar("erro", (e as Error).message); }
    setEnviando(false); if (arquivo.current) arquivo.current.value = "";
  }
  return (
    <li className={`rounded-2xl bg-creme p-3 ${p.ativo ? "" : "opacity-60"}`}>
      <div className="flex gap-3">
        <button onClick={() => arquivo.current?.click()} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-roxo/15" aria-label={`Trocar foto de ${p.nome}`}>
          {foto ? <Image src={foto} alt="" fill sizes="80px" className="object-cover" /> : <span className="grid h-full place-items-center text-xs font-bold text-roxo/50">Sem foto</span>}
          <span className="absolute inset-x-0 bottom-0 bg-roxo/80 py-0.5 text-center text-[10px] font-bold text-white">{enviando ? "Enviando…" : "Trocar foto"}</span>
        </button>
        <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => trocarFoto(e.target.files?.[0])} />
        <div className="min-w-0 flex-1 space-y-2">
          <CampoTexto rotulo="Nome" className="w-full font-bold" valor={p.nome} onChange={(v) => salvar("products", p.id, { nome: v })} />
          <CampoTexto rotulo="Descrição" className="w-full text-sm" valor={p.descricao ?? ""} onChange={(v) => salvar("products", p.id, { descricao: v })} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {p.kind === "simples"
          ? <label className="flex items-center gap-2 font-bold">Preço R$ <CampoValor rotulo={`Preço de ${p.nome}`} valor={Number(p.preco ?? 0)} onChange={(v) => salvar("products", p.id, { preco: v })} /></label>
          : p.tamanhos?.map((t, i) => <label key={t.nome} className="flex items-center gap-2 font-bold">{t.nome} R$ <CampoValor rotulo={`Preço ${p.nome} ${t.nome}`} valor={Number(t.preco)} onChange={(v) => salvar("products", p.id, { tamanhos: p.tamanhos!.map((x, k) => (k === i ? { ...x, preco: v } : x)) })} /></label>)}
        <label className="flex items-center gap-2 font-bold">No site <Chave rotulo={`${p.nome} no site`} ligado={p.ativo} onChange={(v) => { if (v && p.kind === "simples" && !Number(p.preco)) return avisar("erro", `Defina o preço de ${p.nome} antes de colocar no site.`); salvar("products", p.id, { ativo: v }); }} /></label>
        <button onClick={apagar} className="ml-auto rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-700">Apagar</button>
      </div>
      {p.sabores && <label className="mt-3 block text-sm"><span className="rotulo">Sabores (separados por vírgula)</span><CampoTexto rotulo={`Sabores de ${p.nome}`} className="w-full" valor={p.sabores.join(", ")} onChange={(v) => salvar("products", p.id, { sabores: v.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>}
      <p className="mt-2 text-xs text-roxo/50">{p.kind === "simples" ? brl(Number(p.preco ?? 0)) : `${p.tamanhos?.length ?? 0} tamanhos`}{p.destaque ? " · destaque" : ""}</p>
    </li>
  );
}
