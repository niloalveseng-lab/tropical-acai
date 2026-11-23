-- 0015: Fornecedores + catálogo; edição de insumo por quem cuida do estoque.

create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  razao_social text,
  apelidos text[] not null default '{}',      -- como aparece nas compras ("Mais Sabor (Iolando…)")
  vendedor text,
  whatsapp text,
  cidade text,
  fornece text,                               -- o que compra dele
  pagamento text,
  frequencia text check (frequencia in ('semanal','quinzenal','mensal','quando_precisa')),
  pedido_minimo text,
  obs text,
  catalogo_em date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  linha text not null,
  nome text not null,
  descricao text,
  embalagem text,
  emb_qtd numeric(10,3),                      -- quanto vem na embalagem, na unidade do insumo (ex.: 5 = 5 kg)
  preco numeric(10,2),                        -- null = consultar
  insumo_id uuid references insumos(id) on delete set null,
  ordem int not null default 0,
  ativo boolean not null default true,
  atualizado_em date not null default (now() at time zone 'America/Fortaleza')::date,
  unique (fornecedor_id, linha, nome)
);
create index if not exists fornecedor_produtos_insumo on fornecedor_produtos(insumo_id);

alter table fornecedores enable row level security;
alter table fornecedor_produtos enable row level security;
drop policy if exists "financeiro" on fornecedores;
create policy "financeiro" on fornecedores for all using (pode('financeiro')) with check (pode('financeiro'));
drop policy if exists "financeiro" on fornecedor_produtos;
create policy "financeiro" on fornecedor_produtos for all using (pode('financeiro')) with check (pode('financeiro'));

-- Preço do catálogo ligado a um insumo vira cotação na memória de preços (R$ por unidade do insumo).
create or replace function fornecedor_produto_preco() returns trigger language plpgsql security definer set search_path = public as $$
declare v_forn text;
begin
  if new.preco is null or new.insumo_id is null or coalesce(new.emb_qtd, 0) <= 0 then return new; end if;
  if tg_op = 'UPDATE' and new.preco is not distinct from old.preco and new.emb_qtd is not distinct from old.emb_qtd and new.insumo_id is not distinct from old.insumo_id then return new; end if;
  new.atualizado_em := (now() at time zone 'America/Fortaleza')::date;
  select nome into v_forn from fornecedores where id = new.fornecedor_id;
  delete from insumo_precos where insumo_id = new.insumo_id and origem = 'cotacao' and data = new.atualizado_em and fornecedor = v_forn || ' · ' || new.nome;
  insert into insumo_precos (insumo_id, data, preco_unit, fornecedor, origem, obs)
  values (new.insumo_id, new.atualizado_em, round(new.preco / new.emb_qtd, 4), v_forn || ' · ' || new.nome, 'cotacao', 'catálogo do fornecedor');
  return new;
end $$;
drop trigger if exists fornecedor_produto_preco on fornecedor_produtos;
create trigger fornecedor_produto_preco before insert or update on fornecedor_produtos for each row execute function fornecedor_produto_preco();

-- Cadastrar/editar insumo: dono, financeiro ou quem tem a permissão Estoque (sem mexer em custo).
create or replace function salvar_insumo(p_id uuid, p_nome text, p_categoria text, p_unidade text, p_minimo numeric,
  p_fornecedor text, p_frequencia text, p_ativo boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not pode_estoque() then raise exception 'Sem permissão para editar o estoque'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe o nome'; end if;
  if p_id is null then
    insert into insumos (nome, categoria, unidade, minimo, fornecedor, frequencia, ativo)
    values (trim(p_nome), p_categoria, p_unidade, coalesce(p_minimo, 0), nullif(trim(p_fornecedor), ''), p_frequencia, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update insumos set nome = trim(p_nome), categoria = p_categoria, unidade = p_unidade, minimo = coalesce(p_minimo, 0),
      fornecedor = nullif(trim(p_fornecedor), ''), frequencia = p_frequencia, ativo = coalesce(p_ativo, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Insumo não encontrado'; end if;
  end if;
  return v_id;
end $$;
revoke all on function salvar_insumo(uuid, text, text, text, numeric, text, text, boolean) from public, anon;
grant execute on function salvar_insumo(uuid, text, text, text, numeric, text, text, boolean) to authenticated;

-- Fornecedores conhecidos
insert into fornecedores (nome, razao_social, apelidos, vendedor, fornece, pagamento, frequencia, obs, catalogo_em) values
 ('Mais Sabor', 'Iolando Diniz Araujo ME', '{"Mais Sabor","Especial Gourmet"}', null, 'Açaí, cremes, sorvetes e picolés Especial Gourmet', 'Boleto', 'mensal', 'Marcas: Mais Açaí, Oca do Açaí, Especial Gourmet (picolés). Cremes Premium: consultar valores.', '2026-11-23'),
 ('Flor de Lis', null, '{"Flor de Lis"}', 'Rodolfo', 'Sorvetes, açaí, cremes de fruta, gelatos e picolés', 'Boleto', 'mensal', 'Catálogo sem preços: anote os valores quando receber a tabela.', '2026-11-23'),
 ('Atacado das Balas', 'Lucivaldo Luciano Luiz ME', '{"Atacado das Balas","Atacado"}', null, 'Complementos, descartáveis e bomboniere', 'Dinheiro ou cartão', 'semanal', null, null),
 ('ABC Fest', null, '{"ABC"}', null, 'Complementos e descartáveis', 'Dinheiro ou cartão', 'quinzenal', null, null),
 ('Paulo Cezar (morangos)', null, '{"Paulo Cezar","Morangos"}', null, 'Morangos (caixa 800 g)', 'PIX', 'semanal', null, null)
on conflict (nome) do nothing;

insert into fornecedor_produtos (fornecedor_id, linha, nome, descricao, embalagem, emb_qtd, preco, insumo_id, ordem)
select f.id, v.linha, v.nome, v.descricao, v.embalagem, v.emb_qtd, v.preco, i.id, v.ordem
from (values
('Flor de Lis','Açaí Premium 5 L','Açaí Tradicional','0% lactose, 0% corante, 0% aroma','Caixa 5 L',null::numeric,null::numeric,null,1),
('Flor de Lis','Açaí Premium 5 L','Açaí Zero','0% lactose, 0% corante, 0% aroma','Caixa 5 L',null,null,null,2),
('Flor de Lis','Açaí Premium 10 L','Açaí Tradicional','0% lactose, 0% corante, 0% aroma','Caixa 10 L',null,null,null,3),
('Flor de Lis','Açaí Premium 10 L','Açaí com Banana','0% lactose, 0% corante, 0% aroma','Caixa 10 L',null,null,null,4),
('Flor de Lis','Açaí Cremoso 5 L','Açaí Tradicional','Textura pronta para servir','Caixa 5 L',null,null,null,5),
('Flor de Lis','Açaí Cremoso 5 L','Açaí com Banana','Textura pronta para servir','Caixa 5 L',null,null,null,6),
('Flor de Lis','Açaí Cremoso 5 L','Açaí com Morango','Textura pronta para servir','Caixa 5 L',null,null,null,7),
('Flor de Lis','Açaí Cremoso 5 L','Açaí com Ninho','Textura pronta para servir','Caixa 5 L',null,null,null,8),
('Flor de Lis','Açaí Cremoso 5 L','Açaí com Avelã','Textura pronta para servir','Caixa 5 L',null,null,null,9),
('Flor de Lis','Açaí Cremoso 10 L','Açaí Tradicional','Textura pronta para servir','Caixa 10 L',null,null,null,10),
('Flor de Lis','Açaí Cremoso 10 L','Açaí com Banana','Textura pronta para servir','Caixa 10 L',null,null,null,11),
('Flor de Lis','Açaí Cremoso 10 L','Açaí com Morango','Textura pronta para servir','Caixa 10 L',null,null,null,12),
('Flor de Lis','Açaí Cremoso 10 L','Açaí com Ninho','Textura pronta para servir','Caixa 10 L',null,null,null,13),
('Flor de Lis','Açaí Cremoso 10 L','Açaí com Avelã','Textura pronta para servir','Caixa 10 L',null,null,null,14),
('Flor de Lis','Creme de Fruta 5 L','Creme de Cajá','70% fruta','Caixa 5 L',null,null,null,15),
('Flor de Lis','Creme de Fruta 5 L','Creme de Morango','70% fruta','Caixa 5 L',null,null,null,16),
('Flor de Lis','Creme de Fruta 5 L','Creme de Pitaya','70% fruta','Caixa 5 L',null,null,null,17),
('Flor de Lis','Creme de Fruta 5 L','Creme de Cupuaçu','70% fruta','Caixa 5 L',null,null,null,18),
('Flor de Lis','Creme de Fruta 10 L','Creme de Cupuaçu','70% fruta','Caixa 10 L',null,null,null,19),
('Flor de Lis','Sorvetes','3 Chocolates','Sorvete de chocolate branco, chocolate e ovomaltine',null,null,null,null,20),
('Flor de Lis','Sorvetes','Abacaxi','Sorvete de abacaxi com doce de abacaxi',null,null,null,'Sorvete Abacaxi',21),
('Flor de Lis','Sorvetes','Africano','Sorvete de doce de leite e cobertura de chocolate',null,null,null,null,22),
('Flor de Lis','Sorvetes','Amendoim','Sorvete de amendoim',null,null,null,null,23),
('Flor de Lis','Sorvetes','Bariloche','Sorvete de doce de leite com amendoim, chocolate e passas',null,null,null,null,24),
('Flor de Lis','Sorvetes','Blue Ice com Oreo','Sorvete azul do céu com oreo',null,null,null,null,25),
('Flor de Lis','Sorvetes','Bombom','Calda de bombom flovado com cobertura de chocolate',null,null,null,null,26),
('Flor de Lis','Sorvetes','Brigadeiro','Sorvete de chocolate com doce de leite e granulado preto',null,null,null,null,27),
('Flor de Lis','Sorvetes','Cajá','Sorvete feito com polpa da fruta de cajá',null,null,null,null,28),
('Flor de Lis','Sorvetes','Chiclete','Sorvete de leite condensado com azul do céu e chiclete',null,null,null,null,29),
('Flor de Lis','Sorvetes','Chocolate','Sorvete de chocolate',null,null,null,null,30),
('Flor de Lis','Sorvetes','Chocomenta','Sorvete de menta e chocolate com cobertura de chocolate',null,null,null,null,31),
('Flor de Lis','Sorvetes','Chocorango','Sorvete de morango com cobertura de chocolate',null,null,null,null,32),
('Flor de Lis','Sorvetes','Chokito','Sorvete de doce de leite e chocolate com cobertura de chocolate e amendoim',null,null,null,'Sorvete Chokito',33),
('Flor de Lis','Sorvetes','Coco','Sorvete de coco',null,null,null,null,34),
('Flor de Lis','Sorvetes','Creme','Sorvete de creme',null,null,null,null,35),
('Flor de Lis','Sorvetes','Creme com Passas','Sorvete de creme com passas',null,null,null,null,36),
('Flor de Lis','Sorvetes','Creme Suíço','Sorvete de iogurte e uva',null,null,null,null,37),
('Flor de Lis','Sorvetes','Diamante Negro','Sorvete de chocolate com crocante de amendoim',null,null,null,null,38),
('Flor de Lis','Sorvetes','Doce de Leite','Sorvete de doce de leite',null,null,null,'Sorvete Doce de Leite',39),
('Flor de Lis','Sorvetes','Ferrero','Sorvete de chocolate com cobertura de chocolate e chocolate branco',null,null,null,null,40),
('Flor de Lis','Sorvetes','Flocos','Sorvete de nata com granulado preto',null,null,null,null,41),
('Flor de Lis','Sorvetes','Lacta Negra','Sorvete de leite condensado e chocolate com cobertura de chocolate',null,null,null,null,42),
('Flor de Lis','Sorvetes','Leite Condensado','Sorvete de leite condensado',null,null,null,null,43),
('Flor de Lis','Sorvetes','Leitinho com Morango','Sorvete de leitinho com mescla de morango',null,null,null,null,44),
('Flor de Lis','Sorvetes','Maçã Verde','Sorvete de maçã verde',null,null,null,null,45),
('Flor de Lis','Sorvetes','Malibu','Sorvete de leite condensado com crocante de amendoim e cobertura de chocolate',null,null,null,null,46),
('Flor de Lis','Sorvetes','Maracujá','Sorvete de maracujá',null,null,null,null,47),
('Flor de Lis','Sorvetes','Mesclabom','Sorvete de leite condensado e morango',null,null,null,null,48),
('Flor de Lis','Sorvetes','Mimo Trufado','Sorvete de leite condensado mesclado com trufa premium',null,null,null,null,49),
('Flor de Lis','Sorvetes','Morango','Sorvete de morango',null,null,null,null,50),
('Flor de Lis','Sorvetes','Morango Premium','Sorvete de morango (produzido com pasta italiana)',null,null,null,null,51),
('Flor de Lis','Sorvetes','Napolitano','Sorvete de nata, morango e chocolate',null,null,null,null,52),
('Flor de Lis','Sorvetes','Nata Goiaba','Sorvete de nata com goiabada',null,null,null,null,53),
('Flor de Lis','Sorvetes','Nutella','Sorvete de chocolate à base de nutella',null,null,null,'Sorvete Nutella',54),
('Flor de Lis','Sorvetes','Oreo','Sorvete de nata com biscoito oreo em pedaços',null,null,null,'Sorvete Oreo',55),
('Flor de Lis','Sorvetes','Ouro Branco','Sorvete de chocolate ouro branco com cobertura de chocolate branco',null,null,null,'Sorvete Ouro Branco',56),
('Flor de Lis','Sorvetes','Pavê','Sorvete de creme com chocolate',null,null,null,null,57),
('Flor de Lis','Sorvetes','Prestígio','Sorvete de coco com raspas de chocolate',null,null,null,'Sorvete Prestígio',58),
('Flor de Lis','Sorvetes','Pudim','Sorvete de pudim com mescla de caramelo',null,null,null,null,59),
('Flor de Lis','Sorvetes','Sensação','Sorvete de nata com calda de morango e cobertura de morango',null,null,null,null,60),
('Flor de Lis','Sorvetes','Sonho de Valsa','Sorvete de nata com amendoim e cobertura de chocolate',null,null,null,null,61),
('Flor de Lis','Sorvetes','Abacaxi ao Vinho','Sorvete de abacaxi mesclado com abacaxi ao vinho',null,null,null,null,62),
('Flor de Lis','Sorvetes','Tapioca','Sorvete de coco com sagu de tapioca',null,null,null,'Sorvete Tapioca',63),
('Flor de Lis','Sorvetes','Torta de Maracujá','Sorvete de maracujá com calda de maracujá',null,null,null,null,64),
('Flor de Lis','Sorvetes','Trufa de Morango','Sorvete de morango mesclado com chocolate zerado e morango topping',null,null,null,null,65),
('Flor de Lis','Gelatos','Alfajor','Gelato à base de doce de leite, mesclado com doce de leite e chocolate meio amargo, recheado com bolo de chocolate.',null,null,null,null,66),
('Flor de Lis','Gelatos','Bem Casado','Gelato à base de chocolate branco, mesclado com trufa ao leite e doce de leite e bolo.',null,null,null,null,67),
('Flor de Lis','Gelatos','Cappuccino','Gelato à base de café seleção premium, trufado com chocolate branco.',null,null,null,null,68),
('Flor de Lis','Gelatos','Chocolate Belga','Gelato à base de cacau seleção, mesclado com trufa ao leite.',null,null,null,null,69),
('Flor de Lis','Gelatos','Ferrero Rocher','Gelato à base de chocolate meio amargo com amêndoas, mesclado com chocolate amargo.',null,null,null,null,70),
('Flor de Lis','Gelatos','Grego com Frutas Vermelhas','Gelato à base de iogurte grego, mesclado com frutas vermelhas selecionadas.',null,null,null,null,71),
('Flor de Lis','Gelatos','Ovomaltine Trufado','Gelato à base de ovomaltine, mesclado com chocolate ao leite e ovomaltine.',null,null,null,null,72),
('Flor de Lis','Gelatos','Morango Frágula','Gelato à base de morango premium, mesclado com trufa selecionada de morango.',null,null,null,null,73),
('Flor de Lis','Gelatos','Ninho com Morango','Gelato à base de leitinho, trufado com mescla de morango premium.',null,null,null,null,74),
('Flor de Lis','Gelatos','Ninho com Nutella','Gelato à base de leitinho, trufado com nutella.',null,null,null,null,75),
('Flor de Lis','Gelatos','Pavê Italiano','Gelato à base de biscoito, trufado com chocolate ao leite e waffer.',null,null,null,null,76),
('Flor de Lis','Gelatos','Pérola Negra','Gelato à base de leitinho, trufado com chocolate amargo e chocoball.',null,null,null,null,77),
('Flor de Lis','Gelatos','Torta de Limão','Gelato à base de pasta premium de limão, mesclado com chocolate branco e waffle.',null,null,null,null,78),
('Flor de Lis','Picolés','Lis''zinho','Picolé à base de água',null,null,null,null,79),
('Flor de Lis','Picolés','Lapis''lis','Infantil, ao leite (leite condensado e morango / doce de leite com chocolate)',null,null,null,null,80),
('Flor de Lis','Picolés','Frut''lis','Frutas: limão, tamarindo, cajá, graviola',null,null,null,null,81),
('Flor de Lis','Picolés','Ao leite','Sabores tradicionais ao leite',null,null,null,null,82),
('Flor de Lis','Picolés','Açaí','Picolé de açaí',null,null,null,null,83),
('Flor de Lis','Picolés','Trufados','Ao leite, recheio de morango ou chocolate, cobertos',null,null,null,null,84),
('Flor de Lis','Picolés','Finesse','5 sabores finos com cobertura',null,null,null,null,85),
('Flor de Lis','Picolés','Meglis','Linha gourmet, 3 sabores',null,null,null,null,86),
('Flor de Lis','Picolés','Paleta Lis','Paletas recheadas (ao leite e frutadas 70% fruta)',null,null,null,null,87),
('Flor de Lis','Mono porções e potes','Biglis',null,null,null,null,null,88),
('Flor de Lis','Mono porções e potes','Querobis','3 combinações de sabores',null,null,null,null,89),
('Flor de Lis','Mono porções e potes','Sundelis','Recheado com topping de morango ou chocolate',null,null,null,null,90),
('Flor de Lis','Mono porções e potes','Minilis','Morango com topping de morango',null,null,null,null,91),
('Flor de Lis','Mono porções e potes','Açaí (pote individual)','Para consumo imediato',null,null,null,null,92),
('Flor de Lis','Mono porções e potes','Sorvete 1 L','2 sabores mais vendidos',null,null,null,null,93),
('Flor de Lis','Mono porções e potes','Combinação de sabores',null,null,null,null,null,94),
('Flor de Lis','Mono porções e potes','Açaí 1 L','Açaí cremoso para casa',null,null,null,null,95),
('Flor de Lis','Mono porções e potes','Linha 2 L','Sabores mais vendidos',null,null,null,null,96),
('Flor de Lis','Cremolisinn','Açaí com Morango','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,97),
('Flor de Lis','Cremolisinn','Azul do Céu','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,98),
('Flor de Lis','Cremolisinn','Bombom','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,99),
('Flor de Lis','Cremolisinn','Chiclete','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,100),
('Flor de Lis','Cremolisinn','Chocolate com Avelã','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,101),
('Flor de Lis','Cremolisinn','Chocolate Branco','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,102),
('Flor de Lis','Cremolisinn','Coco','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,103),
('Flor de Lis','Cremolisinn','Graviola','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,104),
('Flor de Lis','Cremolisinn','Leitinho','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,105),
('Flor de Lis','Cremolisinn','Leite Condensado','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,106),
('Flor de Lis','Cremolisinn','Maracujá','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,107),
('Flor de Lis','Cremolisinn','Morango','Cremoso com leite em pó integral e lactobacilos',null,null,null,null,108),
('Mais Sabor','Mais Açaí · caixa 5 kg','Mais Açaí Tradicional',null,'Caixa 5 kg',5,74,'Açaí tradicional',1),
('Mais Sabor','Mais Açaí · caixa 5 kg','Creme Morango Trufado',null,'Caixa 5 kg',5,60,null,2),
('Mais Sabor','Mais Açaí · caixa 5 kg','Creme Ninho Trufado',null,'Caixa 5 kg',5,60,'Creme Ninho Trufado',3),
('Mais Sabor','Mais Açaí · caixa 5 kg','Creme Amendoim',null,'Caixa 5 kg',5,60,null,4),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Açaí Tradicional',null,'Caixa 5 kg',5,94,'Açaí tradicional',5),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Açaí c/ Morango',null,'Caixa 5 kg',5,84,null,6),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme de Ninho',null,'Caixa 5 kg',5,90,null,7),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Ninho Trufado',null,'Caixa 5 kg',5,90,'Creme Ninho Trufado',8),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme L. Condensado',null,'Caixa 5 kg',5,81,null,9),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Ocapower',null,'Caixa 5 kg',5,90,null,10),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Avelã',null,'Caixa 5 kg',5,90,null,11),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Oreo',null,'Caixa 5 kg',5,94,null,12),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Tapioca',null,'Caixa 5 kg',5,90,null,13),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Ovomaltine',null,'Caixa 5 kg',5,94,null,14),
('Mais Sabor','Oca do Açaí · caixa 5 kg','Creme Morango',null,'Caixa 5 kg',5,90,'Creme Morango',15),
('Mais Sabor','Sorvete · caixa 10 L','Abacaxi',null,'Caixa 10 L',null,90,'Sorvete Abacaxi',16),
('Mais Sabor','Sorvete · caixa 10 L','Azul',null,'Caixa 10 L',null,90,null,17),
('Mais Sabor','Sorvete · caixa 10 L','Base Neutra p/ Milk-shake',null,'Caixa 10 L',null,90,'Base neutra',18),
('Mais Sabor','Sorvete · caixa 10 L','Brigadeiro',null,'Caixa 10 L',null,90,null,19),
('Mais Sabor','Sorvete · caixa 10 L','Bombom',null,'Caixa 10 L',null,90,null,20),
('Mais Sabor','Sorvete · caixa 10 L','Brigadeiro e Leite Condensado',null,'Caixa 10 L',null,90,null,21),
('Mais Sabor','Sorvete · caixa 10 L','Chocolate Branco',null,'Caixa 10 L',null,90,'Sorvete Chocolate Branco',22),
('Mais Sabor','Sorvete · caixa 10 L','Chocolate Preto',null,'Caixa 10 L',null,90,null,23),
('Mais Sabor','Sorvete · caixa 10 L','Creme com Passas',null,'Caixa 10 L',null,90,null,24),
('Mais Sabor','Sorvete · caixa 10 L','Diamante Negro',null,'Caixa 10 L',null,90,null,25),
('Mais Sabor','Sorvete · caixa 10 L','Doce de Leite',null,'Caixa 10 L',null,90,'Sorvete Doce de Leite',26),
('Mais Sabor','Sorvete · caixa 10 L','Chocolate com Castanha',null,'Caixa 10 L',null,90,null,27),
('Mais Sabor','Sorvete · caixa 10 L','Leite Condensado',null,'Caixa 10 L',null,90,null,28),
('Mais Sabor','Sorvete · caixa 10 L','Morango',null,'Caixa 10 L',null,90,null,29),
('Mais Sabor','Sorvete · caixa 10 L','Menta',null,'Caixa 10 L',null,90,null,30),
('Mais Sabor','Sorvete · caixa 10 L','Morango e Creme',null,'Caixa 10 L',null,90,null,31),
('Mais Sabor','Sorvete · caixa 10 L','Morango Trufado',null,'Caixa 10 L',null,90,null,32),
('Mais Sabor','Sorvete · caixa 10 L','Morango e Leite Condensado',null,'Caixa 10 L',null,90,null,33),
('Mais Sabor','Sorvete · caixa 10 L','Napolitano',null,'Caixa 10 L',null,90,null,34),
('Mais Sabor','Sorvete · caixa 10 L','Nata Goiaba',null,'Caixa 10 L',null,90,null,35),
('Mais Sabor','Sorvete · caixa 10 L','Ninho Trufado',null,'Caixa 10 L',null,90,null,36),
('Mais Sabor','Sorvete · caixa 10 L','Prestígio',null,'Caixa 10 L',null,90,'Sorvete Prestígio',37),
('Mais Sabor','Sorvete · caixa 10 L','Chocolate Rocher',null,'Caixa 10 L',null,90,null,38),
('Mais Sabor','Sorvete · caixa 10 L','Tentação',null,'Caixa 10 L',null,90,null,39),
('Mais Sabor','Sorvete · caixa 10 L','Pavê',null,'Caixa 10 L',null,90,null,40),
('Mais Sabor','Sorvete · caixa 10 L','Uva',null,'Caixa 10 L',null,90,null,41),
('Mais Sabor','Cremes Premium · caixa 5 L','Abacaxi','Consultar valor','Caixa 5 L',null,null,null,42),
('Mais Sabor','Cremes Premium · caixa 5 L','Chocolate Belga','Consultar valor','Caixa 5 L',null,null,null,43),
('Mais Sabor','Cremes Premium · caixa 5 L','Chocolate Rocher','Consultar valor','Caixa 5 L',null,null,null,44),
('Mais Sabor','Cremes Premium · caixa 5 L','Bis','Consultar valor','Caixa 5 L',null,null,null,45),
('Mais Sabor','Cremes Premium · caixa 5 L','Café','Consultar valor','Caixa 5 L',null,null,null,46),
('Mais Sabor','Cremes Premium · caixa 5 L','Chocolate Dark','Consultar valor','Caixa 5 L',null,null,null,47),
('Mais Sabor','Cremes Premium · caixa 5 L','Cookies','Consultar valor','Caixa 5 L',null,null,null,48),
('Mais Sabor','Cremes Premium · caixa 5 L','Creme com Passas','Consultar valor','Caixa 5 L',null,null,null,49),
('Mais Sabor','Cremes Premium · caixa 5 L','Crocante','Consultar valor','Caixa 5 L',null,null,null,50),
('Mais Sabor','Cremes Premium · caixa 5 L','Gran Chocolate','Consultar valor','Caixa 5 L',null,null,null,51),
('Mais Sabor','Cremes Premium · caixa 5 L','Kinder','Consultar valor','Caixa 5 L',null,null,null,52),
('Mais Sabor','Cremes Premium · caixa 5 L','Kit Kat','Consultar valor','Caixa 5 L',null,null,null,53),
('Mais Sabor','Cremes Premium · caixa 5 L','Ninho Trufado','Consultar valor','Caixa 5 L',null,null,null,54),
('Mais Sabor','Cremes Premium · caixa 5 L','Menta','Consultar valor','Caixa 5 L',null,null,null,55),
('Mais Sabor','Cremes Premium · caixa 5 L','Morango','Consultar valor','Caixa 5 L',null,null,null,56),
('Mais Sabor','Cremes Premium · caixa 5 L','Nata Goiaba','Consultar valor','Caixa 5 L',null,null,null,57),
('Mais Sabor','Cremes Premium · caixa 5 L','Oreo','Consultar valor','Caixa 5 L',null,null,null,58),
('Mais Sabor','Cremes Premium · caixa 5 L','Raffaello','Consultar valor','Caixa 5 L',null,null,null,59),
('Mais Sabor','Cremes Premium · caixa 5 L','Stracciatella','Consultar valor','Caixa 5 L',null,null,null,60),
('Mais Sabor','Cremes Premium · caixa 5 L','Ovomaltine','Consultar valor','Caixa 5 L',null,null,null,61),
('Mais Sabor','Cremes Premium · caixa 5 L','Pistache','Consultar valor','Caixa 5 L',null,null,null,62),
('Mais Sabor','Cremes Premium · caixa 5 L','Tapioca','Consultar valor','Caixa 5 L',null,null,null,63),
('Mais Sabor','Cremes Premium · caixa 5 L','Torta de Limão','Consultar valor','Caixa 5 L',null,null,null,64),
('Mais Sabor','Picolés Especial Gourmet','Maracujá','Picolé artesanal',null,null,null,null,65),
('Mais Sabor','Picolés Especial Gourmet','Dois Amores (açaí com leite condensado)','Picolé artesanal de açaí recheado com leite condensado',null,null,null,null,66)) v(forn, linha, nome, descricao, embalagem, emb_qtd, preco, insumo, ordem)
join fornecedores f on f.nome = v.forn
left join insumos i on i.nome = v.insumo
on conflict (fornecedor_id, linha, nome) do nothing;

update insumos set fornecedor = 'Flor de Lis' where nome in ('Sorvete Nutella','Sorvete Chokito','Sorvete Oreo','Sorvete Ouro Branco') and fornecedor is null;
update insumos set fornecedor = 'Mais Sabor' where nome in ('Sorvete Chocolate Branco','Base neutra') and fornecedor is null;


-- Ajustes feitos junto com a migração
update staff set permissoes = permissoes || '{"financeiro": true}' where nome = 'Louhana Abrantes';
update insumos set ativo = true where nome = 'Açaí tradicional';
