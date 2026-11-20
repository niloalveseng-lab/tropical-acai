-- Extrato: tudo que entrou e saiu num período, pela data em que o dinheiro entrou/saiu.
--  Entradas: vendas do sistema (1 linha por dia), dias do caderno, repasses do iFood.
--  Saídas: compras pagas na hora e contas pagas (boleto/fatura pagos depois entram pela conta, na data do pagamento).
create or replace function extrato(p_de date, p_ate date) returns table (
  data date, tipo text, origem text, descricao text, categoria text, forma text, pago_com text, valor numeric, ref uuid
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not pode('financeiro') then return; end if;
  return query
  with v as (
    select (o.created_at at time zone 'America/Fortaleza')::date dia, o.* from orders o
    where o.created_at >= (p_de::timestamp at time zone 'America/Fortaleza')
      and o.created_at < ((p_ate + 1)::timestamp at time zone 'America/Fortaleza')
      and o.status not in ('cancelado', 'aguardando_pagamento')
  ),
  vf as (  -- por forma, usando os pagamentos quando existem
    select v.dia, coalesce(p.metodo, v.forma_pagamento) f, coalesce(p.valor, v.total) val
    from v left join payments p on p.order_id = v.id and p.status = 'approved'
  )
  select v.dia, 'entrada', 'sistema', 'Vendas do dia (' || count(*) || ' pedido' || case when count(*) > 1 then 's' else '' end || ')',
         'vendas', (select string_agg(f || '=' || s::text, ';' order by s desc) from (select f, sum(val) s from vf where vf.dia = v.dia group by f) z),
         null::text, sum(v.total), null::uuid
    from v group by v.dia
  union all
  select e.data, 'entrada', e.canal, case e.canal when 'caderno' then 'Vendas do dia (caderno)' when 'ifood' then 'Repasse iFood' else 'Outra entrada' end || coalesce(' — ' || nullif(trim(regexp_replace(regexp_replace(coalesce(e.obs, ''), '\s*\[import[^]]*\]', ''), '^Caixa do caderno\s*', '')), ''), ''),
         'vendas', (select string_agg(k || '=' || x, ';' order by x::numeric desc) from jsonb_each_text(coalesce(e.por_forma, '{}'::jsonb)) j(k, x)),
         null, case when e.canal = 'ifood' then e.liquido else e.bruto end, e.id
    from entradas_externas e where e.data between p_de and p_ate
  union all
  select c.data, 'saida', 'compra', coalesce(c.fornecedor, 'Compra'), 'compras', c.forma, c.pago_com, c.total, c.id
    from compras c where c.forma <> 'boleto' and c.data between p_de and p_ate
      and not exists (select 1 from contas k2 where k2.compra_id = c.id)  -- paga depois: entra pela conta
  union all
  select k.pago_em, 'saida', 'conta', k.descricao, k.categoria, null, k.pago_com, k.valor, k.id
    from contas k where k.pago_em between p_de and p_ate
  order by 1 desc, 2, 8 desc;
end $$;
revoke execute on function extrato(date, date) from public, anon;
grant execute on function extrato(date, date) to authenticated;
