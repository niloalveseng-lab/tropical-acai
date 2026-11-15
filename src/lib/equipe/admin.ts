import { createClient as createAdmin } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const FUNCOES = ["gerente", "atendente"] as const;

export const novoMembroSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(60),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
  funcao: z.enum(FUNCOES),
});

export class AcessoNegado extends Error {}

/** Confere pela sessão (cookie) se quem chamou é o dono. Devolve o id dele. */
export async function exigirDono() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new AcessoNegado("Faça login novamente.");
  const { data: funcao } = await sb.rpc("minha_funcao");
  if (funcao !== "dono") throw new AcessoNegado("Só o dono pode gerenciar a equipe.");
  return user.id;
}

/** Cliente com a chave de serviço — só no servidor, nunca no navegador. */
export function admin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("Falta a variável SUPABASE_SERVICE_ROLE_KEY na Vercel.");
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function acharUsuarioPorEmail(sb: ReturnType<typeof admin>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}
