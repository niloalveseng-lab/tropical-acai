import { z } from "zod";
import { checarPedidoMinimo, cotarEntrega, type Faixa } from "@/lib/delivery";
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

const coord = z.number().finite();
export const vendaSchema = z.object({
  itens: z.array(itemSchema).min(1, "Adicione pelo menos um item").max(40),
  // Pago agora: uma ou mais formas. Cobrar na entrega/retirada: vazio + formaPrevista.
  pagamentos: z.array(z.object({ metodo: z.enum(METODOS), valor: z.number().positive().max(100000) })).max(4).default([]),
  cobrarDepois: z.boolean().default(false),
  formaPrevista: z.enum(METODOS).optional(),
  recebido: z.number().positive().max(100000).optional(), // dinheiro entregue pelo cliente (para o troco)
  cliente: z.string().trim().max(60).optional(),
  telefone: z.string().trim().max(20).optional(),
  paraPreparo: z.boolean().default(false), // balcão: true = entra na fila "Em preparo"; false = já entregue
  canal: z.enum(["balcao", "whatsapp"]).default("balcao"),
  tipo: z.enum(["balcao", "retirada", "entrega"]).default("balcao"),
  entrega: z.object({
    endereco: z.string().trim().min(3, "Informe o endereço da entrega").max(200),
    referencia: z.string().trim().max(200).optional(),
    lat: coord.min(-90).max(90), lng: coord.min(-180).max(180),
  }).optional(),
  observacao: z.string().trim().max(300).optional(),
});

export class VendaError extends Error {}
const cents = (v: number) => Math.round(v * 100) / 100;
const reais = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

/** Dados da loja usados para cobrar a entrega (os mesmos do site). */
export type LojaEntrega = { lat: number; lng: number; faixas: Faixa[]; pedidoMinimo: number };

export type VendaMontada = {
  linhas: PricedItem[]; subtotal: number; taxa: number; total: number;
  pagamentos: { metodo: Metodo; valor: number }[];
  forma: Metodo | "misto"; pago: boolean; recebido: number | null; troco: number;
  cliente: string | null; telefone: string | null; paraPreparo: boolean;
  canal: "balcao" | "whatsapp"; tipo: "balcao" | "retirada" | "entrega";
  entrega: { endereco: string; referencia: string | null; lat: number; lng: number; distanciaKm: number } | null;
  status: "preparo" | "entregue"; observacao: string | null;
};

export function montarVenda(c: Catalog, entrada: unknown, agora = agoraSousa(), loja?: LojaEntrega): VendaMontada {
  const r = vendaSchema.safeParse(entrada);
  if (!r.success) throw new VendaError(r.error.issues[0]?.message || "Venda inválida");
  const v = r.data;
  let linhas: PricedItem[], subtotal: number;
  try { ({ linhas, subtotal } = priceCart(c, v.itens as CartItem[], agora)); }
  catch (e) { if (e instanceof PricingError) throw new VendaError(e.message); throw e; }

  // Entrega: a taxa é calculada aqui pela distância, igual ao site. O navegador não manda taxa.
  let taxa = 0, entrega: VendaMontada["entrega"] = null;
  if (v.tipo === "entrega") {
    if (!v.entrega) throw new VendaError("Marque o local da entrega");
    if (!loja) throw new VendaError("Local da loja não configurado");
    const cot = cotarEntrega(loja, v.entrega, loja.faixas);
    if (!cot.entrega) throw new VendaError(cot.motivo);
    const minimo = checarPedidoMinimo(subtotal, loja.pedidoMinimo);
    if (minimo) throw new VendaError(minimo);
    taxa = cot.taxa;
    entrega = { endereco: v.entrega.endereco, referencia: v.entrega.referencia || null, lat: v.entrega.lat, lng: v.entrega.lng, distanciaKm: cot.distanciaKm };
  }
  if (v.tipo !== "balcao" && !v.cliente) throw new VendaError("Informe o nome do cliente");
  const total = cents(subtotal + taxa);

  let pagamentos: { metodo: Metodo; valor: number }[] = [], forma: Metodo | "misto", dinheiro = 0;
  if (v.cobrarDepois) {
    if (v.tipo === "balcao") throw new VendaError("No balcão o pagamento é na hora");
    if (!v.formaPrevista) throw new VendaError("Informe como o cliente vai pagar");
    if (v.pagamentos.length) throw new VendaError("Pedido a cobrar não leva pagamento agora");
    forma = v.formaPrevista;
    dinheiro = forma === "dinheiro" ? total : 0;
  } else {
    if (!v.pagamentos.length) throw new VendaError("Escolha a forma de pagamento");
    // Junta linhas repetidas da mesma forma e confere a soma.
    const soma = new Map<Metodo, number>();
    for (const p of v.pagamentos) soma.set(p.metodo, cents((soma.get(p.metodo) ?? 0) + p.valor));
    pagamentos = Array.from(soma, ([metodo, valor]) => ({ metodo, valor }));
    const pago = cents(pagamentos.reduce((s, p) => s + p.valor, 0));
    if (pago !== total) throw new VendaError(`Os pagamentos somam ${reais(pago)}, mas o total é ${reais(total)}`);
    forma = pagamentos.length === 1 ? pagamentos[0].metodo : "misto";
    dinheiro = soma.get("dinheiro") ?? 0;
  }

  let recebido: number | null = null, troco = 0;
  if (v.recebido != null) {
    if (!dinheiro) throw new VendaError("Valor recebido só vale para pagamento em dinheiro");
    if (v.recebido < dinheiro) throw new VendaError("O valor recebido é menor que a parte em dinheiro");
    recebido = v.recebido; troco = cents(v.recebido - dinheiro);
  }
  const vaiParaFila = v.tipo !== "balcao" || v.paraPreparo;
  return {
    linhas, subtotal, taxa, total, pagamentos, forma, pago: !v.cobrarDepois, recebido, troco,
    cliente: v.cliente || null, telefone: v.telefone?.replace(/\D/g, "") || null, paraPreparo: vaiParaFila,
    canal: v.canal, tipo: v.tipo, entrega, status: vaiParaFila ? "preparo" : "entregue", observacao: v.observacao || null,
  };
}
