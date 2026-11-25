-- =====================================================================
-- Pereira & Cruz · Fichas de produção e pré-orçamentação
-- Estrutura inicial da base de dados (Supabase / PostgreSQL)
--
-- Como aplicar: Supabase → SQL Editor → New query → colar este ficheiro → Run.
-- Pode correr-se mais do que uma vez (não apaga dados).
-- =====================================================================

-- ---------- Perfis dos utilizadores ----------
-- Um perfil por conta (auth.users). Papéis previstos na Descrição Funcional;
-- por agora há um só utilizador, administrador.
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default 'Admin',
  papel text not null default 'administrador'
    check (papel in ('administrador', 'equipa', 'validador', 'consulta')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Cria o perfil automaticamente quando se cria um utilizador
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', 'Admin'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_utilizador on auth.users;
create trigger ao_criar_utilizador
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Perfis para utilizadores que já existiam antes deste script
insert into public.perfis (id)
select id from auth.users
on conflict (id) do nothing;

-- Utilizador com sessão iniciada e perfil ativo
create or replace function public.utilizador_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo)
$$;

-- ---------- Documentos da aplicação ----------
-- Encomendas (com as fichas), pedidos de orçamento, histórico de preços e dados mestre.
-- Cada registo é um documento JSON identificado por (coleção, id).
create table if not exists public.documentos (
  colecao text not null check (colecao in (
    'encomendas', 'pedidos', 'historico',
    'fornecedores', 'tecidos', 'equivalencias', 'lavagens', 'acessorios',
    'escalas', 'destinatarios', 'precosRef', 'clientes'
  )),
  id text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null,
  primary key (colecao, id)
);

create index if not exists documentos_colecao_idx on public.documentos (colecao);

create or replace function public.marcar_atualizacao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists documentos_atualizacao on public.documentos;
create trigger documentos_atualizacao
  before insert or update on public.documentos
  for each row execute function public.marcar_atualizacao();

-- ---------- Registo de atividade ----------
-- Só se acrescenta: não se altera nem se apaga (consultável pelo administrador).
create table if not exists public.atividade (
  id bigint generated always as identity primary key,
  data timestamptz not null default now(),
  utilizador uuid default auth.uid() references auth.users (id) on delete set null,
  acao text not null,
  detalhe text not null default ''
);

create index if not exists atividade_data_idx on public.atividade (data desc);

-- ---------- Segurança (Row Level Security) ----------
alter table public.perfis enable row level security;
alter table public.documentos enable row level security;
alter table public.atividade enable row level security;

drop policy if exists "perfis: ler" on public.perfis;
create policy "perfis: ler" on public.perfis
  for select to authenticated using (public.utilizador_ativo());

drop policy if exists "perfis: o próprio altera o nome" on public.perfis;
create policy "perfis: o próprio altera o nome" on public.perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "documentos: ler" on public.documentos;
create policy "documentos: ler" on public.documentos
  for select to authenticated using (public.utilizador_ativo());

drop policy if exists "documentos: criar" on public.documentos;
create policy "documentos: criar" on public.documentos
  for insert to authenticated with check (public.utilizador_ativo());

drop policy if exists "documentos: alterar" on public.documentos;
create policy "documentos: alterar" on public.documentos
  for update to authenticated using (public.utilizador_ativo()) with check (public.utilizador_ativo());

drop policy if exists "documentos: apagar" on public.documentos;
create policy "documentos: apagar" on public.documentos
  for delete to authenticated using (public.utilizador_ativo());

drop policy if exists "atividade: ler" on public.atividade;
create policy "atividade: ler" on public.atividade
  for select to authenticated using (public.utilizador_ativo());

drop policy if exists "atividade: registar" on public.atividade;
create policy "atividade: registar" on public.atividade
  for insert to authenticated with check (public.utilizador_ativo() and utilizador = auth.uid());

-- Sem políticas de update/delete na atividade: o registo não se altera.

-- ---------- Ficheiros (tech packs, encomendas, fichas) ----------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "ficheiros: ler" on storage.objects;
create policy "ficheiros: ler" on storage.objects
  for select to authenticated using (bucket_id = 'documentos' and public.utilizador_ativo());

drop policy if exists "ficheiros: carregar" on storage.objects;
create policy "ficheiros: carregar" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos' and public.utilizador_ativo());

drop policy if exists "ficheiros: apagar" on storage.objects;
create policy "ficheiros: apagar" on storage.objects
  for delete to authenticated using (bucket_id = 'documentos' and public.utilizador_ativo());
