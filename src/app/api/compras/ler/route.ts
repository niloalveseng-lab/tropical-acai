import { NextResponse } from "next/server";
import { z } from "zod";
import { casarLinhas, type Apelido, type InsumoBase, type LinhaLida } from "@/lib/compras/casar";
import { permitido } from "@/lib/limite";
import { createClient, supabaseConfigurado } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const entrada = z.object({
  arquivo: z.string().min(100).max(6_000_000), // base64
  tipo: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

const FORMAS = ["dinheiro", "pix", "debito", "credito", "boleto", "outro"] as const;

/** Formato que a IA devolve (ferramenta com esquema fixo, então a resposta é sempre JSON). */
const FERRAMENTA = {
  name: "registrar_comprovante",
  description: "Registra os dados lidos de um cupom fiscal, nota fiscal, DANFE, recibo ou comprovante de compra.",
  input_schema: {
    type: "object",
    properties: {
      legivel: { type: "boolean", description: "false se a foto não é um comprovante de compra ou está ilegível" },
      fornecedor: { type: ["string", "null"], description: "Nome da loja/fornecedor (nome fantasia se houver, senão razão social)" },
      cnpj: { type: ["string", "null"] },
      data: { type: ["string", "null"], description: "Data da compra/emissão no formato AAAA-MM-DD" },
      total: { type: ["number", "null"], description: "Valor total pago (após descontos)" },
      forma_pagamento: { type: ["string", "null"], enum: [...FORMAS, null] },
      vencimento: { type: ["string", "null"], description: "Vencimento do boleto/duplicata, AAAA-MM-DD, se houver" },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição exatamente como impressa" },
            quantidade: { type: "number", description: "Quantidade comprada como impressa (unidades, ou kg quando vendido a peso)" },
            unidade: { type: ["string", "null"], description: "Unidade impressa: UN, KG, CX, PCT..." },
            valor_total: { type: "number", description: "Valor total da linha (quantidade × preço, menos desconto do item)" },
            insumo: { type: ["string", "null"], description: "Nome EXATO do insumo da lista da loja que corresponde a este item, ou null se nenhum corresponde" },
            qtd_estoque: { type: ["number", "null"], description: "Quantidade que entra no estoque, na unidade do insumo escolhido (ex.: 2 caixas de polpa 10kg com insumo em kg = 20)" },
          },
          required: ["descricao", "quantidade", "valor_total"],
        },
      },
      observacao: { type: ["string", "null"], description: "Algo que o dono deve conferir (parte cortada, valor duvidoso etc.)" },
    },
    required: ["legivel", "itens"],
  },
};

type Lido = { legivel: boolean; fornecedor?: string | null; cnpj?: string | null; data?: string | null; total?: number | null; forma_pagamento?: string | null; vencimento?: string | null; itens: LinhaLida[]; observacao?: string | null };

async function chamarIA(chave: string, arquivo: string, tipo: string, insumos: InsumoBase[]): Promise<Lido> {
  const lista = insumos.map((i) => `- ${i.nome} (${i.unidade})`).join("\n");
  const conteudo = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: tipo, data: arquivo } }
    : { type: "image", source: { type: "base64", media_type: tipo, data: arquivo } };
  const texto = `Você lê comprovantes de compra de uma loja de açaí em Sousa-PB (Brasil). Leia o comprovante e chame a ferramenta registrar_comprovante.
Regras:
- Copie cada item como está impresso. Não invente itens nem valores; se algo estiver ilegível, deixe de fora e explique em observacao.
- Números no formato brasileiro: "1.234,56" = 1234.56. Quantidade a peso ("1,250 KG") = 1.25.
- forma_pagamento: dinheiro, pix, debito, credito, boleto ou outro (null se não aparecer). Nota com duplicata/boleto = boleto.
- Para cada item, escolha o insumo da lista abaixo que é o mesmo produto (ou null) e calcule qtd_estoque na unidade dele.
  Ex.: "POLPA ACAI 10KG" × 2 com insumo em kg → 20; "COPO 300ML C/50" × 4 com insumo em un → 200; "MORANGO BDJ 250G" × 4 em kg → 1.
- Produtos de limpeza, gás, material de escritório etc. ficam com insumo null.
Insumos da loja:
${lista || "(nenhum cadastrado)"}`;

  const modelos = [process.env.ANTHROPIC_MODEL, "claude-sonnet-5-5", "claude-sonnet-4-5"].filter(Boolean) as string[];
  let ultimoErro = "";
  for (const model of [...new Set(modelos)]) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 4096, tools: [FERRAMENTA], tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [{ role: "user", content: [conteudo, { type: "text", text: texto }] }],
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const uso = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
      if (!uso) throw new Error("A leitura não retornou dados. Tente outra foto.");
      return uso.input as Lido;
    }
    ultimoErro = j?.error?.message ?? `Erro ${r.status}`;
    if (r.status === 401) throw new Error("A chave ANTHROPIC_API_KEY na Vercel não foi aceita.");
    if (!(r.status === 404 || /model/i.test(ultimoErro))) break; // só tenta outro modelo se o problema for o modelo
  }
  throw new Error("Falha na leitura: " + ultimoErro);
}

const dataValida = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** Lê a foto/PDF de um comprovante e devolve os dados já ligados aos insumos, para conferência. */
export async function POST(req: Request) {
  try {
    if (!supabaseConfigurado()) return NextResponse.json({ erro: "Banco de dados não configurado" }, { status: 503 });
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ erro: "Faça login novamente." }, { status: 401 });
    const { data: pode } = await sb.rpc("pode", { p: "financeiro" });
    if (!pode) return NextResponse.json({ erro: "Sem acesso ao financeiro." }, { status: 403 });
    if (!permitido("ler:" + user.id, 20, 10 * 60_000)) return NextResponse.json({ erro: "Muitas leituras seguidas. Aguarde alguns minutos." }, { status: 429 });

    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) return NextResponse.json({ erro: "A leitura por foto ainda não está ligada (falta ANTHROPIC_API_KEY na Vercel). Lance os itens à mão.", semChave: true }, { status: 503 });

    const { arquivo, tipo } = entrada.parse(await req.json());
    const [{ data: insumos }, { data: apelidos }] = await Promise.all([
      sb.from("insumos").select("id,nome,unidade").eq("ativo", true).order("nome"),
      sb.from("insumo_apelidos").select("texto,insumo_id,fator"),
    ]);
    const lido = await chamarIA(chave, arquivo, tipo, (insumos ?? []) as InsumoBase[]);
    if (!lido.legivel && !lido.itens?.length) return NextResponse.json({ erro: lido.observacao || "Não consegui ler esse comprovante. Tire outra foto, de perto e com boa luz." }, { status: 422 });

    const itens = casarLinhas(lido.itens ?? [], (insumos ?? []) as InsumoBase[], (apelidos ?? []) as Apelido[]);
    return NextResponse.json({
      fornecedor: lido.fornecedor?.trim() || null,
      cnpj: lido.cnpj?.replace(/\D/g, "") || null,
      data: dataValida(lido.data),
      total: Number(lido.total) > 0 ? Math.round(Number(lido.total) * 100) / 100 : null,
      forma: (FORMAS as readonly string[]).includes(lido.forma_pagamento ?? "") ? lido.forma_pagamento : null,
      vencimento: dataValida(lido.vencimento),
      observacao: lido.observacao || null,
      itens,
    });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ erro: "Arquivo inválido ou grande demais" }, { status: 400 });
    console.error("[compras/ler]", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
