-- Funções de gatilho não devem ser chamadas pela API.
revoke execute on function cadastrar_dono() from public, anon, authenticated;
revoke execute on function log_price() from public, anon, authenticated;
-- minha_funcao só para quem está logado.
revoke execute on function minha_funcao() from public, anon;
grant execute on function minha_funcao() to authenticated;
-- search_path fixo.
alter function touch() set search_path = public;
