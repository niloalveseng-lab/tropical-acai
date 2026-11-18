"use client";
import { useCallback, useEffect, useState } from "react";
import { agoraSousa } from "@/lib/pricing";
import { PAGAMENTO } from "@/lib/pedidos/comanda";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";

type Rel = {
  total: number; pedidos: number; ticket_medio: number; taxas_entrega: number; cancelados: number; quilo_g: number; a_receber?: number;
  entregas?: { qtd: number; taxas: number; por_entregador: { entregador: string; qtd: number; taxas: number }[] };
  por_dia: { dia: string; total: number; pedidos: number }[];
  por_canal: { canal: string; total: number; pedidos: number }[];
  por_pagamento: { forma: string; total: number }[];
  mais_vendidos: { nome: string; quantidade: number; total: number }[];
  caixas: { aberto_em: string; fechado_em: string | null; abertura: number; contado: number | null; esperado: number; observacao: string | null }[];
};
const CANAL: Record<string, string> = { site: "Site", balcao: "Balcão", whatsapp: "WhatsApp (pelo caixa)" };
const menosDias = (data: string, n: number) => { const d = new Date(data + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });

export default function Relatorios({ avisar }: { avisar: Aviso }) {
  const hoje = agoraSousa().data;
  const [de, setDe] = useState(hoje), [ate, setAte] = useState(hoje);
  const [r, setR] = useState<Rel | null>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(async (d: string, a: string) => {
    if (a < d) return avisar("erro", "A data final é anterior à inicial.");
    setCarregando(true);
    const { data, error } = await supabaseNavegador().rpc("relatorio_vendas", { p_de: d, p_ate: a });
    setCarregando(false);
    if (error || !data) return avisar("erro", "Não foi possível gerar o relatório" + (error ? ": " + error.message : ""));
    setR(data as Rel);
  }, [avisar]);
  useEffect(() => { buscar(de, ate); }, [de, ate, buscar]);

  const atalhos: [string, string, string][] = [["Hoje", hoje, hoje], ["Ontem", menosDias(hoje, 1), menosDias(hoje, 1)], ["7 dias", menosDias(hoje, 6), hoje], ["30 dias", menosDias(hoje, 29), hoje], ["Este mês", hoje.slice(0, 8) + "01", hoje]];
  const maiorDia = Math.max(1, ...(r?.por_dia.map((d) => Number(d.total)) ?? []));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-white p-4 text-sm shadow-sm">
        {atalhos.map(([n, d, a]) => <button key={n} aria-pressed={de === d && ate === a} onClick={() => { setDe(d); setAte(a); }} className={`rounded-full px-3.5 py-2 font-extrabold ${de === d && ate === a ? "bg-roxo text-white" : "bg-creme text-roxo"}`}>{n}</button>)}
        <label className="ml-auto flex items-center gap-2 font-semibold">De <input type="date" className="campo !w-auto !py-1.5" value={de} max={hoje} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
        <label className="flex items-center gap-2 font-semibold">até <input type="date" className="campo !w-auto !py-1.5" value={ate} max={hoje} onChange={(e) => e.target.value && setAte(e.target.value)} /></label>
      </div>

      {!r ? <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p> : (
        <div className={`space-y-4 transition ${carregando ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[["Vendido", brl(r.total)], ["Pedidos", String(r.pedidos)], ["Ticket médio", brl(r.ticket_medio)], ["Cancelados", String(r.cancelados)]].map(([a, b]) => (
              <div key={a} className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">{a}</div><div className="mt-1 text-2xl font-extrabold text-roxo">{b}</div></div>
            ))}
          </div>
          {r.pedidos === 0 ? <p className="rounded-3xl bg-white p-8 text-center font-semibold text-roxo/60">Nenhuma venda neste período.</p> : <>
            {r.por_dia.length > 1 && (
              <Cartao titulo="Vendas por dia">
                <ul className="space-y-1.5 text-sm">{r.por_dia.map((d) => (
                  <li key={d.dia} className="flex items-center gap-2"><span className="w-12 shrink-0 font-bold">{dataBr(d.dia)}</span>
                    <div className="h-6 flex-1 rounded-md bg-creme"><div className="h-6 rounded-md bg-roxo" style={{ width: `${Math.max(2, (Number(d.total) / maiorDia) * 100)}%` }} /></div>
                    <span className="w-24 shrink-0 text-right font-bold">{brl(d.total)}</span><span className="w-8 shrink-0 text-right text-roxo/60">{d.pedidos}</span></li>
                ))}</ul>
              </Cartao>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Cartao titulo="Por canal"><Tabela linhas={r.por_canal.map((c) => [CANAL[c.canal] ?? c.canal, `${c.pedidos} pedidos`, brl(c.total)])} /></Cartao>
              <Cartao titulo="Por forma de pagamento"><Tabela linhas={r.por_pagamento.map((p) => [PAGAMENTO[p.forma] ?? p.forma, "", brl(p.total)])} />
                {Number(r.taxas_entrega) > 0 && <p className="mt-2 text-xs text-roxo/60">Inclui {brl(r.taxas_entrega)} de taxas de entrega.</p>}</Cartao>
            </div>
            {r.entregas && r.entregas.qtd > 0 && (
              <Cartao titulo="Entregas (saídas)" dica={`${r.entregas.qtd} entregas · ${brl(r.entregas.taxas)} em taxas${Number(r.a_receber) > 0 ? ` · ${brl(Number(r.a_receber))} ficou a receber` : ""}`}>
                <Tabela linhas={r.entregas.por_entregador.map((e) => [e.entregador, `${e.qtd} entregas`, brl(e.taxas)])} />
              </Cartao>
            )}
            <Cartao titulo="Mais vendidos" dica={Number(r.quilo_g) > 0 ? `Açaí no quilo: ${(Number(r.quilo_g) / 1000).toFixed(3).replace(".", ",")} kg vendidos.` : undefined}>
              <Tabela linhas={r.mais_vendidos.map((m) => [m.nome, `${m.quantidade}×`, brl(m.total)])} />
            </Cartao>
          </>}
          {r.caixas.length > 0 && (
            <Cartao titulo="Caixas do período">
              <Tabela linhas={r.caixas.map((c) => {
                const dif = c.contado == null ? null : Math.round((Number(c.contado) - Number(c.esperado)) * 100) / 100;
                return [`${dataHora(c.aberto_em)} → ${c.fechado_em ? dataHora(c.fechado_em) : "aberto"}`, `Esperado ${brl(c.esperado)}`, dif == null ? "—" : dif === 0 ? "Conferiu ✓" : dif > 0 ? `Sobrou ${brl(dif)}` : `Faltou ${brl(-dif)}`];
              })} />
            </Cartao>
          )}
        </div>
      )}
    </>
  );
}

function Tabela({ linhas }: { linhas: string[][] }) {
  return <table className="w-full text-sm"><tbody className="divide-y divide-roxo/10">{linhas.map((l, i) => <tr key={i}><td className="py-2 font-semibold">{l[0]}</td><td className="px-2 text-right text-roxo/60">{l[1]}</td><td className="text-right font-extrabold">{l[2]}</td></tr>)}</tbody></table>;
}
