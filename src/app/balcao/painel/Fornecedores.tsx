"use client";
/** Fornecedores: dados de contato/pagamento, catálogo com preços e o que já foi comprado de cada um. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { brl, Cartao, type Aviso } from "./comum";
import { carregarInsumos, dataBr, FREQUENCIAS, num, precoUn, type Insumo } from "./estoqueComum";

type Fornecedor = {
  id: string; nome: string; razao_social: string | null; apelidos: string[]; vendedor: string | null; whatsapp: string | null; cidade: string | null;
  fornece: string | null; pagamento: string | null; frequencia: string | null; pedido_minimo: string | null; obs: string | null; catalogo_em: string | null; ativo: boolean;
};
type Produto = {
  id: string; fornecedor_id: string; linha: string; nome: string; descricao: string | null; embalagem: string | null; emb_qtd: number | null;
  preco: number | null; insumo_id: string | null; ordem: number; ativo: boolean; atualizado_em: string;
};
type Compra = { id: string; data: string; fornecedor: string | null; total: number; forma: string; vencimento: string | null };
type Conta = { id: string; descricao: string; valor: number; vencimento: string | null };

const sb = () => supabaseNavegador();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** A compra/conta é deste fornecedor? Compara o nome e os apelidos com o texto lançado. */
const ehDele = (f: Fornecedor, texto: string | null) => !!texto && [f.nome, ...f.apelidos].some((a) => a.trim().length > 2 && semAcento(texto).includes(semAcento(a.replace(/\s*\(.*\)$/, ""))));
const whats = (n: string) => `https://wa.me/55${n.replace(/\D/g, "").replace(/^55/, "")}`;
const dinheiroTxt = (n: number | null) => (n == null ? "" : Number(n).toFixed(2).replace(".", ","));

export default function Fornecedores({ avisar }: { avisar: Aviso }) {
  const [lista, setLista] = useState<Fornecedor[] | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Fornecedor | "novo" | null>(null);

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    const [f, p, c, k, i] = await Promise.all([
      sb().from("fornecedores").select("*").order("nome"),
      sb().from("fornecedor_produtos").select("*").order("ordem").order("nome"),
      sb().from("compras").select("id,data,fornecedor,total,forma,vencimento").gte("data", desde).order("data", { ascending: false }),
      sb().from("contas").select("id,descricao,valor,vencimento").is("pago_em", null).order("vencimento"),
      carregarInsumos().catch(() => [] as Insumo[]),
    ]);
    const erro = [f, p, c, k].find((r) => r.error)?.error;
    if (erro) return avisar("erro", "Não foi possível carregar os fornecedores: " + erro.message);
    setLista(f.data as Fornecedor[]); setProdutos(p.data as Produto[]); setCompras(c.data as Compra[]); setContas(k.data as Conta[]); setInsumos(i);
  }, [avisar]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!lista) return <p className="py-10 text-center font-semibold text-roxo/60">Carregando…</p>;
  const ativos = lista.filter((f) => f.ativo);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-semibold text-roxo/70">{ativos.length} fornecedores · toque para ver o catálogo, os preços e o que já comprou.</p>
        <button onClick={() => setEditando("novo")} className="botao !min-h-[40px] !py-2 text-sm">+ Novo fornecedor</button>
      </div>
      {editando && <EditarFornecedor f={editando === "novo" ? null : editando} avisar={avisar} onFim={(ok) => { setEditando(null); if (ok) carregar(); }} />}

      {lista.map((f) => {
        const doF = produtos.filter((p) => p.fornecedor_id === f.id && p.ativo);
        const compF = compras.filter((c) => ehDele(f, c.fornecedor));
        const contF = contas.filter((c) => ehDele(f, c.descricao));
        const ultima = compF[0];
        const noventa = compF.filter((c) => c.data >= new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)).reduce((s, c) => s + Number(c.total), 0);
        const deve = contF.reduce((s, c) => s + Number(c.valor), 0);
        const abertoAqui = aberto === f.id;
        return (
          <section key={f.id} className={`rounded-3xl bg-white shadow-sm ${f.ativo ? "" : "opacity-60"}`}>
            <button onClick={() => setAberto(abertoAqui ? null : f.id)} aria-expanded={abertoAqui} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left sm:p-5">
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold text-roxo">{f.nome}{!f.ativo && " (inativo)"}</span>
                <span className="block text-sm text-roxo/70">{[f.fornece, f.pagamento, f.frequencia && FREQUENCIAS[f.frequencia]].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="grid grid-cols-3 gap-3 text-center text-xs font-bold text-roxo/60">
                <span><b className="block text-base text-roxo">{doF.length}</b>no catálogo</span>
                <span><b className="block text-base text-roxo">{brl(noventa)}</b>comprado 90 dias</span>
                <span><b className={`block text-base ${deve ? "text-amber-700" : "text-roxo"}`}>{brl(deve)}</b>a pagar</span>
              </span>
              {ultima && <span className="w-full text-xs text-roxo/60">Última compra: {dataBr(ultima.data)} · {brl(ultima.total)}</span>}
            </button>
            {abertoAqui && <Detalhe f={f} produtos={doF} compras={compF} contas={contF} insumos={insumos} avisar={avisar} recarregar={carregar} onEditar={() => setEditando(f)} />}
          </section>
        );
      })}
    </>
  );
}

function Detalhe({ f, produtos, compras, contas, insumos, avisar, recarregar, onEditar }: {
  f: Fornecedor; produtos: Produto[]; compras: Compra[]; contas: Conta[]; insumos: Insumo[]; avisar: Aviso; recarregar: () => void; onEditar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const termo = semAcento(busca.trim());
  const filtrados = termo ? produtos.filter((p) => semAcento(`${p.linha} ${p.nome} ${p.descricao ?? ""}`).includes(termo)) : produtos;
  const linhas = useMemo(() => Array.from(new Set(filtrados.map((p) => p.linha))), [filtrados]);
  const unidade = (id: string | null) => insumos.find((i) => i.id === id)?.unidade ?? "un";

  async function mudar(p: Produto, campos: Partial<Produto>) {
    const { error } = await sb().from("fornecedor_produtos").update(campos).eq("id", p.id);
    if (error) return avisar("erro", error.message);
    avisar("ok", "Catálogo atualizado"); recarregar();
  }

  return (
    <div className="space-y-4 border-t border-roxo/10 p-4 sm:p-5">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {f.razao_social && <p><b>Razão social:</b> {f.razao_social}</p>}
        {f.vendedor && <p><b>Vendedor:</b> {f.vendedor}</p>}
        {f.whatsapp && <p><b>WhatsApp:</b> <a className="font-bold text-roxo underline" href={whats(f.whatsapp)} target="_blank" rel="noreferrer">{f.whatsapp} ↗</a></p>}
        {f.cidade && <p><b>Cidade:</b> {f.cidade}</p>}
        {f.pedido_minimo && <p><b>Pedido mínimo:</b> {f.pedido_minimo}</p>}
        {f.catalogo_em && <p><b>Catálogo de:</b> {dataBr(f.catalogo_em)}</p>}
        {f.obs && <p className="sm:col-span-2 rounded-xl bg-creme px-3 py-2">{f.obs}</p>}
      </div>
      <button onClick={onEditar} className="rounded-full bg-roxo/10 px-4 py-2 text-sm font-bold text-roxo">Editar dados do fornecedor</button>

      {contas.length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm">
          <b className="text-amber-900">Contas em aberto</b>
          <ul className="mt-1 space-y-0.5">{contas.map((c) => <li key={c.id} className="flex gap-2"><span className="flex-1">{c.descricao}</span><span>{c.vencimento ? `vence ${dataBr(c.vencimento)}` : ""}</span><b>{brl(c.valor)}</b></li>)}</ul>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 font-extrabold text-roxo">Catálogo ({produtos.length})</h3>
          <input aria-label="Buscar no catálogo" placeholder="Buscar sabor…" className="campo !w-44 !py-1.5 text-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button onClick={() => setNovo((x) => !x)} className="rounded-full bg-roxo px-3 py-1.5 text-sm font-bold text-white">+ Produto</button>
        </div>
        {novo && <NovoProduto f={f} linhas={Array.from(new Set(produtos.map((p) => p.linha)))} avisar={avisar} onFim={(ok) => { setNovo(false); if (ok) recarregar(); }} />}
        {!produtos.length && !novo && <p className="mt-2 text-sm text-roxo/60">Nenhum produto ainda. Use “+ Produto” para anotar o que ele vende e o preço.</p>}
        {linhas.map((l) => {
          const itens = filtrados.filter((p) => p.linha === l);
          return (
            <details key={l} open={!!termo || itens.some((p) => p.preco != null)} className="mt-3 rounded-2xl bg-creme/70 p-3">
              <summary className="cursor-pointer font-extrabold text-roxo">{l} <span className="text-xs font-bold text-roxo/60">· {itens.length} {itens[0]?.embalagem ? `· ${itens[0].embalagem}` : ""}</span></summary>
              <ul className="mt-2 divide-y divide-roxo/10">
                {itens.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                      <b>{p.nome}</b>
                      {p.descricao && <span className="block text-xs text-roxo/60">{p.descricao}</span>}
                      {p.preco != null && p.emb_qtd && <span className="block text-xs font-semibold text-roxo/70">= {precoUn(Number(p.preco) / Number(p.emb_qtd), unidade(p.insumo_id))}</span>}
                    </span>
                    <select aria-label={`Insumo do estoque ligado a ${p.nome}`} className="campo !w-auto min-w-0 flex-1 !px-2 !py-1.5 text-xs sm:!w-44 sm:flex-none" value={p.insumo_id ?? ""} onChange={(e) => mudar(p, { insumo_id: e.target.value || null })}>
                      <option value="">— não ligado ao estoque —</option>
                      {insumos.filter((i) => i.ativo).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                    </select>
                    <Preco p={p} onSalvar={(v) => mudar(p, { preco: v })} />
                    <button onClick={() => mudar(p, { ativo: false })} aria-label={`Tirar ${p.nome} do catálogo`} className="px-1 text-red-700">✕</button>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        <p className="mt-2 text-xs text-roxo/60">Com o produto ligado a um insumo e o tamanho da embalagem preenchido, o preço entra sozinho na memória de preços (como cotação).</p>
      </div>

      <div>
        <h3 className="font-extrabold text-roxo">Compras (últimos 6 meses)</h3>
        {!compras.length ? <p className="text-sm text-roxo/60">Nenhuma compra lançada com esse nome.</p> : (
          <ul className="mt-1 divide-y divide-roxo/10 text-sm">{compras.slice(0, 12).map((c) => (
            <li key={c.id} className="flex gap-2 py-1.5"><span className="w-20 shrink-0 text-roxo/60">{dataBr(c.data)}</span><span className="flex-1 truncate">{c.fornecedor}</span><span className="text-xs text-roxo/60">{c.forma}</span><b>{brl(c.total)}</b></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

function Preco({ p, onSalvar }: { p: Produto; onSalvar: (v: number | null) => void }) {
  const [txt, setTxt] = useState(dinheiroTxt(p.preco));
  useEffect(() => setTxt(dinheiroTxt(p.preco)), [p.preco]);
  return (
    <label className="flex items-center gap-1 text-xs font-bold text-roxo/60">R$
      <input aria-label={`Preço de ${p.nome}`} inputMode="decimal" placeholder="consultar" className="campo !w-24 !px-2 !py-1.5 text-right text-sm" value={txt}
        onChange={(e) => setTxt(e.target.value.replace(/[^\d,.]/g, ""))}
        onBlur={() => { const v = txt.trim() ? num(txt) : null; if (v !== (p.preco == null ? null : Number(p.preco))) onSalvar(v && v > 0 ? v : null); }} />
    </label>
  );
}

function NovoProduto({ f, linhas, avisar, onFim }: { f: Fornecedor; linhas: string[]; avisar: Aviso; onFim: (ok: boolean) => void }) {
  const [d, setD] = useState({ linha: linhas[0] ?? "", nome: "", embalagem: "", emb_qtd: "", preco: "" });
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!d.linha.trim() || !d.nome.trim()) return avisar("erro", "Informe a linha e o nome");
    const { error } = await sb().from("fornecedor_produtos").upsert({
      fornecedor_id: f.id, linha: d.linha.trim(), nome: d.nome.trim(), embalagem: d.embalagem.trim() || null,
      emb_qtd: d.emb_qtd ? num(d.emb_qtd) : null, preco: d.preco ? num(d.preco) : null, ativo: true, ordem: 999,
    }, { onConflict: "fornecedor_id,linha,nome" });
    if (error) return avisar("erro", error.message);
    avisar("ok", "Produto anotado"); onFim(true);
  }
  return (
    <form onSubmit={salvar} className="mt-3 grid gap-2 rounded-2xl border-2 border-roxo/15 p-3 text-sm sm:grid-cols-6">
      <label className="sm:col-span-2"><span className="rotulo">Linha</span><input list={`linhas-${f.id}`} className="campo !py-1.5" value={d.linha} onChange={(e) => setD({ ...d, linha: e.target.value })} placeholder="Ex.: Sorvete · caixa 10 L" /></label>
      <datalist id={`linhas-${f.id}`}>{linhas.map((l) => <option key={l} value={l} />)}</datalist>
      <label className="sm:col-span-2"><span className="rotulo">Produto</span><input className="campo !py-1.5" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required /></label>
      <label><span className="rotulo">Embalagem</span><input className="campo !py-1.5" value={d.embalagem} onChange={(e) => setD({ ...d, embalagem: e.target.value })} placeholder="Caixa 5 kg" /></label>
      <label><span className="rotulo">Qtd. na emb.</span><input inputMode="decimal" className="campo !py-1.5" value={d.emb_qtd} onChange={(e) => setD({ ...d, emb_qtd: e.target.value })} placeholder="5" /></label>
      <label><span className="rotulo">Preço R$</span><input inputMode="decimal" className="campo !py-1.5" value={d.preco} onChange={(e) => setD({ ...d, preco: e.target.value })} placeholder="consultar" /></label>
      <div className="flex items-end gap-2 sm:col-span-5"><button type="button" onClick={() => onFim(false)} className="rounded-full bg-gray-100 px-4 py-2 font-bold">Cancelar</button><button className="botao flex-1 !min-h-[40px] !py-2">Salvar produto</button></div>
    </form>
  );
}

function EditarFornecedor({ f, avisar, onFim }: { f: Fornecedor | null; avisar: Aviso; onFim: (ok: boolean) => void }) {
  const [d, setD] = useState({
    nome: f?.nome ?? "", razao_social: f?.razao_social ?? "", vendedor: f?.vendedor ?? "", whatsapp: f?.whatsapp ?? "", cidade: f?.cidade ?? "",
    fornece: f?.fornece ?? "", pagamento: f?.pagamento ?? "", frequencia: f?.frequencia ?? "", pedido_minimo: f?.pedido_minimo ?? "",
    obs: f?.obs ?? "", apelidos: (f?.apelidos ?? []).join(", "), ativo: f?.ativo ?? true,
  });
  const campo = (k: keyof typeof d, rotulo: string, ph = "", extra = "") => (
    <label className={extra}><span className="rotulo">{rotulo}</span><input className="campo !py-2" value={String(d[k])} placeholder={ph} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>
  );
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (d.nome.trim().length < 2) return avisar("erro", "Informe o nome");
    const vazio = (s: string) => s.trim() || null;
    const dados = {
      nome: d.nome.trim(), razao_social: vazio(d.razao_social), vendedor: vazio(d.vendedor), whatsapp: vazio(d.whatsapp), cidade: vazio(d.cidade),
      fornece: vazio(d.fornece), pagamento: vazio(d.pagamento), frequencia: d.frequencia || null, pedido_minimo: vazio(d.pedido_minimo), obs: vazio(d.obs),
      apelidos: d.apelidos.split(",").map((s) => s.trim()).filter(Boolean), ativo: d.ativo,
    };
    const { error } = f ? await sb().from("fornecedores").update(dados).eq("id", f.id) : await sb().from("fornecedores").insert(dados);
    if (error) return avisar("erro", error.code === "23505" ? "Já existe um fornecedor com esse nome." : error.message);
    avisar("ok", f ? "Fornecedor atualizado" : "Fornecedor cadastrado"); onFim(true);
  }
  return (
    <Cartao titulo={f ? `Editar ${f.nome}` : "Novo fornecedor"}>
      <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-3">
        {campo("nome", "Nome", "Ex.: Mais Sabor", "sm:col-span-2")}
        {campo("razao_social", "Razão social (opcional)")}
        {campo("vendedor", "Vendedor / contato")}
        {campo("whatsapp", "WhatsApp", "(83) 9…")}
        {campo("cidade", "Cidade")}
        {campo("fornece", "O que compro dele", "Açaí, sorvetes…", "sm:col-span-2")}
        {campo("pagamento", "Pagamento", "Boleto, PIX…")}
        <label><span className="rotulo">Frequência</span><select className="campo !py-2" value={d.frequencia} onChange={(e) => setD({ ...d, frequencia: e.target.value })}><option value="">—</option>{Object.entries(FREQUENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {campo("pedido_minimo", "Pedido mínimo / prazo")}
        {campo("apelidos", "Outros nomes nas notas", "separe por vírgula")}
        <label className="sm:col-span-3"><span className="rotulo">Observações</span><textarea className="campo" rows={2} value={d.obs} onChange={(e) => setD({ ...d, obs: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-roxo" checked={d.ativo} onChange={(e) => setD({ ...d, ativo: e.target.checked })} />Ativo</label>
        <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => onFim(false)} className="rounded-full bg-gray-100 px-5 font-bold">Cancelar</button><button className="botao flex-1">Salvar</button></div>
      </form>
    </Cartao>
  );
}
