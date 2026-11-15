-- PDV: um caixa aberto por vez, resumo de fechamento e regras mais restritas.
create unique index if not exists um_caixa_aberto on cash_sessions ((true)) where fechado_em is null;

-- Equipe abre, movimenta e fecha o caixa, mas não apaga registros.
drop policy if exists "equipe caixa" on cash_sessions;
drop policy if exists "equipe ve caixa" on cash_sessions;
drop policy if exists "equipe abre caixa" on cash_sessions;
drop policy if exists "equipe fecha caixa" on cash_sessions;
create policy "equipe ve caixa" on cash_sessions for select using (is_staff());
create policy "equipe abre caixa" on cash_sessions for insert with check (is_staff() and aberto_por = auth.uid());
create policy "equipe fecha caixa" on cash_sessions for update using (is_staff() and fechado_em is null) with check (is_staff());
drop policy if exists "equipe movimentos" on cash_movements;
drop policy if exists "equipe ve movimentos" on cash_movements;
drop policy if exists "equipe lanca movimentos" on cash_movements;
create policy "equipe ve movimentos" on cash_movements for select using (is_staff());
create policy "equipe lanca movimentos" on cash_movements for insert with check (is_staff() and por = auth.uid());

-- Resumo do caixa (aberto ou fechado): vendas do balcão por forma de pagamento,
-- dinheiro recebido de pedidos do site, sangrias, reforços e dinheiro esperado na gaveta.
create or replace function resumo_caixa(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s cash_sessions; fim timestamptz; r jsonb; por_metodo jsonb; dinheiro numeric; site_din numeric; sang numeric; supr numeric;
begin
  if not is_staff() then return null; end if;
  select * into s from cash_sessions where id = p_session;
  if not found then return null; end if;
  fim := coalesce(s.fechado_em, now());

  select coalesce(jsonb_object_agg(metodo, v), '{}'::jsonb), coalesce(sum(v) filter (where metodo = 'dinheiro'), 0)
    into por_metodo, dinheiro
  from (select p.metodo, sum(p.valor) v from payments p join orders o on o.id = p.order_id
        where o.cash_session_id = s.id and o.status <> 'cancelado' and p.status = 'approved' group by p.metodo) x;

  select coalesce(sum(total), 0) into site_din from orders
   where canal = 'site' and pago and forma_pagamento = 'dinheiro' and status <> 'cancelado' and created_at >= s.aberto_em and created_at < fim;
  select coalesce(sum(valor) filter (where tipo = 'sangria'), 0), coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)
    into sang, supr from cash_movements where session_id = s.id;

  r := jsonb_build_object(
    'aberto_em', s.aberto_em, 'fechado_em', s.fechado_em, 'abertura', s.valor_abertura, 'contado', s.valor_contado,
    'por_metodo', por_metodo,
    'balcao_qtd', (select count(*) from orders where cash_session_id = s.id and status <> 'cancelado'),
    'balcao_total', (select coalesce(sum(total), 0) from orders where cash_session_id = s.id and status <> 'cancelado'),
    'site_qtd', (select count(*) from orders where canal = 'site' and status <> 'cancelado' and created_at >= s.aberto_em and created_at < fim),
    'site_total', (select coalesce(sum(total), 0) from orders where canal = 'site' and status <> 'cancelado' and created_at >= s.aberto_em and created_at < fim),
    'site_dinheiro', site_din, 'sangrias', sang, 'suprimentos', supr,
    'dinheiro_esperado', s.valor_abertura + dinheiro + site_din + supr - sang);
  return r;
end $$;
revoke execute on function resumo_caixa(uuid) from public, anon;
grant execute on function resumo_caixa(uuid) to authenticated;
