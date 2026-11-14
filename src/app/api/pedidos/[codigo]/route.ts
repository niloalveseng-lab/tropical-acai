import { NextResponse } from "next/server";
import { pedidosRepo } from "@/lib/pedidos/repo";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { codigo: string } }) {
  if (!/^[a-z0-9]{12}$/.test(params.codigo)) return NextResponse.json({ erro: "Pedido não encontrado" }, { status: 404 });
  const pedido = await pedidosRepo().buscar(params.codigo);
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado" }, { status: 404 });
  return NextResponse.json({ pedido }, { headers: { "Cache-Control": "no-store" } });
}
