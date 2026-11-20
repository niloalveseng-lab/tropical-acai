-- Vendas anotadas no caderno (dias antes do sistema), com separação por forma de pagamento.
alter table entradas_externas drop constraint if exists entradas_externas_canal_check;
alter table entradas_externas add constraint entradas_externas_canal_check check (canal in ('ifood', 'outro', 'caderno'));
alter table entradas_externas add column if not exists por_forma jsonb;  -- {"dinheiro": 10, "pix": 5, "debito": 0, "credito": 0}
create unique index if not exists entradas_caderno_dia on entradas_externas (data) where canal = 'caderno';

create or replace function resultado_mes(p_mes date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ini date := date_trunc('month', p_mes)::date; fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
        t0 timestamptz := (ini::timestamp at time zone 'America/Fortaleza'); t1 timestamptz := (fim::timestamp at time zone 'America/Fortaleza');
begin
  if not pode('financeiro') then return null; end if;
  return (
    with v as (
      select o.* from orders o where o.created_at >= t0 and o.created_at < t1 and o.status not in ('cancelado', 'aguardando_pagamento')
    ),
    cad as (select * from entradas_externas where canal = 'caderno' and data >= ini and data < fim),
    formas as (
      select forma, sum(valor) total from (
        select p.metodo forma, p.valor from payments p join v on v.id = p.order_id where p.status = 'approved'
        union all
        select v.forma_pagamento, v.total from v where not exists (select 1 from payments p where p.order_id = v.id and p.status = 'approved')
        union all
        select f.key, f.value::numeric from cad, jsonb_each_text(coalesce(cad.por_forma, '{}'::jsonb)) f
      ) y group by forma
    ),
    taxas as (
      select f.forma, f.total, coalesce(t.percentual, 0) pct, round(f.total * coalesce(t.percentual, 0) / 100, 2) taxa
      from formas f left join taxas_pagamento t on t.forma = f.forma
    ),
    ext as (select * from entradas_externas where canal <> 'caderno' and data >= ini and data < fim),
    cp as (select * from compras where data >= ini and data < fim),
    ct as (select * from contas where vencimento >= ini and vencimento < fim and compra_id is null)
    select jsonb_build_object(
      'mes', ini,
      'vendas_sistema', coalesce((select sum(total) from v), 0),
      'vendas_caderno', coalesce((select sum(bruto) from cad), 0),
      'dias_caderno', (select count(*) from cad),
      'pedidos', (select count(*) from v),
      'ticket_medio', coalesce((select round(avg(total), 2) from v), 0),
      'por_canal', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'total', t, 'pedidos', n) order by t desc) from (
          select canal::text, sum(total) t, count(*) n from v group by canal
          union all select 'caderno', sum(bruto), count(*) from cad having count(*) > 0) x), '[]'::jsonb),
      'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', forma, 'total', total, 'percentual', pct, 'taxa', taxa) order by total desc) from taxas), '[]'::jsonb),
      'taxas_cartao', coalesce((select sum(taxa) from taxas), 0),
      'externas_bruto', coalesce((select sum(bruto) from ext), 0),
      'externas_liquido', coalesce((select sum(liquido) from ext), 0),
      'compras', coalesce((select sum(total) from cp), 0),
      'compras_por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', cat, 'total', t) order by t desc) from (
          select coalesce(i.categoria, 'sem_insumo') cat, sum(ci.valor_total) t
          from compra_itens ci join cp on cp.id = ci.compra_id left join insumos i on i.id = ci.insumo_id group by 1) x), '[]'::jsonb),
      'despesas', coalesce((select sum(valor) from ct), 0),
      'despesas_por_categoria', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'total', t, 'pago', pg) order by t desc) from (
          select categoria, sum(valor) t, bool_and(pago_em is not null) pg from ct group by categoria) x), '[]'::jsonb),
      'contas_abertas', coalesce((select sum(valor) from contas where pago_em is null and vencimento < fim), 0),
      'devido_aos_donos', coalesce((select sum(total) from compras where pago_com in ('dono','esposa') and reembolsado_em is null), 0)
        + coalesce((select sum(valor) from contas where pago_com in ('dono','esposa') and pago_em is not null and reembolsado_em is null), 0)
    )
  );
end $$;
revoke execute on function resultado_mes(date) from public, anon;
grant execute on function resultado_mes(date) to authenticated;
