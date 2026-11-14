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

Sem `NEXT_PUBLIC_SUPABASE_URL` o site usa `src/data/cardapio-demo.ts` e os pedidos **não chegam à loja**.
A gravação no Supabase ainda não foi testada contra um projeto real (faltam as chaves).

## Rodar
```bash
npm install
npm test          # testes de preço e balança
npm run dev
```
Variáveis (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`.

## Próximas fases
3. Pagamento online Mercado Pago (PIX e cartão) + webhook.
4. PDV de balcão: caixa, fila de pedidos do site, balança, impressão, modo sem internet.
5. Painel do dono: cardápio, preços, fotos, esgotado hoje, entrega, horários, equipe, relatórios.
6. Publicação: domínio, variáveis, dados reais e teste na loja.
