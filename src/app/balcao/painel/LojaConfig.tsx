"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { CampoTexto, CampoValor, Cartao, Chave, enviarFoto, urlFoto, type Aviso, type Config, type Dados } from "./comum";

type Props = { dados: Dados; avisar: Aviso; recarregar: () => void };
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const HORAS = Array.from({ length: 25 }, (_, i) => i);

export default function LojaConfig({ dados, avisar, recarregar }: Props) {
  const c = dados.config;
  const [lat, setLat] = useState(String(c.loja_lat)), [lng, setLng] = useState(String(c.loja_lng));
  const [localizando, setLocalizando] = useState(false);

  async function salvar(campos: Partial<Config>) {
    const { error } = await supabaseNavegador().from("settings").update(campos).eq("id", 1);
    if (error) avisar("erro", "Não foi possível salvar: " + error.message); else avisar("ok", "Salvo");
    recarregar();
  }
  const horario = (d: number, v: [number, number] | null) => salvar({ horarios: { ...c.horarios, [d]: v } });
  const faixas = (f: Config["faixas_entrega"]) => salvar({ faixas_entrega: [...f].sort((a, b) => a.ate_km - b.ate_km) });

  function salvarPonto(la: number, ln: number) {
    if (!(la >= -34 && la <= 6 && ln >= -74 && ln <= -34)) return avisar("erro", "Coordenadas fora do Brasil. Confira os números.");
    setLat(String(la)); setLng(String(ln)); salvar({ loja_lat: la, loja_lng: ln });
  }
  function usarLocalAtual() {
    if (!navigator.geolocation) return avisar("erro", "Este aparelho não informa a localização.");
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocalizando(false); if (confirm(`Usar este ponto como local da loja?\n${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)} (precisão de ${Math.round(p.coords.accuracy)} m)\n\nFaça isso só estando dentro da loja.`)) salvarPonto(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6))); },
      () => { setLocalizando(false); avisar("erro", "Não foi possível obter a localização. Libere a permissão no navegador."); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <>
      <Cartao titulo="Horário de funcionamento" dica="O site mostra “Aberto” ou “Fechado” por estes horários.">
        <ul className="divide-y divide-roxo/10 text-sm">{DIAS.map((nome, d) => {
          const h = c.horarios[String(d)];
          return (
            <li key={d} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-20 font-bold">{nome}</span>
              <Chave rotulo={`${nome} aberto`} ligado={!!h} onChange={(v) => horario(d, v ? [14, 21] : null)} />
              {h ? <>
                <select aria-label={`${nome} abre`} className="campo !w-24 !py-2" value={h[0]} onChange={(e) => horario(d, [Number(e.target.value), Math.max(h[1], Number(e.target.value) + 1)])}>{HORAS.slice(0, 24).map((x) => <option key={x} value={x}>{x}h</option>)}</select>
                <span>às</span>
                <select aria-label={`${nome} fecha`} className="campo !w-24 !py-2" value={h[1]} onChange={(e) => horario(d, [h[0], Number(e.target.value)])}>{HORAS.filter((x) => x > h[0]).map((x) => <option key={x} value={x}>{x}h</option>)}</select>
              </> : <span className="font-semibold text-roxo/50">Fechado</span>}
            </li>
          );
        })}</ul>
        <label className="mt-3 flex items-center gap-3 border-t border-roxo/10 pt-3 text-sm font-semibold"><Chave rotulo="Aceitar pedidos com a loja fechada" ligado={c.aceita_agendamento} onChange={(v) => salvar({ aceita_agendamento: v })} />Aceitar pedidos pelo site com a loja fechada (ficam para a abertura). Desligado = site só aceita pedidos no horário.</label>
      </Cartao>

      <Cartao titulo="Preços gerais">
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold">
          <label className="flex items-center gap-2">Açaí no quilo R$ <CampoValor rotulo="Preço do quilo" valor={Number(c.preco_kg)} onChange={(v) => salvar({ preco_kg: v })} /></label>
          <label className="flex items-center gap-2">Acompanhamento extra R$ <CampoValor rotulo="Acompanhamento extra" valor={Number(c.acomp_extra ?? 0)} onChange={(v) => salvar({ acomp_extra: v })} /></label>
        </div>
      </Cartao>

      <Cartao titulo="Entrega" dica="Taxa por distância em linha reta a partir da loja. Acima da última faixa o site não aceita entrega.">
        <ul className="space-y-2 text-sm">{c.faixas_entrega.map((f, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 font-bold">
            Até <CampoValor rotulo={`Faixa ${i + 1} km`} valor={f.ate_km} onChange={(v) => v > 0 && faixas(c.faixas_entrega.map((x, k) => (k === i ? { ...x, ate_km: v } : x)))} /> km · R$
            <CampoValor rotulo={`Faixa ${i + 1} taxa`} valor={f.taxa} onChange={(v) => faixas(c.faixas_entrega.map((x, k) => (k === i ? { ...x, taxa: v } : x)))} />
            {c.faixas_entrega.length > 1 && <button aria-label={`Remover faixa ${i + 1}`} onClick={() => faixas(c.faixas_entrega.filter((_, k) => k !== i))} className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">×</button>}
          </li>
        ))}</ul>
        <button onClick={() => { const u = c.faixas_entrega[c.faixas_entrega.length - 1]; faixas([...c.faixas_entrega, { ate_km: u.ate_km + 1, taxa: u.taxa + 2 }]); }} className="mt-3 rounded-full bg-roxo/10 px-4 py-2 text-sm font-extrabold text-roxo">+ Faixa</button>
        <label className="mt-4 flex items-center gap-2 border-t border-roxo/10 pt-3 text-sm font-bold">Pedido mínimo para entrega R$ <CampoValor rotulo="Pedido mínimo" valor={Number(c.pedido_minimo)} onChange={(v) => salvar({ pedido_minimo: v })} /></label>
      </Cartao>

      <Cartao titulo="Local da loja" dica="Toda a taxa de entrega é calculada a partir deste ponto. Confira se o pino está em cima da loja.">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label><span className="rotulo">Latitude</span><input className="campo !w-36 !py-2" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
          <label><span className="rotulo">Longitude</span><input className="campo !w-36 !py-2" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
          <button onClick={() => salvarPonto(Number(lat.replace(",", ".")), Number(lng.replace(",", ".")))} className="rounded-full bg-roxo px-4 py-2.5 font-extrabold text-white">Salvar ponto</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={usarLocalAtual} disabled={localizando} className="rounded-full bg-lima px-4 py-2 font-extrabold text-roxo-escuro">{localizando ? "Localizando…" : "📍 Estou na loja: usar minha localização"}</button>
          <a href={`https://www.google.com/maps?q=${c.loja_lat},${c.loja_lng}`} target="_blank" rel="noreferrer" className="rounded-full bg-roxo/10 px-4 py-2 font-extrabold text-roxo">Ver ponto salvo no mapa ↗</a>
        </div>
      </Cartao>

      <Cartao titulo="Contato e fotos do açaí">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label><span className="rotulo">WhatsApp (com 55 e DDD, só números)</span><CampoTexto rotulo="WhatsApp" className="w-full" valor={c.whatsapp} onChange={(v) => { const n = v.replace(/\D/g, ""); if (n.length < 12) return avisar("erro", "Informe o número completo: 55 + DDD + número."); salvar({ whatsapp: n }); }} /></label>
          <label><span className="rotulo">Endereço</span><CampoTexto rotulo="Endereço" className="w-full" valor={c.endereco} onChange={(v) => salvar({ endereco: v })} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <FotoAcai rotulo="Foto do copo" path={c.img_copo} padrao="/img/acai_copo.jpg" avisar={avisar} onSalvar={(p) => salvar({ img_copo: p })} />
          <FotoAcai rotulo="Foto do pote" path={c.img_pote} padrao="/img/acai_pote.jpg" avisar={avisar} onSalvar={(p) => salvar({ img_pote: p })} />
        </div>
      </Cartao>
    </>
  );
}

function FotoAcai({ rotulo, path, padrao, avisar, onSalvar }: { rotulo: string; path: string | null; padrao: string; avisar: Aviso; onSalvar: (p: string) => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="text-center text-sm">
      <button onClick={() => arquivo.current?.click()} aria-label={`Trocar ${rotulo.toLowerCase()}`} className="relative block h-28 w-28 overflow-hidden rounded-2xl ring-1 ring-roxo/15">
        <Image src={urlFoto(path) ?? padrao} alt="" fill sizes="112px" className="object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-roxo/80 py-1 text-xs font-bold text-white">{enviando ? "Enviando…" : "Trocar foto"}</span>
      </button>
      <input ref={arquivo} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setEnviando(true);
        try { onSalvar(await enviarFoto(f, rotulo)); } catch (err) { avisar("erro", (err as Error).message); }
        setEnviando(false);
      }} />
      <div className="mt-1 font-bold">{rotulo}</div>
    </div>
  );
}
