-- Memória de preços por insumo: cada compra (e cada cotação anotada) guarda o preço por unidade do insumo.
-- A lista de compras e o estoque mostram médio, menor e maior preço (últimos 12 meses).

create table if not exists insumo_precos (
  id bigint generated always as identity primary key,
  insumo_id uuid not null references insumos(id) on delete cascade,
  data date not null,
  preco_unit numeric(12,4) not null check (preco_unit > 0),  -- R$ por unidade do insumo (kg, un…)
  fornecedor text,
  origem text not null default 'compra' check (origem in ('compra', 'cotacao')),
  compra_item_id uuid unique references compra_itens(id) on delete cascade,
  obs text,
  criado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists insumo_precos_insumo on insumo_precos (insumo_id, data desc);

alter table insumo_precos enable row level security;
drop policy if exists "financeiro" on insumo_precos;
create policy "financeiro" on insumo_precos for all using (pode('financeiro')) with check (pode('financeiro'));

-- Toda linha de compra ligada a um insumo, com quantidade e valor, vira um preço na memória.
create or replace function registrar_preco_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare c compras;
begin
  if new.insumo_id is null or coalesce(new.qtd_estoque, 0) <= 0 or coalesce(new.valor_total, 0) <= 0 then
    delete from insumo_precos where compra_item_id = new.id;
    return new;
  end if;
  select * into c from compras where id = new.compra_id;
  insert into insumo_precos (insumo_id, data, preco_unit, fornecedor, origem, compra_item_id, criado_por)
  values (new.insumo_id, c.data, round(new.valor_total / new.qtd_estoque, 4), c.fornecedor, 'compra', new.id, c.criado_por)
  on conflict (compra_item_id) do update set insumo_id = excluded.insumo_id, data = excluded.data, preco_unit = excluded.preco_unit, fornecedor = excluded.fornecedor;
  return new;
end $$;
revoke execute on function registrar_preco_item() from public, anon, authenticated;
drop trigger if exists compra_itens_preco on compra_itens;
create trigger compra_itens_preco after insert or update of insumo_id, qtd_estoque, valor_total on compra_itens
  for each row execute function registrar_preco_item();

-- Data/fornecedor da compra mudou: acompanha.
create or replace function atualizar_precos_compra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update insumo_precos p set data = new.data, fornecedor = new.fornecedor
    from compra_itens ci where ci.compra_id = new.id and p.compra_item_id = ci.id;
  return new;
end $$;
revoke execute on function atualizar_precos_compra() from public, anon, authenticated;
drop trigger if exists compras_preco on compras;
create trigger compras_preco after update of data, fornecedor on compras for each row execute function atualizar_precos_compra();

-- Resumo por insumo (últimos 12 meses): médio, menor (onde), maior, último.
create or replace function precos_insumos() returns table (
  insumo_id uuid, qtd int, medio numeric, menor numeric, menor_onde text, menor_data date,
  maior numeric, maior_onde text, ultimo numeric, ultimo_onde text, ultimo_data date
)
language sql stable security definer set search_path = public as $$
  with p as (
    select * from insumo_precos where pode('financeiro') and data >= current_date - 365
  )
  select i, count(*)::int, round(avg(preco_unit), 4),
    (array_agg(preco_unit order by preco_unit, data desc))[1], (array_agg(fornecedor order by preco_unit, data desc))[1], (array_agg(data order by preco_unit, data desc))[1],
    (array_agg(preco_unit order by preco_unit desc, data desc))[1], (array_agg(fornecedor order by preco_unit desc, data desc))[1],
    (array_agg(preco_unit order by data desc, id desc))[1], (array_agg(fornecedor order by data desc, id desc))[1], (array_agg(data order by data desc, id desc))[1]
  from (select insumo_id i, * from p) x group by i;
$$;
revoke execute on function precos_insumos() from public, anon;
grant execute on function precos_insumos() to authenticated;

-- ===== Correção: morango de 12/11 lançado como 800 kg (era 800 g) =====
do $$
declare it compra_itens; mid uuid := (select id from insumos where nome = 'Morango');
begin
  select * into it from compra_itens where insumo_id = mid and qtd_estoque = 800 limit 1;
  if it.id is not null then
    update compra_itens set qtd_estoque = 0.8 where id = it.id;
    update insumos set estoque = greatest(estoque - 799.2, 0), ultimo_custo = 47.5 where id = mid;
    insert into estoque_movimentos (insumo_id, tipo, quantidade, saldo, obs)
      select mid, 'ajuste', -799.2, estoque, 'Correção: caixa de 800 g tinha sido lançada como 800 kg' from insumos where id = mid;
    update insumo_apelidos set fator = 0.8 where texto = 'morangos cx' and insumo_id = mid;
  end if;
end $$;

-- ===== Preenche a quantidade das compras importadas (sem mexer no estoque) e monta a memória =====
update compra_itens ci set qtd_estoque = round(ci.quantidade * a.fator, 3)
  from insumo_apelidos a
 where ci.insumo_id = a.insumo_id and normalizar_texto(ci.descricao) = a.texto and ci.qtd_estoque is null;
update compra_itens set qtd_estoque = quantidade where qtd_estoque is null and insumo_id is not null and descricao = 'Leite condensado';
insert into insumo_precos (insumo_id, data, preco_unit, fornecedor, origem, compra_item_id, criado_por)
select ci.insumo_id, c.data, round(ci.valor_total / ci.qtd_estoque, 4), c.fornecedor, 'compra', ci.id, c.criado_por
  from compra_itens ci join compras c on c.id = ci.compra_id
 where ci.insumo_id is not null and ci.qtd_estoque > 0 and ci.valor_total > 0
on conflict (compra_item_id) do nothing;
