"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useId } from "react";

export type Camada = { id: string; nome: string; cor: string };

/** Copo ou pote que ganha uma camada a cada acompanhamento escolhido. */
export function CopoAnimado({ embalagem, camadas, vagas }: { embalagem: "Copo" | "Pote"; camadas: Camada[]; vagas: number }) {
  const clip = useId();
  const copo = embalagem === "Copo";
  // contorno interno do recipiente
  const forma = copo ? "M18 16 L102 16 L90 150 Q89 156 82 156 L38 156 Q31 156 30 150 Z" : "M8 44 L112 44 L104 148 Q103 156 95 156 L25 156 Q17 156 16 148 Z";
  const topo = copo ? 16 : 44, fundo = 156, altura = fundo - topo;
  const base = altura * 0.42;                                  // açaí
  const faixa = (altura - base - 6) / Math.max(vagas + 2, camadas.length);
  let y = fundo - base;
  const faixas = camadas.map((c) => { y -= faixa; return { ...c, y }; });

  return (
    <svg viewBox="0 0 120 164" role="img" aria-label={`${embalagem} com ${camadas.length ? camadas.map((c) => c.nome).join(", ") : "açaí"}`} className="h-full w-auto drop-shadow-md">
      <defs><clipPath id={clip}><path d={forma} /></clipPath></defs>
      <path d={forma} fill="#ffffff" fillOpacity="0.55" />
      <g clipPath={`url(#${clip})`}>
        <motion.rect x="0" width="120" fill="#4A1259" initial={false} animate={{ y: fundo - base, height: base }} />
        <rect x="0" y={fundo - base} width="120" height="5" fill="#6B1F86" opacity="0.6" />
        <AnimatePresence>
          {faixas.map((f) => (
            <motion.rect key={f.id} x="0" width="120" fill={f.cor}
              initial={{ y: f.y + faixa, height: 0, opacity: 0.4 }} animate={{ y: f.y, height: faixa + 0.6, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1] }} />
          ))}
        </AnimatePresence>
        <rect x="22" y={topo} width="9" height={altura} fill="#ffffff" opacity="0.18" />
      </g>
      <path d={forma} fill="none" stroke="#421268" strokeOpacity="0.35" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x={copo ? 12 : 3} y={topo - 6} width={copo ? 96 : 114} height="7" rx="3.5" fill="#ffffff" stroke="#421268" strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}
