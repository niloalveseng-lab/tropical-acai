"use client";
import { supabaseNavegador } from "@/lib/supabase/client";
import { agoraSousa } from "@/lib/pricing";
import { Cartao, type Aviso, type Dados } from "./comum";

type Props = { dados: Dados; avisar: Aviso; recarregar: () => void };

/** Marca o que acabou hoje. Some do site e do caixa na hora e volta sozinho amanhã. */
export default function Esgotado({ dados, avisar, recarregar }: Props) {
  const hoje = agoraSousa().data;
  async function alternar(tipo: "addon" | "produto", id: string, nome: string, esgotar: boolean) {
    const { error } = await supabaseNavegador().rpc("marcar_esgotado", { p_tipo: tipo, p_id: id, p_esgotado: esgotar });
    if (error) return avisar("erro", "Não foi possível alterar: " + error.message);
    avisar("ok", esgotar ? `${nome} marcado como esgotado hoje` : `${nome} disponível de novo`);
    recarregar();
  }
  const Botao = ({ tipo, id, nome, esgotado }: { tipo: "addon" | "produto"; id: string; nome: string; esgotado: boolean }) => (
    <button aria-pressed={esgotado} onClick={() => alternar(tipo, id, nome, !esgotado)} className={`rounded-xl px-3 py-2.5 text-sm font-bold transition active:scale-95 ${esgotado ? "bg-red-600 text-white" : "bg-creme text-roxo ring-1 ring-roxo/15"}`}>
      {nome}{esgotado && " · esgotado"}
    </button>
  );
  const esgotados = dados.addons.filter((a) => a.esgotado_em === hoje).length + dados.produtos.filter((p) => p.esgotado_em === hoje).length;

  return (
    <>
      <p className="rounded-2xl bg-lima/30 px-4 py-3 text-sm font-semibold text-roxo-escuro">Toque no que acabou. O item some do site e do caixa na hora e volta sozinho amanhã. {esgotados > 0 ? `Esgotados agora: ${esgotados}.` : "Nada esgotado hoje."}</p>
      {dados.grupos.map((g) => {
        const itens = dados.addons.filter((a) => a.group_id === g.id && a.ativo);
        return itens.length > 0 && <Cartao key={g.id} titulo={g.nome}><div className="flex flex-wrap gap-2">{itens.map((a) => <Botao key={a.id} tipo="addon" id={a.id} nome={a.nome} esgotado={a.esgotado_em === hoje} />)}</div></Cartao>;
      })}
      {dados.categorias.map((c) => {
        const itens = dados.produtos.filter((p) => p.category_id === c.id && p.ativo);
        return itens.length > 0 && <Cartao key={c.id} titulo={c.nome}><div className="flex flex-wrap gap-2">{itens.map((p) => <Botao key={p.id} tipo="produto" id={p.id} nome={p.nome} esgotado={p.esgotado_em === hoje} />)}</div></Cartao>;
      })}
    </>
  );
}
