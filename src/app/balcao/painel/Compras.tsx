"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { confereTotal } from "@/lib/compras/casar";
import { agoraSousa } from "@/lib/pricing";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";
import { carregarInsumos, CATEGORIAS, dataBr, FORMAS, num, PAGO_COM, qtd, UNIDADES, type Insumo } from "./estoqueComum";

type Compra = {
  id: string; data: string; fornecedor: string | null; total: number; forma: string; pago_com: string; vencimento: string | null;
  reembolsado_em: string | null; foto_path: string | null; lido_por_ia: boolean; obs: string | null; created_at: string;
  compra_itens: { id: string; descricao: string; quantidade: number; valor_total: number; insumo_id: string | null; qtd_estoque: number | null }[];
};
type Linha = { descricao: string; quantidade: string; valor: string; insumo_id: string; qtd_estoque: string; origem: "memoria" | "ia" | null };
type Cab = { data: string; fornecedor: string; cnpj: string; total: string; forma: string; pago_com: string; vencimento: string; obs: string; sangria: boolean };

const txt = (n: number | null | undefined) => (n == null ? "" : String(Math.round(Number(n) * 1000) / 1000).replace(".", ","));
const dinheiro = (n: number | null | undefined) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));
const linhaVazia = (): Linha => ({ descricao: "", quantidade: "1", valor: "", insumo_id: "", qtd_estoque: "", origem: null });

/** Reduz a foto para a leitura (lado maior até 2200 px) e devolve JPEG em base64. */
async function prepararArquivo(f: File): Promise<{ base64: string; tipo: string; blob: Blob }> {
  if (f.type === "application/pdf") {
    if (f.size > 4_000_000) throw new Error("PDF grande demais (máx. 4 MB).");
    const b = new Uint8Array(await f.arrayBuffer());
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { base64: btoa(s), tipo: "application/pdf", blob: f };
  }
  const img = await createImageBitmap(f);
  const escala = Math.min(1, 2200 / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala); tela.height = Math.round(img.height * escala);
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob>((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível ler a imagem"))), "image/jpeg", 0.85));
  const url = tela.toDataURL("image/jpeg", 0.85);
  return { base64: url.slice(url.indexOf(",") + 1), tipo: "image/jpeg", blob };
}

export default function Compras({ avisar }: { avisar: Aviso }) {
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [nova, setNova] = useState<null | "foto" | "manual">(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const desde = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const [ins, c] = await Promise.all([
        carregarInsumos(),
        supabaseNavegador().from("compras").select("*, compra_itens(*)").gte("data", desde).order("data", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (c.error) throw new Error(c.error.message);
      setInsumos(ins); setCompras(c.data as Compra[]);
    } catch (e) { avisar("erro", "Não foi possível carregar as compras: " + (e as Error).message); }
  }, [avisar]);
  useEffect(() => { carregar(); }, [carregar]);

  if (nova) return <NovaCompra modo={nova} insumos={insumos} avisar={avisar} recarregarInsumos={() => carregarInsumos().then(setInsumos)} onFim={(salvou) => { setNova(null); if (salvou) carregar(); }} />;

  const mes = agoraSousa().data.slice(0, 7);
  const doMes = (compras ?? []).filter((c) => c.data.startsWith(mes));
  const devendo = (compras ?? []).filter((c) => (c.pago_com === "dono" || c.pago_com === "esposa") && !c.reembolsado_em);

  async function devolvido(c: Compra) {
    const { error } = await supabaseNavegador().from("compras").update({ reembolsado_em: agoraSousa().data }).eq("id", c.id);
    if (error) return avisar("erro", error.message);
    avisar("ok", "Marcado como devolvido"); carregar();
  }
  async function excluir(c: Compra) {
    if (!confirm(`Excluir a compra de ${brl(c.total)} (${c.fornecedor ?? "sem fornecedor"})? O que entrou no estoque sai de novo.`)) return;
    const { error } = await supabaseNavegador().rpc("excluir_compra", { p_id: c.id });
    if (error) return avisar("erro", error.message);
    if (c.foto_path) await supabaseNavegador().storage.from("comprovantes").remove([c.foto_path]);
    avisar("ok", "Compra excluída"); carregar();
  }
  async function verFoto(path: string) {
    const { data, error } = await supabaseNavegador().storage.from("comprovantes").createSignedUrl(path, 300);
    if (error || !data) return avisar("erro", "Não foi possível abrir o comprovante");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setNova("foto")} className="botao min-h-[64px] text-lg">📷 Lançar compra pela foto</button>
        <button onClick={() => setNova("manual")} className="botao-lima min-h-[64px]">✍️ Lançar sem comprovante</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Compras no mês</div><div className="mt-1 text-2xl font-extrabold text-roxo">{brl(doMes.reduce((s, c) => s + Number(c.total), 0))}</div><div className="text-xs text-roxo/60">{doMes.length} lançamento(s)</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wider text-roxo/60">Pago do bolso (a devolver)</div><div className={`mt-1 text-2xl font-extrabold ${devendo.length ? "text-amber-700" : "text-roxo"}`}>{brl(devendo.reduce((s, c) => s + Number(c.total), 0))}</div><div className="text-xs text-roxo/60">{devendo.length} compra(s)</div></div>
      </div>

      <Cartao titulo="Compras lançadas" dica="Últimos 90 dias. Toque para ver os itens.">
        {!compras ? <p>Carregando…</p> : !compras.length ? <p className="text-sm font-semibold text-roxo/60">Nenhuma compra lançada ainda.</p> : (
          <ul className="divide-y divide-roxo/10">
            {compras.map((c) => {
              const bolso = (c.pago_com === "dono" || c.pago_com === "esposa") && !c.reembolsado_em;
              return (
                <li key={c.id} className="py-2">
                  <button onClick={() => setAberta(aberta === c.id ? null : c.id)} className="flex w-full items-center gap-3 text-left">
                    <span className="w-12 shrink-0 text-sm font-bold text-roxo/70">{c.data.slice(8, 10)}/{c.data.slice(5, 7)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.fornecedor ?? "Sem fornecedor"}</span>
                      <span className="block text-xs text-roxo/60">{FORMAS[c.forma]} · {PAGO_COM[c.pago_com]}{c.forma === "boleto" && c.vencimento ? ` · vence ${dataBr(c.vencimento)}` : ""} · {c.compra_itens.length} item(ns)</span>
                    </span>
                    <span className="text-right"><span className="block font-extrabold">{brl(c.total)}</span>{bolso && <span className="text-xs font-bold text-amber-700">a devolver</span>}</span>
                  </button>
                  {aberta === c.id && (
                    <div className="mt-2 space-y-2 rounded-2xl bg-creme p-3 text-sm">
                      <ul className="space-y-1">{c.compra_itens.map((i) => {
                        const ins = insumos.find((x) => x.id === i.insumo_id);
                        return <li key={i.id} className="flex gap-2"><span className="flex-1">{qtd(i.quantidade)}× {i.descricao}{ins && <span className="text-xs text-roxo/60"> → {ins.nome} +{qtd(i.qtd_estoque, ins.unidade)}</span>}</span><span className="font-semibold">{brl(i.valor_total)}</span></li>;
                      })}</ul>
                      {c.obs && <p className="text-roxo/70">Obs.: {c.obs}</p>}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {c.foto_path && <button onClick={() => verFoto(c.foto_path!)} className="rounded-full bg-white px-3 py-1.5 font-bold">Ver comprovante</button>}
                        {bolso && <button onClick={() => devolvido(c)} className="rounded-full bg-lima px-3 py-1.5 font-bold text-roxo-escuro">Loja já devolveu</button>}
                        <button onClick={() => excluir(c)} className="ml-auto rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-700">Excluir</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function NovaCompra({ modo, insumos, avisar, recarregarInsumos, onFim }: { modo: "foto" | "manual"; insumos: Insumo[]; avisar: Aviso; recarregarInsumos: () => Promise<unknown>; onFim: (salvou: boolean) => void }) {
  const hoje = agoraSousa().data;
  const [etapa, setEtapa] = useState<"escolher" | "lendo" | "conferir">(modo === "foto" ? "escolher" : "conferir");
  const [cab, setCab] = useState<Cab>({ data: hoje, fornecedor: "", cnpj: "", total: "", forma: "dinheiro", pago_com: "conta_loja", vencimento: "", obs: "", sangria: true });
  const [itens, setItens] = useState<Linha[]>(modo === "manual" ? [linhaVazia()] : []);
  const [foto, setFoto] = useState<{ path: string | null; preview: string | null }>({ path: null, preview: null });
  const [aviso, setAviso] = useState<string | null>(null);
  const [lidoIA, setLidoIA] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoInsumo, setNovoInsumo] = useState<number | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  async function escolher(f: File | undefined) {
    if (!f) return;
    setEtapa("lendo"); setAviso(null);
    try {
      const arq = await prepararArquivo(f);
      if (arq.tipo !== "application/pdf") setFoto((x) => ({ ...x, preview: URL.createObjectURL(arq.blob) }));
      const ext = arq.tipo === "application/pdf" ? "pdf" : "jpg";
      const path = `${hoje.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const [envio, leitura] = await Promise.all([
        supabaseNavegador().storage.from("comprovantes").upload(path, arq.blob, { contentType: arq.tipo }),
        fetch("/api/compras/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ arquivo: arq.base64, tipo: arq.tipo }) }).then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) })),
      ]);
      if (!envio.error) setFoto((x) => ({ ...x, path }));
      if (!leitura.ok) {
        setAviso((leitura.j.erro ?? "Não consegui ler o comprovante.") + " Preencha os itens à mão.");
        setItens([linhaVazia()]); setEtapa("conferir"); return;
      }
      const j = leitura.j;
      setLidoIA(true);
      setCab((c) => ({ ...c, data: j.data ?? c.data, fornecedor: j.fornecedor ?? "", cnpj: j.cnpj ?? "", total: j.total != null ? dinheiro(j.total) : "", forma: j.forma ?? c.forma, vencimento: j.vencimento ?? "", sangria: (j.data ?? hoje) === hoje }));
      setItens((j.itens as { descricao: string; quantidade: number; valor_total: number; insumo_id: string | null; qtd_estoque: number | null; origem: Linha["origem"] }[]).map((i) => ({
        descricao: i.descricao, quantidade: txt(i.quantidade), valor: dinheiro(i.valor_total), insumo_id: i.insumo_id ?? "", qtd_estoque: txt(i.qtd_estoque), origem: i.origem,
      })));
      if (j.observacao) setAviso("Leitura: " + j.observacao);
      setEtapa("conferir");
    } catch (e) {
      setAviso((e as Error).message + " Preencha à mão."); setItens([linhaVazia()]); setEtapa("conferir");
    }
  }

  const mudar = (i: number, p: Partial<Linha>) => setItens((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const total = num(cab.total);
  const conf = confereTotal(itens.map((i) => ({ valor_total: num(i.valor) })), total);

  async function salvar() {
    if (!total) return avisar("erro", "Informe o total da compra.");
    if (cab.forma === "boleto" && !cab.vencimento) return avisar("erro", "Informe o vencimento do boleto.");
    const validos = itens.filter((i) => i.descricao.trim());
    if (!validos.length) return avisar("erro", "Adicione pelo menos um item.");
    const semQtd = validos.find((i) => i.insumo_id && !(num(i.qtd_estoque) > 0));
    if (semQtd) return avisar("erro", `Informe quanto entra no estoque de "${semQtd.descricao}".`);
    setSalvando(true);
    const { error } = await supabaseNavegador().rpc("registrar_compra", {
      p: {
        data: cab.data, fornecedor: cab.fornecedor, cnpj: cab.cnpj, total, forma: cab.forma, pago_com: cab.pago_com,
        vencimento: cab.forma === "boleto" ? cab.vencimento : null, foto_path: foto.path, lido_por_ia: lidoIA, obs: cab.obs,
        sangria: cab.pago_com === "caixa" && cab.sangria,
        itens: validos.map((i) => ({ descricao: i.descricao.trim(), quantidade: num(i.quantidade) || 1, valor_total: num(i.valor), insumo_id: i.insumo_id || null, qtd_estoque: i.insumo_id ? num(i.qtd_estoque) : null, lembrar: true })),
      },
    });
    setSalvando(false);
    if (error) return avisar("erro", "Não foi possível salvar: " + error.message);
    avisar("ok", "Compra lançada" + (validos.some((i) => i.insumo_id) ? " e estoque atualizado" : ""));
    onFim(true);
  }

  async function cancelar() {
    if (foto.path) await supabaseNavegador().storage.from("comprovantes").remove([foto.path]);
    onFim(false);
  }

  if (etapa !== "conferir") return (
    <Cartao titulo="Lançar compra pela foto" dica="Tire a foto do cupom fiscal, nota ou comprovante, de perto, inteiro e com boa luz. Cupom comprido: pode mandar em PDF ou em mais de uma compra.">
      {etapa === "lendo" ? (
        <div className="space-y-3 py-6 text-center">
          {foto.preview && (<>
            {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
            <img src={foto.preview} alt="Comprovante enviado" className="mx-auto max-h-64 rounded-xl" />
          </>)}
          <p className="animate-pulse font-extrabold text-roxo">Lendo o comprovante… (até 30 segundos)</p>
        </div>
      ) : (
        <div className="space-y-3">
          <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          <input ref={galeria} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => camera.current?.click()} className="botao min-h-[64px] text-lg">📷 Tirar foto agora</button>
            <button onClick={() => galeria.current?.click()} className="botao-lima min-h-[64px] text-lg">🖼️ Escolher da galeria / PDF</button>
          </div>
          <button onClick={() => onFim(false)} className="w-full rounded-full bg-gray-100 py-3 font-bold">Voltar</button>
        </div>
      )}
    </Cartao>
  );

  return (
    <div className="space-y-4">
      <Cartao titulo={lidoIA ? "Confira a leitura" : "Nova compra"} dica={lidoIA ? "Confira cada linha. O que você ligar a um insumo entra no estoque, e o sistema lembra na próxima compra." : "Itens ligados a um insumo entram no estoque."}>
        {aviso && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{aviso}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className="rotulo">Data</span><input type="date" className="campo" value={cab.data} max={hoje} onChange={(e) => setCab({ ...cab, data: e.target.value, sangria: e.target.value === hoje })} /></label>
          <label className="lg:col-span-2"><span className="rotulo">Fornecedor / loja</span><input className="campo" value={cab.fornecedor} onChange={(e) => setCab({ ...cab, fornecedor: e.target.value })} placeholder="Ex.: Atacadão, Mais Sabor, feira" maxLength={80} /></label>
          <label><span className="rotulo">Total pago</span><input inputMode="decimal" className="campo text-right text-lg font-extrabold" value={cab.total} onChange={(e) => setCab({ ...cab, total: e.target.value.replace(/[^\d,.]/g, "") })} placeholder="0,00" /></label>
          <label><span className="rotulo">Forma</span><select className="campo" value={cab.forma} onChange={(e) => setCab({ ...cab, forma: e.target.value })}>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {cab.forma === "boleto"
            ? <label><span className="rotulo">Vencimento do boleto</span><input type="date" className="campo" value={cab.vencimento} onChange={(e) => setCab({ ...cab, vencimento: e.target.value })} /></label>
            : <label><span className="rotulo">Pago com</span><select className="campo" value={cab.pago_com} onChange={(e) => setCab({ ...cab, pago_com: e.target.value })}>{Object.entries(PAGO_COM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        </div>
        {cab.forma === "boleto" && <p className="mt-2 text-xs font-semibold text-roxo/60">O boleto vai para Contas a pagar com aviso antes do vencimento.</p>}
        {cab.forma !== "boleto" && cab.pago_com === "caixa" && (
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-roxo" checked={cab.sangria} onChange={(e) => setCab({ ...cab, sangria: e.target.checked })} />Lançar como sangria no caixa aberto (para a gaveta bater)</label>
        )}
        {(cab.pago_com === "dono" || cab.pago_com === "esposa") && cab.forma !== "boleto" && <p className="mt-2 text-xs font-semibold text-amber-800">Fica em “a devolver” até a loja reembolsar.</p>}
      </Cartao>

      <Cartao titulo={`Itens (${itens.length})`}>
        <ul className="space-y-3">
          {itens.map((it, i) => {
            const ins = insumos.find((x) => x.id === it.insumo_id);
            return (
              <li key={i} className="rounded-2xl bg-creme p-3">
                <div className="flex gap-2">
                  <input aria-label="Descrição" className="campo !py-2 text-sm font-semibold" value={it.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })} placeholder="Descrição" />
                  <button onClick={() => setItens((l) => l.filter((_, k) => k !== i))} aria-label="Remover item" className="shrink-0 rounded-xl bg-white px-3 text-red-700">✕</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[90px_110px_1fr_140px]">
                  <label className="text-xs font-bold text-roxo/60">Qtd<input inputMode="decimal" className="campo !py-2 text-sm" value={it.quantidade} onChange={(e) => mudar(i, { quantidade: e.target.value.replace(/[^\d,.]/g, "") })} /></label>
                  <label className="text-xs font-bold text-roxo/60">Valor (R$)<input inputMode="decimal" className="campo !py-2 text-right text-sm" value={it.valor} onChange={(e) => mudar(i, { valor: e.target.value.replace(/[^\d,.]/g, "") })} /></label>
                  <label className="col-span-2 text-xs font-bold text-roxo/60 sm:col-span-1">Insumo do estoque {it.origem === "memoria" && <span className="rounded bg-lima/40 px-1 text-[10px] text-roxo-escuro">lembrado</span>}{it.origem === "ia" && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-900">sugestão</span>}
                    <select className="campo !py-2 text-sm" value={it.insumo_id} onChange={(e) => { if (e.target.value === "__novo") return setNovoInsumo(i); mudar(i, { insumo_id: e.target.value, origem: null, qtd_estoque: it.qtd_estoque || it.quantidade }); }}>
                      <option value="">Não entra no estoque</option>
                      {Object.entries(CATEGORIAS).map(([c, nome]) => {
                        const l = insumos.filter((x) => x.categoria === c && x.ativo);
                        return l.length ? <optgroup key={c} label={nome}>{l.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}</optgroup> : null;
                      })}
                      <option value="__novo">+ Cadastrar novo insumo…</option>
                    </select>
                  </label>
                  {it.insumo_id && (
                    <label className="col-span-2 text-xs font-bold text-roxo/60 sm:col-span-1">Entra no estoque
                      <span className="flex items-center gap-1"><input inputMode="decimal" className="campo !py-2 text-right text-sm font-extrabold" value={it.qtd_estoque} onChange={(e) => mudar(i, { qtd_estoque: e.target.value.replace(/[^\d,.]/g, "") })} /><span className="font-extrabold text-roxo">{ins?.unidade}</span></span>
                    </label>
                  )}
                </div>
                {novoInsumo === i && <CadastroRapido nome={it.descricao} avisar={avisar} onPronto={async (id) => { setNovoInsumo(null); if (id) { await recarregarInsumos(); mudar(i, { insumo_id: id, qtd_estoque: it.quantidade, origem: null }); } }} />}
              </li>
            );
          })}
        </ul>
        <button onClick={() => setItens((l) => [...l, linhaVazia()])} className="mt-3 rounded-full bg-roxo/10 px-4 py-2 text-sm font-bold text-roxo">+ Item</button>
        {total > 0 && !conf.ok && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">A soma dos itens ({brl(conf.soma)}) não bate com o total ({brl(total)}). Diferença: {brl(conf.diferenca)} — pode ser desconto ou item faltando.</p>}
      </Cartao>

      <label className="block"><span className="rotulo">Observação (opcional)</span><input className="campo" value={cab.obs} onChange={(e) => setCab({ ...cab, obs: e.target.value })} maxLength={200} /></label>
      <div className="flex gap-2">
        <button onClick={cancelar} className="rounded-full bg-gray-100 px-5 font-bold">Cancelar</button>
        <button onClick={salvar} disabled={salvando} className="botao flex-1">{salvando ? "Salvando…" : `Salvar compra${total ? " de " + brl(total) : ""}`}</button>
      </div>
    </div>
  );
}

function CadastroRapido({ nome, avisar, onPronto }: { nome: string; avisar: Aviso; onPronto: (id: string | null) => void }) {
  const limpo = nome.replace(/\s+/g, " ").trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).slice(0, 60);
  const [f, setF] = useState({ nome: limpo, categoria: "insumos", unidade: "un" });
  async function criar() {
    if (f.nome.trim().length < 2) return;
    const { data, error } = await supabaseNavegador().from("insumos").insert({ nome: f.nome.trim(), categoria: f.categoria, unidade: f.unidade }).select("id").single();
    if (error) return avisar("erro", error.code === "23505" ? "Já existe um insumo com esse nome." : error.message);
    avisar("ok", "Insumo cadastrado"); onPronto(data.id);
  }
  return (
    <div className="mt-2 grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-[1fr_160px_90px_auto]">
      <input aria-label="Nome do insumo" className="campo !py-2 text-sm" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
      <select aria-label="Categoria" className="campo !py-2 text-sm" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select aria-label="Unidade" className="campo !py-2 text-sm" value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select>
      <div className="flex gap-2"><button onClick={() => onPronto(null)} className="rounded-xl bg-gray-100 px-3 text-sm font-bold">✕</button><button onClick={criar} className="rounded-xl bg-roxo px-3 text-sm font-bold text-white">Criar</button></div>
    </div>
  );
}
