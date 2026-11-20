"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { agoraSousa } from "@/lib/pricing";
import { PAGAMENTO } from "@/lib/pedidos/comanda";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";
import Extrato from "./Extrato";
import { CAT_CONTA, CATEGORIAS, dataBr, num, PAGO_COM } from "./estoqueComum";

type Conta = { id: string; descricao: string; categoria: string; valor: number; vencimento: string; pago_em: string | null; pago_com: string | null; reembolsado_em: string | null; compra_id: string | null; despesa_fixa_id: string | null; obs: string | null };
type Fixa = { id: string; descricao: string; categoria: string; valor: number; dia: number; ativo: boolean };
type Taxa = { forma: string; nome: string; percentual: number; ordem: number };
type Externa = { id: string; data: string; canal: string; bruto: number; liquido: number; obs: string | null; por_forma?: Record<string, number> | null };
type Resultado = {
  vendas_sistema: number; vendas_caderno?: number; dias_caderno?: number; pedidos: number; ticket_medio: number; taxas_cartao: number; externas_bruto: number; externas_liquido: number;
  compras: number; despesas: number; contas_abertas: number; devido_aos_donos: number;
  por_canal: { canal: string; total: number; pedidos: number }[];
  por_forma: { forma: string; total: number; percentual: number; taxa: number }[];
  compras_por_categoria: { categoria: string; total: number }[];
  despesas_por_categoria: { categoria: string; total: number; pago: boolean }[];
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const somaMes = (mes: string, n: number) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
/** Último dia do mês (ou hoje, se for o mês atual). */
const ultimoDia = (mes: string, hoje: string) => { const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10); return d > hoje ? hoje : d; };
const titulo = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const diasAte = (hoje: string, d: string) => Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 864e5);
const CANAL: Record<string, string> = { site: "Site", balcao: "Balcão", whatsapp: "WhatsApp", caderno: "Caderno" };
const v2 = (n: number) => String(Number(n).toFixed(2)).replace(".", ",");

export default function Financeiro({ avisar }: { avisar: Aviso }) {
  const hoje = agoraSousa().data;
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [r, setR] = useState<Resultado | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [externas, setExternas] = useState<Externa[]>([]);
  const [pagando, setPagando] = useState<Conta | null>(null);
  const [aba, setAba] = useState<"resumo" | "extrato" | "contas" | "ifood" | "config">("resumo");
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null); // null = mês selecionado
  const [novaConta, setNovaConta] = useState(false);

  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const ini = mes + "-01", fim = somaMes(mes, 1) + "-01";
    const limite = somaMes(hoje.slice(0, 7), 2) + "-01"; // contas abertas até o fim do mês que vem
    const [res, ct, ex] = await Promise.all([
      sb.rpc("resultado_mes", { p_mes: ini }),
      sb.from("contas").select("*").or(`and(pago_em.is.null,vencimento.lt.${limite}),and(vencimento.gte.${ini},vencimento.lt.${fim}),and(pago_em.gte.${ini},pago_em.lt.${fim}),and(pago_com.in.(dono,esposa),reembolsado_em.is.null,pago_em.not.is.null)`).order("vencimento"),
      sb.from("entradas_externas").select("*").gte("data", ini).lt("data", fim).order("data", { ascending: false }),
    ]);
    if (res.error || ct.error) return avisar("erro", "Não foi possível carregar o financeiro: " + (res.error ?? ct.error)!.message);
    setR(res.data as Resultado); setContas(ct.data as Conta[]); setExternas((ex.data ?? []) as Externa[]);
  }, [mes, hoje, avisar]);

  // Gera as contas fixas deste mês e do próximo (não duplica) e carrega.
  useEffect(() => {
    const sb = supabaseNavegador();
    Promise.all([sb.rpc("gerar_contas_mes", { p_mes: hoje.slice(0, 7) + "-01" }), sb.rpc("gerar_contas_mes", { p_mes: somaMes(hoje.slice(0, 7), 1) + "-01" })]).finally(carregar);
  }, [carregar, hoje]);

  if (!r) return <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p>;

  const comissaoIfood = Number(r.externas_bruto) - Number(r.externas_liquido);
  const caderno = Number(r.vendas_caderno ?? 0);
  const receita = Number(r.vendas_sistema) + caderno + Number(r.externas_bruto);
  const resultado = receita - Number(r.taxas_cartao) - comissaoIfood - Number(r.compras) - Number(r.despesas);
  const pctCompras = receita > 0 ? (Number(r.compras) / receita) * 100 : 0;
  const abertas = contas.filter((c) => !c.pago_em);
  const vencidas = abertas.filter((c) => c.vencimento < hoje);
  const proximas = abertas.filter((c) => c.vencimento >= hoje && diasAte(hoje, c.vencimento) <= 7);
  const devendo = contas.filter((c) => c.pago_em && (c.pago_com === "dono" || c.pago_com === "esposa") && !c.reembolsado_em);
  const mesAtual = mes === hoje.slice(0, 7);

  async function devolverConta(c: Conta) {
    const { error } = await supabaseNavegador().from("contas").update({ reembolsado_em: hoje }).eq("id", c.id);
    if (error) return avisar("erro", error.message);
    avisar("ok", "Marcado como devolvido"); carregar();
  }
  async function desfazerPagamento(c: Conta) {
    const { error } = await supabaseNavegador().from("contas").update({ pago_em: null, pago_com: null, reembolsado_em: null }).eq("id", c.id);
    if (error) return avisar("erro", error.message);
    carregar();
  }
  async function excluirConta(c: Conta) {
    if (!confirm(`Excluir "${c.descricao}" (${brl(c.valor)})?`)) return;
    const { error } = await supabaseNavegador().from("contas").delete().eq("id", c.id);
    if (error) return avisar("erro", error.message);
    carregar();
  }

  const linhaConta = (c: Conta) => {
    const d = diasAte(hoje, c.vencimento);
    const etiqueta = c.pago_em ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">Pago {dataBr(c.pago_em).slice(0, 5)}</span>
      : d < 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Vencida há {-d} dia(s)</span>
      : d === 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Vence hoje</span>
      : <span className="rounded-full bg-creme px-2 py-0.5 text-xs font-bold text-roxo/70">em {d} dia(s)</span>;
    return (
      <li key={c.id} className="py-2 sm:flex sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <span className="w-12 shrink-0 text-sm font-bold text-roxo/70">{c.vencimento.slice(8, 10)}/{c.vencimento.slice(5, 7)}</span>
          <span className="min-w-0 flex-1"><span className="block font-bold leading-tight">{c.descricao}</span><span className="block text-xs text-roxo/60">{CAT_CONTA[c.categoria]}{c.pago_com ? ` · ${PAGO_COM[c.pago_com]}` : ""}</span></span>
          <span className="shrink-0 font-extrabold">{brl(c.valor)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-2 sm:mt-0">
          {etiqueta}
          {c.pago_em
            ? <button onClick={() => desfazerPagamento(c)} className="text-xs font-bold text-roxo/60 underline">desfazer</button>
            : <><button onClick={() => setPagando(c)} className="rounded-full bg-lima px-3 py-1.5 text-sm font-extrabold text-roxo-escuro">Paguei</button>
                {!c.despesa_fixa_id && !c.compra_id && <button onClick={() => excluirConta(c)} aria-label={`Excluir ${c.descricao}`} className="text-xs font-bold text-red-700">✕</button>}</>}
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-3 shadow-sm">
        <button onClick={() => { setMes(somaMes(mes, -1)); setPeriodo(null); }} aria-label="Mês anterior" className="grid h-10 w-10 place-items-center rounded-full bg-creme font-extrabold">←</button>
        <span className="min-w-[160px] text-center text-lg font-extrabold text-roxo">{titulo(nomeMes(mes))}</span>
        <button onClick={() => { setMes(somaMes(mes, 1)); setPeriodo(null); }} disabled={mesAtual} aria-label="Próximo mês" className="grid h-10 w-10 place-items-center rounded-full bg-creme font-extrabold disabled:opacity-30">→</button>
        <div role="tablist" className="ml-auto flex flex-wrap gap-1.5">
          {([["resumo", "Resultado"], ["extrato", "Entradas e saídas"], ["contas", `Contas${vencidas.length ? ` (${vencidas.length}!)` : ""}`], ["ifood", "Vendas fora do sistema"], ["config", "Fixas e taxas"]] as const).map(([k, n]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`rounded-full px-3.5 py-2 text-sm font-extrabold ${aba === k ? "bg-roxo text-white" : "bg-creme text-roxo"}`}>{n}</button>
          ))}
        </div>
      </div>

      {(vencidas.length > 0 || proximas.length > 0) && aba !== "contas" && (
        <button onClick={() => setAba("contas")} className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-bold ${vencidas.length ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          {vencidas.length ? `⚠ ${vencidas.length} conta(s) vencida(s): ${brl(vencidas.reduce((s, c) => s + Number(c.valor), 0))}. ` : ""}
          {proximas.length ? `${proximas.length} vence(m) nos próximos 7 dias: ${proximas.map((c) => `${c.descricao} ${c.vencimento.slice(8, 10)}/${c.vencimento.slice(5, 7)}`).join(", ")}.` : ""}
        </button>
      )}

      {aba === "extrato" && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm">
          <span className="font-bold text-roxo/70">Período:</span>
          {([["mes", `Mês todo`], ["hoje", "Hoje"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"]] as const).map(([k, n]) => {
            const alvo = k === "mes" ? null : k === "hoje" ? { de: hoje, ate: hoje } : { de: new Date(Date.parse(hoje + "T12:00:00Z") - (Number(k) - 1) * 864e5).toISOString().slice(0, 10), ate: hoje };
            const on = JSON.stringify(alvo) === JSON.stringify(periodo);
            return <button key={k} onClick={() => setPeriodo(alvo)} aria-pressed={on} className={`rounded-full px-3 py-1.5 font-bold ${on ? "bg-roxo text-white" : "bg-creme text-roxo"}`}>{n}</button>;
          })}
          <span className="flex items-center gap-1 font-bold text-roxo/70">de
            <input type="date" aria-label="De" className="campo !w-auto !px-2 !py-1.5" value={periodo?.de ?? mes + "-01"} max={hoje} onChange={(e) => e.target.value && setPeriodo({ de: e.target.value, ate: periodo?.ate ?? ultimoDia(mes, hoje) })} />
            até <input type="date" aria-label="Até" className="campo !w-auto !px-2 !py-1.5" value={periodo?.ate ?? ultimoDia(mes, hoje)} max={hoje} onChange={(e) => e.target.value && setPeriodo({ de: periodo?.de ?? mes + "-01", ate: e.target.value })} />
          </span>
        </div>
      )}
      {aba === "extrato" && <Extrato de={periodo?.de ?? mes + "-01"} ate={periodo?.ate ?? ultimoDia(mes, hoje)} avisar={avisar} />}

      {pagando && <Pagar conta={pagando} hoje={hoje} avisar={avisar} onFim={(ok) => { setPagando(null); if (ok) carregar(); }} />}

      {aba === "resumo" && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Vendas", brl(receita), `${r.pedidos} pedidos no sistema${caderno ? ` + ${r.dias_caderno} dia(s) do caderno` : ""}${Number(r.externas_bruto) ? " + iFood" : ""}`],
            ["Compras", brl(r.compras), `${pctCompras.toFixed(0)}% das vendas`],
            ["Despesas fixas", brl(r.despesas), "aluguel, energia, salário…"],
            [mesAtual ? "Resultado até agora" : "Resultado do mês", brl(resultado), mesAtual ? "o mês ainda não fechou" : "fechado"]].map(([a, b, c], i) => (
            <div key={a} className={`rounded-2xl p-4 shadow-sm ${i === 3 ? (resultado >= 0 ? "bg-lima/40" : "bg-red-50") : "bg-white"}`}><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">{a}</div><div className={`mt-1 text-2xl font-extrabold ${i === 3 && resultado < 0 ? "text-red-700" : "text-roxo"}`}>{b}</div><div className="text-xs text-roxo/60">{c}</div></div>
          ))}
        </div>

        <Cartao titulo="Como chegou nesse resultado">
          <table className="w-full text-sm"><tbody className="divide-y divide-roxo/10">
            <tr><td className="py-1.5">Vendas no sistema (balcão, site, WhatsApp)</td><td className="text-right font-bold">{brl(r.vendas_sistema)}</td></tr>
            {caderno > 0 && <tr><td className="py-1.5">Vendas anotadas no caderno ({r.dias_caderno} dia(s) antes do sistema)</td><td className="text-right font-bold">{brl(caderno)}</td></tr>}
            {Number(r.externas_bruto) > 0 && <tr><td className="py-1.5">Vendas iFood (bruto)</td><td className="text-right font-bold">{brl(r.externas_bruto)}</td></tr>}
            <tr className="text-red-800"><td className="py-1.5">− Taxas da maquininha e do site</td><td className="text-right font-bold">{brl(r.taxas_cartao)}</td></tr>
            {comissaoIfood > 0 && <tr className="text-red-800"><td className="py-1.5">− Comissão e taxas iFood</td><td className="text-right font-bold">{brl(comissaoIfood)}</td></tr>}
            <tr className="text-red-800"><td className="py-1.5">− Compras (mercadoria, descartáveis, mercado)</td><td className="text-right font-bold">{brl(r.compras)}</td></tr>
            <tr className="text-red-800"><td className="py-1.5">− Despesas fixas do mês</td><td className="text-right font-bold">{brl(r.despesas)}</td></tr>
            <tr className="text-base"><td className="py-2 font-extrabold">= Resultado</td><td className={`text-right font-extrabold ${resultado < 0 ? "text-red-700" : "text-roxo"}`}>{brl(resultado)}</td></tr>
          </tbody></table>
          <p className="mt-2 text-xs text-roxo/60">As compras contam no mês em que foram feitas (boleto também, mesmo pago depois). Estoque que sobrou para o mês seguinte ainda não entra na conta — isso vem com a contagem mensal.</p>
        </Cartao>

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Vendas por forma de pagamento" dica="Taxa calculada com os percentuais de “Fixas e taxas”.">
            <ul className="space-y-1 text-sm">{r.por_forma.map((f) => <li key={f.forma} className="flex gap-2"><span className="flex-1">{PAGAMENTO[f.forma] ?? f.forma}</span><span className="font-bold">{brl(f.total)}</span><span className="w-32 whitespace-nowrap text-right text-red-800">− {brl(f.taxa)} <span className="text-xs">({v2(f.percentual)}%)</span></span></li>)}</ul>
            {r.por_canal.length > 0 && <p className="mt-3 text-xs text-roxo/60">{r.por_canal.map((c) => `${CANAL[c.canal] ?? c.canal}: ${brl(c.total)} (${c.pedidos})`).join(" · ")} · ticket médio {brl(r.ticket_medio)}</p>}
          </Cartao>
          <Cartao titulo="Para onde foi o dinheiro">
            <ul className="space-y-1 text-sm">
              {r.compras_por_categoria.map((c) => <li key={c.categoria} className="flex"><span className="flex-1">Compras · {CATEGORIAS[c.categoria] ?? "Sem insumo (limpeza, outros)"}</span><span className="font-bold">{brl(c.total)}</span></li>)}
              {r.despesas_por_categoria.map((c) => <li key={c.categoria} className="flex"><span className="flex-1">{CAT_CONTA[c.categoria]}{!c.pago && <span className="text-xs text-amber-700"> (a pagar)</span>}</span><span className="font-bold">{brl(c.total)}</span></li>)}
              {!r.compras_por_categoria.length && !r.despesas_por_categoria.length && <li className="text-roxo/60">Nada lançado neste mês.</li>}
            </ul>
          </Cartao>
        </div>

        {Number(r.devido_aos_donos) > 0 && (
          <Cartao titulo={`A loja deve a vocês: ${brl(r.devido_aos_donos)}`} dica="Compras e contas pagas do bolso que a loja ainda não devolveu. Compras: marque em Compras. Contas: abaixo.">
            {devendo.length > 0 && <ul className="divide-y divide-roxo/10 text-sm">{devendo.map((c) => <li key={c.id} className="flex items-center gap-2 py-1.5"><span className="flex-1">{c.descricao} · {PAGO_COM[c.pago_com!]}</span><span className="font-bold">{brl(c.valor)}</span><button onClick={() => devolverConta(c)} className="rounded-full bg-lima px-3 py-1 text-xs font-extrabold text-roxo-escuro">Devolvido</button></li>)}</ul>}
          </Cartao>
        )}
      </>}

      {aba === "contas" && <>
        <Cartao titulo="Em aberto" dica="Contas fixas aparecem sozinhas todo mês. Boletos entram ao lançar a compra.">
          {!abertas.length ? <p className="text-sm font-semibold text-roxo/60">Nenhuma conta em aberto. 🎉</p> : <ul className="divide-y divide-roxo/10">{abertas.map(linhaConta)}</ul>}
          {novaConta ? <NovaConta hoje={hoje} avisar={avisar} onFim={(ok) => { setNovaConta(false); if (ok) carregar(); }} /> : <button onClick={() => setNovaConta(true)} className="mt-3 rounded-full bg-roxo/10 px-4 py-2 text-sm font-bold text-roxo">+ Conta avulsa (manutenção, gás…)</button>}
        </Cartao>
        <Cartao titulo={`Pagas em ${nomeMes(mes)}`} dica="Inclui boletos e faturas de fornecedor. Veja tudo que saiu (compras também) em “Entradas e saídas”.">
          {(() => { const pagas = contas.filter((c) => c.pago_em && c.pago_em.startsWith(mes)).sort((a, b) => b.pago_em!.localeCompare(a.pago_em!)); return !pagas.length ? <p className="text-sm text-roxo/60">Nenhuma ainda.</p> : <ul className="divide-y divide-roxo/10">{pagas.map(linhaConta)}</ul>; })()}
        </Cartao>
      </>}

      {aba === "ifood" && <Ifood externas={externas} hoje={hoje} avisar={avisar} recarregar={carregar} />}
      {aba === "config" && <Config avisar={avisar} />}
    </>
  );
}

function Pagar({ conta, hoje, avisar, onFim }: { conta: Conta; hoje: string; avisar: Aviso; onFim: (ok: boolean) => void }) {
  const [f, setF] = useState({ data: hoje, valor: v2(conta.valor), pago_com: "conta_loja" });
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => { caixa.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, []);
  async function salvar() {
    const valor = num(f.valor);
    if (!(valor > 0)) return avisar("erro", "Informe o valor pago");
    const { error } = await supabaseNavegador().from("contas").update({ pago_em: f.data, valor, pago_com: f.pago_com }).eq("id", conta.id);
    if (error) return avisar("erro", error.message);
    avisar("ok", `${conta.descricao} paga`); onFim(true);
  }
  return (
    <div ref={caixa} className="space-y-3 rounded-3xl border-2 border-lima bg-white p-4 shadow-sm">
      <h3 className="font-extrabold text-roxo">Pagar: {conta.descricao}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="rotulo">Data do pagamento</span><input type="date" className="campo" value={f.data} max={hoje} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
        <label><span className="rotulo">Valor pago {conta.despesa_fixa_id ? "(ajuste se mudou)" : ""}</span><input inputMode="decimal" className="campo text-right font-extrabold" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value.replace(/[^\d,.]/g, "") })} /></label>
        <label><span className="rotulo">Pago com</span><select className="campo" value={f.pago_com} onChange={(e) => setF({ ...f, pago_com: e.target.value })}>{Object.entries(PAGO_COM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div className="flex gap-2"><button onClick={() => onFim(false)} className="rounded-full bg-gray-100 px-5 font-bold">Cancelar</button><button onClick={salvar} className="botao flex-1">Confirmar pagamento</button></div>
    </div>
  );
}

function NovaConta({ hoje, avisar, onFim }: { hoje: string; avisar: Aviso; onFim: (ok: boolean) => void }) {
  const [f, setF] = useState({ descricao: "", categoria: "outros", valor: "", vencimento: hoje });
  async function salvar() {
    if (f.descricao.trim().length < 2 || !(num(f.valor) > 0)) return avisar("erro", "Preencha descrição e valor");
    const { error } = await supabaseNavegador().from("contas").insert({ descricao: f.descricao.trim(), categoria: f.categoria, valor: num(f.valor), vencimento: f.vencimento });
    if (error) return avisar("erro", error.message);
    avisar("ok", "Conta lançada"); onFim(true);
  }
  return (
    <div className="mt-3 grid gap-2 rounded-2xl bg-creme p-3 sm:grid-cols-[1fr_150px_110px_150px_auto]">
      <input aria-label="Descrição" className="campo !py-2" placeholder="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} maxLength={80} />
      <select aria-label="Categoria" className="campo !py-2" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{Object.entries(CAT_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input aria-label="Valor" inputMode="decimal" className="campo !py-2 text-right" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value.replace(/[^\d,.]/g, "") })} />
      <input aria-label="Vencimento" type="date" className="campo !py-2" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
      <div className="flex gap-2"><button onClick={() => onFim(false)} className="rounded-xl bg-white px-3 font-bold">✕</button><button onClick={salvar} className="rounded-xl bg-roxo px-4 font-bold text-white">Salvar</button></div>
    </div>
  );
}

function Ifood({ externas, hoje, avisar, recarregar }: { externas: Externa[]; hoje: string; avisar: Aviso; recarregar: () => void }) {
  const [f, setF] = useState({ data: hoje, bruto: "", liquido: "", obs: "" });
  const [cad, setCad] = useState({ data: hoje, dinheiro: "", pix: "", debito: "", credito: "", obs: "" });
  const totalCad = num(cad.dinheiro) + num(cad.pix) + num(cad.debito) + num(cad.credito);
  const so = (t: string) => t.replace(/[^\d,.]/g, "");

  async function salvarCaderno(e: React.FormEvent) {
    e.preventDefault();
    if (!(totalCad > 0)) return avisar("erro", "Preencha pelo menos uma forma de pagamento.");
    const por_forma = Object.fromEntries((["dinheiro", "pix", "debito", "credito"] as const).filter((k) => num(cad[k]) > 0).map((k) => [k, num(cad[k])]));
    const { error } = await supabaseNavegador().from("entradas_externas").insert({ data: cad.data, canal: "caderno", bruto: totalCad, liquido: totalCad, por_forma, obs: cad.obs.trim() || null });
    if (error) return avisar("erro", error.code === "23505" ? `O dia ${dataBr(cad.data)} já está lançado. Exclua o lançamento abaixo para lançar de novo.` : error.message);
    avisar("ok", `Vendas de ${dataBr(cad.data)} lançadas: ${brl(totalCad)}`);
    setCad({ data: cad.data, dinheiro: "", pix: "", debito: "", credito: "", obs: "" }); recarregar();
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const bruto = num(f.bruto), liquido = num(f.liquido);
    if (!(bruto > 0) || !(liquido > 0) || liquido > bruto) return avisar("erro", "Confira os valores: o líquido não pode ser maior que o bruto.");
    const { error } = await supabaseNavegador().from("entradas_externas").insert({ data: f.data, canal: "ifood", bruto, liquido, obs: f.obs.trim() || null });
    if (error) return avisar("erro", error.message);
    avisar("ok", "Repasse do iFood lançado"); setF({ data: hoje, bruto: "", liquido: "", obs: "" }); recarregar();
  }
  async function excluir(x: Externa) {
    if (!confirm(`Excluir o lançamento de ${dataBr(x.data)} (${brl(x.bruto)})?`)) return;
    const { error } = await supabaseNavegador().from("entradas_externas").delete().eq("id", x.id);
    if (error) avisar("erro", error.message); else recarregar();
  }
  const limpaObs = (o: string | null) => (o ?? "").replace(/\s*\[import[^\]]*\]/, "").replace(/^Caixa do caderno\s*/, "");
  return (
    <>
      <Cartao titulo="Vendas de um dia anotado no caderno" dica="Para dias antes do sistema (meses anteriores) ou dias em que o caixa ficou fora do ar. Um lançamento por dia; não lance dias que já têm vendas no sistema.">
        <form onSubmit={salvarCaderno} className="grid grid-cols-2 gap-2 sm:grid-cols-[150px_repeat(4,110px)_1fr_auto]">
          <label className="col-span-2 text-xs font-bold text-roxo/60 sm:col-span-1">Dia<input type="date" className="campo !py-2" value={cad.data} max={hoje} onChange={(e) => setCad({ ...cad, data: e.target.value })} /></label>
          {(["dinheiro", "pix", "debito", "credito"] as const).map((k) => (
            <label key={k} className="text-xs font-bold text-roxo/60">{PAGAMENTO[k] ?? k}<input inputMode="decimal" className="campo !py-2 text-right" placeholder="0,00" value={cad[k]} onChange={(e) => setCad({ ...cad, [k]: so(e.target.value) })} /></label>
          ))}
          <label className="col-span-2 text-xs font-bold text-roxo/60 sm:col-span-1">Obs.<input className="campo !py-2" value={cad.obs} onChange={(e) => setCad({ ...cad, obs: e.target.value })} maxLength={80} /></label>
          <button className="botao col-span-2 self-end !min-h-[44px] !py-2 sm:col-span-1">Lançar {totalCad > 0 ? brl(totalCad) : ""}</button>
        </form>
      </Cartao>

      <Cartao titulo="Repasse do iFood" dica="O iFood não passa pelo sistema. Lance o repasse da semana (Portal do Parceiro → Financeiro): total vendido e o que caiu na conta.">
        <form onSubmit={salvar} className="grid gap-2 sm:grid-cols-[150px_130px_130px_1fr_auto]">
          <label className="text-xs font-bold text-roxo/60">Data do repasse<input type="date" className="campo !py-2" value={f.data} max={hoje} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
          <label className="text-xs font-bold text-roxo/60">Vendido (bruto)<input inputMode="decimal" className="campo !py-2 text-right" value={f.bruto} onChange={(e) => setF({ ...f, bruto: so(e.target.value) })} /></label>
          <label className="text-xs font-bold text-roxo/60">Recebido (líquido)<input inputMode="decimal" className="campo !py-2 text-right" value={f.liquido} onChange={(e) => setF({ ...f, liquido: so(e.target.value) })} /></label>
          <label className="text-xs font-bold text-roxo/60">Obs.<input className="campo !py-2" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} maxLength={80} placeholder="Ex.: semana 10 a 16/11" /></label>
          <button className="botao self-end !min-h-[44px] !py-2">Lançar</button>
        </form>
      </Cartao>

      <Cartao titulo="Lançados neste mês">
        <ul className="divide-y divide-roxo/10 text-sm">
          {externas.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-1.5">
              <span className="w-12 shrink-0 font-bold text-roxo/70">{x.data.slice(8, 10)}/{x.data.slice(5, 7)}</span>
              <span className="min-w-0 flex-1"><span className="font-bold">{x.canal === "caderno" ? "Caderno" : x.canal === "ifood" ? "iFood" : "Outra"}</span> <span className="text-xs text-roxo/60">{limpaObs(x.obs)}</span></span>
              {x.canal === "ifood" ? <span>{brl(x.bruto)} → <b>{brl(x.liquido)}</b></span> : <b>{brl(x.bruto)}</b>}
              <button onClick={() => excluir(x)} aria-label={`Excluir lançamento de ${dataBr(x.data)}`} className="text-xs font-bold text-red-700">✕</button>
            </li>
          ))}
          {!externas.length && <li className="py-2 text-roxo/60">Nada lançado neste mês.</li>}
        </ul>
      </Cartao>
    </>
  );
}

function Config({ avisar }: { avisar: Aviso }) {
  const [fixas, setFixas] = useState<Fixa[]>([]);
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [nova, setNova] = useState({ descricao: "", categoria: "outros", valor: "", dia: "10" });
  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const [f, t] = await Promise.all([sb.from("despesas_fixas").select("*").order("dia"), sb.from("taxas_pagamento").select("*").order("ordem")]);
    setFixas((f.data ?? []) as Fixa[]); setTaxas((t.data ?? []) as Taxa[]);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvarFixa(id: string, p: Partial<Fixa>) {
    const { error } = await supabaseNavegador().from("despesas_fixas").update(p).eq("id", id);
    if (error) return avisar("erro", error.message);
    avisar("ok", "Salvo. Vale a partir das próximas contas geradas."); carregar();
  }
  async function addFixa(e: React.FormEvent) {
    e.preventDefault();
    const dia = Math.min(31, Math.max(1, Number(nova.dia) || 1));
    if (nova.descricao.trim().length < 2 || !(num(nova.valor) > 0)) return avisar("erro", "Preencha descrição e valor");
    const { error } = await supabaseNavegador().from("despesas_fixas").insert({ descricao: nova.descricao.trim(), categoria: nova.categoria, valor: num(nova.valor), dia });
    if (error) return avisar("erro", error.message);
    setNova({ descricao: "", categoria: "outros", valor: "", dia: "10" }); avisar("ok", "Despesa fixa criada"); carregar();
  }
  async function salvarTaxa(forma: string, percentual: number) {
    const { error } = await supabaseNavegador().from("taxas_pagamento").update({ percentual }).eq("forma", forma);
    if (error) return avisar("erro", error.message);
    avisar("ok", "Taxa salva"); carregar();
  }

  return (
    <>
      <Cartao titulo="Despesas fixas" dica="Viram contas a pagar sozinhas todo mês, no dia do vencimento. Dia 31 em mês curto cai no último dia.">
        <ul className="divide-y divide-roxo/10">
          {fixas.map((f) => (
            <li key={f.id} className={`flex flex-wrap items-center gap-2 py-2 ${f.ativo ? "" : "opacity-50"}`}>
              <span className="min-w-0 flex-1"><span className="block font-bold">{f.descricao}</span><span className="text-xs text-roxo/60">{CAT_CONTA[f.categoria]}</span></span>
              <label className="flex items-center gap-1 text-xs font-bold text-roxo/60">dia<input aria-label={`Dia de ${f.descricao}`} inputMode="numeric" defaultValue={f.dia} className="campo !w-14 !px-2 !py-1.5 text-center" onBlur={(e) => { const d = Math.min(31, Math.max(1, Number(e.target.value) || f.dia)); if (d !== f.dia) salvarFixa(f.id, { dia: d }); }} /></label>
              <label className="flex items-center gap-1 text-xs font-bold text-roxo/60">R$<input aria-label={`Valor de ${f.descricao}`} inputMode="decimal" defaultValue={v2(f.valor)} className="campo !w-24 !px-2 !py-1.5 text-right" onBlur={(e) => { const v = num(e.target.value); if (v > 0 && v !== Number(f.valor)) salvarFixa(f.id, { valor: v }); }} /></label>
              <button onClick={() => salvarFixa(f.id, { ativo: !f.ativo })} className="rounded-full bg-creme px-3 py-1.5 text-xs font-bold">{f.ativo ? "Pausar" : "Reativar"}</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addFixa} className="mt-3 grid gap-2 rounded-2xl bg-creme p-3 sm:grid-cols-[1fr_140px_100px_70px_auto]">
          <input aria-label="Descrição" className="campo !py-2" placeholder="Nova despesa fixa (ex.: água, contador)" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} maxLength={60} />
          <select aria-label="Categoria" className="campo !py-2" value={nova.categoria} onChange={(e) => setNova({ ...nova, categoria: e.target.value })}>{Object.entries(CAT_CONTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input aria-label="Valor" inputMode="decimal" className="campo !py-2 text-right" placeholder="0,00" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value.replace(/[^\d,.]/g, "") })} />
          <input aria-label="Dia" inputMode="numeric" className="campo !py-2 text-center" placeholder="dia" value={nova.dia} onChange={(e) => setNova({ ...nova, dia: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          <button className="rounded-xl bg-roxo px-4 py-2 font-bold text-white">Criar</button>
        </form>
      </Cartao>

      <Cartao titulo="Taxas por forma de pagamento" dica="Usadas para calcular quanto realmente sobra de cada venda. Se o PIX do balcão cai direto na sua chave (sem maquininha), deixe 0.">
        <ul className="divide-y divide-roxo/10">
          {taxas.map((t) => (
            <li key={t.forma} className="flex items-center gap-2 py-2">
              <span className="flex-1 font-bold">{t.nome}</span>
              <input aria-label={`Taxa ${t.nome}`} inputMode="decimal" defaultValue={v2(t.percentual)} className="campo !w-20 !px-2 !py-1.5 text-right" onBlur={(e) => { const p = num(e.target.value); if (p >= 0 && p <= 100 && p !== Number(t.percentual)) salvarTaxa(t.forma, p); }} />
              <span className="font-bold">%</span>
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}
