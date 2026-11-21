import { NextResponse } from "next/server";
import { z } from "zod";
import { acharUsuarioPorEmail, AcessoNegado, admin, exigirDono, FUNCOES, novoMembroSchema } from "@/lib/equipe/admin";

export const dynamic = "force-dynamic";

function falha(e: unknown) {
  if (e instanceof AcessoNegado) return NextResponse.json({ erro: e.message }, { status: 403 });
  if (e instanceof z.ZodError) return NextResponse.json({ erro: e.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  console.error("[equipe]", e);
  return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
}

/** Lista a equipe. */
export async function GET() {
  try {
    await exigirDono();
    const { data, error } = await admin().from("staff").select("user_id,nome,email,role,ativo,permissoes,created_at").order("ativo", { ascending: false }).order("role").order("nome");
    if (error) throw error;
    return NextResponse.json({ equipe: data });
  } catch (e) { return falha(e); }
}

/** Cadastra (ou reativa) alguém com e-mail e senha inicial. */
export async function POST(req: Request) {
  try {
    await exigirDono();
    const m = novoMembroSchema.parse(await req.json());
    const sb = admin();
    let userId: string;
    const { data, error } = await sb.auth.admin.createUser({ email: m.email, password: m.senha, email_confirm: true, user_metadata: { nome: m.nome } });
    if (data?.user) userId = data.user.id;
    else if (error && /already|registered|exists/i.test(error.message)) {
      const u = await acharUsuarioPorEmail(sb, m.email);
      if (!u) throw new Error("Este e-mail já existe, mas não foi encontrado. Tente de novo.");
      const { error: e2 } = await sb.auth.admin.updateUserById(u.id, { password: m.senha, ban_duration: "none", email_confirm: true });
      if (e2) throw e2;
      userId = u.id;
    } else throw error ?? new Error("Não foi possível criar o usuário");

    const { data: atual } = await sb.from("staff").select("role").eq("user_id", userId).maybeSingle();
    if (atual?.role === "dono") throw new Error("Este e-mail é do dono.");
    const { error: e3 } = await sb.from("staff").upsert({ user_id: userId, nome: m.nome, email: m.email, role: m.funcao, ativo: true });
    if (e3) throw e3;
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}

const PERMISSOES = ["caixa", "cancelar", "esgotado", "historico", "relatorios", "cardapio", "loja", "estoque", "financeiro"] as const;
const alterarSchema = z.object({
  user_id: z.string().uuid(), funcao: z.enum(FUNCOES).optional(),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72).optional(),
  // Ajustes individuais; null volta ao padrão da função.
  permissoes: z.partialRecord(z.enum(PERMISSOES), z.boolean()).nullable().optional(),
});

/** Muda função ou define nova senha. */
export async function PATCH(req: Request) {
  try {
    const dono = await exigirDono();
    const m = alterarSchema.parse(await req.json());
    if (m.user_id === dono) throw new AcessoNegado("Para trocar a sua senha use “Esqueci a senha” no login.");
    const sb = admin();
    if (m.funcao) { const { error } = await sb.from("staff").update({ role: m.funcao, permissoes: {} }).eq("user_id", m.user_id).neq("role", "dono"); if (error) throw error; }
    if (m.permissoes !== undefined) { const { error } = await sb.from("staff").update({ permissoes: m.permissoes ?? {} }).eq("user_id", m.user_id).neq("role", "dono"); if (error) throw error; }
    if (m.senha) { const { error } = await sb.auth.admin.updateUserById(m.user_id, { password: m.senha }); if (error) throw error; }
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}

/** Remove o acesso. Apaga o usuário; se ele tiver histórico de caixa, bloqueia o login e mantém o histórico. */
export async function DELETE(req: Request) {
  try {
    const dono = await exigirDono();
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get("id"));
    if (id === dono) throw new AcessoNegado("O dono não pode remover a si mesmo.");
    const sb = admin();
    const { data: alvo } = await sb.from("staff").select("role").eq("user_id", id).maybeSingle();
    if (alvo?.role === "dono") throw new AcessoNegado("Não é possível remover o dono.");
    const { error } = await sb.auth.admin.deleteUser(id);
    if (!error) return NextResponse.json({ ok: true, modo: "apagado" });
    // Tem caixa aberto/fechado no nome dele: bloqueia em vez de apagar.
    const { error: e1 } = await sb.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (e1) throw e1;
    const { error: e2 } = await sb.from("staff").update({ ativo: false }).eq("user_id", id);
    if (e2) throw e2;
    return NextResponse.json({ ok: true, modo: "bloqueado" });
  } catch (e) { return falha(e); }
}
