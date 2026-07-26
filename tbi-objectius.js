/* ============================================================
   TBI · MOTOR D'OBJECTIUS  (font única compartida)

   Fins ara un objectiu era text decoratiu: {titol, import, termini:"5 anys"}.
   No calculava res, no reclamava capital i la cartera no sabia que existia.
   El resultat era la incoherència de fons del sistema: un objectiu a 3 anys
   i el FIRE a 20 compartien el mateix 70% de renda variable.

   Aquest mòdul converteix l'objectiu en la UNITAT DE CÀLCUL del pla:

   1) SOBRES VIRTUALS · una sola cartera real. Cada objectiu reclama un
      tros del capital i un tros de l'aportació mensual. L'objectiu marcat
      com a `residual` (típicament el FIRE) absorbeix el que no reclama
      ningú. La suma mai pot superar el que hi ha de veritat.

   2) GLIDEPATH PER HORITZÓ · cada objectiu té la barreja RV/RF/liquiditat
      que li correspon pel temps que li queda, retallada SEMPRE pel sostre
      de risc de l'arquetip MiFID del client. Mai més risc del que el
      perfil permet, mai més risc del que l'horitzó aguanta.

   3) CARTERA PROPOSADA · la target del client és la barreja ponderada dels
      seus objectius, no l'arquetip aplicat en abstracte. Es proposa;
      l'assessor l'aprova o la sobreescriu.

   TERMES REALS: tot es calcula en euros d'avui (rendiment descomptada la
   inflació), igual que TBI_FIRE. Barrejar objectius en euros d'avui amb
   creixement nominal és l'error que fa semblar tots els plans viables.

   Disseny: funcions PURES. Cap referència a getClient(), APP, document ni
   Supabase, perquè es pugui provar sol i el puguin fer servir tant
   platform.html com tbi-app.html.

   Educació i anàlisi financera. No és assessorament d'inversió.
   ES5: var / function. TBI_FIRE i TBI_CARTERA són opcionals.
   ============================================================ */
var TBI_OBJECTIUS = (function () {
  "use strict";

  var VERSION = "2026-07-26";

  /* ---------- 1) PARÀMETRES ---------- */
  var PARAMS = {
    inflacio_defecte: 2.2,      // s'agafa de TBI_FIRE.REF si hi és
    ter_defecte: 0.25,
    // Rendiments NOMINALS bruts esperats per grup d'actiu (%, anual).
    // El host pot sobreescriure'ls amb els μ reals de la seva taula d'actius.
    mu: { rv: 7.0, rf: 3.2, cash: 2.0, alt: 5.0 },
    sigma: { rv: 16.0, rf: 5.0, cash: 0.5, alt: 14.0 },
    // Marge abans de cridar "fora de ruta" un objectiu (projecció / import)
    llindar_just: 0.90,
    // Desviació de RV (punts percentuals) tolerada abans d'avisar de risc
    tolerancia_rv_pp: 7,
    // Un objectiu FIRE desat fa més d'aquests mesos es considera ranci
    mesos_fire_ranci: 9,
    prioritats: ['essencial', 'important', 'desitjable']
  };

  /* ---------- 2) GLIDEPATH · barreja per horitzó ----------
     Punts d'ancoratge. Entremig s'interpola linealment. La lògica és
     senzilla i defensable: els diners que necessites aviat no poden estar
     exposats a una caiguda de la qual no hi hauria temps de recuperar-se.

     IMPORTANT sobre les tres galledes. `rv` no vol dir "renda variable" en
     sentit estricte: vol dir ACTIUS DE CREIXEMENT, tot allò que pot caure
     un 30% i necessita anys per recuperar-se. Or, crypto, crowdlending,
     private equity i start-ups hi compten. `rf` i `cash` són el CAPITAL
     SEGUR, l'únic que pot respondre d'un objectiu proper.

     Tractar els alternatius com a capital segur només perquè no són borsa
     és l'error que faria dir a una cartera amb 28% de crypto i or que té
     el fons d'emergència cobert. */
  var GLIDEPATH = [
    { anys: 0,  rv: 0,  rf: 0,  cash: 100 },
    { anys: 1,  rv: 0,  rf: 15, cash: 85 },
    { anys: 2,  rv: 12, rf: 33, cash: 55 },
    { anys: 3,  rv: 25, rf: 50, cash: 25 },
    { anys: 5,  rv: 45, rf: 47, cash: 8 },
    { anys: 8,  rv: 65, rf: 32, cash: 3 },
    { anys: 12, rv: 80, rf: 19, cash: 1 },
    { anys: 20, rv: 92, rf: 8,  cash: 0 },
    { anys: 30, rv: 95, rf: 5,  cash: 0 }
  ];

  /* Plantilles de tipus d'objectiu. `residual:true` només al FIRE. */
  var TIPUS = {
    fire:              { titol: 'Independència financera (FIRE)', residual: true,  prioritat: 'important',  flexible: true  },
    jubilacio:         { titol: 'Jubilació complementària',       residual: false, prioritat: 'essencial',  flexible: true  },
    habitatge_compra:  { titol: 'Compra d\'habitatge',            residual: false, prioritat: 'important',  flexible: true  },
    emergencia:        { titol: 'Fons d\'emergència',             residual: false, prioritat: 'essencial',  flexible: false },
    educacio_fills:    { titol: 'Educació superior fills',        residual: false, prioritat: 'essencial',  flexible: false },
    vehicle:           { titol: 'Vehicle nou',                    residual: false, prioritat: 'desitjable', flexible: true  },
    reforma:           { titol: 'Reforma habitatge',              residual: false, prioritat: 'desitjable', flexible: true  },
    viatge:            { titol: 'Viatge gran',                    residual: false, prioritat: 'desitjable', flexible: true  },
    negoci:            { titol: 'Capital inicial de negoci',      residual: false, prioritat: 'important',  flexible: true  },
    patrimoni:         { titol: 'Patrimoni familiar',             residual: false, prioritat: 'desitjable', flexible: true  },
    lliure:            { titol: 'Objectiu personalitzat',         residual: false, prioritat: 'important',  flexible: true  }
  };

  /* ---------- 3) UTILITATS ---------- */
  function _num(x, def) {
    var v = parseFloat(x);
    return isFinite(v) ? v : (def === undefined ? 0 : def);
  }
  function _clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function _inflacio() {
    try {
      if (typeof TBI_FIRE !== 'undefined' && TBI_FIRE.REF && isFinite(TBI_FIRE.REF.inflacio_defecte)) {
        return TBI_FIRE.REF.inflacio_defecte;
      }
    } catch (e) {}
    return PARAMS.inflacio_defecte;
  }

  function _avui(d) {
    if (d instanceof Date) return d;
    if (typeof d === 'string' && d) { var p = new Date(d); if (!isNaN(p.getTime())) return p; }
    return new Date();
  }

  /* Anys (decimals) entre avui i una data objectiu. Negatiu si ja ha passat. */
  function anysFins(dataObjectiu, avui) {
    if (!dataObjectiu) return null;
    var d = (dataObjectiu instanceof Date) ? dataObjectiu : new Date(String(dataObjectiu).length === 7 ? dataObjectiu + '-01' : dataObjectiu);
    if (isNaN(d.getTime())) return null;
    return (d.getTime() - _avui(avui).getTime()) / (365.25 * 86400000);
  }

  /* Data ISO (YYYY-MM-DD) d'aquí a N anys. */
  function dataDinsDe(anys, avui) {
    var d = new Date(_avui(avui).getTime() + _num(anys) * 365.25 * 86400000);
    return d.toISOString().slice(0, 10);
  }

  /* "5 anys" / "5" / "2031" / "juny 2031" → anys decimals. Compat amb
     el camp `termini` de text lliure dels objectius antics. */
  function _parseTermini(txt, avui) {
    if (txt === null || txt === undefined) return null;
    if (typeof txt === 'number') return isFinite(txt) ? txt : null;
    var s = String(txt).trim().toLowerCase();
    if (!s || s === '—' || s === '-') return null;
    var any = s.match(/(19|20)\d{2}/);
    if (any) {
      var anyNum = parseInt(any[0], 10);
      return anyNum - _avui(avui).getFullYear();
    }
    var n = s.match(/-?[\d.,]+/);
    if (!n) return null;
    var v = parseFloat(n[0].replace(',', '.'));
    if (!isFinite(v)) return null;
    if (s.indexOf('mes') >= 0) return v / 12;
    return v;
  }

  var _idSeq = 0;
  function _nouId(seed) {
    _idSeq++;
    return 'obj_' + (seed || 'x') + '_' + _idSeq;
  }

  /* ---------- 4) NORMALITZACIÓ I MIGRACIÓ ----------
     Accepta tant la forma antiga {titol, import, termini:"5 anys"} com la
     nova. No perd cap camp desconegut: els objectius poden portar `icona`,
     `meta` i el que l'assessor hi hagi escrit. */
  function normalitza(obj, opts) {
    opts = opts || {};
    var o = obj || {};
    var tipus = o.tipus || 'lliure';
    var plantilla = TIPUS[tipus] || TIPUS.lliure;
    var avui = _avui(opts.avui);

    var data = o.dataObjectiu || o.data_objectiu || null;
    if (!data) {
      var anys = _parseTermini(o.termini, avui);
      if (anys !== null) data = dataDinsDe(anys, avui);
    }

    var out = {
      id: o.id || _nouId(tipus),
      tipus: tipus,
      titol: o.titol || plantilla.titol,
      icona: o.icona || '',
      meta: o.meta || '',
      import: Math.max(0, _num(o.import)),
      dataObjectiu: data,
      prioritat: (PARAMS.prioritats.indexOf(o.prioritat) >= 0) ? o.prioritat : plantilla.prioritat,
      capitalAssignat: Math.max(0, _num(o.capitalAssignat)),
      aportacioAssignada: Math.max(0, _num(o.aportacioAssignada)),
      residual: (o.residual === undefined) ? !!plantilla.residual : !!o.residual,
      flexible: (o.flexible === undefined) ? !!plantilla.flexible : !!o.flexible,
      estat: o.estat || 'actiu',
      // es conserva el text original per no perdre el que hi havia escrit
      termini: o.termini || null
    };
    out.anys = anysFins(out.dataObjectiu, avui);
    return out;
  }

  function normalitzaLlista(llista, opts) {
    var arr = Array.isArray(llista) ? llista : [];
    var out = [], i;
    for (i = 0; i < arr.length; i++) out.push(normalitza(arr[i], opts));
    return out;
  }

  /* ---------- 5) BARREJA PER HORITZÓ ----------
     Retorna {rv, rf, cash} en %. `pct_rv_max` és el sostre de l'arquetip
     MiFID: el que sobri de RV baixa a RF. El perfil mana per damunt de
     l'horitzó, mai al revés. */
  function mixPerHoritzo(anys, pctRvMax) {
    var a = (anys === null || anys === undefined) ? 10 : Math.max(0, _num(anys));
    var g = GLIDEPATH, i, mix = null;
    if (a >= g[g.length - 1].anys) {
      mix = { rv: g[g.length - 1].rv, rf: g[g.length - 1].rf, cash: g[g.length - 1].cash };
    } else {
      for (i = 1; i < g.length; i++) {
        if (a <= g[i].anys) {
          var lo = g[i - 1], hi = g[i];
          var t = (a - lo.anys) / (hi.anys - lo.anys);
          mix = {
            rv: lo.rv + t * (hi.rv - lo.rv),
            rf: lo.rf + t * (hi.rf - lo.rf),
            cash: lo.cash + t * (hi.cash - lo.cash)
          };
          break;
        }
      }
    }
    if (!mix) mix = { rv: g[0].rv, rf: g[0].rf, cash: g[0].cash };

    var sostre = (pctRvMax === null || pctRvMax === undefined) ? 100 : _clamp(_num(pctRvMax, 100), 0, 100);
    var retallat = false;
    if (mix.rv > sostre) {
      mix.rf += (mix.rv - sostre);
      mix.rv = sostre;
      retallat = true;
    }
    var suma = mix.rv + mix.rf + mix.cash;
    if (suma > 0) {
      mix.rv = mix.rv / suma * 100;
      mix.rf = mix.rf / suma * 100;
      mix.cash = mix.cash / suma * 100;
    }
    mix.anys = a;
    mix.retallat_per_perfil = retallat;
    return mix;
  }

  /* Rendiment esperat d'una barreja. Torna nominal i real. */
  function retornMix(mix, opts) {
    opts = opts || {};
    var mu = opts.mu || PARAMS.mu;
    var sg = opts.sigma || PARAMS.sigma;
    var ter = _num(opts.ter, PARAMS.ter_defecte);
    var infl = _num(opts.inflacio, _inflacio());
    var w = { rv: _num(mix.rv) / 100, rf: _num(mix.rf) / 100, cash: _num(mix.cash) / 100, alt: _num(mix.alt) / 100 };

    var nominal = w.rv * _num(mu.rv) + w.rf * _num(mu.rf) + w.cash * _num(mu.cash) + w.alt * _num(mu.alt, 0);
    nominal -= ter;
    // σ sense correlacions creuades seria massa optimista; s'aplica una
    // correlació conservadora entre RV i RF (0,2) i cash independent.
    var varC = Math.pow(w.rv * _num(sg.rv), 2) + Math.pow(w.rf * _num(sg.rf), 2)
             + Math.pow(w.cash * _num(sg.cash), 2) + Math.pow(w.alt * _num(sg.alt, 0), 2)
             + 2 * 0.2 * (w.rv * _num(sg.rv)) * (w.rf * _num(sg.rf));
    var real = ((1 + nominal / 100) / (1 + infl / 100) - 1) * 100;
    return { nominal: nominal, real: real, sigma: Math.sqrt(Math.max(0, varC)), ter: ter, inflacio: infl };
  }

  /* ---------- 6) ASSIGNACIÓ · els sobres virtuals ----------
     p: {capital_total, aportacio_total}
     Els objectius no residuals reclamen el que tenen assignat. El residual
     (FIRE) es queda el sobrant. Si la suma dels explícits supera el que hi
     ha de veritat, NO es reparteix en silenci: es marca `sobreassignat` i
     s'exposa també el repartiment escalat perquè el host pugui ensenyar
     les dues xifres. */
  function assignacio(objectius, p) {
    p = p || {};
    var capTotal = Math.max(0, _num(p.capital_total));
    var aporTotal = Math.max(0, _num(p.aportacio_total));
    var objs = normalitzaLlista(objectius, p);
    var actius = [], i, o;

    for (i = 0; i < objs.length; i++) {
      if (objs[i].estat === 'pausat' || objs[i].estat === 'assolit') { objs[i].capitalEfectiu = 0; objs[i].aportacioEfectiva = 0; continue; }
      actius.push(objs[i]);
    }

    var residual = null, explicits = [];
    for (i = 0; i < actius.length; i++) {
      if (actius[i].residual && !residual) residual = actius[i];
      else explicits.push(actius[i]);
    }

    var sumaCap = 0, sumaAport = 0;
    for (i = 0; i < explicits.length; i++) {
      sumaCap += explicits[i].capitalAssignat;
      sumaAport += explicits[i].aportacioAssignada;
    }

    var sobreCap = sumaCap > capTotal + 0.5;
    var sobreAport = sumaAport > aporTotal + 0.5;
    var fCap = sobreCap && sumaCap > 0 ? capTotal / sumaCap : 1;
    var fAport = sobreAport && sumaAport > 0 ? aporTotal / sumaAport : 1;

    for (i = 0; i < explicits.length; i++) {
      o = explicits[i];
      o.capitalEfectiu = o.capitalAssignat * fCap;
      o.aportacioEfectiva = o.aportacioAssignada * fAport;
    }

    var restaCap = Math.max(0, capTotal - Math.min(sumaCap, capTotal));
    var restaAport = Math.max(0, aporTotal - Math.min(sumaAport, aporTotal));
    if (residual) {
      residual.capitalEfectiu = restaCap;
      residual.aportacioEfectiva = restaAport;
      residual.capitalAssignat = restaCap;
      residual.aportacioAssignada = restaAport;
    }

    var avisos = [];
    if (sobreCap) {
      avisos.push({
        codi: 'capital_sobreassignat', gravetat: 'alta',
        titol: 'Els objectius reclamen més capital del que hi ha',
        detall: 'Assignats ' + Math.round(sumaCap) + ' € sobre una cartera de ' + Math.round(capTotal) + ' €. '
              + 'Falten ' + Math.round(sumaCap - capTotal) + ' €.'
      });
    }
    if (sobreAport) {
      avisos.push({
        codi: 'aportacio_sobreassignada', gravetat: 'alta',
        titol: 'Els objectius reclamen més aportació de la que hi ha',
        detall: 'Assignats ' + Math.round(sumaAport) + ' €/mes sobre una aportació de ' + Math.round(aporTotal) + ' €/mes.'
      });
    }
    if (!residual && (restaCap > capTotal * 0.05)) {
      avisos.push({
        codi: 'sense_residual', gravetat: 'mitjana',
        titol: 'Hi ha capital sense objectiu assignat',
        detall: Math.round(restaCap) + ' € no pertanyen a cap objectiu. Marca el FIRE com a residual perquè l\'absorbeixi.'
      });
    }

    return {
      objectius: objs,
      capital_total: capTotal,
      aportacio_total: aporTotal,
      capital_assignat: Math.min(sumaCap, capTotal) + (residual ? restaCap : 0),
      capital_lliure: residual ? 0 : restaCap,
      aportacio_lliure: residual ? 0 : restaAport,
      sobreassignat: sobreCap || sobreAport,
      factor_escala_capital: fCap,
      factor_escala_aportacio: fAport,
      residual_id: residual ? residual.id : null,
      avisos: avisos
    };
  }

  /* ---------- 7) PROJECCIÓ D'UN OBJECTIU ----------
     En euros d'avui. Torna on arribarà l'objectiu amb el que té assignat,
     quant li falta i què caldria per tancar el forat. */
  function _fv(C, A, rm, n) {
    if (n <= 0) return C;
    if (Math.abs(rm) < 1e-9) return C + A * n;
    var f = Math.pow(1 + rm, n);
    return C * f + A * (f - 1) / rm;
  }
  function _aportacioNecessaria(objectiu, C, rm, n) {
    if (n <= 0) return Math.max(0, objectiu - C);
    if (Math.abs(rm) < 1e-9) return Math.max(0, (objectiu - C) / n);
    var f = Math.pow(1 + rm, n);
    return Math.max(0, (objectiu - C * f) * rm / (f - 1));
  }
  function _mesosFins(objectiu, C, A, rm) {
    if (C >= objectiu) return 0;
    if (rm <= 0 && A <= 0) return Infinity;
    var cap = C, m = 0;
    while (cap < objectiu && m < 1200) { cap = cap * (1 + rm) + A; m++; }
    return cap >= objectiu ? m : Infinity;
  }

  function projeccio(obj, p) {
    p = p || {};
    var o = (obj && obj.capitalEfectiu !== undefined) ? obj : normalitza(obj, p);
    var avui = _avui(p.avui);
    var anys = (o.anys === null || o.anys === undefined) ? anysFins(o.dataObjectiu, avui) : o.anys;
    var mix = p.mix || mixPerHoritzo(anys, p.pct_rv_max);
    var r = p.retorn_real_pct !== undefined ? { real: _num(p.retorn_real_pct) } : retornMix(mix, p);
    var rm = r.real / 100 / 12;

    var C = _num(o.capitalEfectiu !== undefined ? o.capitalEfectiu : o.capitalAssignat);
    var A = _num(o.aportacioEfectiva !== undefined ? o.aportacioEfectiva : o.aportacioAssignada);
    var objectiu = Math.max(0, _num(o.import));
    var n = (anys === null) ? null : Math.max(0, Math.round(anys * 12));

    var projectat = (n === null) ? null : _fv(C, A, rm, n);
    var mesos = _mesosFins(objectiu, C, A, rm);
    var ratio = (objectiu > 0 && projectat !== null) ? projectat / objectiu : (objectiu === 0 ? 1 : null);

    var estat;
    if (objectiu > 0 && C >= objectiu) estat = 'assolit';
    else if (ratio === null) estat = 'sense_data';
    else if (ratio >= 1) estat = 'en_ruta';
    else if (ratio >= PARAMS.llindar_just) estat = 'just';
    else estat = 'fora_ruta';

    return {
      id: o.id,
      titol: o.titol,
      anys: anys,
      mesos_horitzo: n,
      mix: mix,
      retorn_real_pct: r.real,
      capital_assignat: C,
      aportacio_assignada: A,
      import_objectiu: objectiu,
      projectat: projectat,
      gap: (projectat === null) ? null : (objectiu - projectat),
      cobertura_pct: (ratio === null) ? null : ratio * 100,
      progres_pct: objectiu > 0 ? Math.min(100, C / objectiu * 100) : 100,
      aportacio_necessaria: (n === null) ? null : _aportacioNecessaria(objectiu, C, rm, n),
      mesos_al_ritme_actual: mesos,
      data_projectada: (mesos === Infinity) ? null : dataDinsDe(mesos / 12, avui),
      estat_ritme: estat,
      prioritat: o.prioritat,
      flexible: o.flexible
    };
  }

  /* ---------- 8) CARTERA PROPOSADA ----------
     La target del client és la barreja ponderada dels seus objectius.
     El pes de cada objectiu és el capital que té assignat (si encara no
     n'hi ha, el seu import descomptat, perquè un objectiu nou i gros
     pesi més que un de petit). */
  function carteraProposada(objectius, p) {
    p = p || {};
    var a = assignacio(objectius, p);
    var objs = a.objectius, i, o, pesos = [], sumaPes = 0;

    for (i = 0; i < objs.length; i++) {
      o = objs[i];
      if (o.estat === 'pausat' || o.estat === 'assolit') { pesos.push(0); continue; }
      var w = _num(o.capitalEfectiu);
      if (w <= 0) w = Math.max(0, _num(o.import)) * 0.10; // pes testimonial: encara no finançat
      pesos.push(w);
      sumaPes += w;
    }
    if (sumaPes <= 0) return null;

    var blend = { rv: 0, rf: 0, cash: 0 }, detall = [];
    for (i = 0; i < objs.length; i++) {
      if (pesos[i] <= 0) continue;
      o = objs[i];
      var w2 = pesos[i] / sumaPes;
      var mix = mixPerHoritzo(o.anys, p.pct_rv_max);
      blend.rv += w2 * mix.rv;
      blend.rf += w2 * mix.rf;
      blend.cash += w2 * mix.cash;
      detall.push({ id: o.id, titol: o.titol, anys: o.anys, pes_pct: w2 * 100, mix: mix, prioritat: o.prioritat });
    }
    detall.sort(function (x, y) { return y.pes_pct - x.pes_pct; });
    blend.rendiment = retornMix(blend, p);
    blend.detall = detall;
    blend.assignacio = a;
    return blend;
  }

  /* Reescala una cartera target existent perquè els seus pesos de grup
     coincideixin amb la barreja proposada, PRESERVANT les categories i
     les proporcions internes que ha triat l'assessor. Els alternatius
     (il·líquids, decisió deliberada) es mantenen intactes i la resta es
     reparteix sobre el que queda.
     `target`: [{id, pct, ...}] · `grupDe`: funció id → 'rv'|'rf'|'cash'|'alt'|'mixt' */
  function aplicaATarget(target, blend, grupDe) {
    if (!Array.isArray(target) || !target.length || !blend) return null;
    var g = grupDe || _grupPerDefecte;
    var i, actual = { rv: 0, rf: 0, cash: 0, alt: 0 }, totalAlt = 0, total = 0;

    for (i = 0; i < target.length; i++) {
      var pct = _num(target[i].pct);
      var gr = g(target[i].id || target[i].nom);
      total += pct;
      if (gr === 'mixt') { actual.rv += pct * 0.6; actual.rf += pct * 0.4; }
      else if (gr === 'alt') { actual.alt += pct; totalAlt += pct; }
      else actual[gr] = (actual[gr] || 0) + pct;
    }
    if (total <= 0) return null;

    // Els alternatius es queden com estan, però COMPTEN com a creixement:
    // si la barreja vol un 72% de creixement i els il·líquids ja n'aporten
    // un 28%, a les línies de renda variable els toca un 44%, no un 72%.
    // Comptar-los com a "no creixement" inflaria el risc real de la cartera.
    var disponible = Math.max(0, total - totalAlt);
    var creixementVolgut = blend.rv / 100 * total;
    var vol = {
      rv: Math.max(0, creixementVolgut - totalAlt),
      rf: blend.rf / 100 * total,
      cash: blend.cash / 100 * total
    };
    // Si els alternatius ja passen del creixement que es vol, el sobrant no
    // es pot desfer sense tocar-los: es reparteix el que queda de manera
    // proporcional i s'avisa.
    var excesAlt = Math.max(0, totalAlt - creixementVolgut);
    if (excesAlt > 0.5) {
      var restant = Math.max(0, disponible);
      var sumaDef = vol.rf + vol.cash;
      if (sumaDef > 0) {
        vol.rf = vol.rf / sumaDef * restant;
        vol.cash = vol.cash / sumaDef * restant;
      }
    }

    // Grups que la barreja demana i que no tenen cap categoria on caure.
    // Passa de veritat: una target sense cap línia de renda fixa. S'avisa
    // i el pes es reubica al grup més proper en lloc d'evaporar-se.
    var sense = [];
    if (vol.rv > 0.5 && actual.rv <= 0) sense.push('rv');
    if (vol.rf > 0.5 && actual.rf <= 0) sense.push('rf');
    if (vol.cash > 0.5 && actual.cash <= 0) sense.push('cash');

    if (actual.rf <= 0 && vol.rf > 0) {
      if (actual.cash > 0) vol.cash += vol.rf; else vol.rv += vol.rf;
      vol.rf = 0;
    }
    if (actual.cash <= 0 && vol.cash > 0) {
      if (actual.rf > 0) vol.rf += vol.cash; else vol.rv += vol.cash;
      vol.cash = 0;
    }
    if (actual.rv <= 0 && vol.rv > 0) {
      if (actual.rf > 0) vol.rf += vol.rv; else vol.cash += vol.rv;
      vol.rv = 0;
    }

    var f = {
      rv: actual.rv > 0 ? vol.rv / actual.rv : 0,
      rf: actual.rf > 0 ? vol.rf / actual.rf : 0,
      cash: actual.cash > 0 ? vol.cash / actual.cash : 0
    };

    if (excesAlt > 0.5) sense.push('exces_alternatius');

    var out = [], sumaNoAlt = 0;
    for (i = 0; i < target.length; i++) {
      var t = target[i], p0 = _num(t.pct), gr2 = g(t.id || t.nom), nou;
      if (gr2 === 'alt') nou = p0;
      else if (gr2 === 'mixt') nou = p0 * (0.6 * f.rv + 0.4 * f.rf);
      else nou = p0 * (f[gr2] || 0);
      out.push({ id: t.id, nom: t.nom, color: t.color, pct_abans: p0, pct: nou, grup: gr2 });
      if (gr2 !== 'alt') sumaNoAlt += nou;
    }
    // El quadrament final només toca el que NO és alternatiu: si es
    // renormalitzés tot, els il·líquids que havien de quedar intactes
    // s'inflarien per compensar. Va passar amb una target real.
    if (sumaNoAlt > 0 && Math.abs(sumaNoAlt - disponible) > 0.01) {
      for (i = 0; i < out.length; i++) {
        if (out[i].grup !== 'alt') out[i].pct = out[i].pct / sumaNoAlt * disponible;
      }
    }
    for (i = 0; i < out.length; i++) out[i].pct = Math.round(out[i].pct * 10) / 10;
    return { target: out, grups_sense_cabuda: sense, blend: { rv: blend.rv, rf: blend.rf, cash: blend.cash } };
  }

  function _grupPerDefecte(id) {
    try {
      if (typeof TBI_CARTERA !== 'undefined' && TBI_CARTERA.cat) {
        var c = TBI_CARTERA.cat(id);
        if (c && c.grup) return c.grup === 'altres' ? 'alt' : c.grup;
      }
    } catch (e) {}
    var s = String(id || '');
    if (s.indexOf('rv_') === 0) return 'rv';
    if (s.indexOf('rf_') === 0) return 'rf';
    if (s.indexOf('fons_') === 0) return 'mixt';
    if (s === 'liquiditat') return 'cash';
    return 'alt';
  }

  /* ---------- 9) COHERÈNCIA GLOBAL ----------
     ctx: {objectius, capital_total, aportacio_total, pes_rv_real,
           pct_rv_max, target_actual, fire, avui}
     Torna una puntuació i la llista de què no lliga. La puntuació no és
     un premi: és un recompte de coses per resoldre. */
  function coherencia(ctx) {
    ctx = ctx || {};
    var a = assignacio(ctx.objectius, ctx);
    var objs = a.objectius;
    var flags = a.avisos.slice();
    var i, o, pr, projeccions = [];

    for (i = 0; i < objs.length; i++) {
      o = objs[i];
      if (o.estat === 'pausat' || o.estat === 'assolit') continue;
      pr = projeccio(o, ctx);
      projeccions.push(pr);

      if (!o.dataObjectiu) {
        flags.push({
          codi: 'sense_data', gravetat: 'mitjana', objectiu_id: o.id,
          titol: o.titol + ': sense data',
          detall: 'Sense data objectiu no es pot calcular ni l\'horitzó ni la barreja que li toca.'
        });
        continue;
      }
      if (o.import <= 0) {
        flags.push({
          codi: 'sense_import', gravetat: 'mitjana', objectiu_id: o.id,
          titol: o.titol + ': sense import',
          detall: 'Un objectiu sense xifra no es pot seguir.'
        });
        continue;
      }
      if (o.capitalEfectiu <= 0 && o.aportacioEfectiva <= 0) {
        // Sense res assignat no és que vagi "fora de ruta": és que encara
        // no s'ha configurat. Dir-li fora de ruta amaga el problema real.
        flags.push({
          codi: 'sense_assignacio', gravetat: 'mitjana', objectiu_id: o.id,
          titol: o.titol + ': no té ni capital ni aportació assignats',
          detall: 'Cap euro de la cartera treballa per aquest objectiu. Assigna-li un sobre o marca\'l com a residual.'
        });
        continue;
      }
      if (pr.estat_ritme === 'fora_ruta') {
        // Un objectiu flexible que va curt no és una urgència: la data pot
        // moure's. Un d'essencial amb data fixa, sí.
        flags.push({
          codi: 'fora_ruta',
          gravetat: o.prioritat === 'essencial' ? 'alta' : (o.flexible ? 'baixa' : 'mitjana'),
          objectiu_id: o.id,
          titol: o.titol + ': el ritme actual no hi arriba',
          detall: 'Projecció ' + Math.round(pr.projectat) + ' € sobre ' + Math.round(o.import) + ' € el '
                + String(o.dataObjectiu).slice(0, 7) + '. Caldrien ' + Math.round(pr.aportacio_necessaria)
                + ' €/mes (ara n\'hi van ' + Math.round(pr.aportacio_assignada) + ').'
        });
      } else if (pr.estat_ritme === 'just') {
        flags.push({
          codi: 'just', gravetat: 'baixa', objectiu_id: o.id,
          titol: o.titol + ': hi arriba just',
          detall: 'Cobertura del ' + Math.round(pr.cobertura_pct) + '%. Qualsevol desviació el deixa curt.'
        });
      }
      if (o.anys !== null && o.anys < 3 && o.capitalEfectiu <= 0 && o.import > 0) {
        flags.push({
          codi: 'curt_sense_capital', gravetat: 'alta', objectiu_id: o.id,
          titol: o.titol + ': a menys de 3 anys i sense capital assignat',
          detall: 'Un objectiu tan a prop hauria de tenir els diners ja apartats en liquiditat, no per acumular.'
        });
      }
    }

    // COBERTURA SEGURA · la prova de foc del model de sobres.
    // Comparar el % de RV global amb el sostre de l'objectiu més proper és
    // massa gruixut: castiga una cartera agressiva encara que el fons
    // d'emergència, que hi pesa poc, estigui perfectament cobert. El que
    // importa és si hi ha prou euros FORA de renda variable per cobrir el
    // que cada sobre necessita en segur pel seu horitzó.
    var pesRvReal = (ctx.pes_rv_real === undefined || ctx.pes_rv_real === null) ? null : _num(ctx.pes_rv_real);
    var segurNecessari = 0, culpable = null;
    for (i = 0; i < projeccions.length; i++) {
      pr = projeccions[i];
      var necess = _num(pr.capital_assignat) * (100 - _num(pr.mix.rv)) / 100;
      segurNecessari += necess;
      if (pr.anys !== null && pr.anys <= 5 && (!culpable || pr.anys < culpable.anys)) culpable = pr;
    }
    var segurReal = (pesRvReal === null) ? null : a.capital_total * (100 - pesRvReal) / 100;
    if (segurReal !== null && segurNecessari > segurReal + 500) {
      flags.push({
        codi: 'cobertura_segura_insuficient', gravetat: 'alta',
        objectiu_id: culpable ? culpable.id : null,
        titol: 'No hi ha prou capital fora de borsa per als objectius propers',
        detall: 'Els objectius necessiten ' + Math.round(segurNecessari) + ' € en renda fixa i liquiditat, '
              + 'i la cartera només en té ' + Math.round(segurReal) + ' €. '
              + (culpable ? 'El més exposat és "' + culpable.titol + '", a '
                  + (culpable.anys < 1 ? 'menys d\'un any.' : Math.round(culpable.anys) + ' anys.') : '')
      });
    }

    // La cartera real contra la que proposen els objectius
    var blend = carteraProposada(ctx.objectius, ctx);
    if (blend && pesRvReal !== null) {
      var desv = Math.abs(pesRvReal - blend.rv);
      if (desv > PARAMS.tolerancia_rv_pp * 1.5) {
        flags.push({
          codi: 'target_desalineada', gravetat: 'mitjana',
          titol: 'La cartera no reflecteix els objectius',
          detall: 'Els objectius demanen un ' + Math.round(blend.rv) + '% de renda variable i la cartera en té un '
                + Math.round(pesRvReal) + '%.'
        });
      }
    }

    // FIRE ranci o descordat del full de ruta
    if (ctx.fire) {
      var fireObj = null;
      for (i = 0; i < objs.length; i++) if (objs[i].tipus === 'fire') { fireObj = objs[i]; break; }
      if (ctx.fire.actualitzat) {
        var mesos = (_avui(ctx.avui).getTime() - new Date(ctx.fire.actualitzat).getTime()) / (30.44 * 86400000);
        if (isFinite(mesos) && mesos > PARAMS.mesos_fire_ranci) {
          flags.push({
            codi: 'fire_ranci', gravetat: 'baixa',
            titol: 'El càlcul FIRE fa ' + Math.round(mesos) + ' mesos que no es toca',
            detall: 'Convé recalcular-lo amb el capital i l\'aportació d\'ara.'
          });
        }
      }
      if (fireObj && ctx.fire.objectiuFIRE && Math.abs(_num(ctx.fire.objectiuFIRE) - fireObj.import) > Math.max(1000, fireObj.import * 0.02)) {
        flags.push({
          codi: 'fire_descordat', gravetat: 'mitjana', objectiu_id: fireObj.id,
          titol: 'La calculadora FIRE i el full de ruta diuen coses diferents',
          detall: 'Calculadora: ' + Math.round(_num(ctx.fire.objectiuFIRE)) + ' €. Full de ruta: ' + Math.round(fireObj.import) + ' €.'
        });
      }
      // El retorn escrit a mà a la calculadora contra el que dona la cartera
      if (blend && ctx.fire.retornEsperat) {
        var esperatReal = blend.rendiment.nominal;
        if (_num(ctx.fire.retornEsperat) > esperatReal + 3) {
          flags.push({
            codi: 'retorn_optimista', gravetat: 'alta',
            titol: 'El rendiment del càlcul FIRE no el sosté la cartera',
            detall: 'La calculadora fa servir un ' + _num(ctx.fire.retornEsperat).toFixed(1).replace('.', ',')
                  + '% i la barreja proposada n\'espera un ' + esperatReal.toFixed(1).replace('.', ',')
                  + '% nominal. Amb un supòsit inflat, els anys que falten surten curts.'
          });
        }
      }
    }

    var pes = { alta: 18, mitjana: 8, baixa: 3 }, penalitzacio = 0;
    for (i = 0; i < flags.length; i++) penalitzacio += (pes[flags[i].gravetat] || 5);
    var score = Math.max(0, Math.min(100, Math.round(100 - penalitzacio)));

    flags.sort(function (x, y) { return (pes[y.gravetat] || 0) - (pes[x.gravetat] || 0); });

    return {
      score: score,
      flags: flags,
      n_alta: flags.filter(function (f) { return f.gravetat === 'alta'; }).length,
      assignacio: a,
      projeccions: projeccions,
      blend: blend,
      capital_segur_necessari: segurNecessari,
      capital_segur_real: segurReal
    };
  }

  /* ---------- 10) PONT AMB LA CALCULADORA FIRE ----------
     Els dos sentits, perquè deixin de ser dues xifres independents. */

  /* clients.fire → objectiu del full de ruta (per fusionar-lo a la llista) */
  function desDeFire(fire, opts) {
    opts = opts || {};
    var f = fire || {};
    var objectiu = Math.round(_num(f.objectiuFIRE));
    if (!objectiu) return null;
    var anys = (f.anysEstimats === null || f.anysEstimats === undefined) ? null : _num(f.anysEstimats);
    return normalitza({
      id: opts.id || null,
      tipus: 'fire',
      titol: 'Independència financera (FIRE)',
      meta: (opts.model ? opts.model + ' · ' : '')
          + (f.taxaRetirada ? 'retirada ' + _num(f.taxaRetirada).toFixed(2).replace('.', ',') + '% · ' : '')
          + 'sincronitzat amb la calculadora',
      import: objectiu,
      dataObjectiu: anys === null ? null : dataDinsDe(anys, opts.avui),
      residual: true,
      capitalAssignat: _num(f.capitalActual),
      aportacioAssignada: _num(f.aportacioMensual),
      estat: 'actiu'
    }, opts);
  }

  /* objectiu residual + cartera real → paràmetres per a TBI_FIRE.objectiuFIRE,
     amb el rendiment que surt de la barreja, no d'un número escrit a mà. */
  function capAFire(obj, p) {
    p = p || {};
    var o = normalitza(obj, p);
    var mix = p.mix || mixPerHoritzo(o.anys, p.pct_rv_max);
    var r = retornMix(mix, p);
    return {
      despeses_anuals_netes: _num(p.despeses_anuals_netes),
      edat_actual: _num(p.edat_actual, 35),
      edat_retirada: _num(p.edat_retirada, 55),
      pct_rv: mix.rv,
      ter: _num(p.ter, PARAMS.ter_defecte),
      ratio_guany: _num(p.ratio_guany, 0.35),
      capital_actual: _num(o.capitalEfectiu !== undefined ? o.capitalEfectiu : o.capitalAssignat),
      aportacio_mensual: _num(o.aportacioEfectiva !== undefined ? o.aportacioEfectiva : o.aportacioAssignada),
      retorn_brut: r.nominal + r.ter,   // TBI_FIRE ja hi resta el TER
      inflacio: r.inflacio
    };
  }

  /* ---------- 11) REPARTIMENT D'UNA APORTACIÓ PER OBJECTIU ----------
     El client aporta 500 € i abans de decidir a quin fons van, cal saber
     de quin objectiu són. Prioritat: primer els essencials que van fora
     de ruta, després la resta en proporció a l'aportació assignada. */
  function repartirAportacio(objectius, import_, p) {
    p = p || {};
    var total = Math.max(0, _num(import_));
    if (total <= 0) return null;
    var a = assignacio(objectius, p);
    var objs = a.objectius.filter(function (o) { return o.estat !== 'pausat' && o.estat !== 'assolit'; });
    if (!objs.length) return null;

    var base = 0, i;
    for (i = 0; i < objs.length; i++) base += _num(objs[i].aportacioEfectiva);
    var files = [];
    for (i = 0; i < objs.length; i++) {
      var o = objs[i];
      var quota = base > 0 ? _num(o.aportacioEfectiva) / base : 1 / objs.length;
      var pr = projeccio(o, p);
      files.push({
        id: o.id, titol: o.titol, icona: o.icona, prioritat: o.prioritat,
        import: Math.round(total * quota * 100) / 100,
        pct: quota * 100,
        estat_ritme: pr.estat_ritme,
        anys: o.anys,
        mix: pr.mix
      });
    }
    // Quadrar els cèntims a l'objectiu més gros
    var suma = 0;
    for (i = 0; i < files.length; i++) suma += files[i].import;
    if (files.length && Math.abs(suma - total) > 0.001) {
      files.sort(function (x, y) { return y.import - x.import; });
      files[0].import = Math.round((files[0].import + (total - suma)) * 100) / 100;
    }
    files.sort(function (x, y) { return y.import - x.import; });
    return { total: total, files: files, assignacio: a };
  }

  return {
    VERSION: VERSION,
    PARAMS: PARAMS,
    GLIDEPATH: GLIDEPATH,
    TIPUS: TIPUS,
    anysFins: anysFins,
    dataDinsDe: dataDinsDe,
    normalitza: normalitza,
    normalitzaLlista: normalitzaLlista,
    mixPerHoritzo: mixPerHoritzo,
    retornMix: retornMix,
    assignacio: assignacio,
    projeccio: projeccio,
    carteraProposada: carteraProposada,
    aplicaATarget: aplicaATarget,
    coherencia: coherencia,
    desDeFire: desDeFire,
    capAFire: capAFire,
    repartirAportacio: repartirAportacio
  };
})();

try { console.log("[TBI_OBJECTIUS] v" + TBI_OBJECTIUS.VERSION + " carregat"); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_OBJECTIUS; }
