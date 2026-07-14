-- ============================================================================
-- Paediatric Dosing & Dispensing — initial schema
-- ----------------------------------------------------------------------------
-- Design: the TypeScript Zod schema (src/data/schema.ts) stays the source of
-- truth for the rich clinical shapes (discriminated Formulation union, ordered
-- phases[], Ceiling union). Postgres stores QUERYABLE scalar columns (bands,
-- ids, verified flag) alongside VALIDATED JSONB for those nested shapes, so we
-- keep Zod parity and never lose the structure to a lossy relational split.
-- The app re-parses JSONB with Zod after every fetch — Postgres is storage,
-- Zod is the gate.
--
-- Safety invariants mirrored from the app's data loader (src/data/index.ts):
--   * a rule's provenance reference must equal its own reference (CHECK)
--   * a rule may NOT be attributed to a `licensed` reference (trigger)
--   * clinicians read ONLY verified rules; drafts are reviewer/admin-only (RLS)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums & shared helpers
-- ----------------------------------------------------------------------------
create type app_role as enum ('nurse', 'doctor', 'pharmacist', 'reviewer', 'admin');

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- references
-- ----------------------------------------------------------------------------
create table refs (
  id                text primary key,
  name              text not null,
  short_name        text not null,
  edition_id        text not null,
  edition_label     text not null,
  preferred         boolean not null default false,
  not_yet_populated boolean not null default false,
  licensed          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table refs is 'Reference sources. `licensed` = proprietary (BNFc/Lexicomp): shown but never populated from copied content.';
create trigger refs_updated before update on refs for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- drugs
-- ----------------------------------------------------------------------------
create table drugs (
  id          text primary key,
  name        text not null,
  synonyms    text[] not null default '{}',
  data_status text not null check (data_status in ('mock_for_ui_testing', 'verified_clinical')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger drugs_updated before update on drugs for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- formulations — kind-specific fields live in `spec` (validated against the
-- Zod Formulation union at the app layer)
-- ----------------------------------------------------------------------------
create table formulations (
  id           text primary key,
  drug_id      text not null references drugs(id) on delete cascade,
  kind         text not null check (kind in ('liquid', 'solid', 'sachet', 'reconstituted_vial')),
  display_name text not null,
  routes       text[] not null,
  spec         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint spec_is_object check (jsonb_typeof(spec) = 'object')
);
create index formulations_drug on formulations(drug_id);
create trigger formulations_updated before update on formulations for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- dosing_rules — scalar columns for SQL filtering; JSONB for phases/ceilings;
-- provenance flattened so `verified` is directly RLS-able.
-- ----------------------------------------------------------------------------
create table dosing_rules (
  id                    text primary key,
  drug_id               text not null references drugs(id) on delete cascade,
  reference_id          text not null references refs(id),
  indication_id         text,
  -- half-open bands [min, max) — nullable = unbounded on that side
  min_kg_incl           numeric,
  max_kg_excl           numeric,
  min_months_incl       numeric,
  max_months_excl       numeric,
  priority              integer not null default 100,
  phases                jsonb not null,            -- Phase[]
  max_single_dose       jsonb,                     -- Ceiling | null
  max_daily_dose        jsonb,                     -- Ceiling | null
  absolute_cap          jsonb,                     -- Ceiling | null
  default_duration_days numeric,
  notes                 text,
  -- provenance
  prov_reference_id     text not null,
  prov_edition_id       text not null,
  prov_citation         text not null,
  verified              boolean not null default false,
  verified_by           text,
  verification_note     text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint phases_is_array check (jsonb_typeof(phases) = 'array' and jsonb_array_length(phases) >= 1),
  -- mirror the loader: a rule's provenance must cite the rule's own reference
  constraint prov_matches_reference check (prov_reference_id = reference_id),
  -- a verified rule must name who verified it (no anonymous clinical sign-off)
  constraint verified_needs_verifier check (verified = false or verified_by is not null)
);
create index dosing_rules_drug on dosing_rules(drug_id);
create index dosing_rules_lookup on dosing_rules(drug_id, reference_id, verified);
create trigger dosing_rules_updated before update on dosing_rules for each row execute function set_updated_at();

-- Guard: never attribute a rule to a licensed (proprietary) reference.
create or replace function forbid_licensed_reference() returns trigger
language plpgsql as $$
declare is_licensed boolean;
begin
  select licensed into is_licensed from refs where id = new.reference_id;
  if is_licensed then
    raise exception 'Rule % attributed to licensed reference % — not permitted', new.id, new.reference_id;
  end if;
  return new;
end;
$$;
create trigger dosing_rules_no_licensed before insert or update on dosing_rules
  for each row execute function forbid_licensed_reference();

-- ----------------------------------------------------------------------------
-- profiles — role + professional registration (gates real clinical use)
-- ----------------------------------------------------------------------------
create table profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  role                  app_role not null default 'nurse',
  registration_number   text,   -- Pharmacy Council / MDC / N&MC number
  registration_body     text,
  registration_verified boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

-- New auth user -> profile row. Registration details come from sign-up metadata.
-- `role` is CLAMPED to clinical roles: a crafted metadata payload can never
-- self-grant 'reviewer'/'admin' (registration_verified also stays false).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, registration_body, registration_number)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when new.raw_user_meta_data ->> 'role' in ('nurse', 'doctor', 'pharmacist')
         then (new.raw_user_meta_data ->> 'role')::app_role
         else 'nurse' end,
    new.raw_user_meta_data ->> 'registration_body',
    new.raw_user_meta_data ->> 'registration_number'
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Role lookup helper (SECURITY DEFINER so RLS policies can call it without
-- recursing into profiles' own policies).
create or replace function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- A user may edit their own name / registration number, but NOT their own role
-- or verification status. Only an admin may change those. This is what makes the
-- self-service `profiles_self_update` policy safe against privilege escalation.
create or replace function guard_profile_privilege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() is distinct from 'admin' then
    if new.role is distinct from old.role
       or new.registration_verified is distinct from old.registration_verified then
      raise exception 'role and registration_verified can only be changed by an admin';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privilege before update on profiles
  for each row execute function guard_profile_privilege();

-- ----------------------------------------------------------------------------
-- calculation_audit — immutable log; NO patient identifiers by design
-- ----------------------------------------------------------------------------
create table calculation_audit (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id),
  drug_id        text,
  reference_id   text,
  rule_id        text,
  weight_kg      numeric,
  age_months     numeric,
  indication_id  text,
  formulation_id text,
  citation       text,
  result         jsonb not null,   -- CalculationResult snapshot
  created_at     timestamptz not null default now()
);
create index calc_audit_user on calculation_audit(user_id, created_at desc);
comment on table calculation_audit is 'Every calculation, for dispute/audit. Stores weight/drug/result only — never patient identifiers.';

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table refs enable row level security;
alter table drugs enable row level security;
alter table formulations enable row level security;
alter table dosing_rules enable row level security;
alter table profiles enable row level security;
alter table calculation_audit enable row level security;

-- References / drugs / formulations: readable by any authenticated user.
create policy refs_read on refs for select to authenticated using (true);
create policy drugs_read on drugs for select to authenticated using (true);
create policy formulations_read on formulations for select to authenticated using (true);

-- Reference catalogue is writable by admins only.
create policy refs_write on refs for all to authenticated
  using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
create policy drugs_write on drugs for all to authenticated
  using (current_app_role() in ('reviewer', 'admin')) with check (current_app_role() in ('reviewer', 'admin'));
create policy formulations_write on formulations for all to authenticated
  using (current_app_role() in ('reviewer', 'admin')) with check (current_app_role() in ('reviewer', 'admin'));

-- Dosing rules: clinicians read ONLY verified rules; reviewers/admins see all
-- (incl. drafts) and are the only ones who can write / flip `verified`.
create policy dosing_rules_read_verified on dosing_rules for select to authenticated
  using (verified = true);
create policy dosing_rules_read_all_reviewers on dosing_rules for select to authenticated
  using (current_app_role() in ('reviewer', 'admin'));
create policy dosing_rules_write on dosing_rules for all to authenticated
  using (current_app_role() in ('reviewer', 'admin')) with check (current_app_role() in ('reviewer', 'admin'));

-- Profiles: a user sees/edits their own; admins see all. Note: role and
-- registration_verified should be locked down further (a user must not
-- self-promote) — enforce via a column-level trigger before production.
create policy profiles_self_read on profiles for select to authenticated
  using (id = auth.uid() or current_app_role() = 'admin');
create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles for all to authenticated
  using (current_app_role() = 'admin') with check (current_app_role() = 'admin');

-- Audit: users append and read their own; admins read all; nobody updates/deletes.
create policy audit_insert_self on calculation_audit for insert to authenticated
  with check (user_id = auth.uid());
create policy audit_read_self on calculation_audit for select to authenticated
  using (user_id = auth.uid() or current_app_role() = 'admin');
