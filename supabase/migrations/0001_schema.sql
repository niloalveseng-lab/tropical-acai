-- Tropical Açaí — esquema inicial
-- Rodar no Supabase: SQL Editor > New query > colar e executar (ou `supabase db push`).

create extension if not exists "pgcrypto";

-- ============ EQUIPE ============
create type staff_role as enum ('dono','gerente','atendente');

create table staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  role staff_role not null default 'atendente',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function is_staff(min_role staff_role default 'atendente')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s
    where s.user_id = auth.uid() and s.ativo
      and case min_role
            when 'atendente' then true
            when 'gerente' then s.role in ('gerente','dono')
            when 'dono' then s.role = 'dono'
          end
  );
$$;

-- ============ CONFIGURAÇÕES (linha única) ============
create table settings (
  id int primary key default 1 check (id = 1),
  whatsapp text not null default '5583993526981',
  endereco text not null default 'Av. Monsenhor Vicente Freitas, 445 – Sousa-PB',
  -- horário por dia da semana (0=dom..6=sáb); null = fechado
  horarios jsonb not null default '{"0":[14,21],"1":null,"2":[14,21],"3":[14,21],"4":[14,21],"5":[14,22],"6":[14,22]}',
  preco_kg numeric(10,2) not null default 49.99,
  acomp_extra numeric(10,2) default 2.00, -- cada acompanhamento incluso acima do limite (null = bloqueia)
  -- Entrega por raio (linha reta a partir da loja). Acima do último raio: não entrega.
  loja_lat double precision not null default -6.7490513, -- pino do Google Maps da loja
  loja_lng double precision not null default -38.24237,
  faixas_entrega jsonb not null default '[{"ate_km":1,"taxa":5},{"ate_km":2,"taxa":7},{"ate_km":3,"taxa":8},{"ate_km":4,"taxa":10}]',
  pedido_minimo numeric(10,2) not null default 20.00,   -- só para entrega
  aceita_agendamento boolean not null default true,
  balanca jsonb not null default '{"protocolo":"prt3","baud":9600}',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

-- ============ CARDÁPIO ============
create table categories (
  id text primary key,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);

-- Tamanhos do açaí (copo/pote)
create table acai_sizes (
  id text primary key,
  embalagem text not null check (embalagem in ('Copo','Pote')),
  rotulo text not null,                 -- "300 ml"
  preco numeric(10,2) not null check (preco >= 0),
  acomp_inclusos int not null check (acomp_inclusos >= 0),
  tara_g int not null default 0,        -- peso da embalagem vazia (balança)
  peso_padrao_g int,                    -- porção esperada (conferência)
  ordem int not null default 0,
  ativo boolean not null default true
);

create table acai_bases (
  id text primary key,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);

create table addon_groups (
  id text primary key,
  nome text not null,
  ordem int not null default 0
);

create table addon_items (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references addon_groups(id) on delete cascade,
  nome text not null,
  preco_adicional numeric(10,2) not null default 0 check (preco_adicional >= 0),
  -- true: gratuito, conta nos acompanhamentos inclusos (acima do limite cobra settings.acomp_extra)
  -- false: pago à parte (preco_adicional), não ocupa vaga dos inclusos
  conta_no_limite boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  esgotado_em date                      -- "esgotado hoje": igual à data de hoje
);

-- Demais produtos: batida, milkshake, cascão, picolés...
-- kind: 'simples' (preço único) | 'opcoes' (tamanhos + sabores/escolha)
create table products (
  id text primary key,
  category_id text not null references categories(id),
  nome text not null,
  descricao text,
  kind text not null check (kind in ('simples','opcoes')),
  preco numeric(10,2),                  -- para 'simples'
  tamanhos jsonb,                       -- [{"nome":"P 300 ml","preco":15,"sabores":1}]
  sabores text[],
  escolha jsonb,                        -- {"rotulo":"Servir em","opcoes":["Copo","Garrafa"]}
  imagem_path text,
  controla_estoque boolean not null default false,
  estoque int,
  estoque_minimo int,
  ordem int not null default 0,
  destaque boolean not null default false, -- aparece em "Mais vendidos" enquanto ainda não há vendas suficientes
  ativo boolean not null default true,
  esgotado_em date
);

-- Copo promocional e futuros combos
create table promos (
  id text primary key,
  nome text not null,
  tamanho text not null,
  preco numeric(10,2) not null,
  composicao text[] not null,
  dias_semana int[] not null,           -- 0=dom..6=sáb
  hora_inicio int, hora_fim int,
  limite_diario int,
  permite_adicionais boolean not null default false,
  imagem_path text,
  ativo boolean not null default true
);

-- Histórico de preços (auditoria)
create table price_history (
  id bigserial primary key,
  tabela text not null, item_id text not null,
  preco_antes numeric(10,2), preco_depois numeric(10,2),
  alterado_por uuid default auth.uid(),
  alterado_em timestamptz not null default now()
);

create or replace function log_price() returns trigger language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; v_old numeric; v_new numeric;
begin
  execute format('select ($1).%I, ($2).%I', col, col) into v_old, v_new using old, new;
  if v_old is distinct from v_new then
    insert into price_history(tabela,item_id,preco_antes,preco_depois)
    values (tg_table_name, new.id::text, v_old, v_new);
  end if;
  return new;
end $$;
create trigger t_price_sizes  after update on acai_sizes  for each row execute function log_price('preco');
create trigger t_price_addons after update on addon_items for each row execute function log_price('preco_adicional');
create trigger t_price_prod   after update on products    for each row execute function log_price('preco');
create trigger t_price_promo  after update on promos      for each row execute function log_price('preco');

-- ============ CLIENTES ============
create table customers (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text, telefone text,
  aceite_lgpd_em timestamptz,
  created_at timestamptz not null default now()
);
create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  apelido text, endereco text not null, bairro text not null, referencia text,
  created_at timestamptz not null default now()
);

-- ============ PEDIDOS ============
create type order_status as enum ('aguardando_pagamento','novo','preparo','pronto','saiu','entregue','cancelado');
create type order_channel as enum ('site','balcao','whatsapp');

create sequence order_number_seq;

create table orders (
  id uuid primary key default gen_random_uuid(),
  numero int not null default nextval('order_number_seq'),
  canal order_channel not null,
  status order_status not null,
  customer_id uuid references customers(id),
  cliente_nome text, cliente_telefone text,
  tipo text not null check (tipo in ('retirada','entrega','balcao')),
  endereco text, bairro text,
  entrega_lat double precision, entrega_lng double precision, distancia_km numeric(6,2),
  subtotal numeric(10,2) not null, taxa_entrega numeric(10,2) not null default 0,
  desconto numeric(10,2) not null default 0, total numeric(10,2) not null,
  forma_pagamento text not null,         -- pix_online, cartao_online, dinheiro, pix, debito, credito, misto
  pago boolean not null default false,
  troco_para numeric(10,2),
  observacao text,
  agendado_para timestamptz,
  operador uuid references staff(user_id),
  cash_session_id uuid,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (created_at desc);
create index on orders (status);
create index on orders (customer_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  nome text not null,                    -- snapshot do nome no momento da venda
  detalhes jsonb not null default '{}',  -- base, acompanhamentos, sabores, peso etc.
  descricao text,
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,
  total numeric(10,2) not null,
  peso_liquido_g int                     -- açaí no quilo
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  metodo text not null,
  valor numeric(10,2) not null,
  provedor text,                         -- mercadopago | manual
  provedor_id text unique,
  status text not null,                  -- pending | approved | rejected | refunded
  dados jsonb,
  created_at timestamptz not null default now()
);

-- ============ CAIXA ============
create table cash_sessions (
  id uuid primary key default gen_random_uuid(),
  aberto_por uuid not null references staff(user_id),
  aberto_em timestamptz not null default now(),
  valor_abertura numeric(10,2) not null default 0,
  fechado_por uuid references staff(user_id),
  fechado_em timestamptz,
  valor_contado numeric(10,2),
  observacao text
);
create table cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions(id) on delete cascade,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric(10,2) not null check (valor > 0),
  motivo text,
  por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table orders add constraint orders_cash_fk foreign key (cash_session_id) references cash_sessions(id);

-- ============ RLS ============
alter table staff enable row level security;
alter table settings enable row level security;
alter table categories enable row level security;
alter table acai_sizes enable row level security;
alter table acai_bases enable row level security;
alter table addon_groups enable row level security;
alter table addon_items enable row level security;
alter table products enable row level security;
alter table promos enable row level security;
alter table price_history enable row level security;
alter table customers enable row level security;
alter table addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;

-- Cardápio: leitura pública, escrita só gerente/dono
do $$ declare t text; begin
  foreach t in array array['settings','categories','acai_sizes','acai_bases','addon_groups','addon_items','products','promos'] loop
    execute format('create policy "leitura publica" on %I for select using (true)', t);
    execute format('create policy "gerente edita" on %I for all using (is_staff(''gerente'')) with check (is_staff(''gerente''))', t);
  end loop;
end $$;
-- Atendente pode marcar "esgotado hoje" (feito via rota do servidor; aqui só leitura)

create policy "equipe ve equipe" on staff for select using (is_staff());
create policy "dono gerencia equipe" on staff for all using (is_staff('dono')) with check (is_staff('dono'));
create policy "gerente ve historico" on price_history for select using (is_staff('gerente'));

create policy "cliente ve/edita a si" on customers for all using (id = auth.uid()) with check (id = auth.uid());
create policy "equipe ve clientes" on customers for select using (is_staff());
create policy "cliente enderecos" on addresses for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- Pedidos: criados SOMENTE pelo servidor (service role recalcula preços).
create policy "cliente ve seus pedidos" on orders for select using (customer_id = auth.uid());
create policy "equipe ve pedidos" on orders for select using (is_staff());
create policy "equipe atualiza status" on orders for update using (is_staff()) with check (is_staff());
create policy "cliente ve itens" on order_items for select using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "equipe ve itens" on order_items for select using (is_staff());
create policy "equipe ve pagamentos" on payments for select using (is_staff());
create policy "equipe caixa" on cash_sessions for all using (is_staff()) with check (is_staff());
create policy "equipe movimentos" on cash_movements for all using (is_staff()) with check (is_staff());

-- Tempo real para o painel de pedidos
alter publication supabase_realtime add table orders;

-- updated_at automático
create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger t_orders_touch before update on orders for each row execute function touch();
create trigger t_settings_touch before update on settings for each row execute function touch();

-- Bucket de imagens do cardápio (público para leitura)
insert into storage.buckets (id, name, public) values ('cardapio','cardapio', true) on conflict do nothing;
create policy "imagens publicas" on storage.objects for select using (bucket_id = 'cardapio');
create policy "gerente envia imagens" on storage.objects for insert with check (bucket_id = 'cardapio' and is_staff('gerente'));
create policy "gerente troca imagens" on storage.objects for update using (bucket_id = 'cardapio' and is_staff('gerente'));
create policy "gerente apaga imagens" on storage.objects for delete using (bucket_id = 'cardapio' and is_staff('gerente'));

-- Mais vendidos (somente nomes e quantidades, sem dados de clientes) — usado na vitrine do site
create or replace function mais_vendidos(dias int default 30, limite int default 6)
returns table(nome text, quantidade bigint) language sql stable security definer set search_path = public as $$
  select i.nome, sum(i.quantidade)::bigint
  from order_items i join orders o on o.id = i.order_id
  where o.status not in ('cancelado','aguardando_pagamento')
    and o.created_at >= now() - make_interval(days => dias)
    and i.nome <> 'Açaí no quilo'
  group by i.nome order by 2 desc limit limite;
$$;
grant execute on function mais_vendidos(int,int) to anon, authenticated;
