"use client";
import { useEffect, useState } from "react";
import type { PedidoPublico } from "@/lib/pedidos/repo";
import { brl } from "@/components/loja/util";

/** Tela de pagamento online: QR Code e copia-e-cola do PIX, ou botão para a página do cartão. */
export function Pagar({ pedido: p }: { pedido: PedidoPublico }) {
  const [copiado, setCopiado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const pg = p.pagar;
  if (!pg) return <section className="rounded-3xl bg-white p-5 text-center shadow-sm"><p className="font-semibold">Preparando o pagamento…</p></section>;

  const resta = Math.max(0, Math.floor((new Date(pg.expiraEm).getTime() - agora) / 1000));
  const tempo = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, "0")}`;
  const prazo = resta > 0 ? <p className="text-sm font-bold text-roxo/70">Pague em até <span className="tabular-nums text-roxo">{tempo}</span></p> : <p className="text-sm font-bold text-red-700">O prazo terminou. Aguarde um instante…</p>;

  if (pg.tipo === "cartao") return (
    <section className="space-y-3 rounded-3xl bg-white p-5 text-center shadow-sm">
      <h2 className="text-lg font-extrabold">Pagar {brl(p.total)} com cartão</h2>
      {prazo}
      <a href={pg.link} className="botao-lima w-full">Ir para o pagamento seguro</a>
      <p className="text-xs text-roxo/60">O pagamento é feito na página do Mercado Pago. Depois você volta para cá automaticamente.</p>
    </section>
  );

  async function copiar() {
    if (pg?.tipo !== "pix") return;
    try { await navigator.clipboard.writeText(pg.copiaCola); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* o campo abaixo permite copiar manualmente */ }
  }
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 text-center shadow-sm">
      <h2 className="text-lg font-extrabold">Pague {brl(p.total)} com PIX</h2>
      {prazo}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {pg.qrBase64 && <img src={`data:image/png;base64,${pg.qrBase64}`} alt="QR Code do PIX" width={220} height={220} className="mx-auto rounded-2xl ring-1 ring-roxo/15" />}
      <button type="button" onClick={copiar} className="botao-lima w-full">{copiado ? "✓ Código copiado" : "Copiar código PIX"}</button>
      <input readOnly aria-label="Código PIX copia e cola" value={pg.copiaCola} onFocus={(e) => e.currentTarget.select()} className="campo !py-2 text-xs" />
      <ol className="space-y-1 text-left text-sm text-roxo/80">
        <li>1. Abra o app do seu banco e escolha <b>PIX → Copia e cola</b> (ou leia o QR Code).</li>
        <li>2. Cole o código e confirme o pagamento.</li>
        <li>3. Volte para esta página: ela confirma sozinha em alguns segundos.</li>
      </ol>
    </section>
  );
}
