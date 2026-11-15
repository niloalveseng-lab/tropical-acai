import { getCardapio } from "@/lib/cardapio";
import Caixa from "./Caixa";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <Caixa cardapio={await getCardapio()} />;
}
