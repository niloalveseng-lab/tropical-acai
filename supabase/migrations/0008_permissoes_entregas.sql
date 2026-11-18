-- Permissões por pessoa, pedidos de WhatsApp com entrega pelo caixa e controle de saídas.

-- ============ PERMISSÕES ============
-- Cada pessoa tem a função (dono/gerente/atendente) e, opcionalmente, ajustes individuais.
-- Chaves: caixa, cancelar, esgotado, historico, relatorios, cardapio, loja.
alter table staff add column if not exists permissoes jsonb not null default '{}'::jsonb;

create or replace function permissao_padrao(r staff_role, p text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when r = 'dono' then true
    when r = 'gerente' then true
    else p in ('caixa', 'cancelar', 'esgotado')
  end;
$$;

-- Pode fazer "p"? Dono sempre pode. Os demais: ajuste individual, senão o padrão da função.
create or replace function pode(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when s.role = 'dono' then true
                else coalesce((s.permissoes ->> p)::boolean, permissao_padrao(s.role, p)) end
    from staff s where s.user_id = auth.uid() and s.ativo
  ), false);
$$;

-- Permissões já resolvidas de quem está logado (para as telas). "equipe" é só do dono.
create or replace function minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(k, case when k = 'equipe' then s.role = 'dono' else pode(k) end)
  from staff s, unnest(array['caixa','cancelar','esgotado','historico','relatorios','cardapio','loja','equipe']) k
  where s.user_id = auth.uid() and s.ativo;
$$;
revoke execute on function pode(text) from public, anon;
grant execute on function pode(text) to authenticated;
revoke execute on function minhas_permissoes() from public, anon;
grant execute on function minhas_permissoes() to authenticated;

-- Início do dia de hoje em Sousa-PB.
create or replace function inicio_hoje() returns timestamptz
language sql stable set search_path = public as $$
  select ((now() at time zone 'America/Fortaleza')::date)::timestamp at time zone 'America/Fortaleza';
$$;

-- Cardápio e loja: editados por quem tem a permissão.
do $$ declare t text; begin
  foreach t in array array['categories','acai_sizes','acai_bases','addon_groups','addon_items','products','promos'] loop
    execute format('drop policy if exists "gerente edita" on %I', t);
    execute format('drop policy if exists "edita cardapio" on %I', t);
    execute format('create policy "edita cardapio" on %I for all using (pode(''cardapio'')) with check (pode(''cardapio''))', t);
  end loop;
end $$;
drop policy if exists "gerente edita" on settings;
drop policy if exists "edita loja" on settings;
create policy "edita loja" on settings for all using (pode('loja') or pode('cardapio')) with check (pode('loja') or pode('cardapio'));

drop policy if exists "gerente envia imagens" on storage.objects;
drop policy if exists "gerente troca imagens" on storage.objects;
drop policy if exists "gerente apaga imagens" on storage.objects;
drop policy if exists "envia imagens" on storage.objects;
drop policy if exists "troca imagens" on storage.objects;
drop policy if exists "apaga imagens" on storage.objects;
create policy "envia imagens" on storage.objects for insert with check (bucket_id = 'cardapio' and (pode('cardapio') or pode('loja')));
create policy "troca imagens" on storage.objects for update using (bucket_id = 'cardapio' and (pode('cardapio') or pode('loja')));
create policy "apaga imagens" on storage.objects for delete using (bucket_id = 'cardapio' and (pode('cardapio') or pode('loja')));

-- Pedidos: sem "histórico", a pessoa vê só os de hoje e os ainda em aberto.
drop policy if exists "equipe ve pedidos" on orders;
create policy "equipe ve pedidos" on orders for select using (
  is_staff() and (pode('historico') or created_at >= inicio_hoje() or status in ('novo','preparo','pronto','saiu'))
);

-- Caixa: só quem tem a permissão.
drop policy if exists "equipe abre caixa" on cash_sessions;
drop policy if exists "equipe fecha caixa" on cash_sessions;
drop policy if exists "equipe lanca movimentos" on cash_movements;
create policy "equipe abre caixa" on cash_sessions for insert with check (pode('caixa') and aberto_por = auth.uid());
create policy "equipe fecha caixa" on cash_sessions for update using (pode('caixa') and fechado_em is null) with check (pode('caixa'));
create policy "equipe lanca movimentos" on cash_movements for insert with check (pode('caixa') and por = auth.uid());

-- Cancelar pedido exige a permissão (o servidor, sem usuário logado, não é bloqueado).
create or replace function checar_cancelamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' and auth.uid() is not null and not pode('cancelar') then
    raise exception 'Você não tem permissão para cancelar pedidos.';
  end if;
  return new;
end $$;
revoke execute on function checar_cancelamento() from public, anon, authenticated;
drop trigger if exists t_checar_cancelamento on orders;
create trigger t_checar_cancelamento before update on orders for each row execute function checar_cancelamento();

-- Esgotado hoje: quem tem a permissão.
create or replace function marcar_esgotado(p_tipo text, p_id text, p_esgotado boolean) returns void
language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not pode('esgotado') then raise exception 'Sem permissão'; end if;
  if p_tipo = 'addon' then
    update addon_items set esgotado_em = case when p_esgotado then hoje end where id = p_id::uuid;
  elsif p_tipo = 'produto' then
    update products set esgotado_em = case when p_esgotado then hoje end where id = p_id;
  else raise exception 'Tipo inválido';
  end if;
end $$;

-- ============ SAÍDAS (ENTREGAS) ============
alter table orders add column if not exists entregador text;
grant update (status, motivo_cancelamento, pago, operador, updated_at, entregador) on orders to authenticated;

-- ============ RESUMO DO CAIXA ============
-- Inclui pedidos do caixa cobrados na entrega (sem pagamento registrado): contam quando marcados "pago".
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
  from (select metodo, sum(valor) v from (
          select p.metodo, p.valor from payments p join orders o on o.id = p.order_id
           where o.cash_session_id = s.id and o.status <> 'cancelado' and p.status = 'approved'
          union all
          select o.forma_pagamento, o.total from orders o
           where o.cash_session_id = s.id and o.status <> 'cancelado' and o.pago
             and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'approved')
        ) y group by metodo) x;

  select coalesce(sum(total), 0) into site_din from orders
   where canal = 'site' and pago and forma_pagamento = 'dinheiro' and status not in ('cancelado', 'aguardando_pagamento') and created_at >= s.aberto_em and created_at < fim;
  select coalesce(sum(valor) filter (where tipo = 'sangria'), 0), coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)
    into sang, supr from cash_movements where session_id = s.id;

  r := jsonb_build_object(
    'aberto_em', s.aberto_em, 'fechado_em', s.fechado_em, 'abertura', s.valor_abertura, 'contado', s.valor_contado,
    'por_metodo', por_metodo,
    'balcao_qtd', (select count(*) from orders where cash_session_id = s.id and status <> 'cancelado'),
    'balcao_total', (select coalesce(sum(total), 0) from orders where cash_session_id = s.id and status <> 'cancelado'),
    'a_receber', (select coalesce(sum(total), 0) from orders where cash_session_id = s.id and status <> 'cancelado' and not pago),
    'entregas_qtd', (select count(*) from orders where tipo = 'entrega' and status <> 'cancelado' and status <> 'aguardando_pagamento'
                       and (cash_session_id = s.id or (canal = 'site' and created_at >= s.aberto_em and created_at < fim))),
    'taxas_entrega', (select coalesce(sum(taxa_entrega), 0) from orders where tipo = 'entrega' and status not in ('cancelado', 'aguardando_pagamento')
                       and (cash_session_id = s.id or (canal = 'site' and created_at >= s.aberto_em and created_at < fim))),
    'site_qtd', (select count(*) from orders where canal = 'site' and status not in ('cancelado', 'aguardando_pagamento') and created_at >= s.aberto_em and created_at < fim),
    'site_total', (select coalesce(sum(total), 0) from orders where canal = 'site' and status not in ('cancelado', 'aguardando_pagamento') and created_at >= s.aberto_em and created_at < fim),
    'site_online', (select coalesce(sum(total), 0) from orders where canal = 'site' and forma_pagamento in ('pix_online', 'cartao_online') and status not in ('cancelado', 'aguardando_pagamento') and created_at >= s.aberto_em and created_at < fim),
    'site_dinheiro', site_din, 'sangrias', sang, 'suprimentos', supr,
    'dinheiro_esperado', s.valor_abertura + dinheiro + site_din + supr - sang);
  return r;
end $$;

-- ============ RELATÓRIO ============
create or replace function relatorio_vendas(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ini timestamptz := (p_de::timestamp at time zone 'America/Fortaleza');
        fim timestamptz := ((p_ate + 1)::timestamp at time zone 'America/Fortaleza');
begin
  if not pode('relatorios') then return null; end if;
  if p_ate < p_de or p_ate - p_de > 366 then raise exception 'Período inválido'; end if;
  return (
    with v as (
      select o.*, (o.created_at at time zone 'America/Fortaleza')::date as dia
      from orders o where o.created_at >= ini and o.created_at < fim and o.status not in ('cancelado', 'aguardando_pagamento')
    )
    select jsonb_build_object(
      'total', coalesce((select sum(total) from v), 0),
      'pedidos', (select count(*) from v),
      'ticket_medio', coalesce((select round(avg(total), 2) from v), 0),
      'taxas_entrega', coalesce((select sum(taxa_entrega) from v), 0),
      'a_receber', coalesce((select sum(total) from v where not pago), 0),
      'cancelados', (select count(*) from orders o where o.created_at >= ini and o.created_at < fim and o.status = 'cancelado'),
      'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'total', t, 'pedidos', n) order by dia) from (select dia, sum(total) t, count(*) n from v group by dia) x), '[]'::jsonb),
      'por_canal', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'total', t, 'pedidos', n) order by t desc) from (select canal::text, sum(total) t, count(*) n from v group by canal) x), '[]'::jsonb),
      'por_pagamento', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'total', t) order by t desc) from (
          select forma, sum(valor) t from (
            select p.metodo forma, p.valor from payments p join v on v.id = p.order_id where p.status = 'approved'
            union all
            select v.forma_pagamento, v.total from v where not exists (select 1 from payments p where p.order_id = v.id and p.status = 'approved')
          ) y group by forma) x), '[]'::jsonb),
      'entregas', jsonb_build_object(
          'qtd', (select count(*) from v where tipo = 'entrega'),
          'taxas', coalesce((select sum(taxa_entrega) from v where tipo = 'entrega'), 0),
          'por_entregador', coalesce((select jsonb_agg(jsonb_build_object('entregador', e, 'qtd', n, 'taxas', t) order by n desc) from (
              select coalesce(nullif(trim(entregador), ''), 'Sem entregador') e, count(*) n, sum(taxa_entrega) t from v where tipo = 'entrega' group by 1) x), '[]'::jsonb)),
      'mais_vendidos', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'quantidade', q, 'total', t) order by t desc) from (
          select i.nome, sum(i.quantidade) q, sum(i.total) t from order_items i join v on v.id = i.order_id group by i.nome order by sum(i.total) desc limit 15) x), '[]'::jsonb),
      'quilo_g', coalesce((select sum(i.peso_liquido_g) from order_items i join v on v.id = i.order_id), 0),
      'caixas', coalesce((select jsonb_agg(jsonb_build_object('aberto_em', s.aberto_em, 'fechado_em', s.fechado_em, 'abertura', s.valor_abertura, 'contado', s.valor_contado,
                  'esperado', (resumo_caixa(s.id) ->> 'dinheiro_esperado')::numeric, 'observacao', s.observacao) order by s.aberto_em desc)
                from cash_sessions s where s.aberto_em >= ini and s.aberto_em < fim), '[]'::jsonb)
    )
  );
end $$;
revoke execute on function relatorio_vendas(date, date) from public, anon;
grant execute on function relatorio_vendas(date, date) to authenticated;
