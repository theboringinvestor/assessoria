// ════════════════════════════════════════════════════════════════════
// TBI · Edge Function: alertes-mercat-enviar
// Envia una alerta ja aprovada als clients afectats, amb les seves
// xifres. Push (enviar-push) + email (Resend).
//
// Desplegar amb verify_jwt: FALSE. Valida internament:
//   · x-tbi-token: <TBI_CRON_TOKEN>   → crida de alertes-mercat-detectar
//   · Authorization: Bearer <JWT admin> → crida manual des de platform.html
//
// Cos: {"alerta_id":"uuid", "prova":true?}
//   prova:true → calcula i retorna destinataris sense enviar res
// ════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!;
const CRON_TOKEN    = Deno.env.get('TBI_CRON_TOKEN') ?? '';

const FROM     = 'The Boring Investor <no-reply@theboringinvestor.es>';
const REPLY_TO = 'guillem.puig@theboringinvestor.es';
const BASE_URL = 'https://theboringinvestor.es';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tbi-token',
  'Content-Type': 'application/json',
};

const eur = (n: number) =>
  new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
const pct = (n: number) => (n * 100).toFixed(1).replace('.', ',') + '%';

// ─── Plantilla de missatge ──────────────────────────────────────────
// El text viu a alertes_plantilles (familia, llindar). Si no hi ha fila
// exacta, s'agafa la del llindar immediatament inferior de la mateixa
// família. Si no n'hi ha cap, no s'envia res: millor silenci que un correu
// sense contingut.
async function plantillaPer(sb: any, familia: string, llindar: number) {
  const { data } = await sb.from('alertes_plantilles')
    .select('*')
    .eq('familia', familia)
    .lte('llindar', llindar)
    .order('llindar', { ascending: false })
    .limit(1);
  const p = data?.[0];
  if (!p) return null;
  return {
    etiqueta: p.etiqueta as string,
    titol: p.titol as string,
    context: p.context as string,
    prioritats: Array.isArray(p.prioritats) ? p.prioritats as string[] : [],
    noFer: Array.isArray(p.no_fer) ? p.no_fer as string[] : [],
  };
}

// ─── Exposició real del client a la família afectada ────────────────
function calcularExposicio(client: any, cats: string[]) {
  const pos: any[] = Array.isArray(client.posicions) ? client.posicions : [];
  let total = 0, afectat = 0;
  let dataValor: string | null = null;

  for (const p of pos) {
    const v = parseFloat(p.valor_actual) || 0;
    total += v;
    if (cats.includes(p.cat)) {
      afectat += v;
      if (p.valor_data && (!dataValor || p.valor_data > dataValor)) dataValor = p.valor_data;
    }
  }
  return {
    total,
    afectat,
    pes: total > 0 ? afectat / total : 0,
    dataValor,
  };
}

// ─── Protocol de caigudes: font única de veritat = fullderuta.protocol ──
// El mateix objecte que edita l'assessor a la secció 09 del Full de Ruta
// i que el client signa. No hi ha còpia paral·lela en cap columna.
function protocolDe(client: any) {
  const p = client?.fullderuta?.protocol;
  if (!p || p.actiu !== true) return null;
  return {
    llindarMin: Number(p.llindar_min ?? 10),
    reserva: p.reserva ?? null,
    desplegat: Array.isArray(p.desplegat) ? p.desplegat : [],
  };
}

// ─── Tram de reserva que correspon a aquest llindar ─────────────────
function tramReserva(prot: any, llindar: number) {
  const r = prot?.reserva;
  if (!r || r.actiu !== true || !Array.isArray(r.trams)) return null;

  const tram = r.trams
    .filter((t: any) => Number(t.llindar) <= llindar)
    .sort((a: any, b: any) => Number(b.llindar) - Number(a.llindar))[0];
  if (!tram) return null;

  // Un tram només es desplega un cop per episodi de caiguda
  if (prot.desplegat.some((d: any) => Number(d.llindar) === Number(tram.llindar))) return null;

  const total = parseFloat(r.import_total) || 0;
  return { llindar: Number(tram.llindar), import: total * (Number(tram.pct) / 100) };
}

// ─── Plantilla d'email (estils inline, hex de marca TBI) ────────────
function emailHtml(o: any) {
  const NAVY = '#16233A', PAPER = '#F7F5F0', GOLD = '#C8A54A';
  const INK = '#3A3F4A', MUT = '#6B6762';
  const F = "'IBM Plex Sans',Arial,sans-serif";
  const M = "'IBM Plex Mono',monospace";

  const li = (t: string) =>
    `<tr><td style="padding:0 0 12px 0;font:400 14px/1.65 ${F};color:${INK}">`
    + `<span style="color:${GOLD};font-weight:600">—</span>&nbsp; ${t}</td></tr>`;

  return `<!DOCTYPE html><html lang="ca"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#FFFFFF;border-radius:14px;overflow:hidden">

  <!-- Capçalera -->
  <tr><td style="background:${NAVY};padding:22px 30px">
    <table role="presentation" width="100%"><tr>
      <td style="font:600 15px/1 ${F};color:#FFFFFF;letter-spacing:-.2px">The Boring Investor</td>
      <td align="right" style="font:500 10px/1 ${M};color:${GOLD};letter-spacing:.1em;text-transform:uppercase">${o.etiqueta}</td>
    </tr></table>
  </td></tr>

  <!-- Xifra -->
  <tr><td style="padding:32px 30px 0 30px">
    <div style="font:500 11px/1 ${M};color:${MUT};letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px">${o.benchmarkNom}</div>
    <div style="font:600 44px/1 ${M};color:${NAVY};letter-spacing:-1.5px">${o.drawdownTxt}</div>
    <div style="font:400 13px/1.6 ${F};color:${MUT};margin-top:8px">des del pic del ${o.picData}</div>
  </td></tr>

  <tr><td style="padding:26px 30px 0 30px">
    <h1 style="font:600 20px/1.35 ${F};color:${NAVY};margin:0;letter-spacing:-.3px">${o.titol}</h1>
  </td></tr>

  ${o.motius ? `<tr><td style="padding:16px 30px 0 30px">
    <div style="font:500 10px/1 ${M};color:${MUT};letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Per què</div>
    <div style="font:400 14px/1.7 ${F};color:${INK}">${o.motius}</div>
  </td></tr>` : ''}

  ${o.context ? `<tr><td style="padding:20px 30px 0 30px">
    <div style="font:500 10px/1 ${M};color:${MUT};letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">Context</div>
    <div style="font:400 14px/1.7 ${F};color:${INK}">${o.context}</div>
  </td></tr>` : ''}

  <!-- La teva situació -->
  <tr><td style="padding:26px 30px 0 30px">
    <table role="presentation" width="100%" style="background:${PAPER};border-radius:11px">
      <tr><td style="padding:20px 22px">
        <div style="font:500 10px/1 ${M};color:${MUT};letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">La teva situació</div>
        <table role="presentation" width="100%">
          <tr>
            <td style="font:400 13px/1.5 ${F};color:${INK};padding-bottom:8px">Exposició a aquesta família</td>
            <td align="right" style="font:600 15px/1.5 ${M};color:${NAVY};padding-bottom:8px">${o.exposicio}</td>
          </tr>
          <tr>
            <td style="font:400 13px/1.5 ${F};color:${INK};padding-bottom:8px">Pes sobre la teva cartera</td>
            <td align="right" style="font:600 15px/1.5 ${M};color:${NAVY};padding-bottom:8px">${o.pes}</td>
          </tr>
          <tr>
            <td style="font:400 13px/1.5 ${F};color:${INK}">Impacte estimat des del pic</td>
            <td align="right" style="font:600 15px/1.5 ${M};color:#8C2F2F">${o.impacte}</td>
          </tr>
        </table>
        <div style="font:400 11px/1.55 ${F};color:${MUT};margin-top:14px;padding-top:12px;border-top:1px solid #E4E0D8">
          Calculat sobre l'últim valor que vas registrar${o.dataValor ? ` (${o.dataValor})` : ''}. És una estimació, no el saldo del teu bróker.
        </div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Què diu el teu pla -->
  <tr><td style="padding:28px 30px 0 30px">
    <div style="font:500 10px/1 ${M};color:${MUT};letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">Què diu el teu pla</div>
    <table role="presentation" width="100%">${o.prioritats.map(li).join('')}</table>
  </td></tr>

  ${o.tram ? `<tr><td style="padding:6px 30px 0 30px">
    <table role="presentation" width="100%" style="background:#FBF6E8;border-left:3px solid ${GOLD};border-radius:8px">
      <tr><td style="padding:16px 20px">
        <div style="font:600 13px/1.5 ${F};color:#6B5200;margin-bottom:4px">Reserva d'oportunitat · tram del ${o.tram.llindar}%</div>
        <div style="font:400 13px/1.65 ${F};color:#6B5200">El teu Full de Ruta preveu, en aquest escenari, el desplegament de <strong style="font-family:${M}">${o.tram.importTxt}</strong> de la teva reserva. Ho decideixes tu; jo t'ho recordo perquè és el que vas acordar quan els mercats estaven tranquils.</div>
      </td></tr>
    </table>
  </td></tr>` : ''}

  ${o.noFer && o.noFer.length ? `<tr><td style="padding:22px 30px 0 30px">
    <div style="font:500 10px/1 ${M};color:${MUT};letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px">Què no fer</div>
    <div style="font:400 14px/1.7 ${F};color:${INK}">${o.noFer.join(' &nbsp;·&nbsp; ')}</div>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:28px 30px 0 30px">
    <a href="${BASE_URL}/platform.html#portal-roadmap" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;padding:13px 26px;border-radius:9px;font:500 14px/1 ${F}">Obrir el meu Full de Ruta</a>
  </td></tr>

  <tr><td style="padding:24px 30px 0 30px">
    <div style="font:400 13px/1.7 ${F};color:${INK}">
      Si la teva situació personal ha canviat — feina, despeses previstes, horitzó — no apliquis el pla automàticament. Respon aquest correu i ho revisem.
    </div>
  </td></tr>

  <!-- Peu -->
  <tr><td style="padding:28px 30px 30px 30px">
    <table role="presentation" width="100%" style="border-top:1px solid #E4E0D8">
      <tr><td style="padding-top:18px">
        <div style="font:400 11px/1.65 ${F};color:${MUT}">
          <strong style="color:${INK}">Guillem Puig</strong> · The Boring Investor<br>
          Assessorament financer independent i sense comissions de producte<br>
          <a href="mailto:${REPLY_TO}" style="color:${MUT}">${REPLY_TO}</a>
        </div>
        <div style="font:400 10px/1.6 ${F};color:#8B877F;margin-top:14px">
          Aquest avís és seguiment del pla que has acordat, no una recomanació nova d'inversió.
          Rendiments passats no garanteixen rendiments futurs. Tota inversió comporta risc de pèrdua de capital.
        </div>
        <div style="font:400 10px/1.6 ${F};color:#8B877F;margin-top:10px">
          <a href="${BASE_URL}/platform.html#portal-notificacions" style="color:#8B877F">Gestionar quines alertes reps</a>
        </div>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // ── Autorització: token intern de cron, o JWT d'admin ──
  let autoritzat = CRON_TOKEN.length > 0 && req.headers.get('x-tbi-token') === CRON_TOKEN;
  if (!autoritzat) {
    const auth = req.headers.get('Authorization') ?? '';
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: adminOk } = await sbUser.rpc('is_tbi_admin');
    autoritzat = adminOk === true;
  }
  if (!autoritzat) {
    return new Response(JSON.stringify({ error: 'no autoritzat' }), { status: 403, headers: cors });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const alertaId = body.alerta_id;
  const prova = body.prova === true;
  if (!alertaId) {
    return new Response(JSON.stringify({ error: 'falta alerta_id' }), { status: 400, headers: cors });
  }

  // ── Alerta + benchmark ──
  const { data: aRows, error: errA } = await sb
    .from('alertes_mercat').select('*').eq('id', alertaId).limit(1);
  if (errA || !aRows?.length) {
    return new Response(JSON.stringify({ error: 'alerta no trobada' }), { status: 404, headers: cors });
  }
  const alerta = aRows[0];

  if (!prova && alerta.estat === 'enviada') {
    return new Response(JSON.stringify({ error: 'ja enviada', enviada_at: alerta.enviada_at }),
      { status: 409, headers: cors });
  }
  const { data: bRows } = await sb.from('benchmarks').select('*').eq('codi', alerta.codi).limit(1);
  const bm = bRows?.[0];
  if (!bm) {
    return new Response(JSON.stringify({ error: 'benchmark no trobat' }), { status: 404, headers: cors });
  }

  // ── Frens automàtics (substitueixen la revisió humana) ──
  const { data: cfgRows } = await sb.from('alertes_config').select('*').eq('id', 1).limit(1);
  const cfg = cfgRows?.[0] ?? {
    pausa_global: false, max_mes_per_client: 2,
    min_exposicio_eur: 500, min_exposicio_pct: 0.05, hores_entre_alertes: 20,
  };
  const MIN_EUR = Number(cfg.min_exposicio_eur);
  const MIN_PCT = Number(cfg.min_exposicio_pct);

  async function bloquejar(motiu: string) {
    if (!prova) {
      await sb.from('alertes_mercat')
        .update({ estat: 'bloquejada', bloqueig_motiu: motiu })
        .eq('id', alertaId).select('id');
    }
    return new Response(JSON.stringify({ alerta_id: alertaId, bloquejada: motiu, enviats: 0 }),
      { headers: cors });
  }

  if (cfg.pausa_global === true) return await bloquejar('pausa global activada');

  // Anti-ràfega: cap altra alerta enviada en les últimes N hores
  const desDe = new Date(Date.now() - Number(cfg.hores_entre_alertes) * 3600e3).toISOString();
  const { count: recents } = await sb.from('alertes_mercat')
    .select('id', { count: 'exact', head: true })
    .eq('estat', 'enviada').gte('enviada_at', desDe);
  if ((recents ?? 0) > 0) {
    return await bloquejar(`ja s'ha enviat una alerta en les últimes ${cfg.hores_entre_alertes} h`);
  }

  // ── Plantilla de text ──
  const g = await plantillaPer(sb, bm.familia ?? 'rv', alerta.llindar);
  if (!g) return await bloquejar(`sense plantilla per (${bm.familia}, ${alerta.llindar}%)`);

  const ddTxt = pct(Number(alerta.drawdown));
  const titolFinal = (alerta.titol || g.titol)
    .replace(/\{benchmark\}/g, bm.nom)
    .replace(/\{dd\}/g, ddTxt);

  // ── Qui té el protocol de caigudes signat ──
  // Sense signatura, l'alerta seria una recomanació personalitzada nova.
  const { data: sigs } = await sb.from('signatures')
    .select('client_email')
    .eq('tipus', 'protocol_caigudes')
    .eq('estat', 'signat');
  const signats = new Set((sigs ?? []).map((s: any) => (s.client_email ?? '').toLowerCase()));

  // ── Clients candidats ──
  const { data: clients, error: errC } = await sb.from('clients')
    .select('email, nom, notification_email, notify_alertes_mercat, posicions, fullderuta')
    .eq('notify_alertes_mercat', true);
  if (errC) {
    return new Response(JSON.stringify({ error: errC.message }), { status: 500, headers: cors });
  }

  const enviats: any[] = [];
  const omesos: any[] = [];

  for (const c of clients ?? []) {
    const prot = protocolDe(c);

    if (!prot) {
      omesos.push({ email: c.email, motiu: 'sense protocol de caigudes actiu' });
      continue;
    }
    if (!signats.has((c.email ?? '').toLowerCase())) {
      omesos.push({ email: c.email, motiu: 'protocol pendent de signatura' });
      continue;
    }
    if (alerta.llindar < prot.llindarMin) {
      omesos.push({ email: c.email, motiu: `llindar per sota del seu mínim (${prot.llindarMin}%)` });
      continue;
    }

    // Sostre d'alertes per client i mes natural
    const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
    const { count: rebudes } = await sb.from('alertes_enviaments')
      .select('id', { count: 'exact', head: true })
      .eq('client_email', c.email).eq('canal', 'email').eq('estat', 'ok')
      .gte('enviat_at', mes.toISOString());
    if ((rebudes ?? 0) >= Number(cfg.max_mes_per_client)) {
      omesos.push({ email: c.email, motiu: `sostre mensual assolit (${cfg.max_mes_per_client})` });
      continue;
    }

    const exp = calcularExposicio(c, bm.cats ?? []);

    if (exp.afectat < MIN_EUR || exp.pes < MIN_PCT) {
      omesos.push({ email: c.email, motiu: 'exposició per sota del mínim',
                    exposicio: Math.round(exp.afectat), pes: Number((exp.pes * 100).toFixed(1)) });
      if (!prova) {
        await sb.from('alertes_enviaments').upsert({
          alerta_id: alertaId, client_email: c.email, canal: 'email', estat: 'omes',
          exposicio_eur: exp.afectat, exposicio_pct: exp.pes,
          detall: 'exposició per sota del mínim',
        }, { onConflict: 'alerta_id,client_email,canal' }).select('id');
      }
      continue;
    }

    const dd = Number(alerta.drawdown);
    const impacte = exp.afectat * dd / (1 + dd);   // caiguda en € des del pic
    const tram = tramReserva(prot, alerta.llindar);

    const dades = {
      etiqueta: g.etiqueta,
      benchmarkNom: bm.nom,
      drawdownTxt: ddTxt,
      picData: alerta.pic_data
        ? new Date(alerta.pic_data).toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' })
        : '—',
      titol: titolFinal,
      motius: alerta.motius,          // opcional, afegit a mà per l'assessor
      context: alerta.context || g.context,
      exposicio: eur(exp.afectat),
      pes: pct(exp.pes),
      impacte: eur(impacte),
      dataValor: exp.dataValor
        ? new Date(exp.dataValor).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' })
        : null,
      prioritats: g.prioritats,
      noFer: g.noFer,
      tram: tram ? { llindar: tram.llindar, importTxt: eur(tram.import) } : null,
    };

    if (prova) {
      enviats.push({ email: c.email, exposicio: Math.round(exp.afectat),
                     pes: Number((exp.pes * 100).toFixed(1)),
                     impacte: Math.round(impacte),
                     tram: dades.tram });
      continue;
    }

    // ── Email ──
    const desti = c.notification_email || c.email;
    let estatEmail = 'ok', detallEmail: string | null = null;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: FROM, to: [desti], reply_to: REPLY_TO,
          subject: `${titolFinal} — què diu el teu pla`,
          html: emailHtml(dades),
        }),
      });
      if (!r.ok) { estatEmail = 'error'; detallEmail = `Resend ${r.status}: ${await r.text()}`; }
    } catch (e) {
      estatEmail = 'error'; detallEmail = (e as Error).message;
    }

    await sb.from('alertes_enviaments').upsert({
      alerta_id: alertaId, client_email: c.email, canal: 'email', estat: estatEmail,
      exposicio_eur: exp.afectat, exposicio_pct: exp.pes, impacte_eur: impacte,
      detall: detallEmail,
    }, { onConflict: 'alerta_id,client_email,canal' }).select('id');

    // ── Push ──
    let estatPush = 'ok', detallPush: string | null = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/enviar-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          client_email: c.email,
          tipus: 'alerta_mercat',
          titol: `${bm.nom}: ${ddTxt}`,
          cos: `${g.etiqueta}. La teva exposició: ${eur(exp.afectat)}. Obre per veure què diu el teu pla.`,
          url: 'https://theboringinvestor.es/tbi-app.html#alertes',
        }),
      });
      if (!r.ok) { estatPush = 'error'; detallPush = `push ${r.status}`; }
    } catch (e) {
      estatPush = 'error'; detallPush = (e as Error).message;
    }

    await sb.from('alertes_enviaments').upsert({
      alerta_id: alertaId, client_email: c.email, canal: 'push', estat: estatPush,
      exposicio_eur: exp.afectat, exposicio_pct: exp.pes, impacte_eur: impacte,
      detall: detallPush,
    }, { onConflict: 'alerta_id,client_email,canal' }).select('id');

    enviats.push({ email: c.email, email_estat: estatEmail, push_estat: estatPush });
  }

  if (!prova) {
    const { data: upd, error: errU } = await sb.from('alertes_mercat')
      .update({ estat: 'enviada', enviada_at: new Date().toISOString(),
                titol: titolFinal, context: alerta.context || g.context })
      .eq('id', alertaId).select('id,estat');
    if (errU || !upd?.length) console.error('[marcar enviada]', errU?.message ?? 'RLS: 0 files');
  }

  return new Response(JSON.stringify({
    prova, alerta_id: alertaId, llindar: alerta.llindar, benchmark: bm.codi,
    enviats: enviats.length, omesos: omesos.length,
    detall_enviats: enviats, detall_omesos: omesos,
  }, null, 2), { headers: cors });
});
