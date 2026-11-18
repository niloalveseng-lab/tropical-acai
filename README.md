# Tropical Açaí — site de pedidos + PDV

Next.js 14 (App Router) · Supabase (Postgres, Auth, Storage, Realtime) · Mercado Pago · Vercel.

## Estado atual
**Fase 1 — base (pronta e testada)**
- `supabase/migrations/` — tabelas, regras de acesso (RLS), histórico de preços, código público do pedido.
- `supabase/seed.sql` — cardápio inicial.
- `src/lib/pricing.ts`, `delivery.ts`, `horario.ts` — preço, entrega por raio e horário, sempre refeitos no servidor.
- `src/lib/scale/toledo.ts` + `public/teste-balanca.html` — balança Toledo Prix 3 Fit (Prt3).

**Fase 2 — site do cliente (pronta em modo demonstração)**
- `src/components/loja/` — cardápio, montador com copo animado, folha de produto, sacola e checkout como convidado, mapa de entrega.
- `src/app/api/pedidos` — cria o pedido (valida com Zod, recalcula tudo, limite de tentativas por IP).
- `src/app/pedido/[codigo]` — acompanhamento público do pedido, atualizado a cada 6 s.
- `src/lib/pedidos/repo.ts` — grava no Supabase quando as chaves existem; sem chaves, guarda na memória (demonstração).

**Fase 2b — balcão da equipe**
- `/entrar` e `/redefinir-senha` — login da equipe (e-mail e senha) e “esqueci a senha”.
- `/balcao` — fila de pedidos ao vivo (Supabase Realtime + conferência a cada 30 s), campainha que repete enquanto houver pedido novo, botões de status, cancelar com motivo, marcar pago, WhatsApp do cliente, mapa e comanda 80 mm.
- `/balcao/equipe` + `/api/equipe` — só o dono: cadastra gerente/atendente com senha inicial, muda função, redefine senha, remove acesso.
- `supabase/migrations/0003_equipe.sql` — o e-mail do dono vira “dono” automaticamente; atendente só altera status/pago/motivo dos pedidos.

**Fase 4a — caixa (PDV)**
- `/balcao/caixa` — abrir caixa, venda rápida (açaí, quilo, promoção, produtos), receber em dinheiro com troco, PIX, débito, crédito ou dividido, sangria, reforço e fechamento com conferência da gaveta.
- `src/lib/caixa/venda.ts` + `/api/caixa/venda` — preço refeito no servidor; grava pedido (canal balcão), itens e pagamentos no caixa aberto.
- `supabase/migrations/0005_caixa.sql` — um caixa aberto por vez, `resumo_caixa()`, equipe não apaga registros de caixa.
- Falta: modo sem internet, impressora térmica direta (hoje imprime pela janela do navegador), relatórios.

**Fase 5 — painel (`/balcao/painel`)**
- Esgotado hoje (toda a equipe), cardápio e preços com fotos, loja/entrega/horários e relatórios de vendas (gerente e dono).
- `supabase/migrations/0006_painel.sql` — `marcar_esgotado()` e `relatorio_vendas()`.

**Fase 3 — pagamento online (Mercado Pago)**
- `src/lib/pagamento/` — PIX (QR Code na página do pedido) e cartão (Checkout Pro), confirmação por webhook `/api/mp/webhook` e por conferência na API.
- O pedido fica `aguardando_pagamento` e só aparece no balcão depois de aprovado; expira em 30 min.
- Liga sozinho quando `MP_ACCESS_TOKEN` existe na Vercel. `MP_WEBHOOK_SECRET` é opcional.
- Testado em produção com PIX real.

**Fase 6 — entregas pelo caixa, lista de pedidos e acessos por pessoa**
- Caixa: canal Balcão/WhatsApp e tipo Na loja/Retirada/Entrega. O local da entrega vem de link/coordenadas colados, busca de endereço (`/api/geo`, Nominatim limitado a Sousa) ou toque no mapa; a taxa usa as mesmas faixas do site e fica gravada no pedido. “Cobrar na entrega” com troco.
- `/balcao`: pedidos em lista (#, hora, tempo de espera, ação na linha, detalhes ao abrir), filtros, busca, “A receber”, campo Entregador e aba **Dias anteriores** com totais do dia.
- `/balcao/equipe`: liga/desliga por pessoa — caixa, cancelar, esgotado, dias anteriores, relatórios, cardápio, loja. Aplicado no banco (`pode()`), não só na tela.
- `supabase/migrations/0008_permissoes_entregas.sql` — `staff.permissoes`, `pode()`, `minhas_permissoes()`, `orders.entregador`, a receber e entregas no caixa e nos relatórios.

Sem `NEXT_PUBLIC_SUPABASE_URL` o site usa `src/data/cardapio-demo.ts` e os pedidos **não chegam à loja**.
Gravação de pedidos no Supabase testada em produção (Vercel).

## Rodar
```bash
npm install
npm test          # testes de preço e balança
npm run dev
```
Variáveis (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`.

## Próximas fases
4. PDV de balcão: caixa, venda rápida, balança, impressão, modo sem internet.
5. Painel do dono: cardápio, preços, fotos, esgotado hoje, entrega, horários, equipe, relatórios.
6. Publicação: domínio, variáveis, dados reais e teste na loja.
