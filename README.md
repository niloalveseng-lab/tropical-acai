# Tropical Açaí — site de pedidos + PDV

Next.js 14 (App Router) · Supabase (Postgres, Auth, Storage, Realtime) · Mercado Pago · Vercel.

## Estado atual (fase 1 — base)
- `supabase/migrations/0001_schema.sql` — tabelas, regras de acesso (RLS), histórico de preços, bucket de imagens.
- `supabase/seed.sql` — cardápio inicial (açaí, acompanhamentos, copo promocional, batida, milkshake, cascão, picolés).
- `src/lib/pricing.ts` — cálculo de preço refeito no servidor (testado).
- `src/lib/scale/toledo.ts` — leitura da balança Toledo Prix 3 Fit via Web Serial, protocolo Prt3 (testado).
- `public/teste-balanca.html` — página isolada para testar a balança no computador do balcão.
- `docs/CHECKLIST_DONO.md` — contas e informações que o dono providencia.

## Rodar
```bash
npm install
npm test          # testes de preço e balança
npm run dev
```
Variáveis (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`.

## Próximas fases
2. Cardápio online + montador + checkout com Mercado Pago (PIX/cartão) e webhook.
3. Área do cliente (login por telefone/e-mail, histórico, pedir de novo).
4. PDV de balcão (pedidos do site em tempo real, venda rápida, açaí no quilo pela balança, caixa).
5. Admin (preços, fotos, esgotado hoje, horários, relatórios).
