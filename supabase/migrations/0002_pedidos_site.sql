-- Código público do pedido (link de acompanhamento sem login) e imagem dos tamanhos de açaí.
alter table orders add column if not exists codigo text unique;
create index if not exists orders_codigo_idx on orders (codigo);
alter table settings add column if not exists img_copo text, add column if not exists img_pote text;
