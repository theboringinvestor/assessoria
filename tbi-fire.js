/* ============================================================
   TBI · MÒDUL FIRE I FASE DE RETIRADA  (font única)

   - Taxa segura de retirada (SWR) dinàmica: depèn de l'horitzó de
     retirada i del pes de renda variable, no d'una constant fixa
   - Rendiment real (descomptada la inflació) per als objectius
   - Brut necessari per obtenir un net després d'IRPF de l'estalvi
   - Guardrails de Guyton-Klinger (retirada dinàmica)
   - Monte Carlo de la fase de retirada: risc de seqüència de rendiments

   SOBRE LES XIFRES: la taula base de SWR està derivada de la literatura
   històrica (Trinity Study 1998; Bengen 1994 i les seves revisions, que
   situen la SAFEMAX a 30 anys al voltant del 4,7%). Són dades
   majoritàriament de mercat nord-americà del segle XX. Altres mercats
   desenvolupats van tenir seqüències pitjors. Tracta-les com un ordre de
   magnitud raonat, mai com una garantia.

   Educació i anàlisi financera. No és assessorament d'inversió.
   ES5: var / function. Depèn de TBI_FISCAL per als impostos.
   ============================================================ */
var TBI_FIRE = (function () {
  "use strict";

  var VERSION = "2026-07-25";

  var REF = {
    // SWR base segons els anys que ha de durar la cartera, per a una cartera
    // equilibrada de referència (~60% RV) i sense costos.
    // Interpolació lineal entre punts.
    swr_per_horitzo: [
      { anys: 10, swr: 8.5 },
      { anys: 15, swr: 6.6 },
      { anys: 20, swr: 5.6 },
      { anys: 25, swr: 5.0 },
      { anys: 30, swr: 4.7 },   // SAFEMAX de referència (Bengen revisat)
      { anys: 35, swr: 4.3 },
      { anys: 40, swr: 4.0 },
      { anys: 45, swr: 3.8 },
      { anys: 50, swr: 3.6 },
      { anys: 55, swr: 3.5 },
      { anys: 60, swr: 3.4 }
    ],
    swr_perpetua: 3.3,

    // Factor segons el pes de renda variable. La SWR històrica és màxima
    // entre el 50% i el 75% de RV: massa poca RV no aguanta la inflació,
    // massa RV amplifica el risc de seqüència.
    factor_rv: [
      { rv: 0,   f: 0.72 },
      { rv: 20,  f: 0.85 },
      { rv: 40,  f: 0.96 },
      { rv: 55,  f: 1.00 },
      { rv: 70,  f: 1.01 },
      { rv: 85,  f: 0.97 },
      { rv: 100, f: 0.92 }
    ],

    inflacio_defecte: 2.2,
    // Volatilitat anual típica d'una cartera equilibrada 60/40. Una cartera
    // 100% RV se'n va cap al 18-20%; una molt defensiva, cap al 6-8%.
    volatilitat_defecte: 12,

    // Guyton-Klinger: bandes al voltant de la taxa inicial
    guardrails: { superior: 1.20, inferior: 0.80, ajust_pct: 10 },

    esperanca_vida_defecte: 92  // edat fins a la qual ha de durar la cartera
  };

  function _num(x, def) {
    var v = parseFloat(x);
    return isFinite(v) ? v : (def === undefined ? 0 : def);
  }

  function _interpolar(x, punts, campX, campY) {
    if (x <= punts[0][campX]) return punts[0][campY];
    var i;
    for (i = 1; i < punts.length; i++) {
      if (x <= punts[i][campX]) {
        var a = punts[i - 1], b = punts[i];
        var t = (x - a[campX]) / (b[campX] - a[campX]);
        return a[campY] + t * (b[campY] - a[campY]);
      }
    }
    return punts[punts.length - 1][campY];
  }

  /* ---------- 1) TAXA SEGURA DE RETIRADA DINÀMICA ----------
     p: {anys_retirada, pct_rv, ter} */
  function swr(p) {
    p = p || {};
    var anys = Math.max(1, _num(p.anys_retirada, 30));
    var pctRV = Math.max(0, Math.min(100, _num(p.pct_rv, 60)));
    var ter = _num(p.ter, 0.25);

    var base = anys > 60 ? REF.swr_perpetua : _interpolar(anys, REF.swr_per_horitzo, 'anys', 'swr');
    var factor = _interpolar(pctRV, REF.factor_rv, 'rv', 'f');
    // El cost del producte resta gairebé euro per euro de la taxa sostenible
    var taxa = base * factor - ter;

    return {
      swr: Math.max(0.5, taxa),
      swr_base: base,
      factor_rv: factor,
      penalitzacio_ter: ter,
      anys_retirada: anys,
      pct_rv: pctRV,
      multiplicador: 100 / Math.max(0.5, taxa),
      // Etiqueta honesta del grau de confiança
      fiabilitat: anys <= 35 ? 'alta' : (anys <= 50 ? 'mitjana' : 'baixa'),
      nota_fiabilitat: anys <= 35
        ? 'Horitzó dins del rang que la recerca històrica cobreix bé.'
        : (anys <= 50
            ? 'Horitzó llarg: la mostra històrica de períodes de 40-50 anys és petita. Tracta la taxa com un sostre, no com un objectiu.'
            : 'Horitzó de més de 50 anys: pràcticament perpetu. Cap dada històrica valida taxes altes aquí; considera mantenir flexibilitat de despesa.')
    };
  }

  /* Anys de retirada implícits: de l'edat de retirada a l'esperança de vida */
  function anysRetirada(edatRetir, esperancaVida) {
    return Math.max(1, _num(esperancaVida, REF.esperanca_vida_defecte) - _num(edatRetir, 65));
  }

  /* ---------- 2) IMPOSTOS DE LA FASE DE RETIRADA ----------
     Per gastar X net cal vendre més de X: la part de plusvàlua tributa.
     ratio_guany = (valor - cost base) / valor de la cartera. */
  function brutPerNet(net, ratioGuany, altresRendiments) {
    net = _num(net);
    if (net <= 0) return { brut: 0, guany: 0, impost: 0, net: 0, tipus_efectiu: 0 };
    var g = Math.max(0, Math.min(1, _num(ratioGuany)));
    var altres = _num(altresRendiments);
    if (g === 0) return { brut: net, guany: 0, impost: 0, net: net, tipus_efectiu: 0 };

    var S = net, i, imp = 0;
    var base0 = (typeof TBI_FISCAL !== 'undefined') ? TBI_FISCAL.impostEstalvi(altres) : 0;
    for (i = 0; i < 60; i++) {
      var guany = S * g;
      imp = (typeof TBI_FISCAL !== 'undefined')
        ? TBI_FISCAL.impostEstalvi(altres + guany) - base0
        : guany * 0.19;
      var nouS = net + imp;
      if (Math.abs(nouS - S) < 0.005) { S = nouS; break; }
      S = nouS;
    }
    return {
      brut: S,
      guany: S * g,
      impost: imp,
      net: S - imp,
      tipus_efectiu: S > 0 ? imp / S * 100 : 0
    };
  }

  /* ---------- 3) OBJECTIU FIRE ----------
     p: {despeses_anuals_netes, edat_actual, edat_retirada, esperanca_vida,
         pct_rv, ter, ratio_guany, capital_actual, aportacio_mensual,
         retorn_brut, inflacio, altres_rendiments, considerar_impostos} */
  function objectiuFIRE(p) {
    p = p || {};
    var despesesNetes = _num(p.despeses_anuals_netes, 30000);
    var edatAra = _num(p.edat_actual, 35);
    var edatRet = _num(p.edat_retirada, 55);
    var esperanca = _num(p.esperanca_vida, REF.esperanca_vida_defecte);
    var pctRV = _num(p.pct_rv, 60);
    var ter = _num(p.ter, 0.25);
    var ratioGuany = _num(p.ratio_guany, 0.35);
    var capital = _num(p.capital_actual, 0);
    var aportMens = _num(p.aportacio_mensual, 0);
    var retornBrut = _num(p.retorn_brut, 6);
    var inflacio = _num(p.inflacio, REF.inflacio_defecte);
    var ambImpostos = (p.considerar_impostos !== false);

    var anysRet = anysRetirada(edatRet, esperanca);
    var s = swr({ anys_retirada: anysRet, pct_rv: pctRV, ter: ter });

    // Brut anual que cal vendre per disposar de les despeses netes
    var bruta = ambImpostos
      ? brutPerNet(despesesNetes, ratioGuany, _num(p.altres_rendiments))
      : { brut: despesesNetes, impost: 0, guany: 0, tipus_efectiu: 0 };

    var objectiu = bruta.brut * s.multiplicador;

    // Acumulació en termes REALS: si l'objectiu està en euros d'avui, el
    // capital ha de créixer també en euros d'avui. Fer-ho amb retorn nominal
    // és l'error clàssic que fa semblar el FIRE més a prop del que és.
    var retornReal = ((1 + retornBrut / 100 - ter / 100) / (1 + inflacio / 100) - 1) * 100;
    var rMens = retornReal / 100 / 12;

    var mesos = _mesosFins(objectiu, capital, aportMens, rMens);
    var anysFins = (mesos === Infinity) ? Infinity : mesos / 12;

    return {
      despeses_netes: despesesNetes,
      retirada_bruta_anual: bruta.brut,
      impost_anual: bruta.impost,
      tipus_efectiu_retirada: bruta.tipus_efectiu,
      swr: s.swr,
      swr_detall: s,
      multiplicador: s.multiplicador,
      objectiu: objectiu,
      objectiu_sense_impostos: despesesNetes * s.multiplicador,
      cost_fiscal_objectiu: objectiu - despesesNetes * s.multiplicador,
      anys_retirada: anysRet,
      retorn_real: retornReal,
      retorn_nominal: retornBrut,
      inflacio: inflacio,
      anys_fins_objectiu: anysFins,
      edat_assoliment: (anysFins === Infinity) ? null : edatAra + anysFins,
      progres_pct: objectiu > 0 ? Math.min(100, capital / objectiu * 100) : 100,
      assolit: capital >= objectiu,
      // Coast FIRE: quant caldria tenir AVUI perquè, sense aportar més,
      // el capital arribi sol a l'objectiu a l'edat de retirada
      coast_necessari: objectiu / Math.pow(1 + retornReal / 100, Math.max(1, edatRet - edatAra)),
      considerar_impostos: ambImpostos
    };
  }

  function _mesosFins(objectiu, capital, aportMens, rMens) {
    if (capital >= objectiu) return 0;
    if (rMens <= 0 && aportMens <= 0) return Infinity;
    var cap = capital, mesos = 0;
    while (cap < objectiu && mesos < 1200) {
      cap = cap * (1 + rMens) + aportMens;
      mesos++;
    }
    return cap >= objectiu ? mesos : Infinity;
  }

  /* ---------- 4) GUARDRAILS DE GUYTON-KLINGER ----------
     Retirar una xifra fixa indexada a la inflació és rígid. Amb guardrails
     ajustes la despesa quan la cartera se'n va molt amunt o molt avall,
     i això permet començar amb una taxa més alta. */
  function guardrails(p) {
    p = p || {};
    var capitalActual = _num(p.capital_actual);
    var retiradaActual = _num(p.retirada_actual);
    var taxaInicial = _num(p.taxa_inicial, 4);
    var g = REF.guardrails;

    if (capitalActual <= 0) return null;
    var taxaAra = retiradaActual / capitalActual * 100;
    var sostre = taxaInicial * g.superior;
    var terra = taxaInicial * g.inferior;

    var accio = 'mantenir', nova = retiradaActual, motiu;
    if (taxaAra > sostre) {
      accio = 'retallar';
      nova = retiradaActual * (1 - g.ajust_pct / 100);
      motiu = 'La cartera ha caigut prou perquè la teva retirada representi el ' + taxaAra.toFixed(2)
        + '%, per sobre del sostre del ' + sostre.toFixed(2) + '%. Retallar un ' + g.ajust_pct
        + '% ara evita haver de retallar molt més després.';
    } else if (taxaAra < terra) {
      accio = 'apujar';
      nova = retiradaActual * (1 + g.ajust_pct / 100);
      motiu = 'La cartera ha crescut prou perquè la teva retirada sigui només el ' + taxaAra.toFixed(2)
        + '%, per sota del terra del ' + terra.toFixed(2) + '%. Pots apujar la despesa un ' + g.ajust_pct + '%.';
    } else {
      motiu = 'La taxa actual (' + taxaAra.toFixed(2) + '%) està dins de les bandes ['
        + terra.toFixed(2) + '% – ' + sostre.toFixed(2) + '%]. No cal tocar res.';
    }

    return {
      taxa_actual: taxaAra, taxa_inicial: taxaInicial,
      sostre: sostre, terra: terra,
      accio: accio, retirada_nova: nova,
      variacio: nova - retiradaActual, motiu: motiu
    };
  }

  /* ---------- 5) MONTE CARLO DE LA FASE DE RETIRADA ----------
     El risc que mata una jubilació anticipada no és la mitjana: és l'ordre
     dels rendiments. Una mala dècada al principi és irrecuperable encara
     que la mitjana a llarg termini quadri.

     p: {capital, retirada_anual, anys, retorn_real_mig, volatilitat,
         n_sims, amb_guardrails, taxa_inicial, llavor} */
  function _randNormal(rnd) {
    var u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function _rngLlavor(llavor) {
    var s = _num(llavor, 12345) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function monteCarloRetirada(p) {
    p = p || {};
    var capital = _num(p.capital, 750000);
    var retirada0 = _num(p.retirada_anual, 30000);
    var anys = Math.max(1, Math.round(_num(p.anys, 30)));
    var mu = _num(p.retorn_real_mig, 4) / 100;
    var sigma = _num(p.volatilitat, REF.volatilitat_defecte) / 100;
    var n = Math.max(200, Math.round(_num(p.n_sims, 2000)));
    var ambGuard = !!p.amb_guardrails;
    var taxaIni = _num(p.taxa_inicial, retirada0 / Math.max(1, capital) * 100);
    var rnd = _rngLlavor(p.llavor);

    var exits = 0, finals = [], anysEsgotat = [], retallades = 0;
    // `retorn_real_mig` s'interpreta com a rendiment COMPOST (CAGR) real, que
    // és el que la gent té al cap quan diu "espero un 4%". Per tant la mediana
    // del creixement anual ha de ser exactament 1+mu → muLog = ln(1+mu).
    // Fer-ho amb la mitjana aritmètica (restant sigma²/2) penalitza el
    // creixement compost i infla artificialment les taxes de fracàs.
    var muLog = Math.log(1 + mu);

    for (var s = 0; s < n; s++) {
      var V = capital, ret = retirada0, esgotat = false, hiHaRetallada = false;
      for (var y = 0; y < anys; y++) {
        // Retirada a principi d'any: el cas advers
        V -= ret;
        if (V <= 0) { esgotat = true; anysEsgotat.push(y + 1); break; }
        var r = Math.exp(muLog + sigma * _randNormal(rnd)) - 1;
        V *= (1 + r);
        if (ambGuard) {
          var g = guardrails({ capital_actual: V, retirada_actual: ret, taxa_inicial: taxaIni });
          if (g && g.accio === 'retallar') { ret = g.retirada_nova; hiHaRetallada = true; }
          else if (g && g.accio === 'apujar') { ret = g.retirada_nova; }
        }
      }
      if (!esgotat) { exits++; finals.push(V); }
      if (hiHaRetallada) retallades++;
    }

    finals.sort(function (a, b) { return a - b; });
    function pct(q) {
      if (!finals.length) return 0;
      var i = Math.min(finals.length - 1, Math.max(0, Math.round(q * (finals.length - 1))));
      return finals[i];
    }
    var mitjanaEsgotat = anysEsgotat.length
      ? anysEsgotat.reduce(function (a, b) { return a + b; }, 0) / anysEsgotat.length : null;

    return {
      n_sims: n,
      anys: anys,
      exit_pct: exits / n * 100,
      fracas_pct: (n - exits) / n * 100,
      any_mitja_esgotament: mitjanaEsgotat,
      final_p10: pct(0.10), final_p50: pct(0.50), final_p90: pct(0.90),
      amb_guardrails: ambGuard,
      pct_sims_amb_retallada: ambGuard ? retallades / n * 100 : 0,
      taxa_inicial: taxaIni,
      nota: 'Model de rendiments independents amb distribució lognormal. No reprodueix la persistència ni les correlacions dels mercats reals: llegeix-lo com un ordre de magnitud del risc de seqüència, no com una probabilitat exacta.'
    };
  }

  /* Taxa de retirada que assoleix una probabilitat d'èxit objectiu */
  function swrPerProbabilitat(p) {
    p = p || {};
    var objectiuExit = _num(p.exit_objectiu, 90);
    var lo = 1, hi = 10, k, mid;
    function exitDe(taxa) {
      var r = monteCarloRetirada({
        capital: _num(p.capital, 1000000),
        retirada_anual: _num(p.capital, 1000000) * taxa / 100,
        anys: _num(p.anys, 30),
        retorn_real_mig: _num(p.retorn_real_mig, 4),
        volatilitat: _num(p.volatilitat, REF.volatilitat_defecte),
        n_sims: _num(p.n_sims, 1200),
        amb_guardrails: !!p.amb_guardrails,
        llavor: 4242
      });
      return r.exit_pct;
    }
    if (exitDe(lo) < objectiuExit) return { taxa: lo, exit: exitDe(lo), assolible: false };
    for (k = 0; k < 22; k++) {
      mid = (lo + hi) / 2;
      if (exitDe(mid) >= objectiuExit) lo = mid; else hi = mid;
      if (hi - lo < 0.02) break;
    }
    return { taxa: lo, exit: exitDe(lo), assolible: true, exit_objectiu: objectiuExit };
  }

  return {
    VERSION: VERSION,
    REF: REF,
    swr: swr,
    anysRetirada: anysRetirada,
    brutPerNet: brutPerNet,
    objectiuFIRE: objectiuFIRE,
    guardrails: guardrails,
    monteCarloRetirada: monteCarloRetirada,
    swrPerProbabilitat: swrPerProbabilitat
  };
})();

try { console.log("[TBI_FIRE] v" + TBI_FIRE.VERSION + " carregat"); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_FIRE; }
