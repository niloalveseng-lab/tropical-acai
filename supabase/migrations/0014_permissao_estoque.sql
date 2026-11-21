-- Permissão "estoque" separada do financeiro: ver o estoque, fazer contagem e registrar perda.
-- Quem tem financeiro também tem estoque.
create or replace function permissao_padrao(r staff_role, p text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when r = 'dono' then true
    when p = 'financeiro' then false
    when r = 'gerente' then true
    else p in ('caixa', 'cancelar', 'esgotado')
  end;
$$;

create or replace function pode_estoque() returns boolean
language sql stable security definer set search_path = public as $$
  select pode('estoque') or pode('financeiro');
$$;
revoke execute on function pode_estoque() from public, anon;
grant execute on function pode_estoque() to authenticated;

create or replace function minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(k, case when k = 'equipe' then s.role = 'dono' when k = 'estoque' then pode_estoque() else pode(k) end)
  from staff s, unnest(array['caixa','cancelar','esgotado','historico','relatorios','cardapio','loja','estoque','financeiro','equipe']) k
  where s.user_id = auth.uid() and s.ativo;
$$;

drop policy if exists "ve movimentos" on estoque_movimentos;
create policy "ve movimentos" on estoque_movimentos for select using (pode_estoque());

create or replace function registrar_contagem(itens jsonb, p_tipo text default 'contagem', p_obs text default null) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; atual numeric; nova numeric; n int := 0;
begin
  if not pode_estoque() then raise exception 'Sem acesso ao estoque'; end if;
  if p_tipo not in ('contagem', 'perda') then raise exception 'Tipo inválido'; end if;
  for it in select * from jsonb_array_elements(itens) loop
    select estoque into atual from insumos where id = (it ->> 'insumo_id')::uuid for update;
    if atual is null then continue; end if;
    nova := case when p_tipo = 'perda' then atual - abs((it ->> 'quantidade')::numeric) else (it ->> 'quantidade')::numeric end;
    if nova < 0 then nova := 0; end if;
    if nova = atual and p_tipo = 'perda' then continue; end if;
    update insumos set estoque = nova where id = (it ->> 'insumo_id')::uuid;
    insert into estoque_movimentos (insumo_id, tipo, quantidade, saldo, obs, por) values ((it ->> 'insumo_id')::uuid, p_tipo, nova - atual, nova, p_obs, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function registrar_contagem(jsonb, text, text) from public, anon;
grant execute on function registrar_contagem(jsonb, text, text) to authenticated;
