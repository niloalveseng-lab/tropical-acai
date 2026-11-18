"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Cardapio } from "@/lib/cardapio";
import { cotarEntrega } from "@/lib/delivery";
import { ehLinkCurtoMaps, extrairCoordenadas, type Coordenadas } from "@/lib/geo";
import { brl } from "@/lib/pedidos/comanda";

const MapaEntrega = dynamic(() => import("@/components/loja/MapaEntrega").then((m) => m.MapaEntrega), { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl bg-roxo/10" /> });

export type DadosEntrega = { endereco: string; referencia: string; lat: number; lng: number };

/**
 * Local da entrega de um pedido feito por WhatsApp/telefone.
 * Três jeitos de achar o ponto: colar a localização/link que o cliente mandou, buscar o endereço,
 * ou tocar no mapa. A taxa aparece na hora, pelas mesmas faixas do site.
 */
export function LocalEntrega({ c, inicial, onSalvar, onCancelar }: { c: Cardapio; inicial: DadosEntrega | null; onSalvar: (d: DadosEntrega) => void; onCancelar: () => void }) {
  const loja = { lat: c.loja.lat, lng: c.loja.lng };
  const raio = Math.max(...c.loja.faixas.map((f) => f.ate_km));
  const [endereco, setEndereco] = useState(inicial?.endereco ?? "");
  const [referencia, setReferencia] = useState(inicial?.referencia ?? "");
  const [ponto, setPonto] = useState<Coordenadas | null>(inicial ? { lat: inicial.lat, lng: inicial.lng } : null);
  const [colado, setColado] = useState("");
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<{ lat: number; lng: number; nome: string }[] | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cot = ponto ? cotarEntrega(loja, ponto, c.loja.faixas) : null;

  async function usarColado(texto = colado) {
    setMsg("");
    const c1 = extrairCoordenadas(texto);
    if (c1) { setPonto(c1); setColado(""); return; }
    if (ehLinkCurtoMaps(texto)) {
      setOcupado(true);
      const r = await fetch(`/api/geo?link=${encodeURIComponent(texto.trim())}`).then((x) => x.json()).catch(() => ({ erro: "Sem conexão" }));
      setOcupado(false);
      if (r.lat) { setPonto({ lat: r.lat, lng: r.lng }); setColado(""); } else setMsg(r.erro ?? "Não consegui ler esse link");
      return;
    }
    setMsg("Não achei coordenadas aí. Cole o link da localização que o cliente mandou, ou busque o endereço abaixo.");
  }

  async function buscar() {
    if (busca.trim().length < 3) return;
    setMsg(""); setOcupado(true); setResultados(null);
    const r = await fetch(`/api/geo?q=${encodeURIComponent(busca.trim())}`).then((x) => x.json()).catch(() => ({ erro: "Sem conexão" }));
    setOcupado(false);
    if (r.resultados) { setResultados(r.resultados); if (!r.resultados.length) setMsg("Nada encontrado. Tente só o nome da rua ou do bairro, ou toque no mapa."); }
    else setMsg(r.erro ?? "A busca falhou");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-white p-3">
        <span className="rotulo">1. O cliente mandou a localização?</span>
        <div className="flex gap-2">
          <input className="campo !py-2 text-sm" placeholder="Cole aqui o link ou as coordenadas" value={colado}
            onChange={(e) => setColado(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData("text"); setTimeout(() => usarColado(t), 0); }} />
          <button type="button" onClick={() => usarColado()} disabled={!colado.trim() || ocupado} className="shrink-0 rounded-xl bg-roxo px-3 text-sm font-bold text-white disabled:opacity-40">Usar</button>
        </div>
        <p className="text-xs text-roxo/60">No WhatsApp Web, clique na localização do cliente, copie o endereço do Google Maps que abrir e cole aqui.</p>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-3">
        <span className="rotulo">2. Ou busque o endereço</span>
        <form onSubmit={(e) => { e.preventDefault(); buscar(); }} className="flex gap-2">
          <input className="campo !py-2 text-sm" placeholder="Ex.: Rua Manoel Francisco de Barros" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button disabled={busca.trim().length < 3 || ocupado} className="shrink-0 rounded-xl bg-roxo px-3 text-sm font-bold text-white disabled:opacity-40">Buscar</button>
        </form>
        {resultados && resultados.length > 0 && (
          <ul className="space-y-1">{resultados.map((r, i) => (
            <li key={i}><button type="button" onClick={() => { setPonto({ lat: r.lat, lng: r.lng }); if (!endereco) setEndereco(r.nome); setResultados(null); }} className="w-full rounded-lg bg-creme px-3 py-2 text-left text-sm font-semibold hover:bg-lima/30">{r.nome}</button></li>
          ))}</ul>
        )}
      </div>

      <div className="space-y-2">
        <span className="rotulo">3. Confira o pino (toque no mapa ou arraste para ajustar)</span>
        <MapaEntrega loja={loja} destino={ponto} raioKm={raio} onMudar={setPonto} />
        {ocupado && <p className="text-sm font-semibold">Procurando…</p>}
        {msg && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{msg}</p>}
        {cot && (cot.entrega
          ? <p className="rounded-xl bg-lima/30 px-3 py-2 text-sm font-extrabold text-roxo-escuro">{cot.distanciaKm.toFixed(1).replace(".", ",")} km da loja · taxa {brl(cot.taxa)}</p>
          : <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{cot.motivo}</p>)}
      </div>

      <label className="block"><span className="rotulo">Endereço (rua e número)</span><input className="campo" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} placeholder="Rua, número" /></label>
      <label className="block"><span className="rotulo">Referência (opcional)</span><input className="campo" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={200} placeholder="Ex.: casa azul, por trás da escola" /></label>

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="rounded-full bg-gray-100 px-4 font-bold">Cancelar</button>
        <button type="button" className="botao flex-1" disabled={!ponto || !cot?.entrega || endereco.trim().length < 3}
          onClick={() => ponto && onSalvar({ endereco: endereco.trim(), referencia: referencia.trim(), lat: ponto.lat, lng: ponto.lng })}>
          {!ponto ? "Marque o local" : !cot?.entrega ? "Fora da área" : endereco.trim().length < 3 ? "Informe o endereço" : "Usar este local"}
        </button>
      </div>
    </div>
  );
}
