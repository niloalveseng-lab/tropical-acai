export type Status = "aguardando_pagamento" | "novo" | "preparo" | "pronto" | "saiu" | "entregue" | "cancelado";

export const ROTULO: Record<Status, string> = {
  aguardando_pagamento: "Aguardando pagamento", novo: "Novo", preparo: "Em preparo",
  pronto: "Pronto para retirar", saiu: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado",
};

/** Próximo passo do pedido conforme o tipo (retirada ou entrega). */
export function proximo(status: Status, tipo: string): { status: Status; acao: string } | null {
  switch (status) {
    case "novo": return { status: "preparo", acao: "Aceitar e preparar" };
    case "preparo": return tipo === "entrega" ? { status: "saiu", acao: "Saiu para entrega" } : { status: "pronto", acao: "Pronto para retirar" };
    case "pronto": case "saiu": return { status: "entregue", acao: "Entregue" };
    default: return null;
  }
}

export const emAberto = (s: Status) => s === "novo" || s === "preparo" || s === "pronto" || s === "saiu";
