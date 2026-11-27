-- =====================================================================
-- Alterações ao mesmo tempo em vários aparelhos (telemóvel e computador)
--
-- 1. Cada documento passa a ter um número de versão, que sobe a cada gravação.
--    A aplicação só grava se a versão for a que leu; se outro aparelho gravou entretanto,
--    junta as duas alterações em vez de apagar a outra.
-- 2. A tabela «documentos» passa a avisar os aparelhos ligados (Supabase Realtime),
--    para o que muda num aparelho aparecer logo nos outros, sem recarregar.
--    Os avisos respeitam a Row Level Security: só chegam a utilizadores ativos.
--
-- Como aplicar: Supabase → SQL Editor → New query → colar → Run. Pode repetir-se.
-- =====================================================================

alter table public.documentos add column if not exists versao bigint not null default 1;

create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.versao := old.versao + 1; -- a versão nunca vem do aparelho
  else
    new.versao := 1;
  end if;
  return new;
end $$;

-- Avisos em tempo real
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documentos'
  ) then
    alter publication supabase_realtime add table public.documentos;
  end if;
end $$;
