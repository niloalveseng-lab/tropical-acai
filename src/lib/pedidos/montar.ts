import { z } from "zod";
import type { Cardapio } from "@/lib/cardapio";
import { checarPedidoMinimo, cotarEntrega } from "@/lib/delivery";
import { statusLoja, type Agora } from "@/lib/horario";
import { agoraSousa, priceCart, PricingError, type CartItem, type PricedItem } from "@/lib/pricing";

/** O que o navegador envia. Não existe campo de preço: tudo é recalculado aqui. */
const itemSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("acai"), sizeId: z.string().max(40), baseId: z.string().max(40), addonIds: z.array(z.string().max(60)).max(40), qtd: z.number().int().min(1).max(20), obs: z.string().max(200).optional() }),
  z.object({ tipo: z.literal("produto"), productId: z.string().max(40), tamanho: z.string().max(40).optional(), sabores: z.array(z.string().max(40)).max(4).optional(), escolha: z.string().max(40).optional(), qtd: z.number().int().min(1).max(20), obs: z.string().max(200).optional() }),
  z.object({ tipo: z.literal("promo"), promoId: z.string().max(40), qtd: z.number().int().min(1).max(20), obs: z.string().max(200).optional() }),
]);

export const pedidoSchema = z.object({
  itens: z.array(itemSchema).min(1).max(30),
  tipo: z.enum(["retirada", "entrega"]),
  nome: z.string().trim().min(2, "Informe seu nome").max(60),
  whatsapp: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(10, "Informe o WhatsApp com DDD").max(13)),
  endereco: z.string().trim().max(160).optional(),
  referencia: z.string().trim().max(120).optional(),
  destino: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  pagamento: z.enum(["dinheiro", "pix", "cartao", "pix_online", "cartao_online"]),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(120).optional().or(z.literal("").transform(() => undefined)),
  trocoPara: z.number().positive().max(1000).optional(),
});
export type PedidoEntrada = z.input<typeof pedidoSchema>;

export class PedidoError extends Error {}

export type PedidoMontado = {
  tipo: "retirada" | "entrega";
  nome: string; whatsapp: string;
  endereco: string | null; referencia: string | null;
  destino: { lat: number; lng: number } | null; distanciaKm: number | null;
  linhas: PricedItem[];
  subtotal: number; taxaEntrega: number; total: number;
  pagamento: "dinheiro" | "pix" | "cartao" | "pix_online" | "cartao_online"; trocoPara: number | null;
  /** true = pago pelo site (PIX ou cartão): o pedido só vai para a loja depois de aprovado. */
  online: boolean; email: string | null;
  agendado: boolean; avisoHorario: string | null;
};

/** Valida, recalcula preços e taxa, e aplica as regras da loja. Lança PedidoError com mensagem para o cliente. */
export function montarPedido(c: Cardapio, entrada: unknown, agora: Agora = agoraSousa()): PedidoMontado {
  const r = pedidoSchema.safeParse(entrada);
  if (!r.success) throw new PedidoError(r.error.issues[0]?.message || "Dados do pedido incompletos");
  const p = r.data;

  let linhas: PricedItem[], subtotal: number;
  try {
    ({ linhas, subtotal } = priceCart(c, p.itens as CartItem[], agora));
  } catch (e) {
    if (e instanceof PricingError) throw new PedidoError(e.message);
    throw e;
  }

  const st = statusLoja(c.loja.horarios, agora);
  if (!st.aberta && !c.loja.aceitaAgendamento) throw new PedidoError(`${st.texto}. Volte no horário de funcionamento.`);

  let taxa = 0, distanciaKm: number | null = null;
  if (p.tipo === "entrega") {
    if (!p.endereco || p.endereco.length < 5) throw new PedidoError("Informe o endereço de entrega");
    if (!p.destino) throw new PedidoError("Marque o local da entrega no mapa");
    const minimo = checarPedidoMinimo(subtotal, c.loja.pedidoMinimo);
    if (minimo) throw new PedidoError(minimo);
    const cot = cotarEntrega({ lat: c.loja.lat, lng: c.loja.lng }, p.destino, c.loja.faixas);
    if (!cot.entrega) throw new PedidoError(cot.motivo + " Você pode retirar no balcão.");
    taxa = cot.taxa; distanciaKm = cot.distanciaKm;
  }
  const total = Math.round((subtotal + taxa) * 100) / 100;
  if (p.pagamento === "dinheiro" && p.trocoPara != null && p.trocoPara < total) throw new PedidoError("O valor para troco é menor que o total do pedido");

  return {
    tipo: p.tipo, nome: p.nome, whatsapp: p.whatsapp,
    endereco: p.tipo === "entrega" ? p.endereco! : null, referencia: p.tipo === "entrega" ? p.referencia || null : null,
    destino: p.tipo === "entrega" ? p.destino! : null, distanciaKm,
    linhas, subtotal, taxaEntrega: taxa, total,
    pagamento: p.pagamento, trocoPara: p.pagamento === "dinheiro" ? p.trocoPara ?? null : null,
    online: p.pagamento === "pix_online" || p.pagamento === "cartao_online", email: p.email ?? null,
    agendado: !st.aberta, avisoHorario: st.aberta ? null : st.texto,
  };
}
