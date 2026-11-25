-- =====================================================================
-- Permissões das tabelas para utilizadores com sessão iniciada.
-- (Os projetos novos do Supabase não dão permissões automáticas.)
-- O acesso continua limitado pelas regras de Row Level Security do script inicial.
-- Quem não tem sessão (anon) não recebe nenhuma permissão.
--
-- Como aplicar: Supabase → SQL Editor → New query → colar → Run. Pode repetir-se.
-- =====================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.documentos to authenticated;
grant select, insert on public.atividade to authenticated;
grant select, update (nome) on public.perfis to authenticated;

grant execute on function public.utilizador_ativo() to authenticated;

revoke all on public.documentos, public.atividade, public.perfis from anon;
