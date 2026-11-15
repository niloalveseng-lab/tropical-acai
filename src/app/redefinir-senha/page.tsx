"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export default function RedefinirSenha() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    const sb = supabaseNavegador();
    const code = new URLSearchParams(location.search).get("code");
    (code ? sb.auth.exchangeCodeForSession(code) : sb.auth.getSession()).then(({ data, error }) => {
      if (error || !data.session) setErro("Este link expirou ou já foi usado. Volte e peça um novo em “Esqueci a senha”.");
      else setPronto(true);
    });
  }, []);
  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro("");
    if (senha.length < 8) return setErro("Use pelo menos 8 caracteres.");
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    if (error) return setErro("Não foi possível salvar: " + error.message);
    router.replace("/balcao");
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-roxo px-4">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4 rounded-3xl bg-creme p-6">
        <h1 className="text-xl font-extrabold">Criar nova senha</h1>
        {pronto && <label className="block"><span className="rotulo">Nova senha (mínimo 8 caracteres)</span><input className="campo" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>}
        {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{erro}</p>}
        {pronto ? <button className="botao w-full">Salvar e entrar</button> : !erro && <p className="text-sm">Verificando o link…</p>}
        <a href="/entrar" className="block text-center text-sm font-bold text-roxo underline">Voltar ao login</a>
      </form>
    </main>
  );
}
