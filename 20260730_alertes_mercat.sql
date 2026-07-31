-- ════════════════════════════════════════════════════════════════════
-- TBI · Sistema d'alertes de caiguda de mercat · v2 (enviament automàtic)
-- Migració idempotent. Aplicar amb apply_migration (no execute_sql).
--
-- Canvi respecte v1: no hi ha revisió humana per alerta. El text s'escriu
-- UN COP a alertes_plantilles i el sistema l'envia sol. A canvi, hi ha
-- límits durs (alertes_config) que substitueixen el control humà.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Benchmarks seguits ──────────────────────────────────────────
create table if not exists public.benchmarks (
  codi        text primary key,
  nom         text not null,
  ticker      text not null,                    -- símbol Yahoo Finance
  divisa      text not null default 'EUR',
  familia     text not null default 'rv',       -- rv | rf | or | crypto → tria de plantilla
  cats        text[] not null default '{}',     -- ids de ACTIUS_TAXONOMY que hi mapegen
  llindars    int[]  not null default '{5,10,15,20,30,40}',
  actiu       boolean not null default true,
  ordre       int not null default 0,
  ultim_error text,
  creat_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='benchmarks' and column_name='familia') then
    alter table public.benchmarks add column familia text not null default 'rv';
  end if;
end $$;

-- ─── 2. Sèrie de preus ──────────────────────────────────────────────
create table if not exists public.benchmark_preus (
  codi       text not null references public.benchmarks(codi) on delete cascade,
  data       date not null,
  tancament  numeric not null,
  primary key (codi, data)
);
create index if not exists benchmark_preus_codi_data_idx
  on public.benchmark_preus (codi, data desc);

-- ─── 3. Estat de drawdown ───────────────────────────────────────────
create table if not exists public.benchmark_estat (
  codi            text primary key references public.benchmarks(codi) on delete cascade,
  pic             numeric,
  pic_data        date,
  ultim           numeric,
  ultim_data      date,
  drawdown        numeric,                    -- negatiu: -0.1234 = -12,34%
  llindar_actiu   int not null default 0,     -- latch: darrer llindar disparat
  episodi_id      uuid,
  actualitzat_at  timestamptz not null default now()
);

-- ─── 4. Plantilles de missatge ──────────────────────────────────────
-- Aquí viu la redacció. S'escriu un cop i el sistema la fa servir sense
-- demanar permís. Editable des de l'admin sense redesplegar res.
create table if not exists public.alertes_plantilles (
  familia     text not null,          -- rv | rf | or | crypto
  llindar     int  not null,
  etiqueta    text not null,
  titol       text not null,          -- admet {benchmark} i {dd}
  context     text not null,
  prioritats  jsonb not null default '[]'::jsonb,
  no_fer      jsonb not null default '[]'::jsonb,
  actualitzat_at timestamptz not null default now(),
  primary key (familia, llindar)
);

-- ─── 5. Esdeveniments d'alerta ──────────────────────────────────────
create table if not exists public.alertes_mercat (
  id             uuid primary key default gen_random_uuid(),
  codi           text not null references public.benchmarks(codi),
  episodi_id     uuid not null,
  llindar        int  not null,
  drawdown       numeric not null,
  pic            numeric,
  pic_data       date,
  preu           numeric,
  preu_data      date,
  estat          text not null default 'pendent',
                 -- pendent | enviada | bloquejada | descartada
  titol          text,
  context        text,
  motius         text,     -- opcional: comentari afegit per l'assessor a posteriori
  creada_at      timestamptz not null default now(),
  enviada_at     timestamptz,
  bloqueig_motiu text,
  constraint alertes_mercat_estat_chk
    check (estat in ('pendent','enviada','bloquejada','descartada')),
  constraint alertes_mercat_episodi_llindar_uniq
    unique (episodi_id, llindar)
);
create index if not exists alertes_mercat_estat_idx
  on public.alertes_mercat (estat, creada_at desc);

-- ─── 6. Registre d'enviaments (rastre d'auditoria) ──────────────────
create table if not exists public.alertes_enviaments (
  id             bigserial primary key,
  alerta_id      uuid not null references public.alertes_mercat(id) on delete cascade,
  client_email   text not null,
  canal          text not null,             -- push | email
  estat          text not null,             -- ok | error | omes
  exposicio_eur  numeric,
  exposicio_pct  numeric,
  impacte_eur    numeric,
  detall         text,
  enviat_at      timestamptz not null default now(),
  constraint alertes_enviaments_canal_chk check (canal in ('push','email')),
  constraint alertes_enviaments_uniq unique (alerta_id, client_email, canal)
);
create index if not exists alertes_enviaments_client_idx
  on public.alertes_enviaments (client_email, enviat_at desc);

-- ─── 7. Límits de seguretat ─────────────────────────────────────────
-- Sense revisió humana per alerta, aquests límits són l'únic fre. Una
-- setmana nerviosa pot creuar tres llindars en cinc dies.
create table if not exists public.alertes_config (
  id                  int primary key default 1,
  pausa_global        boolean not null default false,
  max_mes_per_client  int not null default 2,
  min_exposicio_eur   numeric not null default 500,
  min_exposicio_pct   numeric not null default 0.05,
  hores_entre_alertes int not null default 20,
  constraint alertes_config_una_fila check (id = 1)
);
insert into public.alertes_config (id) values (1) on conflict (id) do nothing;

-- ─── 8. Preferència del client ──────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='clients'
                   and column_name='notify_alertes_mercat') then
    alter table public.clients add column notify_alertes_mercat boolean not null default true;
  end if;
end $$;

-- El llindar mínim i la reserva d'oportunitat viuen a
-- clients.fullderuta.protocol (secció 09 del Full de Ruta), que és el que
-- el client signa. No es dupliquen en columnes pròpies.

-- ─── 9. Seed dels benchmarks ────────────────────────────────────────
-- ⚠️ VERIFICAR ELS TICKERS: invocar amb {"accio":"verificar"}
insert into public.benchmarks (codi, nom, ticker, familia, cats, llindars, ordre) values
  ('rv_global',   'Renda variable global',       'EUNL.DE', 'rv',
     '{rv_global,rv_dividend,altres}',                '{5,10,15,20,30,40}', 10),
  ('rv_growth',   'RV creixement / tecnologia',  'SXRV.DE', 'rv',
     '{rv_growth,rv_tematica}',                       '{5,10,15,20,30,40}', 20),
  ('rv_emergent', 'RV mercats emergents',        'IS3N.DE', 'rv',
     '{rv_emergent}',                                 '{5,10,15,20,30,40}', 30),
  ('rv_reits',    'Immobiliari cotitzat (REITs)','IQQ6.DE', 'rv',
     '{rv_reits,reits}',                              '{5,10,15,20,30,40}', 40),
  ('rf_gov',      'Renda fixa governamental',    'EUNH.DE', 'rf',
     '{rf_gov_llarg,rf_gov_curt,rf_gov,rf_monetari}', '{3,5,8,12}',         50),
  ('rf_corp',     'Renda fixa corporativa IG',   'EUN5.DE', 'rf',
     '{rf_corp}',                                     '{3,5,8,12}',         60),
  ('or_metalls',  'Or i metalls preciosos',      '4GLD.DE', 'or',
     '{or_metalls}',                                  '{10,20,30}',         70),
  ('crypto',      'Actius digitals',             'BTC-EUR', 'crypto',
     '{crypto}',                                      '{20,30,50,70}',      80)
on conflict (codi) do nothing;

-- ─── 10. Seed de les plantilles ─────────────────────────────────────
insert into public.alertes_plantilles (familia, llindar, etiqueta, titol, context, prioritats, no_fer) values

-- ══ Renda variable ══
('rv', 5, 'Soroll de mercat',
 '{benchmark}: {dd} des del pic',
 'Una caiguda d''aquesta mida passa tres o quatre vegades l''any. No diu res sobre el que farà el mercat després.',
 '["Cap acció. Aquest avís existeix perquè, quan el vegis, no t''ho hagis de preguntar."]'::jsonb,
 '[]'::jsonb),

('rv', 10, 'Correcció',
 '{benchmark} entra en correcció: {dd}',
 'Les caigudes del 10% arriben cada un o dos anys. La majoria no arriben a mercat baixista: des del 1974 s''han comptat 27 correccions i només 6 van superar el −20%.',
 '["La teva aportació programada no es toca. Aportar en caiguda no és valentia: és no fer res.","Comprova les bandes de rebalanceig del teu Full de Ruta. A aquest nivell, sovint encara no cal moure res."]'::jsonb,
 '["Vendre","Aturar aportacions","Mirar la cartera cada dia"]'::jsonb),

('rv', 15, 'Fora de banda',
 '{benchmark}: {dd}, toca revisar les bandes',
 'A partir d''aquí el rebalanceig sol ser necessari: la caiguda ja ha mogut prou els pesos com per sortir de les bandes acordades.',
 '["Revisa el pes de cada família contra el teu objectiu. Rebalancejar en caiguda ja et fa comprar barat sense cap decisió discrecional.","Fons d''emergència intacte? Si ho està, aquesta caiguda no et pot obligar a vendre. Aquesta és tota la diferència entre patir una caiguda i que t''arruïni."]'::jsonb,
 '["Vendre","Aturar aportacions"]'::jsonb),

('rv', 20, 'Mercat baixista',
 '{benchmark} entra en mercat baixista: {dd}',
 'Els mercats baixistes arriben cada quatre o sis anys. La caiguda mitjana total ronda el −35% i la recuperació, uns dos anys; els de 2020 i 2022 van ser força més curts.',
 '["Rebalanceig segons les bandes acordades, i el tram corresponent de la teva reserva si en tens.","Ningú sap si el terra és aquí. Cada caiguda del −40% va passar pel −20% i semblava idèntica a una que es va aturar. Per això les compres van per trams i per regla escrita: per no dependre d''endevinar el terra."]'::jsonb,
 '["Vendre","Aturar aportacions","Canviar l''estratègia enmig de la caiguda"]'::jsonb),

('rv', 30, 'Caiguda severa',
 '{benchmark}: {dd}, territori 2008 / 2020',
 'Caigudes d''aquesta magnitud arriben aproximadament un cop per dècada. Les dues últimes van acabar amb màxims històrics posteriors, però la de 2008 va trigar cinc anys i la de 2020, cinc mesos.',
 '["Trams finals de la reserva d''oportunitat, segons el teu pla.","Val la pena revisar si et convé aflorar pèrdues per compensar guanys a la declaració. Compte amb la regla dels dos mesos de recompra de valors homogenis: parlem-ho abans de fer res.","Revisar el pla amb calma no és abandonar-lo."]'::jsonb,
 '["Vendre per pànic","Aturar aportacions","Abandonar el pla"]'::jsonb),

('rv', 40, 'Caiguda extrema',
 '{benchmark}: {dd}',
 'Aquest és el pitjor escenari que contempla la teva planificació. Les caigudes de 2000-2002 i 2007-2009 van arribar fins aquí i totes dues es van recuperar del tot.',
 '["Si el teu pla té reserva, ja hauria d''estar desplegada o a punt d''estar-ho.","La decisió que importa ara la vas prendre fa temps: no vendre.","Escriu-me. En aquest punt val més una conversa que un correu."]'::jsonb,
 '["Vendre per pànic","Abandonar el pla"]'::jsonb),

-- ══ Renda fixa ══
('rf', 3, 'Moviment de tipus',
 '{benchmark}: {dd} des del pic',
 'La renda fixa cau quan pugen els tipus d''interès. És mecànic i no vol dir que els emissors tinguin cap problema.',
 '["Cap acció. El cupó dels bons nous ha pujat."]'::jsonb,
 '[]'::jsonb),

('rf', 5, 'Pujada de tipus',
 '{benchmark}: {dd}',
 'Una caiguda de la renda fixa sol ser una pujada de tipus. El rendiment futur esperat de la teva cartera de bons ha pujat, no baixat: els que compris a partir d''ara renden més.',
 '["L''aportació programada no es toca.","Comprova les bandes de rebalanceig al teu Full de Ruta."]'::jsonb,
 '["Vendre bons per por"]'::jsonb),

('rf', 8, 'Correcció de renda fixa',
 '{benchmark}: {dd}',
 'Caigudes de renda fixa d''aquesta mida són poc freqüents. El 2022 en va ser l''exemple recent: dolorós mentre passava, i va deixar la renda fixa més atractiva del que havia estat en una dècada.',
 '["La funció de la renda fixa a la teva cartera no és guanyar diners, és reduir la volatilitat del conjunt. Segueix fent-la.","Rebalanceig segons les bandes acordades."]'::jsonb,
 '["Vendre bons per por","Substituir renda fixa per liquiditat"]'::jsonb),

('rf', 12, 'Caiguda severa de renda fixa',
 '{benchmark}: {dd}',
 'Territori de 2022, el pitjor any de renda fixa en dècades. La contrapartida: el rendiment a venciment de la cartera ha pujat molt, i això és rendiment futur ja assegurat si es manté fins al venciment.',
 '["Rebalanceig segons les bandes acordades.","Si vols entendre què significa per al teu pla, aquest és bon moment per parlar-ne."]'::jsonb,
 '["Vendre bons per por"]'::jsonb),

-- ══ Or ══
('or', 10, 'Correcció de l''or',
 'Or: {dd} des del pic',
 'L''or té caigudes llargues i profundes; no és l''actiu estable que sovint s''explica. La seva funció a la cartera és descorrelacionar, no protegir mes a mes.',
 '["Cap acció."]'::jsonb, '[]'::jsonb),

('or', 20, 'Caiguda de l''or',
 'Or: {dd} des del pic',
 'L''or va passar de 1.900 $ el 2011 a 1.050 $ el 2015 i va trigar nou anys a recuperar-se. És un actiu de posició petita i horitzó llarg, per disseny.',
 '["Rebalanceig segons les bandes acordades, si la posició ha sortit de banda."]'::jsonb,
 '["Vendre per por","Augmentar la posició per damunt del pes objectiu"]'::jsonb),

('or', 30, 'Caiguda severa de l''or',
 'Or: {dd} des del pic',
 'Caigudes d''aquesta mida han passat abans i han trigat anys a recuperar-se. Si la posició és petita, com hauria de ser, l''impacte sobre el conjunt és limitat.',
 '["Revisa el pes de la posició. Res més."]'::jsonb,
 '["Vendre per por"]'::jsonb),

-- ══ Crypto ══
('crypto', 20, 'Caiguda en actius digitals',
 'Actius digitals: {dd} des del pic',
 'Caigudes del 20% en crypto passen diverses vegades l''any. La volatilitat no és un accident d''aquest actiu: és la seva característica principal.',
 '["La teva posició és petita per disseny. El teu pla ja assumia caigudes d''aquesta magnitud.","Cap acció. Aquí no hi ha rebalanceig cap a dins ni desplegament de reserva."]'::jsonb,
 '[]'::jsonb),

('crypto', 30, 'Caiguda en actius digitals',
 'Actius digitals: {dd} des del pic',
 'Bitcoin ha caigut més d''un 30% desenes de vegades des del 2010, i més d''un 70% en quatre ocasions. Cap d''aquestes caigudes era distingible de les altres mentre passava.',
 '["La posició és petita per disseny i no es rescata.","Cap acció."]'::jsonb,
 '["Vendre en pànic","Augmentar la posició per recuperar"]'::jsonb),

('crypto', 50, 'Caiguda profunda en actius digitals',
 'Actius digitals: {dd} des del pic',
 'Territori de cicle baixista de crypto. Els anteriors (2014, 2018, 2022) van durar entre un i dos anys abans de tocar fons.',
 '["La posició és petita per disseny. Si la seva caiguda et treu la son, la posició era massa gran: en parlem quan hagi passat, no ara."]'::jsonb,
 '["Vendre en pànic","Augmentar la posició per recuperar"]'::jsonb),

('crypto', 70, 'Caiguda extrema en actius digitals',
 'Actius digitals: {dd} des del pic',
 'Aquest nivell s''ha assolit quatre vegades des del 2010. En tots els casos anteriors va acabar recuperant-se, però això no garanteix res: aquest actiu no té cap valoració fonamental que posi un terra.',
 '["Aquesta és exactament la magnitud de pèrdua que vas assumir com a possible quan vas dimensionar la posició.","Escriu-me si vols revisar-ho."]'::jsonb,
 '["Vendre en pànic","Augmentar la posició per recuperar"]'::jsonb)

on conflict (familia, llindar) do nothing;

-- ─── 11. RLS ────────────────────────────────────────────────────────
alter table public.benchmarks         enable row level security;
alter table public.benchmark_preus    enable row level security;
alter table public.benchmark_estat    enable row level security;
alter table public.alertes_plantilles enable row level security;
alter table public.alertes_mercat     enable row level security;
alter table public.alertes_enviaments enable row level security;
alter table public.alertes_config     enable row level security;

drop policy if exists benchmarks_read on public.benchmarks;
create policy benchmarks_read on public.benchmarks
  for select to authenticated using (true);

drop policy if exists benchmark_preus_read on public.benchmark_preus;
create policy benchmark_preus_read on public.benchmark_preus
  for select to authenticated using (true);

drop policy if exists benchmark_estat_read on public.benchmark_estat;
create policy benchmark_estat_read on public.benchmark_estat
  for select to authenticated using (true);

drop policy if exists alertes_plantilles_admin on public.alertes_plantilles;
create policy alertes_plantilles_admin on public.alertes_plantilles
  for all to authenticated
  using (public.is_tbi_admin()) with check (public.is_tbi_admin());

drop policy if exists alertes_config_admin on public.alertes_config;
create policy alertes_config_admin on public.alertes_config
  for all to authenticated
  using (public.is_tbi_admin()) with check (public.is_tbi_admin());

drop policy if exists alertes_mercat_read on public.alertes_mercat;
create policy alertes_mercat_read on public.alertes_mercat
  for select to authenticated
  using (estat = 'enviada' or public.is_tbi_admin());

drop policy if exists alertes_mercat_admin on public.alertes_mercat;
create policy alertes_mercat_admin on public.alertes_mercat
  for all to authenticated
  using (public.is_tbi_admin()) with check (public.is_tbi_admin());

drop policy if exists alertes_enviaments_read on public.alertes_enviaments;
create policy alertes_enviaments_read on public.alertes_enviaments
  for select to authenticated
  using (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email',''))
         or public.is_tbi_admin());

-- L'escriptura de benchmarks/preus/estat/alertes/enviaments va per service role.

-- ─── 12. Vistes per a l'admin ───────────────────────────────────────
create or replace view public.v_benchmark_drawdown
with (security_invoker = true) as
select b.codi, b.nom, b.ticker, b.familia, b.actiu, b.ordre, b.llindars, b.ultim_error,
       e.pic, e.pic_data, e.ultim, e.ultim_data,
       round(e.drawdown * 100, 2) as drawdown_pct,
       e.llindar_actiu, e.episodi_id, e.actualitzat_at
from public.benchmarks b
left join public.benchmark_estat e on e.codi = b.codi
order by b.ordre;

create or replace view public.v_alertes_resum
with (security_invoker = true) as
select a.id, a.codi, b.nom as benchmark, a.llindar,
       round(a.drawdown * 100, 2) as drawdown_pct,
       a.estat, a.bloqueig_motiu, a.titol, a.creada_at, a.enviada_at,
       count(*) filter (where e.canal = 'email' and e.estat = 'ok') as emails_ok,
       count(*) filter (where e.canal = 'push'  and e.estat = 'ok') as push_ok,
       count(*) filter (where e.estat = 'error')                    as errors,
       count(*) filter (where e.canal = 'email' and e.estat = 'omes') as omesos
from public.alertes_mercat a
join public.benchmarks b on b.codi = a.codi
left join public.alertes_enviaments e on e.alerta_id = a.id
group by a.id, b.nom
order by a.creada_at desc;
