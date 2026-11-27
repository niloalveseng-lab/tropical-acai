"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Folha que sobe da base no celular e vira janela central no computador. */
export function Folha({ aberta, onFechar, titulo, children, larga = false }: { aberta: boolean; onFechar: () => void; titulo: string; children: React.ReactNode; larga?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // No celular a folha sobe inteira da base (e desce pelo mesmo caminho); no computador é uma janela central.
  const [celular, setCelular] = useState(true);
  useEffect(() => { const m = window.matchMedia("(max-width: 639px)"); const f = () => setCelular(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", tecla); document.body.style.overflow = ""; anterior?.focus?.(); };
  }, [aberta, onFechar]);

  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-roxo-escuro/60 sm:items-center sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.3, ease: "easeOut" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo}
            className={`flex max-h-[94dvh] w-full flex-col overflow-hidden overscroll-contain rounded-t-[28px] bg-creme shadow-2xl outline-none sm:rounded-3xl ${larga ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
            initial={celular ? { y: "100%" } : { opacity: 0, scale: 0.96 }} animate={celular ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={celular ? { y: "100%", transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
            transition={celular ? { duration: 0.45, ease: [0.32, 0.72, 0, 1] } : { duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
            <div className="relative flex items-center gap-3 border-b border-roxo/10 px-4 py-3">
              <h2 className="text-lg font-extrabold">{titulo}</h2>
              <button onClick={onFechar} aria-label="Fechar" className="pressionavel ml-auto grid h-10 w-10 place-items-center rounded-full bg-roxo/10 text-xl font-bold">×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
