// ════════════════════════════════════════════════════════════════════
// TBI · Edge Function: alertes-mercat-detectar
// Cron diari. Baixa preus, calcula drawdown des del pic, i crea
// esborranys d'alerta quan es creua un llindar nou.
//
// Desplegar amb verify_jwt: false (la crida ve de pg_cron).
// Protegida per capçalera x-tbi-token == Deno.env.get('TBI_CRON_TOKEN').
//
// MODEL AUTOMÀTIC: quan detecta un llindar nou, invoca directament
// alertes-mercat-enviar. No hi ha revisió humana per alerta; el text ve de
// la taula alertes_plantilles i els frens són a alertes_config.
//
// Accions:
//   {"accio":"verificar"}  → només comprova que els tickers responen
//   {"accio":"detectar"}   → cicle complet (per defecte)
//   {"accio":"backfill"}   → força 5 anys d'històric
// ════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_TOKEN   = Deno.env.get('TBI_CRON_TOKEN') ?? '';

const ADMIN_EMAIL  = 'guillem.puig@theboringinvestor.es';
const RECUPERAT = -0.02;   // drawdown per sobre del qual es rearma el latch

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tbi-token',
  'Content-Type': 'application/json',
};

interface Benchmark {
  codi: string; nom: string; ticker: string;
  cats: string[]; llindars: number[]; actiu: boolean;
}

// ─── Yahoo Finance: sèrie de tancaments diaris ──────────────────────
async function baixarPreus(ticker: string, rang: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/`
    + `${encodeURIComponent(ticker)}?range=${rang}&interval=1d`;

  const r = await fetch(url, {
    headers: {
      // Yahoo rebutja peticions sense User-Agent de navegador
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} de Yahoo per ${ticker}`);

  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description || `sense dades per ${ticker}`);

  const ts: number[] = res.timestamp ?? [];
  const closes: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];

  const files: { data: string; tancament: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !isFinite(c)) continue;   // dies sense sessió
    files.push({
      data: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      tancament: Number(c),
    });
  }
  if (!files.length) throw new Error(`sèrie buida per ${ticker}`);
  return files;
}

// ════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (CRON_TOKEN && req.headers.get('x-tbi-token') !== CRON_TOKEN) {
    return new Response(JSON.stringify({ error: 'no autoritzat' }),
      { status: 401, headers: cors });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let accio = 'detectar';
  try { accio = (await req.json())?.accio ?? 'detectar'; } catch { /* cos buit */ }

  const { data: benchmarks, error: errB } = await sb
    .from('benchmarks').select('*').eq('actiu', true).order('ordre');
  if (errB) {
    return new Response(JSON.stringify({ error: errB.message }), { status: 500, headers: cors });
  }

  const resum: any[] = [];
  const alertesNoves: any[] = [];

  for (const b of (benchmarks ?? []) as Benchmark[]) {
    try {
      // ── Mode verificació: només comprovar que el ticker respon ──
      if (accio === 'verificar') {
        const p = await baixarPreus(b.ticker, '5d');
        const ult = p[p.length - 1];
        await sb.from('benchmarks').update({ ultim_error: null }).eq('codi', b.codi);
        resum.push({ codi: b.codi, ticker: b.ticker, ok: true,
                     ultim_tancament: ult.tancament, data: ult.data });
        continue;
      }

      // ── Quant històric cal? ──
      const { count } = await sb.from('benchmark_preus')
        .select('*', { count: 'exact', head: true }).eq('codi', b.codi);
      const rang = (accio === 'backfill' || !count || count < 200) ? '5y' : '3mo';

      const files = await baixarPreus(b.ticker, rang);

      // Upsert per trams (evita payloads enormes al backfill de 5 anys)
      for (let i = 0; i < files.length; i += 500) {
        const tram = files.slice(i, i + 500)
          .map((f) => ({ codi: b.codi, data: f.data, tancament: f.tancament }));
        const { error } = await sb.from('benchmark_preus')
          .upsert(tram, { onConflict: 'codi,data' }).select('codi');
        if (error) throw new Error(`upsert preus: ${error.message}`);
      }

      // ── Pic i drawdown sobre la sèrie desada ──
      const { data: pics } = await sb.from('benchmark_preus')
        .select('data,tancament').eq('codi', b.codi)
        .order('tancament', { ascending: false }).limit(1);
      const { data: ults } = await sb.from('benchmark_preus')
        .select('data,tancament').eq('codi', b.codi)
        .order('data', { ascending: false }).limit(1);

      const pic = pics?.[0], ult = ults?.[0];
      if (!pic || !ult) throw new Error('sense preus desats');

      const drawdown = Number(ult.tancament) / Number(pic.tancament) - 1;

      // ── Estat previ (latch) ──
      const { data: estats } = await sb.from('benchmark_estat')
        .select('*').eq('codi', b.codi).limit(1);
      const prev = estats?.[0];
      const llindarPrev: number = prev?.llindar_actiu ?? 0;
      let episodiId: string | null = prev?.episodi_id ?? null;

      // Llindar més gran assolit per aquest drawdown
      const llindars = [...(b.llindars ?? [])].sort((x, y) => x - y);
      let llindarAra = 0;
      for (const L of llindars) if (drawdown <= -L / 100) llindarAra = L;

      // Recuperació o pic nou → rearmar el latch
      const recuperat = drawdown > RECUPERAT;
      if (recuperat) { llindarAra = 0; episodiId = null; }

      // ── Nous llindars creuats ──
      if (llindarAra > llindarPrev) {
        if (!episodiId) episodiId = crypto.randomUUID();

        // Només el llindar més profund creuat: si el mercat obre amb un −22%
        // des d'un −8%, s'envia l'alerta de −20%, no la de −10% i la de −15%.
        const nous = llindars.filter((L) => L > llindarPrev && L <= llindarAra);
        const aDisparar = nous.length ? [nous[nous.length - 1]] : [];
        for (const L of aDisparar) {
          const { data: ins, error } = await sb.from('alertes_mercat').insert({
            codi: b.codi,
            episodi_id: episodiId,
            llindar: L,
            drawdown,
            pic: pic.tancament, pic_data: pic.data,
            preu: ult.tancament, preu_data: ult.data,
            estat: 'pendent',
          }).select('id,llindar,codi');

          // Duplicat (unique episodi+llindar) = ja existia: no és error
          if (error && !error.message.includes('duplicate')) {
            console.error('[insert alerta]', b.codi, L, error.message);
          } else if (ins?.length) {
            alertesNoves.push(ins[0]);
          }
        }
      }

      await sb.from('benchmark_estat').upsert({
        codi: b.codi,
        pic: pic.tancament, pic_data: pic.data,
        ultim: ult.tancament, ultim_data: ult.data,
        drawdown,
        llindar_actiu: Math.max(llindarAra, recuperat ? 0 : llindarPrev),
        episodi_id: episodiId,
        actualitzat_at: new Date().toISOString(),
      }, { onConflict: 'codi' }).select('codi');

      await sb.from('benchmarks').update({ ultim_error: null }).eq('codi', b.codi);

      resum.push({
        codi: b.codi, ok: true,
        drawdown_pct: Number((drawdown * 100).toFixed(2)),
        llindar_previ: llindarPrev, llindar_ara: llindarAra,
        preus_desats: files.length,
      });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error(`[${b.codi}]`, msg);
      await sb.from('benchmarks')
        .update({ ultim_error: `${new Date().toISOString().slice(0, 16)} · ${msg}` })
        .eq('codi', b.codi);
      resum.push({ codi: b.codi, ticker: b.ticker, ok: false, error: msg });
    }
  }

  // ── Enviament automàtic de cada alerta nova ──
  const enviaments: any[] = [];
  for (const a of alertesNoves) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/alertes-mercat-enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tbi-token': CRON_TOKEN },
        body: JSON.stringify({ alerta_id: a.id }),
      });
      enviaments.push({ alerta_id: a.id, codi: a.codi, llindar: a.llindar, ...(await r.json()) });
    } catch (e) {
      console.error('[enviar]', a.id, e);
      enviaments.push({ alerta_id: a.id, error: (e as Error).message });
    }
  }

  // ── Resum a l'admin (informatiu, ja s'ha enviat tot) ──
  const errors = resum.filter((r) => r.ok === false);
  if (enviaments.length > 0 || errors.length > 0) {
    const parts: string[] = [];
    for (const e of enviaments) {
      parts.push(`${e.codi} −${e.llindar}%: ${e.enviats ?? 0} clients`
        + (e.bloquejada ? ` (BLOQUEJADA: ${e.bloquejada})` : ''));
    }
    if (errors.length) parts.push(`${errors.length} benchmark(s) amb error de dades`);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          client_email: ADMIN_EMAIL,
          titol: 'Alertes de mercat',
          cos: parts.join(' · '),
          url: '/platform.html#admin-alertes',
        }),
      });
    } catch (e) { console.error('[push admin]', e); }
  }

  return new Response(JSON.stringify({
    accio, benchmarks: resum, alertes_noves: alertesNoves, enviaments,
  }, null, 2), { headers: cors });
});
