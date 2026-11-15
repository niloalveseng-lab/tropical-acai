import { createHmac, timingSafeEqual } from "node:crypto";

/** Mercado Pago por chamadas diretas à API (só no servidor). O Access Token fica em MP_ACCESS_TOKEN. */
const API = "https://api.mercadopago.com";
export const MINUTOS_PARA_PAGAR = 30;
export const mpConfigurado = () => !!process.env.MP_ACCESS_TOKEN;

export type PagamentoMP = {
  id: number; status: string; status_detail?: string; transaction_amount: number; external_reference: string | null;
  payment_method_id?: string; payment_type_id?: string; date_approved?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
};

export class MPErro extends Error { constructor(msg: string, public status = 0) { super(msg); } }

async function chamar<T>(caminho: string, init: RequestInit & { idempotencia?: string } = {}): Promise<T> {
  const r = await fetch(API + caminho, {
    ...init, cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init.idempotencia ? { "X-Idempotency-Key": init.idempotencia } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new MPErro(`Mercado Pago ${r.status}: ${j?.message ?? j?.error ?? "erro"}${j?.cause?.[0]?.description ? " — " + j.cause[0].description : ""}`, r.status);
  return j as T;
}

const expira = () => new Date(Date.now() + MINUTOS_PARA_PAGAR * 60_000).toISOString().replace("Z", "-00:00");
type Dados = { orderId: string; numero: number; total: number; nome: string; email: string; site: string; codigo: string };

/** Cria a cobrança PIX e devolve o QR Code e o copia-e-cola. */
export async function criarPix(d: Dados) {
  const p = await chamar<PagamentoMP>("/v1/payments", {
    method: "POST", idempotencia: "pix-" + d.orderId,
    body: JSON.stringify({
      transaction_amount: d.total, payment_method_id: "pix", description: `Tropical Açaí — pedido #${d.numero}`,
      external_reference: d.orderId, date_of_expiration: expira(),
      notification_url: `${d.site}/api/mp/webhook`,
      payer: { email: d.email, first_name: d.nome.split(" ")[0], last_name: d.nome.split(" ").slice(1).join(" ") || undefined },
    }),
  });
  const t = p.point_of_interaction?.transaction_data;
  if (!t?.qr_code) throw new MPErro("O Mercado Pago não devolveu o código PIX. Confira se a conta tem uma chave PIX cadastrada.");
  return { id: String(p.id), copiaCola: t.qr_code, qrBase64: t.qr_code_base64 ?? null };
}

/** Cria a página de pagamento com cartão (Checkout Pro) e devolve o link. */
export async function criarLinkCartao(d: Dados) {
  const p = await chamar<{ id: string; init_point: string }>("/checkout/preferences", {
    method: "POST", idempotencia: "pref-" + d.orderId,
    body: JSON.stringify({
      items: [{ id: d.orderId, title: `Tropical Açaí — pedido #${d.numero}`, quantity: 1, unit_price: d.total, currency_id: "BRL" }],
      external_reference: d.orderId, statement_descriptor: "TROPICAL ACAI",
      payer: { email: d.email, name: d.nome },
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }], installments: 1 },
      back_urls: { success: `${d.site}/pedido/${d.codigo}`, pending: `${d.site}/pedido/${d.codigo}`, failure: `${d.site}/pedido/${d.codigo}` },
      auto_return: "approved", binary_mode: true,
      notification_url: `${d.site}/api/mp/webhook`,
      expires: true, expiration_date_to: expira(),
    }),
  });
  return { preferencia: p.id, link: p.init_point };
}

export const buscarPagamento = (id: string) => chamar<PagamentoMP>(`/v1/payments/${encodeURIComponent(id)}`);

/** Pagamentos ligados a um pedido (usado para conferir quando o aviso automático não chega). */
export async function pagamentosDoPedido(orderId: string) {
  const r = await chamar<{ results: PagamentoMP[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=10`);
  return r.results ?? [];
}

/**
 * Confere a assinatura do aviso (cabeçalho x-signature: "ts=...,v1=...").
 * Sem MP_WEBHOOK_SECRET configurado devolve null (não dá para conferir); o pagamento é sempre
 * consultado de novo na API antes de qualquer mudança, então um aviso falso não aprova pedido.
 */
export function assinaturaValida(xSignature: string | null, xRequestId: string | null, dataId: string, segredo = process.env.MP_WEBHOOK_SECRET): boolean | null {
  if (!segredo) return null;
  const partes = Object.fromEntries((xSignature ?? "").split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${dataId.toLowerCase()};request-id:${xRequestId ?? ""};ts:${partes.ts};`;
  const esperado = createHmac("sha256", segredo).update(manifesto).digest("hex");
  try { return timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(partes.v1, "hex")); } catch { return false; }
}
