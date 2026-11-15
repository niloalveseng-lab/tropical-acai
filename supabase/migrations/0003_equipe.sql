-- Equipe: e-mail visível na lista, dono cadastrado automaticamente e função do usuário logado.
alter table staff add column if not exists email text;

-- Quem se cadastrar com o e-mail do dono vira "dono" automaticamente.
create or replace function cadastrar_dono() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'niloalves03@gmail.com' then
    insert into staff (user_id, nome, role, email) values (new.id, 'Nilo', 'dono', lower(new.email))
    on conflict (user_id) do update set role = 'dono', ativo = true, email = excluded.email;
  end if;
  return new;
end $$;
drop trigger if exists t_cadastrar_dono on auth.users;
create trigger t_cadastrar_dono after insert on auth.users for each row execute function cadastrar_dono();

-- Se o usuário do dono já existir, garante o cadastro agora.
insert into staff (user_id, nome, role, email)
select id, 'Nilo', 'dono', lower(email) from auth.users where lower(email) = 'niloalves03@gmail.com'
on conflict (user_id) do update set role = 'dono', ativo = true, email = excluded.email;

-- Função de quem está logado (null se não for da equipe).
create or replace function minha_funcao() returns staff_role language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and ativo;
$$;
grant execute on function minha_funcao() to authenticated;

-- Equipe pode atualizar pedidos (status), mas só estes campos.
revoke update on orders from authenticated;
grant update (status, motivo_cancelamento, pago, operador, updated_at) on orders to authenticated;

-- Apagar alguém da equipe não apaga o histórico: os pedidos ficam sem operador.
alter table orders drop constraint if exists orders_operador_fkey;
alter table orders add constraint orders_operador_fkey foreign key (operador) references staff(user_id) on delete set null;
alter table cash_sessions drop constraint if exists cash_sessions_fechado_por_fkey;
alter table cash_sessions add constraint cash_sessions_fechado_por_fkey foreign key (fechado_por) references staff(user_id) on delete set null;
