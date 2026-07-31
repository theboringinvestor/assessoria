# Desplegament · alertes de mercat

## Ordre

```
1. apply_migration  ←  supabase/migrations/20260730_alertes_mercat.sql
2. supabase secrets set TBI_CRON_TOKEN=<random 32 chars>
3. supabase functions deploy alertes-mercat-detectar --no-verify-jwt
4. supabase functions deploy alertes-mercat-enviar   --no-verify-jwt
5. supabase functions deploy enviar-push             (redesplegar: línia nova)
6. git push  →  platform.html a GitHub Pages
7. VERIFICAR TICKERS  (obligatori)
8. Backfill de 5 anys
9. Protocol signat almenys per un client de prova
10. Activar el cron
```

Les dues funcions noves van amb `--no-verify-jwt`: validen elles mateixes
(token de cron o JWT d'admin). Sense el flag, els botons de l'admin fallen.

## 7. Verificar tickers

Admin → **Alertes de mercat** → *Verificar tickers*. Cada índex ha de sortir
sense error a la columna de la taula. Els que fallin: corregeix el `ticker` a
`benchmarks` i torna-hi.

| Codi | Alternatives si falla |
|---|---|
| `rv_global` | `EUNL.DE`, `IWDA.AS`, `VWCE.DE`, `SWRD.MI` |
| `rv_growth` | `SXRV.DE`, `CSNDX.MI`, `EQQQ.AS` |
| `rv_emergent` | `IS3N.DE`, `EIMI.MI`, `EMIM.AS` |
| `rv_reits` | `IQQ6.DE`, `IPRP.AS` |
| `rf_gov` | `EUNH.DE`, `IEGA.MI`, `SEGA.MI` |
| `rf_corp` | `EUN5.DE`, `IEAC.MI` |
| `or_metalls` | `4GLD.DE`, `SGLD.MI`, `IGLN.L` |
| `crypto` | `BTC-EUR` |

## 8. Backfill

**Activa la pausa global abans.** El primer backfill de 5 anys pot detectar
llindars ja creuats i, sense pausa, els enviaria de seguida.

```bash
curl -s -X POST https://nvcmwhzcskihgktltavm.supabase.co/functions/v1/alertes-mercat-detectar \
  -H "x-tbi-token: $TBI_CRON_TOKEN" -H "Content-Type: application/json" \
  -d '{"accio":"backfill"}' | jq '.benchmarks'
```

Comprova a l'admin que els drawdowns quadren amb la realitat. Descarta les
alertes bloquejades que hagi generat i treu la pausa.

## 10. Cron

```sql
select cron.schedule(
  'alertes-mercat-diari',
  '30 6 * * 1-5',                       -- 06:30 UTC ≈ 08:30 CEST, dies feiners
  $$
  select net.http_post(
    url := 'https://nvcmwhzcskihgktltavm.supabase.co/functions/v1/alertes-mercat-detectar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tbi-token', (select decrypted_secret from vault.decrypted_secrets
                      where name = 'TBI_CRON_TOKEN')
    ),
    body := '{"accio":"detectar"}'::jsonb
  );
  $$
);
```

El token cal desar-lo també a Vault (`vault.create_secret`), no només com a
secret de funcions: `pg_net` no hi té accés. Per CLI o SQL editor, no per MCP.

Per treure'l: `select cron.unschedule('alertes-mercat-diari');`

## Prova sense enviar res

```bash
curl -s -X POST .../alertes-mercat-enviar \
  -H "Authorization: Bearer <JWT admin>" -H "Content-Type: application/json" \
  -d '{"alerta_id":"<uuid>","prova":true}' | jq
```

Retorna destinataris amb exposició, pes, impacte i tram de reserva, i la llista
d'omesos amb el motiu de cadascun. Fes-ho abans del primer enviament real.

---

## Ordre de filtres en enviar

Cada client ha de passar-los tots. Si en falla un, queda a `omesos` amb el motiu:

1. `notify_alertes_mercat = true`
2. Protocol de caigudes **actiu** al Full de Ruta
3. Protocol de caigudes **signat** (`signatures.estat = 'signat'`)
4. Llindar de l'alerta ≥ el seu mínim personal
5. Sostre mensual no assolit
6. Exposició ≥ mínim en € **i** en pes

I abans de tot això, tres frens globals: pausa, anti-ràfega, i plantilla
existent per a (família, llindar).

## Què falta

| Peça | On |
|---|---|
| Toggle de client per rebre alertes | `platform.html` → `portal-notificacions`. La columna `notify_alertes_mercat` ja existeix. |
| Vista de l'historial d'alertes al portal del client | Opcional. Ara les alertes viuen al correu i al push. |
