"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Cardapio } from "@/lib/cardapio";
import { checarPedidoMinimo, cotarEntrega } from "@/lib/delivery";
import { statusLoja } from "@/lib/horario";
import { agoraSousa, priceItem, type CartItem } from "@/lib/pricing";
import { Preco } from "./Preco";
import { brl, gravar, ler, mascaraFone, soDigitos } from "./util";

const MapaEntrega = dynamic(() => import("./MapaEntrega").then((m) => m.MapaEntrega), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-roxo/10" /> });

export type LinhaSacola = { id: string; item: CartItem };
type Cliente = { nome: string; whatsapp: string; endereco: string; referencia: string; destino: { lat: number; lng: number } | null };
const chip = (ativo: boolean) => `flex-1 rounded-2xl border-2 px-3 py-3 text-sm font-bold transition active:scale-95 ${ativo ? "border-roxo bg-roxo text-white" : "border-roxo/15 bg-white"}`;

export function Sacola({ cardapio, linhas, onQtd, onRemover, onEnviado }: {
  cardapio: Cardapio; linhas: LinhaSacola[];
  onQtd: (id: string, qtd: number) => void; onRemover: (id: string) => void; onEnviado: (codigo: string) => void;
}) {
  const [tipo, setTipo] = useState<"retirada" | "entrega">("retirada");
  const [cli, setCli] = useState<Cliente>({ nome: "", whatsapp: "", endereco: "", referencia: "", destino: null });
  const [pag, setPag] = useState<"pix" | "cartao" | "dinheiro">("pix");
  const [troco, setTroco] = useState("");
  const [gps, setGps] = useState<"" | "buscando" | "negado">("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { setCli((c) => ({ ...c, ...ler<Partial<Cliente>>("cliente", {}) })); }, []);

  const agora = agoraSousa();
  const precos = useMemo(() => linhas.map((l) => { try { return priceItem(cardapio, l.item, agora); } catch { return null; } }), [cardapio, linhas]); // eslint-disable-line react-hooks/exhaustive-deps
  const invalidos = precos.some((p) => !p);
  const subtotal = Math.round(precos.reduce((s, p) => s + (p?.total ?? 0), 0) * 100) / 100;
  const st = statusLoja(cardapio.loja.horarios, agora);
  const { loja } = cardapio;
  const raio = Math.max(...loja.faixas.map((f) => f.ate_km));
  const cot = tipo === "entrega" && cli.destino ? cotarEntrega({ lat: loja.lat, lng: loja.lng }, cli.destino, loja.faixas) : null;
  const minimo = tipo === "entrega" ? checarPedidoMinimo(subtotal, loja.pedidoMinimo) : null;
  const taxa = cot?.entrega ? cot.taxa : 0;
  const total = Math.round((subtotal + taxa) * 100) / 100;

  const bloqueio =
    invalidos ? "Remova os itens indisponíveis" :
    !st.aberta && !loja.aceitaAgendamento ? st.texto :
    tipo === "entrega" && minimo ? minimo :
    tipo === "entrega" && cot && !cot.entrega ? "Fora da área de entrega" : "";

  function localizar() {
    if (!navigator.geolocation) { setGps("negado"); return; }
    setGps("buscando");
    navigator.geolocation.getCurrentPosition(
      (p) => { setCli((c) => ({ ...c, destino: { lat: p.coords.latitude, lng: p.coords.longitude } })); setGps(""); },
      () => setGps("negado"), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function enviar() {
    setErro("");
    if (cli.nome.trim().length < 2) return setErro("Informe seu nome");
    if (soDigitos(cli.whatsapp).length < 10) return setErro("Informe o WhatsApp com DDD");
    if (tipo === "entrega" && cli.endereco.trim().length < 5) return setErro("Informe o endereço de entrega");
    if (tipo === "entrega" && !cli.destino) return setErro("Marque o local da entrega no mapa ou use sua localização");
    setEnviando(true);
    try {
      const r = await fetch("/api/pedidos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: linhas.map((l) => l.item), tipo, nome: cli.nome, whatsapp: cli.whatsapp, pagamento: pag,
          trocoPara: pag === "dinheiro" && troco ? Number(troco.replace(",", ".")) : undefined,
          ...(tipo === "entrega" ? { endereco: cli.endereco, referencia: cli.referencia || undefined, destino: cli.destino } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.erro || "Não foi possível enviar o pedido"); return; }
      gravar("cliente", cli);
      gravar("ultimo", { codigo: j.pedido.codigo, itens: linhas.map((l) => l.item), em: Date.now() });
      onEnviado(j.pedido.codigo);
    } catch { setErro("Sem conexão. Confira sua internet e tente de novo."); }
    finally { setEnviando(false); }
  }

  if (!linhas.length) return <div className="px-6 py-14 text-center"><p className="text-lg font-bold">Sua sacola está vazia</p><p className="mt-1 text-roxo/70">Escolha um açaí no cardápio para começar.</p></div>;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <ul className="divide-y divide-roxo/10">
          {linhas.map((l, i) => { const p = precos[i]; return (
            <li key={l.id} className="flex gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p?.nome ?? "Item indisponível"}</p>
                <p className="text-sm text-roxo/70">{p ? p.descricao : "Este item não está disponível agora."}{l.item.tipo !== "kg" && l.item.obs ? ` · Obs.: ${l.item.obs}` : ""}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-full border-2 border-roxo/15">
                    <button aria-label="Diminuir" className="h-9 w-9 font-bold" onClick={() => (l.item.qtd > 1 ? onQtd(l.id, l.item.qtd - 1) : onRemover(l.id))}>−</button>
                    <span className="w-5 text-center text-sm font-extrabold tabular-nums">{l.item.qtd}</span>
                    <button aria-label="Aumentar" className="h-9 w-9 font-bold" onClick={() => onQtd(l.id, Math.min(20, l.item.qtd + 1))}>+</button>
                  </div>
                  <button className="text-sm font-semibold text-roxo/70 underline underline-offset-4" onClick={() => onRemover(l.id)}>Remover</button>
                </div>
              </div>
              <p className="font-extrabold tabular-nums">{p ? brl(p.total) : "—"}</p>
            </li>); })}
        </ul>

        {!st.aberta && <p className="rounded-2xl bg-lima/25 px-4 py-3 text-sm font-semibold">{st.texto}. {loja.aceitaAgendamento ? "Seu pedido fica agendado para a abertura." : ""}</p>}

        <fieldset><legend className="rotulo">Como você quer receber?</legend>
          <div className="flex gap-2">
            <button type="button" aria-pressed={tipo === "retirada"} className={chip(tipo === "retirada")} onClick={() => setTipo("retirada")}>Retirar no balcão</button>
            <button type="button" aria-pressed={tipo === "entrega"} className={chip(tipo === "entrega")} onClick={() => setTipo("entrega")}>Entrega</button>
          </div>
        </fieldset>

        {tipo === "entrega" && (
          <div className="space-y-3">
            <label className="block"><span className="rotulo">Endereço</span><input className="campo" value={cli.endereco} onChange={(e) => setCli({ ...cli, endereco: e.target.value })} placeholder="Rua, número e bairro" autoComplete="street-address" /></label>
            <label className="block"><span className="rotulo">Ponto de referência (opcional)</span><input className="campo" value={cli.referencia} onChange={(e) => setCli({ ...cli, referencia: e.target.value })} placeholder="Ex.: casa de portão azul" /></label>
            <div>
              <span className="rotulo">Onde fica? Toque no mapa ou arraste o pino vermelho</span>
              <button type="button" onClick={localizar} className="mb-2 w-full rounded-full border-2 border-roxo px-4 py-2.5 text-sm font-extrabold text-roxo">{gps === "buscando" ? "Buscando sua localização…" : "Usar minha localização"}</button>
              {gps === "negado" && <p className="mb-2 text-sm text-roxo/80">Não conseguimos sua localização. Toque no mapa no ponto da entrega.</p>}
              <MapaEntrega loja={{ lat: loja.lat, lng: loja.lng }} destino={cli.destino} raioKm={raio} onMudar={(p) => setCli((c) => ({ ...c, destino: p }))} />
              <p className="mt-2 text-sm font-semibold" aria-live="polite">
                {!cli.destino ? `Entregamos até ${raio} km da loja.` : cot?.entrega ? `${cot.distanciaKm.toFixed(1).replace(".", ",")} km da loja · entrega ${brl(cot.taxa)}` : <span className="text-red-700">{cot?.motivo} Você pode retirar no balcão.</span>}
              </p>
              {minimo && <p className="mt-1 text-sm font-semibold text-red-700">{minimo}</p>}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="rotulo">Seu nome</span><input className="campo" value={cli.nome} onChange={(e) => setCli({ ...cli, nome: e.target.value })} autoComplete="name" /></label>
          <label className="block"><span className="rotulo">WhatsApp</span><input className="campo" type="tel" inputMode="numeric" value={cli.whatsapp} onChange={(e) => setCli({ ...cli, whatsapp: mascaraFone(e.target.value) })} placeholder="(83) 9 0000-0000" autoComplete="tel-national" /></label>
        </div>

        <fieldset><legend className="rotulo">Pagamento na {tipo === "entrega" ? "entrega" : "retirada"}</legend>
          <div className="flex gap-2">
            {([["pix", "PIX"], ["cartao", "Cartão"], ["dinheiro", "Dinheiro"]] as const).map(([k, v]) => <button key={k} type="button" aria-pressed={pag === k} className={chip(pag === k)} onClick={() => setPag(k)}>{v}</button>)}
          </div>
          {pag === "dinheiro" && <label className="mt-3 block"><span className="rotulo">Troco para quanto? (opcional)</span><input className="campo" inputMode="decimal" value={troco} onChange={(e) => setTroco(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex.: 50" /></label>}
        </fieldset>

        <dl className="space-y-1.5 rounded-2xl bg-white p-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-bold tabular-nums">{brl(subtotal)}</dd></div>
          {tipo === "entrega" && <div className="flex justify-between"><dt>Entrega</dt><dd className="font-bold tabular-nums">{cot?.entrega ? brl(cot.taxa) : "marque no mapa"}</dd></div>}
          <div className="flex justify-between border-t border-roxo/10 pt-2 text-lg font-extrabold"><dt>Total</dt><dd><Preco valor={total} /></dd></div>
        </dl>
      </div>

      <div className="border-t border-roxo/10 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {erro && <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}
        <button type="button" disabled={enviando || !!bloqueio} onClick={enviar} className="botao-lima w-full">
          {enviando ? "Enviando…" : bloqueio || <>Fazer pedido · <Preco valor={total} /></>}
        </button>
      </div>
    </>
  );
}
