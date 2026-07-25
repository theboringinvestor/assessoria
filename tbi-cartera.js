/* ============================================================
   TBI · MOTOR DE CARTERA  (font única compartida)

   platform.html i tbi-app.html carregaven cadascun la seva còpia
   d'aquests càlculs i havien divergit: amb la mateixa cartera i els
   mateixos 500 €, l'app recomanava "RF Corp 499 € · Or 1 €" i la
   plataforma "RF Corp 500 €". Aquest fitxer és ara l'única
   implementació; els dos hostes hi deleguen.

   Disseny: funcions PURES (dades entren, dades surten). Cap referència
   a getClient(), APP, document ni Supabase. Així es pot provar sol i
   qualsevol host el pot fer servir.

   Conté: taxonomia canònica, agregats de posicions, TIR (XIRR), TWR,
   TER ponderat, distribució real, matching amb bandes 5/25 i el procés
   invers de retirades.

   ES5. TBI_FISCAL i TBI_FIRE són opcionals (per als impostos).
   ============================================================ */
var TBI_CARTERA = (function () {
  "use strict";

  var VERSION = "2026-07-25";

  /* ---------- 1) PARÀMETRES ---------- */
  var PARAMS = {
    banda_abs_pp: 5,        // regla 5/25: desviació absoluta màxima
    banda_rel: 0.25,        // regla 5/25: desviació relativa màxima
    banda_min_pp: 0.5,      // terra de la banda per a pesos molt petits
    import_min_ordre: 50,   // € mínims per línia (evita el "compra 1 € d'or")
    ter_banc_ref: 1.80,
    ter_defecte: 0.25,
    retorn_brut_ref: 6.0,
    xirr_mesos_min: 6
  };

  /* ---------- 2) TAXONOMIA CANÒNICA ----------
     Només els camps que necessiten els càlculs i el render bàsic. Els
     textos educatius (descripcions, pros, contres) segueixen vivint a
     platform.html: aquí no fan falta i ocupen. */
  var TAXONOMIA = [
    { id:'rv_global',       grup:'rv',     emoji:'🌍',  nom:'RV Global Indexada',                   color:'#1B3A6B', ter:0.20 },
    { id:'rv_dividend',     grup:'rv',     emoji:'💵',  nom:'RV Dividends / Renda',                 color:'#2E5FA3', ter:0.30 },
    { id:'rv_reits',        grup:'rv',     emoji:'🏠',  nom:'REITs / Immobiliaris cotitzats',       color:'#0F6E56', ter:0.35 },
    { id:'rv_growth',       grup:'rv',     emoji:'🚀',  nom:'RV Growth / Tecnològic',               color:'#4CAF82', ter:0.35 },
    { id:'rv_value',        grup:'rv',     emoji:'⚖️',  nom:'RV Value / Defensiu',                  color:'#5D4037', ter:0.30 },
    { id:'rv_emergent',     grup:'rv',     emoji:'🌏',  nom:'RV Mercats Emergents',                 color:'#FF6F00', ter:0.25 },
    { id:'rf_global',       grup:'rf',     emoji:'🌐',  nom:'RF Global Agregat',                    color:'#607D8B', ter:0.20 },
    { id:'rf_gov_curt',     grup:'rf',     emoji:'🏦',  nom:'RF Governamental Curt termini',        color:'#78909C', ter:0.15 },
    { id:'rf_gov_llarg',    grup:'rf',     emoji:'🏛️',  nom:'RF Governamental Llarg termini',       color:'#546E7A', ter:0.15 },
    { id:'rf_corp',         grup:'rf',     emoji:'🏢',  nom:'RF Corporativa Investment Grade',      color:'#8D6E63', ter:0.20 },
    { id:'rf_hy',           grup:'rf',     emoji:'⚡',  nom:'RF High Yield (Alt Rendiment)',        color:'#BF360C', ter:0.45 },
    { id:'fons_8020',       grup:'mixt',   emoji:'🎚️',  nom:'Fons Indexat 80/20',                   color:'#0E7C66', ter:0.22 },
    { id:'fons_6040',       grup:'mixt',   emoji:'🎚️',  nom:'Fons Indexat 60/40',                   color:'#2A9182', ter:0.22 },
    { id:'fons_4060',       grup:'mixt',   emoji:'🎚️',  nom:'Fons Indexat 40/60',                   color:'#3E7CA8', ter:0.22 },
    { id:'fons_2080',       grup:'mixt',   emoji:'🎚️',  nom:'Fons Indexat 20/80',                   color:'#5566A8', ter:0.22 },
    { id:'or_metalls',      grup:'alt',    emoji:'🥇',  nom:'Or i Metalls preciosos',               color:'#C0392B', ter:0.25 },
    { id:'commodities',     grup:'alt',    emoji:'🛢️',  nom:'Matèries primeres (Commodities)',      color:'#E65100', ter:0.40 },
    { id:'liquiditat',      grup:'cash',   emoji:'💧',  nom:'Liquiditat / Monetari / Dipòsits',     color:'#90A4AE', ter:0.05 },
    { id:'crowdlending',    grup:'alt',    emoji:'🤝',  nom:'Crowdlending / P2P Lending',           color:'#D4943A', ter:1.00 },
    { id:'crypto',          grup:'alt',    emoji:'₿',   nom:'Crypto / Actius Digitals',             color:'#534AB7', ter:1.00 },
    { id:'private_equity',  grup:'alt',    emoji:'🏭',  nom:'Private Equity / Capital Risc',        color:'#4A148C', ter:2.00 },
    { id:'startups',        grup:'alt',    emoji:'💡',  nom:'Start-ups / Venture Capital',          color:'#1B5E20', ter:2.00 },
    { id:'infraestructures',grup:'alt',    emoji:'🌉',  nom:'Infraestructures',                     color:'#37474F', ter:0.55 },
    { id:'hedge_funds',     grup:'alt',    emoji:'🎯',  nom:'Hedge Funds / Estratègies alternatives', color:'#880E4F', ter:1.50 },
    { id:'altres',          grup:'altres', emoji:'📦',  nom:'Altres / No classificats',             color:'#9E9E9E', ter:0.50 }
  ];

  var _perId = {};
  for (var _i = 0; _i < TAXONOMIA.length; _i++) _perId[TAXONOMIA[_i].id] = TAXONOMIA[_i];

  function cat(id) {
    return _perId[id] || { id: id, grup: 'altres', emoji: '•', nom: id || 'Sense categoria', color: '#888', ter: PARAMS.ter_defecte };
  }
  // Resol una categoria que pot venir per id o per nom (targets antics)
  function resolCat(t) {
    if (!t) return 'altres';
    if (t.id && _perId[t.id]) return t.id;
    var n = t.nom || t.id || t;
    if (_perId[n]) return n;
    for (var i = 0; i < TAXONOMIA.length; i++) if (TAXONOMIA[i].nom === n) return TAXONOMIA[i].id;
    return t.id || n;
  }
  function terDeCategoria(id) {
    var c = _perId[id];
    return c ? c.ter : PARAMS.ter_defecte;
  }

  function _num(x, d) { var v = parseFloat(x); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  /* ---------- 3) AGREGATS PER POSICIÓ ---------- */
  function agregats(posicions, moviments) {
    posicions = posicions || []; moviments = moviments || [];
    return posicions.map(function (p) {
      var movs = moviments.filter(function (m) { return m.posicio_id === p.id; });
      var cost = 0, unitats = 0, divi = 0, comis = 0;
      movs.forEach(function (m) {
        var imp = _num(m.import), u = _num(m.unitats);
        if (m.tipus === 'compra')   { cost += imp; unitats += u; }
        if (m.tipus === 'venda')    { cost -= imp; unitats -= u; }
        if (m.tipus === 'dividend') { divi += imp; }
        if (m.tipus === 'comissio') { comis += imp; }
      });
      var valor = _num(p.valor_actual);
      var pnl = valor - cost;
      var obj = {};
      for (var k in p) if (p.hasOwnProperty(k)) obj[k] = p[k];
      obj.cost_base = cost;
      obj.unitats_total = unitats;
      obj.dividends_total = divi;
      obj.comissions_total = comis;
      obj.pnl_eur = pnl;
      obj.pnl_pct = cost > 0 ? (pnl / cost * 100) : 0;
      obj.num_moviments = movs.length;
      obj.ratio_guany = valor > 0 ? Math.max(0, Math.min(1, (valor - Math.max(0, cost)) / valor)) : 0;
      return obj;
    });
  }

  /* ---------- 4) TIR (XIRR) ---------- */
  var _MS_ANY = 1000 * 60 * 60 * 24 * 365.25;
  function _xnpv(rate, f) {
    var t0 = f[0].t, s = 0, i;
    for (i = 0; i < f.length; i++) s += f[i].a / Math.pow(1 + rate, (f[i].t - t0) / _MS_ANY);
    return s;
  }
  function _xnpvD(rate, f) {
    var t0 = f[0].t, s = 0, i, a;
    for (i = 0; i < f.length; i++) {
      a = (f[i].t - t0) / _MS_ANY;
      if (a === 0) continue;
      s += -a * f[i].a / Math.pow(1 + rate, a + 1);
    }
    return s;
  }
  function xirr(flows) {
    if (!flows || flows.length < 2) return null;
    var pos = false, neg = false, i;
    for (i = 0; i < flows.length; i++) { if (flows[i].a > 0) pos = true; if (flows[i].a < 0) neg = true; }
    if (!pos || !neg) return null;
    flows = flows.slice().sort(function (a, b) { return a.t - b.t; });
    if (flows[flows.length - 1].t - flows[0].t < 1000 * 60 * 60 * 24 * 20) return null;

    var r = 0.1, f, d, rn;
    for (i = 0; i < 80; i++) {
      f = _xnpv(r, flows); d = _xnpvD(r, flows);
      if (!isFinite(f) || !isFinite(d) || Math.abs(d) < 1e-12) break;
      rn = r - f / d;
      if (!isFinite(rn)) break;
      if (rn <= -0.999) rn = (r - 0.999) / 2;
      if (Math.abs(rn - r) < 1e-9) { r = rn; if (Math.abs(_xnpv(r, flows)) < 1e-4) return r; break; }
      r = rn;
    }
    var lo = -0.999, hi = 10, flo = _xnpv(lo, flows), fhi = _xnpv(hi, flows), mid, fm, k;
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (k = 0; k < 200; k++) {
      mid = (lo + hi) / 2; fm = _xnpv(mid, flows);
      if (!isFinite(fm)) return null;
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
      if (hi - lo < 1e-9) break;
    }
    return (lo + hi) / 2;
  }

  function fluxos(posicions, moviments) {
    var valor = 0, i;
    (posicions || []).forEach(function (p) { valor += _num(p.valor_actual); });
    var f = [];
    (moviments || []).forEach(function (m) {
      var imp = _num(m.import);
      if (!imp) return;
      var t = new Date(m.data).getTime();
      if (isNaN(t)) return;
      if (m.tipus === 'compra')   f.push({ t: t, a: -imp });
      if (m.tipus === 'venda')    f.push({ t: t, a:  imp });
      if (m.tipus === 'dividend') f.push({ t: t, a:  imp });
      if (m.tipus === 'comissio') f.push({ t: t, a: -imp });
    });
    if (!f.length || valor <= 0) return [];
    f.push({ t: Date.now(), a: valor });
    f.sort(function (a, b) { return a.t - b.t; });
    return f;
  }

  /* ---------- 5) KPIs ---------- */
  function kpis(posicions, moviments) {
    var agg = agregats(posicions, moviments);
    var valor = 0, cost = 0, divi = 0, comis = 0;
    agg.forEach(function (p) {
      valor += _num(p.valor_actual);
      cost += p.cost_base;
      divi += p.dividends_total;
      comis += p.comissions_total;
    });
    var pnl = valor - cost;

    var dataInici = null;
    (moviments || []).forEach(function (m) {
      if (m.tipus === 'compra' && m.data && (!dataInici || m.data < dataInici)) dataInici = m.data;
    });
    var anys = 0;
    if (dataInici) {
      var d0 = new Date(dataInici);
      if (!isNaN(d0.getTime())) anys = Math.max(0, (new Date() - d0) / _MS_ANY);
    }

    var tir = null;
    try {
      var f = fluxos(posicions, moviments);
      if (f.length >= 2) {
        var r = xirr(f);
        if (r !== null && isFinite(r) && r > -0.9999 && r < 100) tir = r * 100;
      }
    } catch (e) { tir = null; }

    return {
      valor_total: valor, cost_total: cost,
      pnl_eur: pnl, pnl_pct: cost > 0 ? pnl / cost * 100 : 0,
      dividends_total: divi, comissions_total: comis,
      xirr: tir, xirr_fiable: (tir !== null) && (anys * 12 >= PARAMS.xirr_mesos_min),
      cagr: (tir !== null ? tir : 0),
      anys_actiu: anys, num_posicions: agg.length,
      num_moviments: (moviments || []).length, data_inici: dataInici,
      ratio_guany: valor > 0 ? Math.max(0, Math.min(1, (valor - Math.max(0, cost)) / valor)) : 0
    };
  }

  /* ---------- 6) TWR ---------- */
  function _mesosEntre(a, b) {
    var x = String(a).split('-'), y = String(b).split('-');
    if (x.length < 2 || y.length < 2) return 0;
    return (parseInt(y[0], 10) - parseInt(x[0], 10)) * 12 + (parseInt(y[1], 10) - parseInt(x[1], 10));
  }
  function twr(snapshots, posicions, moviments) {
    var serie = (snapshots || []).filter(function (s) { return s && s.mes; })
      .map(function (s) { return { mes: String(s.mes), valor: _num(s.valor), invertit: _num(s.invertit) }; });
    var k = kpis(posicions, moviments);
    if (k.valor_total > 0) {
      var mesAvui = new Date().toISOString().slice(0, 7), idx = -1, i;
      for (i = 0; i < serie.length; i++) if (serie[i].mes === mesAvui) idx = i;
      var punt = { mes: mesAvui, valor: k.valor_total, invertit: k.cost_total };
      if (idx >= 0) serie[idx] = punt; else serie.push(punt);
    }
    serie.sort(function (a, b) { return a.mes.localeCompare(b.mes); });
    if (serie.length < 2) return null;

    var factor = 1, n = 0, j, v0, v1, flux, r;
    for (j = 1; j < serie.length; j++) {
      v0 = serie[j - 1].valor; v1 = serie[j].valor;
      flux = serie[j].invertit - serie[j - 1].invertit;
      if (!(v0 > 0)) continue;
      r = (v1 - flux) / v0;
      if (!isFinite(r) || r <= 0) continue;
      factor *= r; n++;
    }
    if (!n) return null;
    var mesos = _mesosEntre(serie[0].mes, serie[serie.length - 1].mes);
    var a = Math.max(mesos / 12, 1 / 12);
    return {
      total: (factor - 1) * 100, anual: (Math.pow(factor, 1 / a) - 1) * 100,
      mesos: mesos, n_periodes: n, fiable: mesos >= PARAMS.xirr_mesos_min
    };
  }

  /* ---------- 7) DISTRIBUCIÓ REAL ---------- */
  function distribucio(posicions, moviments) {
    var agg = agregats(posicions, moviments), per = {}, total = 0;
    agg.forEach(function (p) {
      var v = _num(p.valor_actual);
      if (v <= 0) return;
      per[p.cat] = (per[p.cat] || 0) + v;
      total += v;
    });
    return Object.keys(per).map(function (id) {
      var c = cat(id);
      return { id: id, nom: c.nom, emoji: c.emoji, color: c.color, grup: c.grup,
               valor: per[id], pct: total > 0 ? per[id] / total * 100 : 0 };
    }).sort(function (a, b) { return b.valor - a.valor; });
  }

  // Pes en renda variable (els mixtos compten al 60%)
  function pesRV(posicions, moviments) {
    var d = distribucio(posicions, moviments), rv = 0;
    d.forEach(function (x) {
      if (x.grup === 'rv') rv += x.pct;
      if (x.grup === 'mixt') rv += x.pct * 0.6;
    });
    return rv;
  }

  /* ---------- 8) TER PONDERAT ---------- */
  function ter(posicions, moviments, target) {
    var agg = agregats(posicions, moviments);
    var valor = 0, ponderat = 0, explicit = 0, detall = [];
    agg.forEach(function (p) {
      var v = _num(p.valor_actual);
      if (v <= 0) return;
      var brut = (p.ter === null || p.ter === undefined || p.ter === '') ? NaN : parseFloat(p.ter);
      var esExplicit = isFinite(brut) && brut >= 0;
      var t = esExplicit ? brut : terDeCategoria(p.cat);
      valor += v; ponderat += v * t;
      if (esExplicit) explicit += v;
      detall.push({ id: p.id, nom: p.nom || cat(p.cat).nom, cat: p.cat, valor: v,
                    ter: t, explicit: esExplicit, cost_eur: v * t / 100 });
    });
    if (valor <= 0) return null;
    var terReal = ponderat / valor;

    var terTarget = null;
    if (target && target.length) {
      var sp = 0, ac = 0;
      target.forEach(function (t2) {
        var pct = _num(t2.pct);
        if (pct <= 0) return;
        sp += pct; ac += pct * terDeCategoria(resolCat(t2));
      });
      if (sp > 0) terTarget = ac / sp;
    }

    var g = PARAMS.retorn_brut_ref / 100;
    detall.sort(function (a, b) { return b.cost_eur - a.cost_eur; });
    return {
      ter_real: terReal, ter_target: terTarget, ter_banc: PARAMS.ter_banc_ref,
      valor_total: valor,
      cost_anual_eur: valor * terReal / 100,
      cost_banc_eur: valor * PARAMS.ter_banc_ref / 100,
      estalvi_anual_eur: valor * (PARAMS.ter_banc_ref - terReal) / 100,
      estalvi_10a_eur: valor * Math.pow(1 + g - terReal / 100, 10) - valor * Math.pow(1 + g - PARAMS.ter_banc_ref / 100, 10),
      cobertura_pct: explicit / valor * 100,
      detall: detall
    };
  }

  /* ---------- 9) REPARTIMENTS (cascada comuna) ---------- */
  // Reparteix `totalRepartir` entre `cands` sense passar-se mai del límit de
  // cadascun. El que sobri va a `fallback`, i si `campCapFallback` hi és,
  // també s'hi respecta el sostre: en una retirada no pots vendre d'una
  // categoria més del que hi tens, i ignorar-ho feia que la venda es quedés
  // curta i desequilibrés la cartera.
  function _cascada(cands, campLimit, totalRepartir, fallback, campCapFallback) {
    var assign = {}, i;
    cands.forEach(function (r) { assign[r.id] = 0; });
    var restant = totalRepartir;

    function repartir(llista, camp) {
      for (var k = 0; k < 12 && restant > 0.01; k++) {
        var oberts = llista.filter(function (r) { return assign[r.id] < r[camp] - 0.01; });
        if (!oberts.length) break;
        var sum = 0;
        oberts.forEach(function (r) { sum += (r[camp] - assign[r.id]); });
        if (sum <= 0) break;
        var disp = restant;
        oberts.forEach(function (r) {
          var add = Math.min(disp * (r[camp] - assign[r.id]) / sum, r[camp] - assign[r.id]);
          assign[r.id] += add; restant -= add;
        });
      }
    }

    repartir(cands, campLimit);

    if (restant > 0.01 && fallback && fallback.length) {
      fallback.forEach(function (r) { if (assign[r.id] === undefined) assign[r.id] = 0; });
      if (campCapFallback) {
        repartir(fallback, campCapFallback);
      } else {
        // Sense sostre (fase d'acumulació: sempre pots comprar més)
        var st = 0;
        fallback.forEach(function (r) { st += _num(r._pes); });
        fallback.forEach(function (r) {
          assign[r.id] += restant * (st > 0 ? _num(r._pes) / st : 1 / fallback.length);
        });
        restant = 0;
      }
    }
    return assign;
  }

  // Mínim per ordre + arrodoniment exacte. Sense això surten els "1 € d'or".
  function _minimIArrodonir(lines, total, minim) {
    lines = lines.filter(function (l) { return l.import > 0.5; })
                 .sort(function (a, b) { return b.import - a.import; });
    if (!lines.length) return [];
    if (total < minim) { lines = [lines[0]]; lines[0].import = total; }
    else {
      var canvi = true, guard = 0;
      while (canvi && lines.length > 1 && guard++ < 30) {
        canvi = false;
        var petita = lines[lines.length - 1];
        if (petita.import < minim) {
          lines.pop();
          var pesos = lines.map(function (l) { return l.import; }), sum = 0;
          pesos.forEach(function (p) { sum += p; });
          lines.forEach(function (l, i) { l.import += petita.import * (sum > 0 ? pesos[i] / sum : 1 / lines.length); });
          lines.sort(function (a, b) { return b.import - a.import; });
          canvi = true;
        }
      }
    }
    var ac = 0;
    lines.forEach(function (l) { l.import = Math.round(l.import); ac += l.import; });
    if (lines.length) lines[0].import += Math.round(total) - ac;
    return lines.filter(function (l) { return l.import > 0; });
  }

  /* ---------- 10) MATCHING (fase d'acumulació) ---------- */
  function matching(ctx, aportacio, opts) {
    ctx = ctx || {}; opts = opts || {};
    var target = ctx.target || [];
    if (!target.length) return null;

    var bAbs = (opts.banda_abs_pp != null) ? opts.banda_abs_pp : PARAMS.banda_abs_pp;
    var bRel = (opts.banda_rel != null) ? opts.banda_rel : PARAMS.banda_rel;
    var bMin = (opts.banda_min_pp != null) ? opts.banda_min_pp : PARAMS.banda_min_pp;
    var iMin = (opts.import_min_ordre != null) ? opts.import_min_ordre : PARAMS.import_min_ordre;

    var real = distribucio(ctx.posicions, ctx.moviments);
    var valorActual = 0;
    real.forEach(function (r) { valorActual += r.valor; });
    var aport = _num(aportacio);
    var valorPost = valorActual + aport;

    var idsT = {};
    var rows = target.map(function (t) {
      var id = resolCat(t), c = cat(id);
      idsT[id] = true;
      var rr = null;
      for (var i = 0; i < real.length; i++) if (real[i].id === id) rr = real[i];
      var tp = _num(t.pct), re = rr ? rr.valor : 0;
      var rp = valorActual > 0 ? re / valorActual * 100 : 0;
      var banda = Math.max(bMin, Math.min(bAbs, tp * bRel));
      var gapPct = tp - rp;
      var fora = valorActual > 0 && Math.abs(gapPct) > banda;
      return {
        id: id, nom: c.nom, emoji: c.emoji, color: t.color || c.color,
        target_pct: tp, target_eur: tp / 100 * valorActual,
        real_eur: re, real_pct: rp,
        gap_eur: tp / 100 * valorActual - re,
        gap_pct: gapPct,
        gap_plan: tp / 100 * valorPost - re,
        banda_pp: banda, fora_banda: fora,
        estat: !fora ? 'ok' : (gapPct > 0 ? 'infra' : 'sobre'),
        fora_pla: false, _pes: tp
      };
    });
    // Posicions en categories que no són al target
    real.forEach(function (r) {
      if (idsT[r.id] || r.valor <= 0) return;
      var rp = valorActual > 0 ? r.valor / valorActual * 100 : 0;
      rows.push({ id: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
        target_pct: 0, target_eur: 0, real_eur: r.valor, real_pct: rp,
        gap_eur: -r.valor, gap_pct: -rp, gap_plan: -r.valor,
        banda_pp: bMin, fora_banda: rp > bMin, estat: 'sobre', fora_pla: true, _pes: 0 });
    });

    var sumAbs = 0, derivaMax = 0, foraPla = 0, nFora = 0;
    rows.forEach(function (r) {
      sumAbs += Math.abs(r.gap_pct);
      if (Math.abs(r.gap_pct) > derivaMax) derivaMax = Math.abs(r.gap_pct);
      if (r.fora_pla) foraPla += r.real_pct;
      if (r.fora_banda) nFora++;
    });

    var recomanacio = [];
    if (aport > 0) {
      var infra = rows.filter(function (r) { return r.gap_plan > 0.5; });
      var prio = infra.filter(function (r) { return r.fora_banda; });
      var base = prio.length ? prio : infra;
      if (!base.length) {
        var top = rows.filter(function (r) { return !r.fora_pla && r.target_pct > 0; })
                      .sort(function (a, b) { return b.target_pct - a.target_pct; }).slice(0, 3);
        var st = 0; top.forEach(function (r) { st += r.target_pct; });
        recomanacio = top.map(function (r) {
          return { cat: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
                   import: aport * (st > 0 ? r.target_pct / st : 1 / top.length),
                   motiu: 'DCA equilibrat', prioritat: 'baixa' };
        });
      } else {
        var assign = _cascada(base, 'gap_plan', aport, rows.filter(function (r) { return !r.fora_pla; }));
        recomanacio = base.map(function (r) {
          return { cat: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
                   import: assign[r.id] || 0,
                   motiu: r.fora_banda ? ('Fora de banda · ' + r.gap_pct.toFixed(1) + 'pp') : 'Infraponderat',
                   prioritat: r.fora_banda ? 'alta' : 'mitjana' };
        });
      }
      recomanacio = _minimIArrodonir(recomanacio, aport, iMin);
      recomanacio.forEach(function (l) { l.pct = aport > 0 ? l.import / aport * 100 : 0; });
    }

    rows.sort(function (a, b) { return b.gap_eur - a.gap_eur; });
    return {
      rows: rows,
      resum: {
        coherencia: valorActual > 0 ? Math.max(0, Math.round(100 - sumAbs / 2)) : null,
        n_fora_banda: nFora, deriva_max_pp: derivaMax,
        cal_rebalanceig: valorActual > 0 && nFora > 0,
        fora_pla_pct: foraPla, valor_actual: valorActual
      },
      valor_actual: valorActual, valor_post: valorPost,
      aportacio: aport, import_min_ordre: iMin, recomanacio: recomanacio
    };
  }

  /* ---------- 11) RETIRADA (procés invers) ---------- */
  function retirada(ctx, importNet, opts) {
    ctx = ctx || {}; opts = opts || {};
    var net = _num(importNet);
    if (net <= 0) return null;
    var iMin = (opts.import_min_ordre != null) ? opts.import_min_ordre : PARAMS.import_min_ordre;
    var altres = _num(opts.altres_rendiments);
    var ambImp = (opts.considerar_impostos !== false);

    var agg = agregats(ctx.posicions, ctx.moviments).filter(function (p) { return _num(p.valor_actual) > 0; });
    if (!agg.length) return null;
    var valorTotal = 0;
    agg.forEach(function (p) { valorTotal += _num(p.valor_actual); });
    if (valorTotal <= 0) return null;

    var k = kpis(ctx.posicions, ctx.moviments);
    var brut = net, insuficient = false;
    if (ambImp && typeof TBI_FIRE !== 'undefined') {
      var gu = TBI_FIRE.brutPerNet(net, k.ratio_guany, altres);
      brut = Math.min(gu.brut, valorTotal);
      insuficient = gu.brut > valorTotal;
    }

    var real = distribucio(ctx.posicions, ctx.moviments);
    var target = ctx.target || [];
    var valorPost = Math.max(0, valorTotal - brut);
    var idsT = {};
    var rows = target.map(function (t) {
      var id = resolCat(t), c = cat(id);
      idsT[id] = true;
      var rr = null;
      for (var i = 0; i < real.length; i++) if (real[i].id === id) rr = real[i];
      var tp = _num(t.pct), re = rr ? rr.valor : 0;
      var rp = valorTotal > 0 ? re / valorTotal * 100 : 0;
      return { id: id, nom: c.nom, emoji: c.emoji, color: t.color || c.color,
        target_pct: tp, real_eur: re, real_pct: rp,
        exces_plan: re - tp / 100 * valorPost, exces_pct: rp - tp,
        banda_pp: Math.max(PARAMS.banda_min_pp, Math.min(PARAMS.banda_abs_pp, tp * PARAMS.banda_rel)),
        fora_banda: Math.abs(rp - tp) > Math.max(PARAMS.banda_min_pp, Math.min(PARAMS.banda_abs_pp, tp * PARAMS.banda_rel)),
        fora_pla: false, _pes: re };
    });
    real.forEach(function (r) {
      if (idsT[r.id] || r.valor <= 0) return;
      var rp = valorTotal > 0 ? r.valor / valorTotal * 100 : 0;
      rows.push({ id: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
        target_pct: 0, real_eur: r.valor, real_pct: rp,
        exces_plan: r.valor, exces_pct: rp,
        banda_pp: PARAMS.banda_min_pp, fora_banda: true, fora_pla: true, _pes: r.valor });
    });

    var sobre = rows.filter(function (r) { return r.exces_plan > 0.5; });
    var prio = sobre.filter(function (r) { return r.fora_banda || r.fora_pla; });
    var cands = prio.length ? prio : sobre;

    function construir(objectiu) {
      // El sostre del fallback és real_eur: no es pot vendre més del que hi ha
      var assign = cands.length
        ? _cascada(cands, 'exces_plan', objectiu, rows, 'real_eur')
        : (function () { var a = {}, sv = 0; rows.forEach(function (r) { sv += r.real_eur; });
            rows.forEach(function (r) { a[r.id] = sv > 0 ? objectiu * r.real_eur / sv : 0; }); return a; })();
      var res = [];
      Object.keys(assign).forEach(function (id) {
        var aVendre = assign[id];
        if (!(aVendre > 0.5)) return;
        // Dins de la categoria, primer la posició amb menys plusvàlua
        var pos = agg.filter(function (p) { return p.cat === id; })
          .map(function (p) { return { id: p.id, nom: p.nom || cat(id).nom, valor: _num(p.valor_actual), ratio: p.ratio_guany }; })
          .sort(function (a, b) { return a.ratio - b.ratio; });
        var rest = aVendre, c = cat(id);
        for (var i = 0; i < pos.length && rest > 0.5; i++) {
          var imp = Math.min(rest, pos[i].valor);
          if (imp <= 0.5) continue;
          res.push({ posicio_id: pos[i].id, nom: pos[i].nom, cat: id, nom_cat: c.nom,
            emoji: c.emoji, color: c.color, import: imp, valor_posicio: pos[i].valor,
            ratio_guany: pos[i].ratio, guany: imp * pos[i].ratio,
            pct_posicio: pos[i].valor > 0 ? imp / pos[i].valor * 100 : 0,
            liquida_tot: imp >= pos[i].valor - 0.5 });
          rest -= imp;
        }
      });
      res = res.filter(function (o) { return o.import > 0.5; }).sort(function (a, b) { return b.import - a.import; });
      if (res.length > 1) {
        var g = 0;
        while (res.length > 1 && g++ < 40 && res[res.length - 1].import < iMin) {
          var pe = res.pop(), rec = null;
          for (var j = 0; j < res.length; j++) if (res[j].cat === pe.cat) { rec = res[j]; break; }
          if (!rec) rec = res[0];
          var mou = Math.min(pe.import, Math.max(0, rec.valor_posicio - rec.import));
          rec.import += mou; rec.guany = rec.import * rec.ratio_guany;
          rec.pct_posicio = rec.valor_posicio > 0 ? rec.import / rec.valor_posicio * 100 : 0;
          rec.liquida_tot = rec.import >= rec.valor_posicio - 0.5;
          if (mou < pe.import - 0.5) { pe.import -= mou; res.push(pe); break; }
          res.sort(function (a, b) { return b.import - a.import; });
        }
      }
      return res;
    }
    function impostDe(guany) {
      return (ambImp && typeof TBI_FISCAL !== 'undefined')
        ? TBI_FISCAL.impostEstalvi(altres + guany) - TBI_FISCAL.impostEstalvi(altres) : 0;
    }

    // Punt fix: la ràtio de plusvàlua de les posicions venudes no és la de
    // tota la cartera, així que la primera estimació del brut es queda curta.
    var ordres = [], brutReal = 0, guanyReal = 0, impost = 0, netReal = 0, it;
    for (it = 0; it < 12; it++) {
      ordres = construir(Math.min(brut, valorTotal));
      brutReal = 0; guanyReal = 0;
      ordres.forEach(function (o) { brutReal += o.import; guanyReal += o.guany; });
      impost = impostDe(guanyReal);
      netReal = brutReal - impost;
      if (brutReal >= valorTotal - 0.5) { insuficient = insuficient || (netReal < net - 0.5); break; }
      if (Math.abs(net - netReal) < 0.5) break;
      brut = Math.min(valorTotal, brutReal + (net - netReal));
    }

    var perCat = {};
    ordres.forEach(function (o) { perCat[o.cat] = (perCat[o.cat] || 0) + o.import; });
    var totalDesp = Math.max(1, valorTotal - brutReal);
    var despres = rows.map(function (r) {
      var venut = perCat[r.id] || 0, nou = Math.max(0, r.real_eur - venut);
      return { id: r.id, nom: r.nom, emoji: r.emoji, color: r.color, target_pct: r.target_pct,
        fora_pla: r.fora_pla, abans_pct: r.real_pct, venut: venut,
        despres_pct: nou / totalDesp * 100,
        desviacio_abans: r.real_pct - r.target_pct,
        desviacio_despres: nou / totalDesp * 100 - r.target_pct };
    }).sort(function (a, b) { return b.venut - a.venut; });

    var dA = 0, dD = 0;
    despres.forEach(function (d) { dA += Math.abs(d.desviacio_abans); dD += Math.abs(d.desviacio_despres); });

    return {
      net_demanat: net, brut_necessari: brutReal, guany_realitzat: guanyReal,
      impost: impost, net_real: netReal,
      tipus_efectiu: brutReal > 0 ? impost / brutReal * 100 : 0,
      ratio_guany_cartera: k.ratio_guany,
      valor_abans: valorTotal, valor_despres: valorTotal - brutReal,
      pct_cartera_venut: valorTotal > 0 ? brutReal / valorTotal * 100 : 0,
      ordres: ordres, rows: rows, despres: despres,
      coherencia_abans: Math.max(0, Math.round(100 - dA / 2)),
      coherencia_despres: Math.max(0, Math.round(100 - dD / 2)),
      insuficient: insuficient, import_min_ordre: iMin, considerar_impostos: ambImp
    };
  }

  return {
    VERSION: VERSION, PARAMS: PARAMS, TAXONOMIA: TAXONOMIA,
    cat: cat, resolCat: resolCat, terDeCategoria: terDeCategoria,
    agregats: agregats, xirr: xirr, fluxos: fluxos, kpis: kpis, twr: twr,
    distribucio: distribucio, pesRV: pesRV, ter: ter,
    matching: matching, retirada: retirada
  };
})();

try { console.log("[TBI_CARTERA] v" + TBI_CARTERA.VERSION + " carregat · " + TBI_CARTERA.TAXONOMIA.length + " categories"); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_CARTERA; }
