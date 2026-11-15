"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setCarregando(true);
    const { error } = await supabaseNavegador().auth.signInWithPassword({ email: email.trim(), password: senha });
    setCarregando(false);
    if (error) return setMsg({ tipo: "erro", texto: /invalid/i.test(error.message) ? "E-mail ou senha incorretos." : "Não foi possível entrar: " + error.message });
    router.replace("/balcao");
  }
  async function esqueci() {
    if (!email.includes("@")) return setMsg({ tipo: "erro", texto: "Digite seu e-mail acima e clique de novo em “Esqueci a senha”." });
    setCarregando(true);
    const { error } = await supabaseNavegador().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/redefinir-senha` });
    setCarregando(false);
    setMsg(error ? { tipo: "erro", texto: "Não foi possível enviar: " + error.message } : { tipo: "ok", texto: "Enviamos um link para o seu e-mail. Abra-o neste aparelho para criar uma nova senha." });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-roxo px-4 py-10">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-3xl bg-creme p-6 shadow-2xl">
        <div className="flex justify-center rounded-2xl bg-roxo py-3"><Image src="/img/logo.png" alt="Tropical Açaí" width={130} height={54} priority /></div>
        <h1 className="text-center text-xl font-extrabold">Acesso da equipe</h1>
        <label className="block"><span className="rotulo">E-mail</span><input className="campo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block"><span className="rotulo">Senha</span><input className="campo" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        {msg && <p role="alert" className={`rounded-xl px-3 py-2 text-sm font-semibold ${msg.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-lima/30 text-roxo-escuro"}`}>{msg.texto}</p>}
        <button className="botao w-full" disabled={carregando}>{carregando ? "Aguarde…" : "Entrar"}</button>
        <button type="button" onClick={esqueci} className="block w-full text-center text-sm font-bold text-roxo underline underline-offset-4">Esqueci a senha / primeiro acesso</button>
      </form>
    </main>
  );
}
