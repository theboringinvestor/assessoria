/* ============================================================
   TBI · MÒDUL D'HIPOTECA I DEUTE  (font única)
   - Sistema francès: quota, quadre d'amortització mes a mes
   - Tipus fix / variable / mixt amb revisions i escenaris d'euríbor
   - Amortitzacions anticipades (reduir quota o reduir termini)
   - Comissions segons Llei 5/2019 (LCCI)
   - TAE real incloent despeses inicials
   - Fiscalitat: base de l'estalvi 2026 i deducció per habitatge <2013
   - Comparativa rigorosa amortitzar vs invertir (mateix pressupost mensual)

   ATENCIÓ REGULATÒRIA: aquest mòdul fa simulació i anàlisi comparativa.
   No és intermediació de crèdit immobiliari (activitat reservada, Llei 5/2019)
   ni recomanació de producte. No conté noms d'entitats.

   ES5: var / function / concatenació. Sense dependències.
   ============================================================ */
var TBI_HIPOTECA = (function () {
  "use strict";

  var VERSION = "2026-07-25";

  /* ---------- 1) PARÀMETRES DE REFERÈNCIA ----------
     Actualitzables en un sol lloc. Les dades de mercat porten data. */
  var REF = {
    euribor_12m: 2.82,          // mitjana de juliol 2026
    euribor_data: "juliol 2026",

    // Base de l'estalvi IRPF (Llei 7/2024, vigent 2026). Estatal, uniforme.
    trams_estalvi: [
      { fins: 6000,   tipus: 19 },
      { fins: 50000,  tipus: 21 },
      { fins: 200000, tipus: 23 },
      { fins: 300000, tipus: 27 },
      { fins: Infinity, tipus: 30 }
    ],

    // Deducció per inversió en habitatge habitual. Només per a habitatges
    // adquirits abans de l'1/1/2013 amb dret consolidat.
    deduccio: { base_max: 9040, pct: 15, limit_any: 1356 },

    // Límits màxims de comissió per amortització anticipada (LCCI art. 23).
    // Sempre topats per la pèrdua financera real del prestador.
    lcci: {
      fix_primers_10a: 2.0,
      fix_despres_10a: 1.5,
      variable_opcio_3a: 0.25,   // 0,25% durant els 3 primers anys
      variable_opcio_5a: 0.15,   // o bé 0,15% durant els 5 primers anys
      novacio_a_fix_3a: 0.05     // pas de variable a fix, 3 primers anys
    },

    // Despeses orientatives de constitució (les paga el client des de 2019,
    // excepte l'AJD, que va a càrrec del prestador des del RDL 17/2018).
    despeses_defecte: {
      taxacio: 350,
      notaria_copia: 100,
      gestoria: 300,
      comissio_obertura_pct: 0
    }
  };

  /* ---------- 2) UTILITATS ---------- */
  function _num(x, def) {
    var v = parseFloat(x);
    return isFinite(v) ? v : (def === undefined ? 0 : def);
  }
  function _r2(x) { return Math.round(x * 100) / 100; }

  /* Quota mensual constant del sistema francès.
     i = tipus nominal anual en %, n = nombre de mesos. */
  function quotaFrancesa(capital, iAnual, n) {
    capital = _num(capital); n = Math.round(_num(n));
    if (capital <= 0 || n <= 0) return 0;
    var i = _num(iAnual) / 100 / 12;
    if (Math.abs(i) < 1e-12) return capital / n;
    return capital * i / (1 - Math.pow(1 + i, -n));
  }

  /* Capital pendent després de k quotes (fórmula tancada, per a verificació) */
  function pendentDespres(capital, iAnual, n, k) {
    var i = _num(iAnual) / 100 / 12;
    if (Math.abs(i) < 1e-12) return capital * (1 - k / n);
    var q = quotaFrancesa(capital, iAnual, n);
    return capital * Math.pow(1 + i, k) - q * (Math.pow(1 + i, k) - 1) / i;
  }

  /* ---------- 3) TIPUS APLICABLE MES A MES ----------
     cfg.modalitat: 'fix' | 'variable' | 'mixt'
       fix      → cfg.tipus_fix
       variable → cfg.diferencial + euríbor de l'escenari
       mixt     → cfg.tipus_fix durant cfg.anys_fix, després variable
     cfg.revisio_mesos: cada quants mesos es revisa el tipus (12 per defecte)
     escenari: funció (any) → euríbor %, o número constant */
  function _euriborDe(escenari, anyIdx) {
    if (typeof escenari === "function") return _num(escenari(anyIdx), REF.euribor_12m);
    if (typeof escenari === "number") return escenari;
    if (escenari && escenari.length) {
      return _num(escenari[Math.min(anyIdx, escenari.length - 1)], REF.euribor_12m);
    }
    return REF.euribor_12m;
  }

  function tipusAlMes(cfg, mes, escenari) {
    var modalitat = cfg.modalitat || "fix";
    if (modalitat === "fix") return _num(cfg.tipus_fix);

    var mesosFix = (modalitat === "mixt") ? Math.round(_num(cfg.anys_fix) * 12) : 0;
    if (mes <= mesosFix) return _num(cfg.tipus_fix);

    var revisio = Math.max(1, Math.round(_num(cfg.revisio_mesos, 12)));
    var mesRel = mes - mesosFix - 1;
    var periode = Math.floor(mesRel / revisio);
    var anyIdx = Math.floor((mesosFix + periode * revisio) / 12);
    var t = _euriborDe(escenari, anyIdx) + _num(cfg.diferencial);

    if (cfg.sol_min != null && t < _num(cfg.sol_min)) t = _num(cfg.sol_min);
    if (cfg.sostre_max != null && t > _num(cfg.sostre_max)) t = _num(cfg.sostre_max);
    return t;
  }

  /* ---------- 4) COMISSIÓ D'AMORTITZACIÓ ANTICIPADA ----------
     Retorna el percentatge màxim legal aplicable segons LCCI.
     El contracte pot pactar-ne menys (o cap); mai més. */
  function comissioMaximaPct(cfg, mes) {
    var anys = (mes - 1) / 12;
    var modalitat = cfg.modalitat || "fix";
    var pactada = cfg.comissio_amort_pct;

    var maxLegal;
    if (modalitat === "variable") {
      var opcio = cfg.comissio_opcio || "3a";
      if (opcio === "5a") maxLegal = (anys < 5) ? REF.lcci.variable_opcio_5a : 0;
      else                maxLegal = (anys < 3) ? REF.lcci.variable_opcio_3a : 0;
    } else if (modalitat === "mixt" && anys < _num(cfg.anys_fix)) {
      maxLegal = (anys < 10) ? REF.lcci.fix_primers_10a : REF.lcci.fix_despres_10a;
    } else if (modalitat === "mixt") {
      maxLegal = (anys < _num(cfg.anys_fix) + 3) ? REF.lcci.variable_opcio_3a : 0;
    } else {
      maxLegal = (anys < 10) ? REF.lcci.fix_primers_10a : REF.lcci.fix_despres_10a;
    }
    if (pactada == null) return maxLegal;
    return Math.min(_num(pactada), maxLegal);
  }

  /* ---------- 5) QUADRE D'AMORTITZACIÓ ----------
     cfg: {capital, anys, modalitat, tipus_fix, diferencial, anys_fix,
           revisio_mesos, sol_min, sostre_max, comissio_amort_pct, comissio_opcio}
     opts: {escenari, amortitzacions:[{mes, import, mode:'termini'|'quota'}]}

     Retorna {files, resum}. Cada fila: mes, any, tipus, quota, interes,
     principal, extra, comissio, pendent. */
  function generarQuadre(cfg, opts) {
    opts = opts || {};
    var escenari = (opts.escenari !== undefined) ? opts.escenari : REF.euribor_12m;
    var amorts = (opts.amortitzacions || []).slice().sort(function (a, b) {
      return _num(a.mes) - _num(b.mes);
    });

    var capital = _num(cfg.capital);
    var nTotal = Math.round(_num(cfg.anys) * 12);
    if (capital <= 0 || nTotal <= 0) return { files: [], resum: _resumBuit() };

    var pendent = capital;
    var mesosRestants = nTotal;
    var files = [];
    var tipusAnterior = null;
    var quota = 0;
    var mes = 1;
    var guarda = 0;

    while (pendent > 0.005 && mes <= nTotal && guarda++ < 1200) {
      var tipus = tipusAlMes(cfg, mes, escenari);

      // Recalcular la quota quan canvia el tipus o el capital/termini
      if (tipusAnterior === null || Math.abs(tipus - tipusAnterior) > 1e-9 || quota === 0) {
        quota = quotaFrancesa(pendent, tipus, mesosRestants);
        tipusAnterior = tipus;
      }

      var i = tipus / 100 / 12;
      var interes = pendent * i;
      var principal = quota - interes;

      // Última quota: ajustar per no deixar residus ni negatius
      if (principal >= pendent - 0.005) {
        principal = pendent;
        quota = principal + interes;
      }

      pendent = pendent - principal;
      mesosRestants--;

      // Amortitzacions anticipades d'aquest mes
      var extra = 0, comissio = 0;
      for (var a = 0; a < amorts.length; a++) {
        if (Math.round(_num(amorts[a].mes)) !== mes) continue;
        var imp = Math.min(_num(amorts[a].import), pendent);
        if (imp <= 0) continue;
        var pct = comissioMaximaPct(cfg, mes);
        extra += imp;
        comissio += imp * pct / 100;
        pendent -= imp;

        if ((amorts[a].mode || "termini") === "termini") {
          // Mantenim la quota i escurcem el termini
          if (pendent > 0.005 && quota > 0) {
            var ii = tipus / 100 / 12;
            var nou;
            if (Math.abs(ii) < 1e-12) nou = Math.ceil(pendent / quota);
            else if (quota > pendent * ii) nou = Math.ceil(-Math.log(1 - pendent * ii / quota) / Math.log(1 + ii));
            else nou = mesosRestants;
            mesosRestants = Math.max(1, Math.min(mesosRestants, nou));
          }
        } else {
          // Mantenim el termini i baixem la quota
          quota = quotaFrancesa(pendent, tipus, mesosRestants);
        }
        tipusAnterior = null; // força recàlcul el mes següent
      }

      files.push({
        mes: mes,
        any: Math.ceil(mes / 12),
        tipus: tipus,
        quota: quota,
        interes: interes,
        principal: principal,
        extra: extra,
        comissio: comissio,
        pendent: Math.max(0, pendent)
      });

      if (pendent <= 0.005) break;
      mes++;
    }

    return { files: files, resum: resumQuadre(files, capital) };
  }

  function _resumBuit() {
    return { mesos: 0, anys: 0, total_interessos: 0, total_comissions: 0,
             total_pagat: 0, total_extra: 0, quota_inicial: 0, quota_maxima: 0,
             quota_minima: 0, tipus_min: 0, tipus_max: 0, capital: 0 };
  }

  function resumQuadre(files, capital) {
    if (!files.length) return _resumBuit();
    var ti = 0, tc = 0, tp = 0, tx = 0, qmax = 0, qmin = Infinity, tmin = Infinity, tmax = -Infinity;
    files.forEach(function (f) {
      ti += f.interes; tc += f.comissio; tp += f.quota + f.extra + f.comissio; tx += f.extra;
      if (f.quota > qmax) qmax = f.quota;
      if (f.quota < qmin) qmin = f.quota;
      if (f.tipus < tmin) tmin = f.tipus;
      if (f.tipus > tmax) tmax = f.tipus;
    });
    return {
      mesos: files.length,
      anys: files.length / 12,
      capital: capital,
      total_interessos: ti,
      total_comissions: tc,
      total_extra: tx,
      total_pagat: tp,
      quota_inicial: files[0].quota,
      quota_maxima: qmax,
      quota_minima: qmin,
      tipus_min: tmin,
      tipus_max: tmax
    };
  }

  /* Agregat anual, per a gràfics i per a la deducció fiscal */
  function perAnys(files) {
    var anys = [];
    files.forEach(function (f) {
      var k = f.any - 1;
      if (!anys[k]) anys[k] = { any: f.any, interes: 0, principal: 0, extra: 0, quota: 0, pendent: 0 };
      anys[k].interes += f.interes;
      anys[k].principal += f.principal;
      anys[k].extra += f.extra;
      anys[k].quota += f.quota;
      anys[k].pendent = f.pendent;
    });
    return anys.filter(Boolean);
  }

  /* ---------- 6) TAE REAL ----------
     La TAE del contracte sovint ignora despeses que sí que pagues.
     Aquí es calcula la taxa que iguala el capital net rebut amb els pagaments.
     despeses: {taxacio, notaria_copia, gestoria, comissio_obertura_pct, altres} */
  function despesesInicials(cfg, despeses) {
    var d = despeses || {};
    var base = REF.despeses_defecte;
    var obPct = (d.comissio_obertura_pct != null) ? _num(d.comissio_obertura_pct) : base.comissio_obertura_pct;
    return _num(d.taxacio, base.taxacio)
         + _num(d.notaria_copia, base.notaria_copia)
         + _num(d.gestoria, base.gestoria)
         + _num(d.altres, 0)
         + _num(cfg.capital) * obPct / 100;
  }

  /* Resol la TIR mensual d'una sèrie de fluxos i l'anualitza (TAE) */
  function _tirMensual(fluxos) {
    function npv(r) {
      var s = 0;
      for (var k = 0; k < fluxos.length; k++) s += fluxos[k] / Math.pow(1 + r, k);
      return s;
    }
    // Marge prudent: amb lo molt negatiu, (1+r)^k desborda a k=360 i el NPV
    // surt Infinity. El tipus mensual d'una hipoteca sempre cau dins d'aquest rang.
    var lo = -0.05, hi = 1.0, flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var it = 0; it < 300; it++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if (!isFinite(fm)) return null;
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
      if (hi - lo < 1e-12) break;
    }
    return (lo + hi) / 2;
  }

  function calcularTAE(cfg, opts) {
    opts = opts || {};
    var q = generarQuadre(cfg, opts);
    if (!q.files.length) return null;
    var cost0 = despesesInicials(cfg, opts.despeses);
    var segurs = _num(opts.segurs_anuals, 0) / 12; // assegurances vinculades
    var fluxos = [_num(cfg.capital) - cost0];
    q.files.forEach(function (f) {
      fluxos.push(-(f.quota + f.extra + f.comissio + segurs));
    });
    var r = _tirMensual(fluxos);
    if (r === null) return null;
    return {
      tae: (Math.pow(1 + r, 12) - 1) * 100,
      tin_mig: q.resum.total_interessos / _num(cfg.capital) / (q.resum.anys || 1) * 100,
      despeses_inicials: cost0,
      cost_total: cost0 + q.resum.total_pagat + segurs * q.files.length - _num(cfg.capital),
      resum: q.resum
    };
  }

  /* ---------- 7) FISCALITAT ---------- */
  /* Quota de l'IRPF de la base de l'estalvi sobre un guany patrimonial */
  function impostEstalvi(guany) {
    guany = _num(guany);
    if (guany <= 0) return 0;
    var quota = 0, anterior = 0;
    for (var k = 0; k < REF.trams_estalvi.length; k++) {
      var t = REF.trams_estalvi[k];
      var tram = Math.min(guany, t.fins) - anterior;
      if (tram <= 0) break;
      quota += tram * t.tipus / 100;
      anterior = t.fins;
      if (guany <= t.fins) break;
    }
    return quota;
  }
  function tipusMitjaEstalvi(guany) {
    guany = _num(guany);
    return guany > 0 ? impostEstalvi(guany) / guany * 100 : 0;
  }

  /* Deducció estatal per inversió en habitatge habitual.
     NOMÉS per a habitatges adquirits abans de l'1/1/2013 amb dret consolidat.
     Base = capital amortitzat + interessos + amortitzacions anticipades,
     amb el topall de 9.040 €/any i el 15% (7,5% estatal + 7,5% autonòmic). */
  function deduccioHabitatge(pagatAnyCapitalIInteressos, teDret) {
    if (!teDret) return 0;
    var base = Math.min(_num(pagatAnyCapitalIInteressos), REF.deduccio.base_max);
    return base * REF.deduccio.pct / 100;
  }

  /* ---------- 8) AMORTITZAR VS INVERTIR ----------
     Comparativa rigorosa: els dos escenaris tenen EXACTAMENT el mateix
     pressupost mensual. La diferència de quota s'inverteix, de manera que
     no s'amaga cap avantatge en el flux de caixa.

       A) Amortitzar: es fa una amortització anticipada de `import` avui.
          Si es redueix la quota, la diferència mensual va a la inversió.
          Si es redueix el termini, quan s'acaba la hipoteca tota la quota
          passa a la inversió.
       B) Invertir: no s'amortitza; `import` va íntegre a la inversió avui.

     Es comparen els patrimonis nets al final de l'horitzó, amb l'impost de
     la base de l'estalvi aplicat sobre la plusvàlua i el TER descomptat.
     En tots dos casos l'habitatge queda lliure de càrregues al final. */
  function amortitzarVsInvertir(cfg, params) {
    params = params || {};
    var importAmort = _num(params.import);
    var mode = params.mode || "termini";
    var rBrut = _num(params.retorn_brut, 6);
    var ter = _num(params.ter, 0.25);
    var teDret = !!params.deduccio_habitatge;
    var escenari = (params.escenari !== undefined) ? params.escenari : REF.euribor_12m;

    var base = generarQuadre(cfg, { escenari: escenari });
    if (!base.files.length || importAmort <= 0) return null;

    var amb = generarQuadre(cfg, {
      escenari: escenari,
      amortitzacions: [{ mes: 1, import: importAmort, mode: mode }]
    });

    var horitzo = base.files.length;                 // mesos de l'escenari sense amortitzar
    var rMensual = Math.pow(1 + (rBrut - ter) / 100, 1 / 12) - 1;

    // Pressupost mensual de referència: la quota de l'escenari SENSE amortitzar.
    // Tot el que un escenari deixa de pagar de quota, s'inverteix. Així els dos
    // camins tenen el mateix cost mensual per al client i la comparació és neta.
    function simular(files, capInicial) {
      var cartera = capInicial, aportat = capInicial, m, excedent;
      for (m = 0; m < horitzo; m++) {
        cartera *= (1 + rMensual);
        var quotaRef = base.files[m].quota;
        var quotaPath = (m < files.length) ? files[m].quota : 0;
        excedent = quotaRef - quotaPath;
        if (excedent > 0) { cartera += excedent; aportat += excedent; }
      }
      return { cartera: cartera, aportat: aportat };
    }

    // Desemborsament inicial idèntic en els dos escenaris: qui amortitza paga
    // l'import MÉS la comissió; qui inverteix disposa dels dos conceptes.
    var comissioA = amb.resum.total_comissions;
    var A = simular(amb.files, 0);
    var B = simular(base.files, importAmort + comissioA);

    function net(sim) {
      var guany = Math.max(0, sim.cartera - sim.aportat);
      return sim.cartera - impostEstalvi(guany);
    }
    var netA = net(A);
    var netB = net(B);

    // Deducció per habitatge habitual (només <2013). Amortitzar sol pujar
    // la base fins al topall de 9.040 €/any, cosa que juga a favor d'amortitzar.
    var dedA = 0, dedB = 0;
    if (teDret) {
      var ay;
      var anysA = perAnys(amb.files), anysB = perAnys(base.files);
      for (ay = 0; ay < Math.max(anysA.length, anysB.length); ay++) {
        if (anysA[ay]) dedA += deduccioHabitatge(anysA[ay].interes + anysA[ay].principal + anysA[ay].extra, true);
        if (anysB[ay]) dedB += deduccioHabitatge(anysB[ay].interes + anysB[ay].principal + anysB[ay].extra, true);
      }
    }
    netA += dedA;
    netB += dedB;

    // Rendibilitat bruta anual que caldria per empatar (cerca binària).
    // És el número que fa útil tota la comparativa: per sota d'això, amortitzar
    // guanya sense assumir cap risc de mercat.
    var breakeven = null;
    if (!params._sense_be) {
      var lo = 0, hi = 25, k, mid, dm;
      var difA = function (rr) {
        var res = amortitzarVsInvertir(cfg, {
          import: importAmort, mode: mode, retorn_brut: rr, ter: ter,
          deduccio_habitatge: teDret, escenari: escenari, _sense_be: true
        });
        return res ? (res.net_invertir - res.net_amortitzar) : 0;
      };
      var dLo = difA(lo), dHi = difA(hi);
      if (dLo * dHi <= 0) {
        for (k = 0; k < 40; k++) {
          mid = (lo + hi) / 2;
          dm = difA(mid);
          if (dLo * dm <= 0) { hi = mid; dHi = dm; } else { lo = mid; dLo = dm; }
          if (hi - lo < 1e-3) break;
        }
        breakeven = (lo + hi) / 2;
      }
    }

    return {
      import: importAmort,
      mode: mode,
      horitzo_mesos: horitzo,
      net_amortitzar: netA,
      net_invertir: netB,
      diferencia: netB - netA,
      guanya: (netB > netA) ? "invertir" : "amortitzar",
      breakeven_pct: breakeven,
      interessos_estalviats: base.resum.total_interessos - amb.resum.total_interessos,
      mesos_estalviats: base.files.length - amb.files.length,
      comissio_amortitzacio: comissioA,
      comissio_pct: comissioMaximaPct(cfg, 1),
      quota_abans: base.resum.quota_inicial,
      quota_despres: amb.resum.quota_inicial,
      deduccio_amortitzar: dedA,
      deduccio_invertir: dedB,
      cartera_final_invertir: B.cartera,
      cartera_final_amortitzar: A.cartera,
      retorn_brut: rBrut,
      ter: ter
    };
  }

  /* ---------- 9) STRESS D'EURÍBOR ----------
     Per a hipoteques variables i mixtes: què passa amb la quota si els tipus
     es mouen. Sense escenaris no hi ha decisió informada. */
  function stressEuribor(cfg, escenaris) {
    escenaris = escenaris || [
      { nom: "Baixada a l'1%", valor: 1.0 },
      { nom: "Es manté (" + REF.euribor_12m.toFixed(2) + "%)", valor: REF.euribor_12m },
      { nom: "Puja al 4%", valor: 4.0 },
      { nom: "Xoc: 5,5%", valor: 5.5 }
    ];
    return escenaris.map(function (e) {
      var q = generarQuadre(cfg, { escenari: e.valor });
      return {
        nom: e.nom,
        euribor: e.valor,
        quota_inicial: q.resum.quota_inicial,
        quota_maxima: q.resum.quota_maxima,
        total_interessos: q.resum.total_interessos,
        total_pagat: q.resum.total_pagat
      };
    });
  }

  /* ---------- 10) COMPARADOR D'OFERTES ----------
     Compara N configuracions pel cost total real (interessos + despeses +
     assegurances vinculades), no per la quota, que és l'error més habitual. */
  function comparar(ofertes, opts) {
    opts = opts || {};
    var res = ofertes.map(function (o) {
      var cfg = o.cfg || o;
      var t = calcularTAE(cfg, {
        escenari: (opts.escenari !== undefined) ? opts.escenari : REF.euribor_12m,
        despeses: o.despeses,
        segurs_anuals: o.segurs_anuals
      });
      return {
        nom: o.nom || "Oferta",
        modalitat: cfg.modalitat,
        tae: t ? t.tae : null,
        quota_inicial: t ? t.resum.quota_inicial : null,
        quota_maxima: t ? t.resum.quota_maxima : null,
        total_interessos: t ? t.resum.total_interessos : null,
        despeses_inicials: t ? t.despeses_inicials : null,
        segurs_total: _num(o.segurs_anuals, 0) * (t ? t.resum.anys : 0),
        cost_total: t ? t.cost_total : null,
        anys: t ? t.resum.anys : null
      };
    });
    var valides = res.filter(function (r) { return r.cost_total !== null; });
    if (valides.length) {
      var millor = valides.slice().sort(function (a, b) { return a.cost_total - b.cost_total; })[0];
      res.forEach(function (r) {
        r.millor = (r === millor);
        r.sobrecost = (r.cost_total !== null) ? r.cost_total - millor.cost_total : null;
      });
    }
    return res;
  }

  /* ---------- 11) SUBROGACIÓ / CANVI D'HIPOTECA ----------
     Val la pena canviar? Break-even en mesos entre el cost del canvi i
     l'estalvi mensual. */
  function avaluarSubrogacio(actual, nova, costCanvi) {
    var qa = generarQuadre(actual, {});
    var qn = generarQuadre(nova, {});
    if (!qa.files.length || !qn.files.length) return null;
    var estalviTotal = qa.resum.total_pagat - qn.resum.total_pagat - _num(costCanvi);
    var estalviMensual = qa.resum.quota_inicial - qn.resum.quota_inicial;
    return {
      quota_actual: qa.resum.quota_inicial,
      quota_nova: qn.resum.quota_inicial,
      estalvi_mensual: estalviMensual,
      cost_canvi: _num(costCanvi),
      mesos_recuperacio: estalviMensual > 0 ? Math.ceil(_num(costCanvi) / estalviMensual) : null,
      estalvi_total: estalviTotal,
      val_la_pena: estalviTotal > 0
    };
  }

  /* ---------- 12) SALUT DEL DEUTE ----------
     Ràtios de referència del sector. Orientatius, no llindars d'aprovació. */
  function ratiosDeute(p) {
    var ingressos = _num(p.ingressos_mensuals_nets);
    var quota = _num(p.quota_mensual);
    var altresDeutes = _num(p.altres_quotes);
    var preu = _num(p.preu_habitatge);
    var capital = _num(p.capital);
    var dti = ingressos > 0 ? (quota + altresDeutes) / ingressos * 100 : null;
    var ltv = preu > 0 ? capital / preu * 100 : null;
    return {
      dti: dti,
      ltv: ltv,
      dti_estat: dti === null ? null : (dti <= 30 ? "ok" : (dti <= 35 ? "atencio" : "risc")),
      ltv_estat: ltv === null ? null : (ltv <= 80 ? "ok" : (ltv <= 90 ? "atencio" : "risc")),
      nota_dti: "Referència habitual del sector: la quota total de deute no hauria de superar el 30-35% dels ingressos nets.",
      nota_ltv: "Per damunt del 80% de finançament, les condicions solen empitjorar i sovint cal aval o estalvi addicional."
    };
  }

  return {
    VERSION: VERSION,
    REF: REF,
    quotaFrancesa: quotaFrancesa,
    pendentDespres: pendentDespres,
    tipusAlMes: tipusAlMes,
    comissioMaximaPct: comissioMaximaPct,
    generarQuadre: generarQuadre,
    resumQuadre: resumQuadre,
    perAnys: perAnys,
    despesesInicials: despesesInicials,
    calcularTAE: calcularTAE,
    impostEstalvi: impostEstalvi,
    tipusMitjaEstalvi: tipusMitjaEstalvi,
    deduccioHabitatge: deduccioHabitatge,
    amortitzarVsInvertir: amortitzarVsInvertir,
    stressEuribor: stressEuribor,
    comparar: comparar,
    avaluarSubrogacio: avaluarSubrogacio,
    ratiosDeute: ratiosDeute
  };
})();

try { console.log("[TBI_HIPOTECA] v" + TBI_HIPOTECA.VERSION + " carregat"); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_HIPOTECA; }
