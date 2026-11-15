"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export type Eu = { id: string; funcao: "dono" | "gerente" | "atendente" };

/** Confere o login da equipe; sem login manda para /entrar, sem cadastro manda para /balcao. */
export function useEquipe(): Eu | null {
  const router = useRouter();
  const [eu, setEu] = useState<Eu | null>(null);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    (async () => {
      const sb = supabaseNavegador();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/entrar");
      const { data: funcao } = await sb.rpc("minha_funcao");
      if (!funcao) return router.replace("/balcao");
      setEu({ id: user.id, funcao: funcao as Eu["funcao"] });
    })();
  }, [router]);
  return eu;
}
