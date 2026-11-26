-- Novas coleções (tabelas da Clothius e futuras): a lista fixa de coleções passa a ser só uma regra de formato.
-- A segurança continua na Row Level Security (só utilizadores ativos leem e escrevem).
alter table public.documentos drop constraint if exists documentos_colecao_check;
alter table public.documentos add constraint documentos_colecao_check check (colecao ~ '^[a-zA-Z]{2,40}$');
