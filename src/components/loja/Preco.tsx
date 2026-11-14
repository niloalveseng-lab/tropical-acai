"use client";
import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { brl } from "./util";

/** Valor em reais que "rola" até o novo número quando muda. */
export function Preco({ valor }: { valor: number }) {
  const [mostrado, setMostrado] = useState(valor);
  const anterior = useRef(valor);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setMostrado(valor); anterior.current = valor; return; }
    const c = animate(anterior.current, valor, { duration: 0.3, onUpdate: (v) => setMostrado(v) });
    anterior.current = valor;
    return () => c.stop();
  }, [valor]);
  return <span className="tabular-nums">{brl(Math.round(mostrado * 100) / 100)}</span>;
}
