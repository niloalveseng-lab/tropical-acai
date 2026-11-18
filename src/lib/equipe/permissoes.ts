/** Permissões da equipe (as mesmas do banco: função pode() / minhas_permissoes()). */
export const PERMISSOES = [
  { id: "caixa", nome: "Caixa", descricao: "Abrir e fechar o caixa, vender, sangria e reforço" },
  { id: "cancelar", nome: "Cancelar pedidos", descricao: "Cancelar pedidos e vendas" },
  { id: "esgotado", nome: "Esgotado hoje", descricao: "Marcar o que acabou no dia" },
  { id: "historico", nome: "Dias anteriores", descricao: "Ver pedidos e vendas de outros dias" },
  { id: "relatorios", nome: "Relatórios", descricao: "Faturamento, mais vendidos, caixas e entregas" },
  { id: "cardapio", nome: "Cardápio e preços", descricao: "Preços, itens, fotos e promoções" },
  { id: "loja", nome: "Loja e entrega", descricao: "Horários, taxas de entrega, local e contato" },
] as const;

export type Permissao = (typeof PERMISSOES)[number]["id"];
export type Funcao = "dono" | "gerente" | "atendente";

/** Padrão de cada função (igual a permissao_padrao() no banco). */
export const padrao = (funcao: Funcao, p: Permissao) => funcao !== "atendente" || p === "caixa" || p === "cancelar" || p === "esgotado";

/** Permissão efetiva: ajuste individual, senão o padrão da função. Dono pode tudo. */
export const efetiva = (funcao: Funcao, ajustes: Partial<Record<string, boolean>> | null | undefined, p: Permissao) =>
  funcao === "dono" ? true : ajustes?.[p] ?? padrao(funcao, p);
