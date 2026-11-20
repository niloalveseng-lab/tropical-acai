"use client";
import { useEffect, useMemo, useState } from "react";
import { PAGAMENTO } from "@/lib/pedidos/comanda";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";
import { CAT_CONTA, dataBr, FORMAS, PAGO_COM } from "./estoqueComum";

type Linha = { data: string; tipo: "entrada" | "saida"; origem: string; descricao: string; categoria: string; forma: string | null; pago_com: string | null; valor: number; ref: string | null };

const ORIGEM: Record<string, string> = { sistema: "Sistema", caderno: "Caderno", ifood: "iFood", outro: "Outra entrada", compra: "Compra", conta: "Conta paga" };
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => DIAS[new Date(d + "T12:00:00Z").getUTCDay()];

/** "pix=10.5;dinheiro=3" → "PIX R$ 10,50 · Dinheiro R$ 3,00"; forma simples → nome. */
function formaTexto(f: string | null) {
  if (!f) return "";
  if (!f.includes("=")) return FORMAS[f] ?? PAGAMENTO[f] ?? f;
  return f.split(";").map((p) => { const [k, v] = p.split("="); return `${PAGAMENTO[k] ?? FORMAS[k] ?? k} ${brl(Number(v))}`; }).join(" · ");
}

export default function Extrato({ de, ate, avisar }: { de: string; ate: string; avisar: Aviso }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [tipo, setTipo] = useState<"tudo" | "entrada" | "saida">("tudo");
  const [pagoCom, setPagoCom] = useState("");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    setLinhas(null);
    supabaseNavegador().rpc("extrato", { p_de: de, p_ate: ate }).then(({ data, error }) => {
      if (error) { avisar("erro", "Não foi possível carregar o extrato: " + error.message); setLinhas([]); return; }
      setLinhas(((data ?? []) as Linha[]).map((l) => ({ ...l, valor: Number(l.valor) })));
    });
  }, [de, ate, avisar]);

  const filtradas = useMemo(() => (linhas ?? []).filter((l) =>
    (tipo === "tudo" || l.tipo === tipo) && (!pagoCom || l.pago_com === pagoCom) && (!categoria || l.categoria === categoria) &&
    (!busca || l.descricao.toLowerCase().includes(busca.toLowerCase()))), [linhas, tipo, pagoCom, categoria, busca]);

  if (!linhas) return <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p>;
  const entradas = filtradas.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const saidas = filtradas.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const dias = [...new Set(filtradas.map((l) => l.data))];
  const categorias = [...new Set(linhas.filter((l) => l.tipo === "saida").map((l) => l.categoria))];

  function baixarCsv() {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const cab = ["Data", "Tipo", "Origem", "Descrição", "Categoria", "Forma", "Pago com", "Valor"];
    const corpo = filtradas.map((l) => [dataBr(l.data), l.tipo === "entrada" ? "Entrada" : "Saída", ORIGEM[l.origem] ?? l.origem, l.descricao, CAT_CONTA[l.categoria] ?? l.categoria, formaTexto(l.forma), l.pago_com ? PAGO_COM[l.pago_com] : "", (l.tipo === "saida" ? -l.valor : l.valor).toFixed(2).replace(".", ",")]);
    const csv = "﻿" + [cab, ...corpo].map((r) => r.map(esc).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `extrato-tropical-acai-${de}-a-${ate}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-bold ${on ? "bg-roxo text-white" : "bg-creme text-roxo"}`;
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Entrou</div><div className="mt-1 text-xl font-extrabold text-green-700 sm:text-2xl">{brl(entradas)}</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Saiu</div><div className="mt-1 text-xl font-extrabold text-red-700 sm:text-2xl">{brl(saidas)}</div></div>
        <div className={`rounded-2xl p-4 shadow-sm ${entradas - saidas >= 0 ? "bg-lima/40" : "bg-red-50"}`}><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Saldo</div><div className="mt-1 text-xl font-extrabold text-roxo sm:text-2xl">{brl(entradas - saidas)}</div></div>
      </div>

      <Cartao titulo={`Entradas e saídas · ${dataBr(de)} a ${dataBr(ate)}`} dica="Pela data em que o dinheiro entrou ou saiu. Boletos e faturas aparecem no dia em que foram pagos.">
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {([["tudo", "Tudo"], ["entrada", "Entradas"], ["saida", "Saídas"]] as const).map(([k, n]) => <button key={k} onClick={() => setTipo(k)} aria-pressed={tipo === k} className={chip(tipo === k)}>{n}</button>)}
            <span className="mx-1 w-px bg-roxo/10" />
            {([["", "Qualquer conta"], ...Object.entries(PAGO_COM)] as [string, string][]).map(([k, n]) => <button key={k || "todas"} onClick={() => setPagoCom(k)} aria-pressed={pagoCom === k} className={chip(pagoCom === k)}>{n}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Categoria" className="campo !w-auto !py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => <option key={c} value={c}>{c === "compras" ? "Compras" : CAT_CONTA[c] ?? c}</option>)}
            </select>
            <input className="campo !w-48 !py-2 text-sm" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <button onClick={baixarCsv} disabled={!filtradas.length} className="ml-auto rounded-full bg-roxo/10 px-4 py-2 text-sm font-bold text-roxo disabled:opacity-40">⬇ Baixar planilha</button>
          </div>
        </div>

        {!filtradas.length ? <p className="py-4 text-sm font-semibold text-roxo/60">Nada nesse período/filtro.</p> : (
          <div className="space-y-4">
            {dias.map((d) => {
              const doDia = filtradas.filter((l) => l.data === d);
              const saldoDia = doDia.reduce((s, l) => s + (l.tipo === "entrada" ? l.valor : -l.valor), 0);
              return (
                <div key={d}>
                  <div className="mb-1 flex items-center gap-2 border-b border-roxo/10 pb-1 text-sm font-extrabold text-roxo">
                    <span>{dataBr(d)} <span className="font-semibold text-roxo/50">{diaSemana(d)}</span></span>
                    <span className={`ml-auto ${saldoDia >= 0 ? "text-green-700" : "text-red-700"}`}>{saldoDia >= 0 ? "+" : "−"} {brl(Math.abs(saldoDia))}</span>
                  </div>
                  <ul className="divide-y divide-roxo/5">
                    {doDia.map((l, i) => (
                      <li key={(l.ref ?? l.origem) + i} className="flex items-start gap-2 py-1.5 text-sm">
                        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-extrabold ${l.tipo === "entrada" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{l.tipo === "entrada" ? "+" : "−"}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold leading-tight">{l.descricao}</span>
                          <span className="block text-xs text-roxo/60">{ORIGEM[l.origem] ?? l.origem}{l.categoria !== "vendas" && l.categoria !== "compras" ? ` · ${CAT_CONTA[l.categoria] ?? l.categoria}` : ""}{l.forma ? ` · ${formaTexto(l.forma)}` : ""}{l.pago_com ? ` · ${PAGO_COM[l.pago_com]}` : ""}</span>
                        </span>
                        <span className={`shrink-0 font-extrabold ${l.tipo === "entrada" ? "text-green-700" : "text-red-700"}`}>{l.tipo === "entrada" ? "" : "−"}{brl(l.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Cartao>
    </>
  );
}
