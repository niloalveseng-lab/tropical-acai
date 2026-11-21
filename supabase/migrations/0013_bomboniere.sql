-- Bomboniere: doces de revenda no cardápio (site e balcão) e no estoque.
insert into categories (id, nome, ordem) values ('bomboniere', 'Bomboniere', 7) on conflict (id) do nothing;
insert into products (id, category_id, nome, descricao, kind, preco, ordem) values
  ('halls-uva', 'bomboniere', 'Halls Uva Verde', 'Pastilha', 'simples', 3.00, 1),
  ('halls-morango', 'bomboniere', 'Halls Morango', 'Pastilha', 'simples', 3.00, 2),
  ('halls-preta', 'bomboniere', 'Halls Preta', 'Pastilha', 'simples', 3.00, 3),
  ('trident-verde', 'bomboniere', 'Trident Verde', 'Chiclete', 'simples', 4.00, 4),
  ('trident-azul', 'bomboniere', 'Trident Azul', 'Chiclete', 'simples', 4.00, 5),
  ('bombom-ouro-branco', 'bomboniere', 'Bombom Ouro Branco', null, 'simples', 2.00, 6),
  ('bombom-iogurte', 'bomboniere', 'Bombom de Iogurte', null, 'simples', 0.20, 7),
  ('pirulito', 'bomboniere', 'Pirulito', null, 'simples', 0.50, 8)
on conflict (id) do nothing;

alter table insumos drop constraint if exists insumos_categoria_check;
alter table insumos add constraint insumos_categoria_check check (categoria in ('acai_sorvete','cremes','frutas','insumos','descartaveis','mercado','bomboniere','outros'));
insert into insumos (nome, categoria, unidade, frequencia) values
  ('Halls Uva Verde', 'bomboniere', 'un', 'quando_precisa'),
  ('Halls Morango', 'bomboniere', 'un', 'quando_precisa'),
  ('Halls Preta', 'bomboniere', 'un', 'quando_precisa'),
  ('Trident Verde', 'bomboniere', 'un', 'quando_precisa'),
  ('Trident Azul', 'bomboniere', 'un', 'quando_precisa'),
  ('Bombom Ouro Branco', 'bomboniere', 'un', 'quando_precisa'),
  ('Bombom de Iogurte', 'bomboniere', 'un', 'quando_precisa'),
  ('Pirulito', 'bomboniere', 'un', 'quando_precisa')
on conflict (nome) do nothing;
