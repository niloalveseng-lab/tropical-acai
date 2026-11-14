"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

/** Folha que sobe da base no celular e vira janela central no computador. */
export function Folha({ aberta, onFechar, titulo, children, larga = false }: { aberta: boolean; onFechar: () => void; titulo: string; children: React.ReactNode; larga?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
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
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titulo}
            className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-creme shadow-2xl outline-none sm:rounded-3xl ${larga ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
            initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            <div className="flex items-center gap-3 border-b border-roxo/10 px-4 py-3">
              <h2 className="text-lg font-extrabold">{titulo}</h2>
              <button onClick={onFechar} aria-label="Fechar" className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-roxo/10 text-xl font-bold">×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
