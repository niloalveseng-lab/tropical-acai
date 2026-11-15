import { z } from "zod";
import { agoraSousa, priceCart, PricingError, type Catalog, type CartItem, type PricedItem } from "@/lib/pricing";

/** Venda no balcão: o navegador manda itens e pagamentos; preços são refeitos no servidor. */
export const METODOS = ["dinheiro", "pix", "debito", "credito"] as const;
export type Metodo = (typeof METODOS)[number];
export const NOME_METODO: Record<Metodo, string> = { dinheiro: "Dinheiro", pix: "PIX", debito: "Débito", credito: "Crédito" };

const qtd = z.number().int().min(1).max(50);
const obs = z.string().max(200).optional();
const itemSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("acai"), sizeId: z.string().max(40), baseId: z.string().max(40), addonIds: z.array(z.string().max(60)).max(40), qtd, obs }),
  z.object({ tipo: z.literal("produto"), productId: z.string().max(40), tamanho: z.string().max(40).optional(), sabores: z.array(z.string().max(40)).max(4).optional(), escolha: z.string().max(40).optional(), qtd, obs }),
  z.object({ tipo: z.literal("promo"), promoId: z.string().max(40), qtd, obs }),
  z.object({ tipo: z.literal("kg"), pesoBrutoG: z.number().int().min(1).max(32000), taraG: z.number().int().min(0).max(2000), qtd: z.literal(1) }),
]);

export const vendaSchema = z.object({
  itens: z.array(itemSchema).min(1, "Adicione pelo menos um item").max(40),
  pagamentos: z.array(z.object({ metodo: z.enum(METODOS), valor: z.number().positive().max(100000) })).min(1, "Escolha a forma de pagamento").max(4),
  recebido: z.number().positive().max(100000).optional(), // dinheiro entregue pelo cliente (para o troco)
  cliente: z.string().trim().max(60).optional(),
  paraPreparo: z.boolean().default(false), // true = entra na fila "Em preparo"; false = já entregue
});

export class VendaError extends Error {}
const cents = (v: number) => Math.round(v * 100) / 100;

export type VendaMontada = {
  linhas: PricedItem[]; total: number;
  pagamentos: { metodo: Metodo; valor: number }[];
  forma: Metodo | "misto"; recebido: number | null; troco: number;
  cliente: string | null; paraPreparo: boolean;
};

export function montarVenda(c: Catalog, entrada: unknown, agora = agoraSousa()): VendaMontada {
  const r = vendaSchema.safeParse(entrada);
  if (!r.success) throw new VendaError(r.error.issues[0]?.message || "Venda inválida");
  const v = r.data;
  let linhas: PricedItem[], total: number;
  try { ({ linhas, subtotal: total } = priceCart(c, v.itens as CartItem[], agora)); }
  catch (e) { if (e instanceof PricingError) throw new VendaError(e.message); throw e; }

  // Junta linhas repetidas da mesma forma e confere a soma.
  const soma = new Map<Metodo, number>();
  for (const p of v.pagamentos) soma.set(p.metodo, cents((soma.get(p.metodo) ?? 0) + p.valor));
  const pagamentos = Array.from(soma, ([metodo, valor]) => ({ metodo, valor }));
  const pago = cents(pagamentos.reduce((s, p) => s + p.valor, 0));
  if (pago !== total) throw new VendaError(`Os pagamentos somam R$ ${pago.toFixed(2).replace(".", ",")}, mas o total é R$ ${total.toFixed(2).replace(".", ",")}`);

  const dinheiro = soma.get("dinheiro") ?? 0;
  let recebido: number | null = null, troco = 0;
  if (v.recebido != null) {
    if (!dinheiro) throw new VendaError("Valor recebido só vale para pagamento em dinheiro");
    if (v.recebido < dinheiro) throw new VendaError("O valor recebido é menor que a parte em dinheiro");
    recebido = v.recebido; troco = cents(v.recebido - dinheiro);
  }
  return { linhas, total, pagamentos, forma: pagamentos.length === 1 ? pagamentos[0].metodo : "misto", recebido, troco, cliente: v.cliente || null, paraPreparo: v.paraPreparo };
}
