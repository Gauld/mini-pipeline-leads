-- ============================================================================
-- Mini pipeline de leads — esquema de base de datos (fuente de verdad)
-- Idempotente: se puede ejecutar en un proyecto Supabase vacío o sobre el existente.
-- Ejecutar en: Supabase Dashboard > SQL Editor.
-- ============================================================================

-- 1. TABLAS ------------------------------------------------------------------

create table if not exists public.lead_statuses (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  slug       text not null,
  position   integer not null,
  color      text default '#6B7280'
);
create unique index if not exists lead_statuses_slug_key on public.lead_statuses (slug);

create table if not exists public.target_oppositions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean default true,
  position   integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  full_name         text not null,
  email             text not null,
  phone             text not null,
  target_opposition text not null,
  status_id         uuid not null
);

create table if not exists public.lead_history (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  lead_id       uuid not null,
  action        text not null,
  performed_by  text not null,
  old_status_id uuid,
  new_status_id uuid
);

-- Contenido EXACTO de los emails enviados (solo eventos de email; null en el resto).
-- Las plantillas son editables: sin esto no se podría saber qué recibió cada lead.
alter table public.lead_history add column if not exists email_subject text;
alter table public.lead_history add column if not exists email_body    text;

-- Columna duplicada y sin uso (el código siempre escribió old_status_id).
-- VERIFICAR ANTES: select count(*) from lead_history where previous_status_id is not null;
alter table public.lead_history drop column if exists previous_status_id;

-- 2. CLAVES FORÁNEAS (solo si faltan) ----------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_status_id_fkey') then
    alter table public.leads
      add constraint leads_status_id_fkey foreign key (status_id) references public.lead_statuses (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_history_lead_id_fkey') then
    alter table public.lead_history
      add constraint lead_history_lead_id_fkey foreign key (lead_id) references public.leads (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_history_old_status_id_fkey') then
    alter table public.lead_history
      add constraint lead_history_old_status_id_fkey foreign key (old_status_id) references public.lead_statuses (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_history_new_status_id_fkey') then
    alter table public.lead_history
      add constraint lead_history_new_status_id_fkey foreign key (new_status_id) references public.lead_statuses (id);
  end if;
end $$;

create index if not exists leads_status_id_idx on public.leads (status_id);
create index if not exists lead_history_lead_created_idx on public.lead_history (lead_id, created_at desc);

-- 3. SEED DE ESTADOS (solo si la tabla está vacía) ---------------------------

insert into public.lead_statuses (name, slug, position, color)
select * from (values
  ('Nuevo',           'nuevo',           1, '#3B82F6'),
  ('Contactado',      'contactado',      2, '#F59E0B'),
  ('En seguimiento',  'en-seguimiento',  3, '#8B5CF6'),
  ('Convertido',      'convertido',      4, '#10B981'),
  ('Perdido',         'perdido',         5, '#EF4444')
) as v (name, slug, position, color)
where not exists (select 1 from public.lead_statuses);

-- 3b. PLANTILLAS DE EMAIL (una por estado). Variables: {{nombre}}, {{oposicion}}.

create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  status_id  uuid not null unique references public.lead_statuses (id) on delete cascade,
  subject    text not null,
  body       text not null,
  updated_at timestamptz not null default now()
);

insert into public.email_templates (status_id, subject, body)
select s.id,
       'Seguimiento de tu preparación — {{oposicion}}',
       E'Hola {{nombre}},\n\nTe escribimos para hacer seguimiento de tu interés en la oposición de {{oposicion}}.\n\nQuedamos atentos a cualquier duda.\n\nUn saludo.'
from public.lead_statuses s
where not exists (select 1 from public.email_templates t where t.status_id = s.id);

-- 3c. CONFIGURACIÓN DE EMAIL (fila única). La contraseña se guarda CIFRADA por la app
--     (AES-256-GCM); la base de datos nunca ve el texto plano.

create table if not exists public.email_settings (
  id                      boolean primary key default true check (id),
  smtp_host               text not null,
  smtp_port               integer not null check (smtp_port between 1 and 65535),
  smtp_user               text not null,
  smtp_password_encrypted text not null,
  from_address            text,
  from_name               text,
  updated_at              timestamptz not null default now(),
  updated_by              text
);

-- Modo simulación: true = los correos se registran como enviados pero NO se envían.
-- Sin fila (o sin cuenta en el entorno) la app simula siempre. Ver src/lib/email/settings.ts.
alter table public.email_settings add column if not exists simulate_sending boolean not null default false;

-- 3d. AUTOMATIZACIÓN: email de bienvenida al registrarse un lead -------------
--     null = pendiente; lo marca el "sistema" (service_role) desde la ruta
--     /api/automation/lead-created.

alter table public.leads add column if not exists welcome_email_sent_at timestamptz;

create extension if not exists pg_net with schema extensions;

-- Configuración del webhook. Schema "private": no expuesto por la API (PostgREST).
create schema if not exists private;

create table if not exists private.automation_config (
  id          boolean primary key default true check (id),
  webhook_url text not null,   -- p. ej. https://TU-APP.vercel.app/api/automation/lead-created
  secret      text not null    -- mismo valor que AUTOMATION_SECRET en Vercel
);
revoke all on schema private from public, anon, authenticated;
revoke all on private.automation_config from public, anon, authenticated;

-- Tras desplegar, ejecutar UNA vez (NO versionar el secreto):
--   insert into private.automation_config (webhook_url, secret)
--   values ('https://TU-APP.vercel.app/api/automation/lead-created', 'EL_MISMO_AUTOMATION_SECRET')
--   on conflict (id) do update set webhook_url = excluded.webhook_url, secret = excluded.secret;

create or replace function public.notify_lead_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg private.automation_config%rowtype;
begin
  select * into cfg from private.automation_config limit 1;
  if not found then
    return new;   -- sin configurar (p. ej. desarrollo local): no se envía nada
  end if;

  perform net.http_post(
    url                  := cfg.webhook_url,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-automation-secret', cfg.secret),
    body                 := jsonb_build_object('lead_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- El registro del lead NUNCA debe fallar por la automatización.
  raise warning 'notify_lead_created: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_lead_created() from public, anon, authenticated;

drop trigger if exists trg_lead_welcome_email on public.leads;
create trigger trg_lead_welcome_email
  after insert on public.leads
  for each row execute function public.notify_lead_created();

-- 3e. ANTIABUSO DEL FORMULARIO PÚBLICO ---------------

-- Un email = un lead. Un reenvío no crea otro lead ni otro correo de bienvenida.
-- Si ya hay duplicados no se crea el índice (hay que depurarlos a mano antes).
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'leads_email_lower_key') then
    null;
  elsif exists (select 1 from public.leads group by lower(email) having count(*) > 1) then
    raise notice 'leads_email_lower_key NO creado: hay emails duplicados. Depúralos y vuelve a ejecutar.';
  else
    create unique index leads_email_lower_key on public.leads (lower(email));
  end if;
end $$;

-- Validación en la base: defensa en profundidad para quien llegue a
-- PostgREST con la anon key sin pasar por la app. NOT VALID = solo se aplica a filas nuevas
-- (no falla si ya existen datos antiguos que no cumplen).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_full_name_check') then
    alter table public.leads add constraint leads_full_name_check
      check (char_length(full_name) between 2 and 120 and full_name !~ '[[:cntrl:]<>]') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_email_check') then
    alter table public.leads add constraint leads_email_check
      check (char_length(email) <= 254 and email ~ '^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_phone_check') then
    alter table public.leads add constraint leads_phone_check
      check (phone ~ '^\+?[0-9 ()-]{7,20}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_target_opposition_check') then
    alter table public.leads add constraint leads_target_opposition_check
      check (char_length(target_opposition) between 1 and 150 and target_opposition !~ '[[:cntrl:]<>]') not valid;
  end if;
end $$;

-- Valida las filas existentes. Con datos limpios (o tabla vacía) quedan VALIDADOS; si hay
-- filas antiguas que no cumplen, solo avisa y el constraint sigue activo para filas nuevas.
do $$
declare c text;
begin
  foreach c in array array['leads_full_name_check', 'leads_email_check', 'leads_phone_check', 'leads_target_opposition_check']
  loop
    begin
      execute format('alter table public.leads validate constraint %I', c);
    exception when check_violation then
      raise notice '% no validado: hay filas antiguas que no lo cumplen.', c;
    end;
  end loop;
end $$;

-- Contadores de rate limit. Las claves son hashes con sal (nunca IP ni email en claro).
create table if not exists private.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on private.rate_limits (window_start);
revoke all on private.rate_limits from public, anon, authenticated;

-- Cuenta un intento y devuelve true si sigue dentro del límite (ventana fija).
-- SOLO service_role: si anon pudiera llamarla, consumiría contadores ajenos (DoS).
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_key is null or p_max < 1 or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Limpieza oportunista (~1 % de las llamadas): filas de más de 2 días.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- 3f. CONSENTIMIENTO -------------------------------------
--     consent_privacy_at   : cuándo aceptó la política de privacidad (obligatorio).
--     consent_marketing    : aceptó comunicaciones comerciales (opcional, false por defecto).
--     consent_at           : cuándo dio el consentimiento comercial.
--     consent_text_version : versión del texto legal mostrado (src/lib/leads/consent.ts).

alter table public.leads add column if not exists consent_privacy_at   timestamptz;
alter table public.leads add column if not exists consent_marketing    boolean not null default false;
alter table public.leads add column if not exists consent_at           timestamptz;
alter table public.leads add column if not exists consent_text_version text;

do $$
declare c text;
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_consent_privacy_check') then
    alter table public.leads add constraint leads_consent_privacy_check
      check (consent_privacy_at is not null and consent_text_version is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_consent_marketing_check') then
    alter table public.leads add constraint leads_consent_marketing_check
      check (not consent_marketing or consent_at is not null) not valid;
  end if;

  -- Valida las filas existentes; con filas antiguas (sin consentimiento) solo avisa.
  foreach c in array array['leads_consent_privacy_check', 'leads_consent_marketing_check']
  loop
    begin
      execute format('alter table public.leads validate constraint %I', c);
    exception when check_violation then
      raise notice '% no validado: hay filas antiguas sin consentimiento registrado.', c;
    end;
  end loop;
end $$;

-- 4. HISTORIAL POR TRIGGER (atómico, no se puede saltear desde el cliente) ---

create or replace function public.log_lead_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_history (lead_id, action, performed_by, new_status_id)
  values (new.id, 'Lead registrado en el formulario público', 'Sistema (Formulario Público)', new.status_id);
  return new;
end;
$$;

create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_history (lead_id, action, performed_by, old_status_id, new_status_id)
  values (
    new.id,
    'Actualización de estado',
    coalesce(auth.jwt() ->> 'email', 'Sistema'),
    old.status_id,
    new.status_id
  );
  return new;
end;
$$;

-- Registro del email de seguimiento. Solo admins autenticados; quién lo hizo sale del JWT.
drop function if exists public.log_followup_email(uuid);
drop function if exists public.log_followup_email(uuid, text);
drop function if exists public.log_followup_email(uuid, text, text);

create or replace function public.log_followup_email(
  p_lead_id uuid,
  p_subject text default null,
  p_body    text default null,
  p_error   text default null  -- si viene, el envío FALLÓ: se registra como no enviado, con el error
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  insert into public.lead_history (lead_id, action, performed_by, email_subject, email_body)
  values (
    p_lead_id,
    case
      when nullif(trim(p_error), '') is not null then
        'Email de seguimiento NO enviado: ' || left(coalesce(nullif(trim(p_subject), ''), '(sin asunto)'), 200)
          || ' — ' || left(trim(p_error), 300)
      when nullif(trim(p_subject), '') is null then 'Email de seguimiento enviado'
      else 'Email de seguimiento enviado: ' || left(trim(p_subject), 200)
    end,
    coalesce(auth.jwt() ->> 'email', 'Sistema'),
    p_subject,
    p_body
  );
end;
$$;

drop trigger if exists trg_lead_created on public.leads;
create trigger trg_lead_created
  after insert on public.leads
  for each row execute function public.log_lead_created();

drop trigger if exists trg_lead_status_change on public.leads;
create trigger trg_lead_status_change
  after update of status_id on public.leads
  for each row
  when (old.status_id is distinct from new.status_id)
  execute function public.log_lead_status_change();

-- 4b. REGISTRO DE ERRORES --------------------------------
--     Lo escribe el servidor con service_role (src/lib/logging/log-error.ts).
--     RLS activado SIN políticas y sin grants: anon y authenticated no leen ni escriben.
--     El contexto llega redactado (sin email, teléfono, nombre ni secretos).
create table if not exists public.error_logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source     text        not null,
  message    text        not null,
  code       text,
  stack      text,
  context    jsonb       not null default '{}'::jsonb
);
create index if not exists error_logs_created_idx on public.error_logs (created_at desc);
create index if not exists error_logs_source_idx  on public.error_logs (source, created_at desc);

alter table public.error_logs enable row level security;
revoke all on public.error_logs from public, anon, authenticated;
grant insert, select, delete on public.error_logs to service_role;

-- 5. SEGURIDAD: RLS + GRANTS (mínimo privilegio) -----------------------------

alter table public.lead_statuses      enable row level security;
alter table public.target_oppositions enable row level security;
alter table public.leads              enable row level security;
alter table public.lead_history       enable row level security;
alter table public.email_templates    enable row level security;
alter table public.email_settings     enable row level security;

-- Elimina TODAS las políticas previas (había duplicadas y permisivas).
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('lead_statuses', 'target_oppositions', 'leads', 'lead_history', 'email_templates', 'email_settings')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Catálogos: lectura para todos, escritura solo desde el dashboard de Supabase.
create policy lead_statuses_select on public.lead_statuses
  for select to anon, authenticated using (true);

create policy target_oppositions_select on public.target_oppositions
  for select to anon, authenticated using (is_active);

-- Leads: el público solo puede INSERTAR, y siempre en el estado inicial.
create policy leads_insert_public on public.leads
  for insert to anon, authenticated
  with check (status_id = (select id from public.lead_statuses where position = 1 limit 1));

create policy leads_select_admin on public.leads
  for select to authenticated using (true);

create policy leads_update_admin on public.leads
  for update to authenticated using (true) with check (true);

-- Historial: solo lectura para admins. Las escrituras las hacen los triggers.
create policy lead_history_select_admin on public.lead_history
  for select to authenticated using (true);

-- Plantillas: solo admins. Una por estado (UNIQUE); se guardan con upsert.
create policy email_templates_select_admin on public.email_templates
  for select to authenticated using (true);

create policy email_templates_insert_admin on public.email_templates
  for insert to authenticated with check (true);

create policy email_templates_update_admin on public.email_templates
  for update to authenticated using (true) with check (true);

-- Configuración de email: solo admins; anon no toca nada. Contenido sensible cifrado.
create policy email_settings_select_admin on public.email_settings
  for select to authenticated using (true);

create policy email_settings_insert_admin on public.email_settings
  for insert to authenticated with check (true);

create policy email_settings_update_admin on public.email_settings
  for update to authenticated using (true) with check (true);

-- Privilegios a nivel de tabla/columna (defensa en profundidad sobre RLS).
revoke all on public.lead_statuses, public.target_oppositions, public.leads, public.lead_history,
  public.email_templates, public.email_settings
  from anon, authenticated;

grant select, insert, update on public.email_settings to authenticated;

-- UPDATE a nivel de tabla (no por columna): el upsert (ON CONFLICT DO UPDATE) también
-- reasigna status_id y Postgres exige privilegio sobre cada columna del SET.
grant select, insert, update on public.email_templates to authenticated;

grant select on public.lead_statuses, public.target_oppositions to anon, authenticated;
grant insert on public.leads to anon, authenticated;
grant select on public.leads to authenticated;
grant update (status_id) on public.leads to authenticated;   -- solo se puede cambiar el estado
grant select on public.lead_history to authenticated;

-- La RPC de seguimiento es solo para admins (por defecto las funciones son ejecutables por PUBLIC).
revoke all on function public.log_followup_email(uuid, text, text, text) from public, anon;
grant execute on function public.log_followup_email(uuid, text, text, text) to authenticated;

-- 6. Recarga la caché de esquema de PostgREST para que la API vea las funciones nuevas.
notify pgrst, 'reload schema';
