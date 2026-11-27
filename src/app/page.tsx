import { MapaLoja } from "@/components/MapaLoja";
import { WhatsAppFlutuante } from "@/components/WhatsAppFlutuante";
import { Loja } from "@/components/loja/Loja";
import { getCardapio } from "@/lib/cardapio";
import { getMaisVendidos } from "@/lib/loja";

export const revalidate = 60; // preços e "esgotado hoje" chegam ao site em até 1 minuto

export default async function Home() {
  const [cardapio, top] = await Promise.all([getCardapio(), getMaisVendidos()]);
  return (
    <>
      {cardapio.demo && <p className="bg-lima px-4 py-1.5 text-center text-xs font-bold text-roxo-escuro">Modo demonstração: pedidos não chegam à loja até o banco de dados ser ligado.</p>}
      <Loja cardapio={cardapio} maisVendidos={top} />
      <MapaLoja lat={cardapio.loja.lat} lng={cardapio.loja.lng} endereco={cardapio.loja.endereco} whatsapp={cardapio.loja.whatsapp} />
      <WhatsAppFlutuante numero={cardapio.loja.whatsapp} />
    </>
  );
}
