import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { aplicarPagamento } from "@/lib/pagamento/confirmar";
import { assinaturaValida, buscarPagamento, mpConfigurado } from "@/lib/pagamento/mp";

export const dynamic = "force-dynamic";

/**
 * Aviso do Mercado Pago ("pagamento mudou"). O aviso só traz o número do pagamento:
 * o valor e o status são sempre consultados na API com o nosso token antes de liberar o pedido.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const corpo = await req.json().catch(() => ({} as Record<string, unknown>));
  const tipo = (corpo.type ?? corpo.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic")) as string | null;
  const dataId = String((corpo.data as { id?: string | number } | undefined)?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (tipo !== "payment" || !/^\d+$/.test(dataId)) return NextResponse.json({ ok: true }); // outros avisos: só confirma o recebimento

  if (assinaturaValida(req.headers.get("x-signature"), req.headers.get("x-request-id"), url.searchParams.get("data.id") ?? dataId) === false) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  if (!mpConfigurado() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ erro: "não configurado" }, { status: 503 });

  try {
    const pg = await buscarPagamento(dataId);
    const sb = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const r = await aplicarPagamento(sb, pg);
    return NextResponse.json({ ok: true, resultado: r });
  } catch (e) {
    console.error("[mp/webhook]", dataId, e);
    return NextResponse.json({ erro: "falha ao processar" }, { status: 500 }); // o Mercado Pago tenta de novo
  }
}
