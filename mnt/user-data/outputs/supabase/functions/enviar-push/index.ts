// supabase/functions/enviar-push/index.ts
// Envia notificacions push (Web Push / VAPID) als dispositius subscrits.
// Invocació: { client_email, titol, cos, tipus, url } o { tots:true, ... }
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// verify_jwt = FALSE (valida internament: service role, admin via JWT, o x-cron-secret).
//
// Autoritzacions acceptades:
//   1. Authorization: Bearer <SERVICE_ROLE_KEY>   -> crides internes (altres Edge Functions)
//   2. Authorization: Bearer <JWT d'admin>        -> crides des de platform.html
//   3. x-cron-secret: <CRON_SECRET>               -> triggers de BD (pg_net) i cron
//
// Filtres de preferències aplicats en cascada:
//   a) preferència del client (clients.notify_*) segons el tipus
//   b) preferència del dispositiu (push_subscriptions.notify_*)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:guillem.puig@theboringinvestor.es";
const CRON_SECRET   = Deno.env.get("CRON_SECRET") ?? "";

const ADMIN_EMAILS = [
  "guillem@theboringinvestor.com","guillem.puig@gmail.com","admin@theboringinvestor.com",
  "guillem.puig@theboringinvestor.es","gpuigreig@gmail.com",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Preferència a nivell de DISPOSITIU (push_subscriptions)
const PREF_COL: Record<string,string> = {
  missatge: "notify_missatges",
  recordatori: "notify_recordatori",
  comunicat: "notify_comunicats",
};

// Preferència a nivell de CLIENT (clients) — la mateixa que governa els emails
const CLIENT_PREF: Record<string,string> = {
  missatge: "notify_missatge_admin",
  recordatori: "notify_recordatori",
  comunicat: "notify_comunitat",
  informe: "notify_informe",
  alerta_mercat: "notify_alertes_mercat",
};
// notify_comunitat és opt-in (default false); la resta són opt-out (default true).
const PREF_OPT_IN = ["notify_comunitat"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ ok:false, error:"Metode no permes" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok:false, error:"Falta config Supabase" }, 500);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ ok:false, error:"Falten claus VAPID" }, 500);

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE);

  // -- Autoritzacio --
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  let autoritzat = CRON_SECRET.length > 0 && cronHeader === CRON_SECRET;

  if (!autoritzat) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token && token === SERVICE_ROLE) {
      autoritzat = true;
    } else if (token) {
      const { data: u } = await db.auth.getUser(token);
      const email = (u?.user?.email ?? "").toLowerCase();
      if (email && ADMIN_EMAILS.indexOf(email) !== -1) autoritzat = true;
    }
  }
  if (!autoritzat) return json({ ok:false, error:"No autoritzat" }, 403);

  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const clientEmail = String(payload.client_email ?? "").trim().toLowerCase();
  const tots = payload.tots === true;
  const titol = String(payload.titol ?? "The Boring Investor");
  const cos = String(payload.cos ?? "");
  const tipus = String(payload.tipus ?? "");
  const url = String(payload.url ?? "https://theboringinvestor.es/tbi-app.html");

  if (!clientEmail && !tots) return json({ ok:false, error:"Falta client_email o tots:true" }, 400);

  // -- Filtre de preferencia del CLIENT (la mateixa que governa els emails) --
  const clientPrefCol = CLIENT_PREF[tipus];
  const optIn = clientPrefCol ? PREF_OPT_IN.indexOf(clientPrefCol) !== -1 : false;
  const volAvis = (v: unknown) => optIn ? (v === true) : (v !== false);

  if (clientEmail && clientPrefCol) {
    const { data: c } = await db
      .from("clients")
      .select(clientPrefCol)
      .eq("email", clientEmail)
      .maybeSingle();
    if (c && !volAvis((c as any)[clientPrefCol])) {
      return json({ ok:true, enviat:false, motiu:"El client ha desactivat aquest tipus d'avis", sent_count:0 });
    }
  }

  let q = db.from("push_subscriptions").select("*");
  if (!tots) q = q.eq("client_email", clientEmail);
  const { data: subs, error } = await q;
  if (error) return json({ ok:false, error:"Error llegint subscripcions: "+error.message }, 500);
  if (!subs || !subs.length) return json({ ok:true, enviat:false, motiu:"Cap dispositiu subscrit", sent_count:0 });

  // En enviaments massius (tots:true) cal respectar igualment l'opt-out de cada
  // client: construim la llista d'emails que SI volen aquest tipus d'avis.
  let permesos: Record<string, boolean> | null = null;
  if (tots && clientPrefCol) {
    const { data: cl } = await db.from("clients").select(`email, ${clientPrefCol}`);
    permesos = {};
    (cl ?? []).forEach((c: any) => {
      const e = String(c.email ?? "").trim().toLowerCase();
      if (e && volAvis(c[clientPrefCol])) permesos![e] = true;
    });
  }

  // -- Filtre de preferencia del DISPOSITIU --
  const prefCol = PREF_COL[tipus];
  const dest = subs.filter((s: any) => {
    if (prefCol && s[prefCol] === false) return false;
    if (permesos && !permesos[String(s.client_email ?? "").trim().toLowerCase()]) return false;
    return true;
  });

  const notif = JSON.stringify({ title: titol, body: cos, url: url, tag: tipus || "tbi" });

  let sent = 0, fail = 0;
  const morts: string[] = [];
  const vius: string[] = [];
  for (const s of dest) {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, notif);
      sent++;
      vius.push(s.endpoint);
    } catch (e: any) {
      fail++;
      const code = e?.statusCode;
      if (code === 404 || code === 410) morts.push(s.endpoint);
    }
  }

  // Neteja d'endpoints caducats (el navegador els rota) i segell d'us
  if (morts.length) {
    await db.from("push_subscriptions").delete().in("endpoint", morts);
  }
  if (vius.length) {
    await db.from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in("endpoint", vius);
  }

  return json({ ok:true, enviat: sent>0, sent_count: sent, fail_count: fail, netejades: morts.length });
});
