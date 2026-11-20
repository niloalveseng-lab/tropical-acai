-- Estoque, compras (lidas do comprovante), contas a pagar, despesas fixas, taxas da maquininha e resultado do mês.
-- Acesso: permissão "financeiro" (dono sempre; os demais só se o dono ligar). A lista de compras é de toda a equipe.

-- ============ PERMISSÃO "financeiro" ============
create or replace function permissao_padrao(r staff_role, p text) returns boolean
language sql immutable set search_path = public as $$
  select case
    when r = 'dono' then true
    when p = 'financeiro' then false          -- só com ajuste individual
    when r = 'gerente' then true
    else p in ('caixa', 'cancelar', 'esgotado')
  end;
$$;

create or replace function minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(k, case when k = 'equipe' then s.role = 'dono' else pode(k) end)
  from staff s, unnest(array['caixa','cancelar','esgotado','historico','relatorios','cardapio','loja','financeiro','equipe']) k
  where s.user_id = auth.uid() and s.ativo;
$$;

-- ============ ESTOQUE ============
create table if not exists insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text not null default 'insumos' check (categoria in ('acai_sorvete','cremes','frutas','insumos','descartaveis','mercado','outros')),
  unidade text not null default 'un' check (unidade in ('kg','g','l','ml','un','cx','pct')),
  estoque numeric(12,3) not null default 0,
  minimo numeric(12,3) not null default 0,
  fornecedor text,
  frequencia text not null default 'semanal' check (frequencia in ('semanal','quinzenal','mensal','quando_precisa')),
  ultimo_custo numeric(12,4),             -- R$ por unidade do insumo, da última compra
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- "De-para": nome que aparece no comprovante → insumo + fator (ex.: "POLPA ACAI 10KG" × 1 = 10 kg).
create table if not exists insumo_apelidos (
  texto text primary key,                 -- normalizado (minúsculas, sem acento, sem espaços repetidos)
  insumo_id uuid not null references insumos(id) on delete cascade,
  fator numeric(12,4) not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists estoque_movimentos (
  id bigint generated always as identity primary key,
  insumo_id uuid not null references insumos(id) on delete cascade,
  tipo text not null check (tipo in ('compra','contagem','perda','ajuste')),
  quantidade numeric(12,3) not null,      -- variação (+ entra, − sai)
  saldo numeric(12,3) not null,           -- estoque depois do movimento
  compra_id uuid,
  obs text,
  por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists estoque_mov_insumo on estoque_movimentos (insumo_id, created_at desc);

-- Lista de compras: qualquer pessoa da equipe marca o que está acabando.
create table if not exists lista_compras (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid references insumos(id) on delete cascade,
  texto text,                             -- item avulso (sem cadastro)
  pedido_por uuid references auth.users(id),
  pedido_por_nome text,
  created_at timestamptz not null default now(),
  comprado_em timestamptz,
  check (insumo_id is not null or nullif(trim(texto), '') is not null)
);
create unique index if not exists lista_compras_aberta on lista_compras (insumo_id) where comprado_em is null and insumo_id is not null;

-- ============ COMPRAS ============
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  fornecedor text,
  cnpj text,
  total numeric(10,2) not null check (total >= 0),
  forma text not null check (forma in ('dinheiro','pix','debito','credito','boleto','outro')),
  pago_com text not null check (pago_com in ('caixa','conta_loja','dono','esposa')),
  reembolsado_em date,                    -- quando a loja devolveu o que foi pago do bolso
  vencimento date,                        -- boleto
  foto_path text,                         -- comprovante no Storage (privado)
  lido_por_ia boolean not null default false,
  obs text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists compras_data on compras (data desc);

create table if not exists compra_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  descricao text not null,                -- como veio no comprovante
  quantidade numeric(12,3) not null default 1,
  valor_total numeric(10,2) not null default 0,
  insumo_id uuid references insumos(id) on delete set null,
  qtd_estoque numeric(12,3)               -- quanto entrou no estoque, na unidade do insumo
);

-- ============ CONTAS A PAGAR / DESPESAS FIXAS ============
create table if not exists despesas_fixas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default 'outros' check (categoria in ('aluguel','internet','energia','agua','imposto','pessoal','fornecedor','manutencao','outros')),
  valor numeric(10,2) not null check (valor >= 0),
  dia int not null check (dia between 1 and 31),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default 'outros' check (categoria in ('aluguel','internet','energia','agua','imposto','pessoal','fornecedor','manutencao','outros')),
  valor numeric(10,2) not null check (valor >= 0),
  vencimento date not null,
  pago_em date,
  pago_com text check (pago_com in ('caixa','conta_loja','dono','esposa')),
  reembolsado_em date,
  despesa_fixa_id uuid references despesas_fixas(id) on delete set null,
  compra_id uuid references compras(id) on delete cascade,   -- boleto de uma compra (não entra 2× no resultado)
  obs text,
  created_at timestamptz not null default now(),
  unique (despesa_fixa_id, vencimento)
);
create index if not exists contas_venc on contas (vencimento);

-- ============ TAXAS E ENTRADAS DE FORA ============
create table if not exists taxas_pagamento (
  forma text primary key,                 -- mesma chave usada nos pagamentos dos pedidos
  nome text not null,
  percentual numeric(5,2) not null default 0 check (percentual between 0 and 100),
  ordem int not null default 0
);

-- Repasses do iFood e outras vendas que não passam pelo sistema.
create table if not exists entradas_externas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  canal text not null default 'ifood' check (canal in ('ifood','outro')),
  bruto numeric(10,2) not null check (bruto >= 0),
  liquido numeric(10,2) not null check (liquido >= 0),
  obs text,
  created_at timestamptz not null default now()
);

-- ============ RLS ============
do $$ declare t text; begin
  foreach t in array array['insumo_apelidos','estoque_movimentos','compras','compra_itens','despesas_fixas','contas','taxas_pagamento','entradas_externas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "financeiro" on %I', t);
    execute format('create policy "financeiro" on %I for all using (pode(''financeiro'')) with check (pode(''financeiro''))', t);
  end loop;
end $$;
-- Movimentos de estoque não se apagam nem se editam pela tela (só pelas funções).
drop policy if exists "financeiro" on estoque_movimentos;
create policy "ve movimentos" on estoque_movimentos for select using (pode('financeiro'));

alter table insumos enable row level security;
drop policy if exists "equipe ve insumos" on insumos;
drop policy if exists "financeiro edita insumos" on insumos;
create policy "equipe ve insumos" on insumos for select using (is_staff());
create policy "financeiro edita insumos" on insumos for all using (pode('financeiro')) with check (pode('financeiro'));

alter table lista_compras enable row level security;
drop policy if exists "equipe ve lista" on lista_compras;
drop policy if exists "equipe pede" on lista_compras;
drop policy if exists "equipe tira da lista" on lista_compras;
drop policy if exists "financeiro marca comprado" on lista_compras;
create policy "equipe ve lista" on lista_compras for select using (is_staff());
create policy "equipe pede" on lista_compras for insert with check (is_staff() and pedido_por = auth.uid() and comprado_em is null);
create policy "equipe tira da lista" on lista_compras for delete using (is_staff() and comprado_em is null);
create policy "financeiro marca comprado" on lista_compras for update using (pode('financeiro')) with check (pode('financeiro'));

-- Comprovantes: bucket privado.
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false) on conflict do nothing;
drop policy if exists "financeiro ve comprovantes" on storage.objects;
drop policy if exists "financeiro envia comprovantes" on storage.objects;
drop policy if exists "financeiro apaga comprovantes" on storage.objects;
create policy "financeiro ve comprovantes" on storage.objects for select using (bucket_id = 'comprovantes' and pode('financeiro'));
create policy "financeiro envia comprovantes" on storage.objects for insert with check (bucket_id = 'comprovantes' and pode('financeiro'));
create policy "financeiro apaga comprovantes" on storage.objects for delete using (bucket_id = 'comprovantes' and pode('financeiro'));

-- ============ FUNÇÕES ============
create or replace function normalizar_texto(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(lower(translate(trim(coalesce(t, '')),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g');
$$;

-- Lança uma compra inteira: itens, entrada no estoque, custo, "de-para", boleto em contas a pagar, baixa na lista.
-- p = {data, fornecedor, cnpj, total, forma, pago_com, vencimento, foto_path, lido_por_ia, obs,
--      itens: [{descricao, quantidade, valor_total, insumo_id, qtd_estoque, lembrar}]}
create or replace function registrar_compra(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; it jsonb; ins insumos; q numeric; novo numeric;
begin
  if not pode('financeiro') then raise exception 'Sem acesso ao financeiro'; end if;
  if jsonb_typeof(p -> 'itens') <> 'array' then raise exception 'Compra sem itens'; end if;
  if p ->> 'forma' = 'boleto' and nullif(p ->> 'vencimento', '') is null then raise exception 'Informe o vencimento do boleto'; end if;

  insert into compras (data, fornecedor, cnpj, total, forma, pago_com, vencimento, foto_path, lido_por_ia, obs, criado_por)
  values ((p ->> 'data')::date, nullif(trim(p ->> 'fornecedor'), ''), nullif(trim(p ->> 'cnpj'), ''), (p ->> 'total')::numeric,
          p ->> 'forma', coalesce(p ->> 'pago_com', 'conta_loja'), nullif(p ->> 'vencimento', '')::date, nullif(p ->> 'foto_path', ''),
          coalesce((p ->> 'lido_por_ia')::boolean, false), nullif(trim(p ->> 'obs'), ''), auth.uid())
  returning id into cid;

  for it in select * from jsonb_array_elements(p -> 'itens') loop
    insert into compra_itens (compra_id, descricao, quantidade, valor_total, insumo_id, qtd_estoque)
    values (cid, coalesce(nullif(trim(it ->> 'descricao'), ''), 'Item'), coalesce((it ->> 'quantidade')::numeric, 1), coalesce((it ->> 'valor_total')::numeric, 0),
            nullif(it ->> 'insumo_id', '')::uuid, nullif(it ->> 'qtd_estoque', '')::numeric);

    if nullif(it ->> 'insumo_id', '') is not null and coalesce((it ->> 'qtd_estoque')::numeric, 0) > 0 then
      q := (it ->> 'qtd_estoque')::numeric;
      update insumos set estoque = estoque + q,
             ultimo_custo = case when coalesce((it ->> 'valor_total')::numeric, 0) > 0 then round((it ->> 'valor_total')::numeric / q, 4) else ultimo_custo end
       where id = (it ->> 'insumo_id')::uuid returning * into ins;
      if ins.id is null then raise exception 'Insumo não encontrado'; end if;
      insert into estoque_movimentos (insumo_id, tipo, quantidade, saldo, compra_id, por) values (ins.id, 'compra', q, ins.estoque, cid, auth.uid());
      update lista_compras set comprado_em = now() where insumo_id = ins.id and comprado_em is null;
      -- Aprende o nome do comprovante para a próxima vez.
      if coalesce((it ->> 'lembrar')::boolean, true) and normalizar_texto(it ->> 'descricao') <> '' and coalesce((it ->> 'quantidade')::numeric, 0) > 0 then
        insert into insumo_apelidos (texto, insumo_id, fator, updated_at)
        values (normalizar_texto(it ->> 'descricao'), ins.id, round(q / (it ->> 'quantidade')::numeric, 4), now())
        on conflict (texto) do update set insumo_id = excluded.insumo_id, fator = excluded.fator, updated_at = now();
      end if;
    end if;
  end loop;

  -- Pago com dinheiro do caixa aberto: lança a sangria para a gaveta bater no fechamento.
  if coalesce((p ->> 'sangria')::boolean, false) and p ->> 'pago_com' = 'caixa' and (p ->> 'total')::numeric > 0 then
    insert into cash_movements (session_id, tipo, valor, motivo, por)
    select id, 'sangria', (p ->> 'total')::numeric, left('Compra: ' || coalesce(nullif(trim(p ->> 'fornecedor'), ''), 'sem fornecedor'), 120), auth.uid()
    from cash_sessions where fechado_em is null order by aberto_em desc limit 1;
  end if;

  -- Boleto vira conta a pagar (fica fora das despesas para não contar duas vezes).
  if p ->> 'forma' = 'boleto' then
    insert into contas (descricao, categoria, valor, vencimento, compra_id)
    values ('Boleto ' || coalesce(nullif(trim(p ->> 'fornecedor'), ''), 'fornecedor'), 'fornecedor', (p ->> 'total')::numeric, (p ->> 'vencimento')::date, cid);
  end if;
  return cid;
end $$;

-- Apaga uma compra lançada errada e desfaz a entrada no estoque.
create or replace function excluir_compra(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record; s numeric;
begin
  if not pode('financeiro') then raise exception 'Sem acesso ao financeiro'; end if;
  for m in select insumo_id, sum(quantidade) q from estoque_movimentos where compra_id = p_id and tipo = 'compra' group by insumo_id loop
    update insumos set estoque = greatest(estoque - m.q, 0) where id = m.insumo_id returning estoque into s;
    insert into estoque_movimentos (insumo_id, tipo, quantidade, saldo, obs, por) values (m.insumo_id, 'ajuste', -m.q, s, 'Compra excluída', auth.uid());
  end loop;
  delete from compras where id = p_id;
end $$;

-- Contagem: informa quanto tem de cada insumo; a diferença vira movimento.
-- itens = [{insumo_id, quantidade}], tipo = 'contagem' | 'perda'
create or replace function registrar_contagem(itens jsonb, p_tipo text default 'contagem', p_obs text default null) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; atual numeric; nova numeric; n int := 0;
begin
  if not pode('financeiro') then raise exception 'Sem acesso ao estoque'; end if;
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

-- Cria as contas do mês a partir das despesas fixas (pode chamar várias vezes; não duplica).
create or replace function gerar_contas_mes(p_mes date) returns int
language plpgsql security definer set search_path = public as $$
declare d despesas_fixas; ini date := date_trunc('month', p_mes)::date; ult int; n int := 0;
begin
  if not pode('financeiro') then raise exception 'Sem acesso ao financeiro'; end if;
  ult := extract(day from (ini + interval '1 month - 1 day'))::int;
  for d in select * from despesas_fixas where ativo loop
    insert into contas (descricao, categoria, valor, vencimento, despesa_fixa_id)
    values (d.descricao, d.categoria, d.valor, ini + (least(d.dia, ult) - 1), d.id)
    on conflict (despesa_fixa_id, vencimento) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Resultado do mês (fechamento do dia 30): vendas, taxas, compras, despesas, lucro.
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
    formas as (
      select forma, sum(valor) total from (
        select p.metodo forma, p.valor from payments p join v on v.id = p.order_id where p.status = 'approved'
        union all
        select v.forma_pagamento, v.total from v where not exists (select 1 from payments p where p.order_id = v.id and p.status = 'approved')
      ) y group by forma
    ),
    taxas as (
      select f.forma, f.total, coalesce(t.percentual, 0) pct, round(f.total * coalesce(t.percentual, 0) / 100, 2) taxa
      from formas f left join taxas_pagamento t on t.forma = f.forma
    ),
    ext as (select * from entradas_externas where data >= ini and data < fim),
    cp as (select * from compras where data >= ini and data < fim),
    ct as (select * from contas where vencimento >= ini and vencimento < fim and compra_id is null)
    select jsonb_build_object(
      'mes', ini,
      'vendas_sistema', coalesce((select sum(total) from v), 0),
      'pedidos', (select count(*) from v),
      'ticket_medio', coalesce((select round(avg(total), 2) from v), 0),
      'por_canal', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'total', t, 'pedidos', n) order by t desc) from (select canal::text, sum(total) t, count(*) n from v group by canal) x), '[]'::jsonb),
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

revoke execute on function registrar_compra(jsonb) from public, anon;
revoke execute on function excluir_compra(uuid) from public, anon;
revoke execute on function registrar_contagem(jsonb, text, text) from public, anon;
revoke execute on function gerar_contas_mes(date) from public, anon;
revoke execute on function resultado_mes(date) from public, anon;
grant execute on function registrar_compra(jsonb), excluir_compra(uuid), registrar_contagem(jsonb, text, text), gerar_contas_mes(date), resultado_mes(date) to authenticated;

-- ============ DADOS INICIAIS ============
insert into taxas_pagamento (forma, nome, percentual, ordem) values
  ('dinheiro', 'Dinheiro', 0, 1),
  ('pix', 'PIX na maquininha', 0.99, 2),
  ('debito', 'Débito', 1.99, 3),
  ('credito', 'Crédito à vista', 4.99, 4),
  ('pix_online', 'PIX pelo site (Mercado Pago)', 0, 5),
  ('cartao_online', 'Cartão pelo site (Mercado Pago)', 0, 6)
on conflict (forma) do nothing;

insert into despesas_fixas (descricao, categoria, valor, dia)
select * from (values
  ('Aluguel', 'aluguel', 200.00, 15),
  ('Internet', 'internet', 100.00, 15),
  ('Energia', 'energia', 130.00, 11),
  ('Simples Nacional (DAS)', 'imposto', 76.00, 20),
  ('Salário funcionária (1ª parte)', 'pessoal', 400.00, 15),
  ('Salário funcionária (2ª parte)', 'pessoal', 400.00, 30)
) v(descricao, categoria, valor, dia)
where not exists (select 1 from despesas_fixas);

insert into insumos (nome, categoria, unidade, frequencia) values
  ('Açaí tradicional', 'acai_sorvete', 'kg', 'mensal'),
  ('Açaí zero', 'acai_sorvete', 'kg', 'mensal'),
  ('Sorvete Nutella', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Céu Azul Trufado', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Abacaxi', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Prestígio', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Chokito', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Ouro Branco', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Chocolate Branco', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Doce de Leite', 'acai_sorvete', 'un', 'mensal'),
  ('Sorvete Oreo', 'acai_sorvete', 'un', 'mensal'),
  ('Creme Pistache', 'cremes', 'kg', 'mensal'),
  ('Creme Ninho Trufado', 'cremes', 'kg', 'mensal'),
  ('Creme Morango', 'cremes', 'kg', 'mensal'),
  ('Mousse Abacaxi', 'cremes', 'kg', 'mensal'),
  ('Mousse Maracujá', 'cremes', 'kg', 'mensal'),
  ('Mousse Limão', 'cremes', 'kg', 'mensal'),
  ('Morango', 'frutas', 'kg', 'semanal'),
  ('Kiwi', 'frutas', 'kg', 'semanal'),
  ('Cereja', 'frutas', 'kg', 'semanal'),
  ('Leite em pó', 'insumos', 'kg', 'semanal'),
  ('Leite condensado', 'insumos', 'un', 'semanal'),
  ('Amendoim', 'insumos', 'kg', 'semanal'),
  ('M&M''s', 'insumos', 'kg', 'semanal'),
  ('Copo 300 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Copo 400 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Copo 500 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Pote 300 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Pote 500 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Pote 750 ml', 'descartaveis', 'un', 'quinzenal'),
  ('Pote 1 litro', 'descartaveis', 'un', 'quinzenal'),
  ('Água mineral 500 ml', 'mercado', 'un', 'quando_precisa'),
  ('Água com gás 500 ml', 'mercado', 'un', 'quando_precisa')
on conflict (nome) do nothing;
