"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Membro = { user_id: string; nome: string; email: string | null; role: "dono" | "gerente" | "atendente"; ativo: boolean };
const NOME_FUNCAO = { dono: "Dono", gerente: "Gerente", atendente: "Atendente" } as const;

async function api(metodo: string, corpo?: unknown, query = "") {
  const r = await fetch("/api/equipe" + query, { method: metodo, headers: corpo ? { "content-type": "application/json" } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? "Erro " + r.status);
  return j;
}

export default function Equipe() {
  const [equipe, setEquipe] = useState<Membro[] | null>(null);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", funcao: "atendente" as "atendente" | "gerente" });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => api("GET").then((j) => setEquipe(j.equipe)).catch((e) => setMsg({ tipo: "erro", texto: e.message })), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(f: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await f(); setMsg({ tipo: "ok", texto: ok }); carregar(); } catch (e) { setMsg({ tipo: "erro", texto: (e as Error).message }); }
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true);
    await acao(() => api("POST", form), `${form.nome} cadastrado(a). Passe o e-mail e a senha para a pessoa entrar em /entrar.`);
    setForm((f) => ({ ...f, nome: "", email: "", senha: "" })); setSalvando(false);
  }

  function senhaAleatoria() {
    const abc = "abcdefghjkmnpqrstuvwxyz23456789";
    setForm((f) => ({ ...f, senha: Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => abc[b % abc.length]).join("") }));
  }

  return (
    <main className="min-h-dvh bg-creme pb-16">
      <header className="bg-roxo text-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
        <Link href="/balcao" className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">← Pedidos</Link>
        <h1 className="text-lg font-extrabold">Equipe</h1>
      </div></header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        {msg && <p role="alert" className={`rounded-xl px-3 py-2 text-sm font-semibold ${msg.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-lima/30 text-roxo-escuro"}`}>{msg.texto}</p>}

        <form onSubmit={cadastrar} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-extrabold text-roxo">Cadastrar pessoa</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="rotulo">Nome</span><input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <label><span className="rotulo">E-mail</span><input className="campo" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span className="rotulo">Senha inicial</span>
              <div className="flex gap-2"><input className="campo" required minLength={8} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /><button type="button" onClick={senhaAleatoria} className="shrink-0 rounded-xl bg-roxo/10 px-3 text-sm font-bold text-roxo">Gerar</button></div>
            </label>
            <label><span className="rotulo">Função</span>
              <select className="campo" value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value as "atendente" | "gerente" })}>
                <option value="atendente">Atendente — vê e atualiza pedidos</option>
                <option value="gerente">Gerente — pedidos + cardápio e preços</option>
              </select>
            </label>
          </div>
          <button className="botao w-full sm:w-auto" disabled={salvando}>{salvando ? "Salvando…" : "Cadastrar"}</button>
          <p className="text-xs text-roxo/60">A pessoa entra em <b>/entrar</b> com esse e-mail e senha e pode trocar a senha em “Esqueci a senha”.</p>
        </form>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-extrabold text-roxo">Quem tem acesso</h2>
          {!equipe ? <p>Carregando…</p> : (
            <ul className="divide-y divide-roxo/10">
              {equipe.map((m) => (
                <li key={m.user_id} className={`flex flex-wrap items-center gap-2 py-3 ${m.ativo ? "" : "opacity-50"}`}>
                  <div className="min-w-0 flex-1"><div className="font-bold">{m.nome}{!m.ativo && " (bloqueado)"}</div><div className="truncate text-sm text-roxo/60">{m.email}</div></div>
                  {m.role === "dono" ? <span className="rounded-full bg-roxo px-3 py-1 text-xs font-extrabold text-white">Dono</span> : (
                    <>
                      <select aria-label={`Função de ${m.nome}`} className="rounded-full bg-roxo/10 px-3 py-1.5 text-sm font-bold text-roxo" value={m.role}
                        onChange={(e) => acao(() => api("PATCH", { user_id: m.user_id, funcao: e.target.value }), "Função alterada.")}>
                        <option value="atendente">{NOME_FUNCAO.atendente}</option><option value="gerente">{NOME_FUNCAO.gerente}</option>
                      </select>
                      <button className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold" onClick={() => {
                        const s = prompt(`Nova senha para ${m.nome} (mínimo 8 caracteres):`);
                        if (s) acao(() => api("PATCH", { user_id: m.user_id, senha: s }), "Senha alterada.");
                      }}>Nova senha</button>
                      <button className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-bold text-red-700" onClick={() => {
                        if (confirm(`Remover o acesso de ${m.nome}? Ele(a) não conseguirá mais entrar.`)) acao(() => api("DELETE", undefined, `?id=${m.user_id}`), `${m.nome} removido(a).`);
                      }}>Remover</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
