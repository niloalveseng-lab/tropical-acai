-- Painel do dono: "esgotado hoje" para toda a equipe e relatório de vendas.

-- Qualquer pessoa da equipe marca/desmarca "esgotado hoje" (vale até o fim do dia em Sousa-PB).
create or replace function marcar_esgotado(p_tipo text, p_id text, p_esgotado boolean) returns void
language plpgsql security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  if p_tipo = 'addon' then
    update addon_items set esgotado_em = case when p_esgotado then hoje end where id = p_id::uuid;
  elsif p_tipo = 'produto' then
    update products set esgotado_em = case when p_esgotado then hoje end where id = p_id;
  else raise exception 'Tipo inválido';
  end if;
end $$;
revoke execute on function marcar_esgotado(text, text, boolean) from public, anon;
grant execute on function marcar_esgotado(text, text, boolean) to authenticated;

-- Relatório de vendas entre duas datas (dias de Sousa-PB, inclusive). Só gerente e dono.
create or replace function relatorio_vendas(p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ini timestamptz := (p_de::timestamp at time zone 'America/Fortaleza');
        fim timestamptz := ((p_ate + 1)::timestamp at time zone 'America/Fortaleza');
begin
  if not is_staff('gerente') then return null; end if;
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
      'cancelados', (select count(*) from orders o where o.created_at >= ini and o.created_at < fim and o.status = 'cancelado'),
      'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'total', t, 'pedidos', n) order by dia) from (select dia, sum(total) t, count(*) n from v group by dia) x), '[]'::jsonb),
      'por_canal', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'total', t, 'pedidos', n) order by t desc) from (select canal::text, sum(total) t, count(*) n from v group by canal) x), '[]'::jsonb),
      'por_pagamento', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'total', t) order by t desc) from (
          select forma, sum(valor) t from (
            select p.metodo forma, p.valor from payments p join v on v.id = p.order_id where p.status = 'approved'
            union all
            select v.forma_pagamento, v.total from v where not exists (select 1 from payments p where p.order_id = v.id and p.status = 'approved')
          ) y group by forma) x), '[]'::jsonb),
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
