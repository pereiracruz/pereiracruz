-- =====================================================================
-- Cópias de segurança automáticas (semanais), dentro do próprio Supabase — sem custos.
--
-- Todos os domingos às 03:00 (hora de Lisboa no inverno; 04:00 no verão) a base de dados
-- guarda uma cópia de todos os documentos (encomendas, fichas, dados mestre, emails, configuração…)
-- e das últimas 1000 linhas do registo de atividade, na tabela «copias_automaticas».
-- Ficam as 8 cópias mais recentes (cerca de 2 meses); as mais antigas apagam-se sozinhas.
-- Usa o pg_cron, que está incluído no plano gratuito.
--
-- O formato é o mesmo do botão «Descarregar cópia de segurança»: na aplicação, em
-- Cópias de segurança, cada cópia automática pode ser descarregada (para guardar no Drive) ou reposta.
--
-- Atenção: estas cópias ficam no mesmo projeto Supabase. Protegem contra enganos (dados apagados
-- ou estragados), mas não contra perder o projeto. Para isso continua o ficheiro no Google Drive.
--
-- Como aplicar: Supabase → SQL Editor → New query → colar → Run. Pode repetir-se.
-- No fim é logo feita a primeira cópia.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.copias_automaticas (
  id bigint generated always as identity primary key,
  criada_em timestamptz not null default now(),
  registos integer not null,
  tamanho bigint not null default 0, -- bytes, já comprimido
  conteudo jsonb not null
);

create index if not exists copias_automaticas_data_idx on public.copias_automaticas (criada_em desc);

alter table public.copias_automaticas enable row level security;

drop policy if exists "copias: ler" on public.copias_automaticas;
create policy "copias: ler" on public.copias_automaticas
  for select to authenticated using (public.utilizador_ativo());

-- Só se leem a partir da aplicação; criar e apagar é só pela função abaixo.
revoke all on public.copias_automaticas from anon, authenticated;
grant select on public.copias_automaticas to authenticated;

create or replace function public.fazer_copia_automatica(guardar integer default 8)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  agora timestamptz := now();
  n integer;
  novo bigint;
begin
  select count(*) into n from public.documentos;

  insert into public.copias_automaticas (criada_em, registos, conteudo)
  select agora, n, jsonb_build_object(
    'app', 'pereiracruz-fichas',
    'versao', 1,
    'criadaEm', to_char(agora at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'origem', 'cópia automática semanal (Supabase)',
    'colecoes', coalesce((
      select jsonb_object_agg(colecao, lista)
      from (select colecao, jsonb_agg(dados order by id) as lista from public.documentos group by colecao) c
    ), '{}'::jsonb),
    'atividade', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id::text, 'data', a.data, 'acao', a.acao, 'detalhe', a.detalhe) order by a.data desc)
      from (select * from public.atividade order by data desc limit 1000) a
    ), '[]'::jsonb)
  )
  returning id into novo;

  update public.copias_automaticas set tamanho = pg_column_size(conteudo) where id = novo;

  delete from public.copias_automaticas
  where id not in (select id from public.copias_automaticas order by criada_em desc limit greatest(guardar, 1));

  insert into public.atividade (acao, detalhe)
  values ('Cópia de segurança automática', n || ' registos · guardada no servidor');

  return novo;
end $$;

-- A aplicação não chama esta função: corre só pelo agendamento (e no SQL Editor).
revoke all on function public.fazer_copia_automatica(integer) from public, anon, authenticated;

-- Agendamento semanal: domingo às 03:00 UTC. Com o mesmo nome, substitui o anterior.
select cron.schedule('copia-semanal', '0 3 * * 0', $$select public.fazer_copia_automatica()$$);

-- Primeira cópia já
select public.fazer_copia_automatica();
