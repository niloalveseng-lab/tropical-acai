import Image from "next/image";
import { MapaLoja } from "@/components/MapaLoja";
import { MaisVendidos } from "@/components/MaisVendidos";
import { WhatsAppFlutuante } from "@/components/WhatsAppFlutuante";
import { getInfoLoja, getMaisVendidos } from "@/lib/loja";

export const revalidate = 300; // atualiza "mais pedidos" a cada 5 minutos

export default async function Home() {
  const [loja, top] = await Promise.all([getInfoLoja(), getMaisVendidos()]);
  return (
    <main className="pb-24">
      <header className="bg-roxo text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <Image src="/img/logo.png" alt="Tropical Açaí" width={140} height={58} priority />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-8">
        <h1 className="text-3xl font-extrabold leading-tight">
          Monte o seu <span className="font-script font-normal text-lima-tinta">açaí</span> e receba em casa
        </h1>
        <p className="mt-2 text-roxo/80">Cardápio online em construção — fase 2.</p>
      </section>

      <MaisVendidos itens={top} />
      <MapaLoja lat={loja.lat} lng={loja.lng} endereco={loja.endereco} />
      <WhatsAppFlutuante numero={loja.whatsapp} />
    </main>
  );
}
