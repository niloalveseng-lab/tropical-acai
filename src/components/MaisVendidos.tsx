import Image from "next/image";
import type { Vendido } from "@/lib/loja";

const FOTOS: [RegExp, string][] = [
  [/^Copo Promocional/i, "/img/promo.jpg"],
  [/^Açaí Copo/i, "/img/acai_copo.jpg"],
  [/^Açaí Pote/i, "/img/acai_pote.jpg"],
  [/^Batida/i, "/img/batida.jpg"],
  [/^Milkshake/i, "/img/milkshake.jpg"],
  [/^Sorvete/i, "/img/cascao.jpg"],
  [/^Picolé Açaí/i, "/img/pic_acai.jpg"],
  [/^Picolé Coco/i, "/img/pic_coco.jpg"],
  [/^Picolé Brownie/i, "/img/pic_brownie.jpg"],
];
const foto = (v: Vendido) => v.imagem ?? FOTOS.find(([re]) => re.test(v.nome))?.[1] ?? "/img/logo.png";

export function MaisVendidos({ itens }: { itens: Vendido[] }) {
  if (!itens.length) return null;
  return (
    <section aria-labelledby="top" className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline gap-3">
        <h2 id="top" className="text-2xl font-extrabold">Mais pedidos</h2>
        <span className="text-sm text-roxo/70">nos últimos 30 dias</span>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {itens.map((v, i) => (
          <li key={v.nome} className="overflow-hidden rounded-2xl border border-roxo/10 bg-white">
            <div className="relative aspect-[4/3]">
              <Image src={foto(v)} alt="" fill sizes="(max-width:640px) 50vw, 33vw" className="object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-lima px-2.5 py-0.5 text-xs font-extrabold text-roxo-escuro">#{i + 1}</span>
            </div>
            <div className="p-3">
              <p className="font-bold leading-tight">{v.nome}</p>
              {v.quantidade != null && <p className="text-xs text-roxo/70">{v.quantidade} vendidos</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
