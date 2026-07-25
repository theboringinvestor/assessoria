/* ============================================================
   TBI · MÒDUL DE FISCALITAT DE L'INVERSOR  (font única)
   Exercici 2026 · Espanya (règim comú)

   - Base de l'estalvi i base general (escala estatal + autonòmica)
   - Cascada de compensacions amb la regla del 25% i arrossegament a 4 anys
   - Diferiment per traspàs: fons d'inversió vs ETF
   - Pla de pensions: deducció ara contra tributació al rescat
   - Dividends estrangers i doble imposició internacional
   - Regla dels 2 mesos (norma antiaplicació) i tax-loss harvesting

   ATENCIÓ: contingut d'educació i anàlisi financera. No és assessorament
   fiscal ni substitueix un assessor fiscal col·legiat. Les escales
   autonòmiques canvien cada any: revisa REF abans de cada campanya.

   ES5: var / function / concatenació. Sense dependències.
   ============================================================ */
var TBI_FISCAL = (function () {
  "use strict";

  var VERSION = "2026-07-25";

  /* ---------- 1) PARÀMETRES NORMATIUS ---------- */
  var REF = {
    exercici: 2026,

    // Base de l'estalvi. Estatal i uniforme (Llei 7/2024: darrer tram al 30%).
    trams_estalvi: [
      { fins: 6000,     tipus: 19 },
      { fins: 50000,    tipus: 21 },
      { fins: 200000,   tipus: 23 },
      { fins: 300000,   tipus: 27 },
      { fins: Infinity, tipus: 30 }
    ],

    // Escala general estatal (art. 63.1 LIRPF). S'hi suma l'autonòmica.
    trams_general_estatal: [
      { fins: 12450,    tipus: 9.5 },
      { fins: 20200,    tipus: 12 },
      { fins: 35200,    tipus: 15 },
      { fins: 60000,    tipus: 18.5 },
      { fins: 300000,   tipus: 22.5 },
      { fins: Infinity, tipus: 24.5 }
    ],

    // Escales autonòmiques. Catalunya: Decret llei 5/2025, 8 trams.
    trams_general_autonomic: {
      catalunya: [
        { fins: 12500,    tipus: 9.5 },
        { fins: 22000,    tipus: 12.5 },
        { fins: 33000,    tipus: 16 },
        { fins: 53000,    tipus: 19 },
        { fins: 90000,    tipus: 21.5 },
        { fins: 120000,   tipus: 23.5 },
        { fins: 175000,   tipus: 24.5 },
        { fins: Infinity, tipus: 25.5 }
      ],
      // Escala "de referència" per a qui no és a Catalunya. Aproximació:
      // duplica l'estatal, que és el criteri supletori de l'art. 65 LIRPF.
      generica: [
        { fins: 12450,    tipus: 9.5 },
        { fins: 20200,    tipus: 12 },
        { fins: 35200,    tipus: 15 },
        { fins: 60000,    tipus: 18.5 },
        { fins: 300000,   tipus: 22.5 },
        { fins: Infinity, tipus: 24.5 }
      ]
    },

    // Compensacions entre tipus de renda dins la base de l'estalvi.
    compensacio_creuada_pct: 25,
    anys_arrossegament: 4,

    // Norma antiaplicació (art. 33.5 LIRPF): la pèrdua no és computable si es
    // recompra el mateix valor dins d'aquest termini.
    antiaplicacio_dies_cotitzat: 60,      // 2 mesos, valors cotitzats
    antiaplicacio_dies_no_cotitzat: 365,  // 1 any, valors no cotitzats

    // Plans de pensions (Llei 12/2022): límits d'aportació amb dret a reducció.
    pensions: {
      limit_individual: 1500,
      limit_empresa: 8500,
      limit_total: 10000,
      limit_pct_rendiments: 30,
      reduccio_capital_pre2007: 40  // sobre aportacions anteriors a 2007
    },

    // Retencions en origen habituals sobre dividends estrangers i límit de
    // conveni recuperable via deducció per doble imposició internacional.
    retencions_origen: {
      'ES': { nom: 'Espanya',      retencio: 19, conveni: 19 },
      'US': { nom: 'EUA (amb W-8BEN)', retencio: 15, conveni: 15 },
      'US_SENSE': { nom: 'EUA (sense W-8BEN)', retencio: 30, conveni: 15 },
      'DE': { nom: 'Alemanya',     retencio: 26.375, conveni: 15 },
      'FR': { nom: 'França',       retencio: 25, conveni: 15 },
      'CH': { nom: 'Suïssa',       retencio: 35, conveni: 15 },
      'NL': { nom: 'Països Baixos', retencio: 15, conveni: 15 },
      'GB': { nom: 'Regne Unit',   retencio: 0, conveni: 0 },
      'IE': { nom: 'Irlanda (domicili UCITS)', retencio: 0, conveni: 0 }
    },

    retencio_compte_espanya: 19
  };

  /* ---------- 2) UTILITATS ---------- */
  function _num(x, def) {
    var v = parseFloat(x);
    return isFinite(v) ? v : (def === undefined ? 0 : def);
  }

  // Aplica una escala progressiva per trams i retorna quota + detall
  function aplicarEscala(base, trams) {
    base = _num(base);
    if (base <= 0) return { quota: 0, detall: [], marginal: trams[0].tipus, mitja: 0 };
    var quota = 0, anterior = 0, detall = [], marginal = trams[0].tipus;
    for (var k = 0; k < trams.length; k++) {
      var t = trams[k];
      var tram = Math.min(base, t.fins) - anterior;
      if (tram <= 0) break;
      var q = tram * t.tipus / 100;
      quota += q;
      detall.push({ des: anterior, fins: t.fins, tipus: t.tipus, base: tram, quota: q });
      marginal = t.tipus;
      anterior = t.fins;
      if (base <= t.fins) break;
    }
    return { quota: quota, detall: detall, marginal: marginal, mitja: base > 0 ? quota / base * 100 : 0 };
  }

  /* ---------- 3) BASE DE L'ESTALVI ---------- */
  function impostEstalvi(base) {
    return aplicarEscala(base, REF.trams_estalvi).quota;
  }
  function detallEstalvi(base) {
    return aplicarEscala(base, REF.trams_estalvi);
  }
  function marginalEstalvi(base) {
    return aplicarEscala(base, REF.trams_estalvi).marginal;
  }

  /* ---------- 4) BASE GENERAL (estatal + autonòmica) ---------- */
  function _escalaAuto(ccaa) {
    var e = REF.trams_general_autonomic[ccaa || 'catalunya'];
    return e || REF.trams_general_autonomic.generica;
  }
  function impostGeneral(base, ccaa) {
    var est = aplicarEscala(base, REF.trams_general_estatal);
    var aut = aplicarEscala(base, _escalaAuto(ccaa));
    return {
      quota: est.quota + aut.quota,
      quota_estatal: est.quota,
      quota_autonomica: aut.quota,
      marginal: est.marginal + aut.marginal,
      mitja: base > 0 ? (est.quota + aut.quota) / base * 100 : 0,
      detall_estatal: est.detall,
      detall_autonomic: aut.detall
    };
  }
  function marginalGeneral(base, ccaa) {
    return impostGeneral(base, ccaa).marginal;
  }

  /* ---------- 5) CASCADA DE COMPENSACIONS ----------
     Ordre legal dins la base de l'estalvi:
       1. Guanys i pèrdues patrimonials (GPP) es compensen entre si
       2. Rendiments del capital mobiliari (RCM) es compensen entre si
       3. Si queda un saldo negatiu d'un grup i positiu de l'altre, es compensen
          entre grups fins al 25% del saldo positiu
       4. El que quedi negatiu s'arrossega 4 exercicis

     p: {gpp_positiu, gpp_negatiu, rcm_positiu, rcm_negatiu,
         gpp_pendent, rcm_pendent} — tots en positiu absolut */
  function compensar(p) {
    p = p || {};
    var gppP = Math.max(0, _num(p.gpp_positiu));
    var gppN = Math.max(0, _num(p.gpp_negatiu)) + Math.max(0, _num(p.gpp_pendent));
    var rcmP = Math.max(0, _num(p.rcm_positiu));
    var rcmN = Math.max(0, _num(p.rcm_negatiu)) + Math.max(0, _num(p.rcm_pendent));

    // 1-2) Compensació dins de cada grup
    var gppNet = gppP - gppN;
    var rcmNet = rcmP - rcmN;
    var passos = [];
    passos.push({ pas: 'Guanys i pèrdues patrimonials entre si', resultat: gppNet });
    passos.push({ pas: 'Rendiments del capital mobiliari entre si', resultat: rcmNet });

    // 3) Compensació creuada, limitada al 25% del saldo positiu
    var creuadaAplicada = 0, limitCreuada = 0;
    if (gppNet > 0 && rcmNet < 0) {
      limitCreuada = gppNet * REF.compensacio_creuada_pct / 100;
      creuadaAplicada = Math.min(limitCreuada, -rcmNet);
      gppNet -= creuadaAplicada;
      rcmNet += creuadaAplicada;
    } else if (rcmNet > 0 && gppNet < 0) {
      limitCreuada = rcmNet * REF.compensacio_creuada_pct / 100;
      creuadaAplicada = Math.min(limitCreuada, -gppNet);
      rcmNet -= creuadaAplicada;
      gppNet += creuadaAplicada;
    }
    if (creuadaAplicada > 0) {
      passos.push({
        pas: 'Compensació creuada (límit del ' + REF.compensacio_creuada_pct + '% del saldo positiu)',
        resultat: creuadaAplicada, limit: limitCreuada
      });
    }

    var baseImposable = Math.max(0, gppNet) + Math.max(0, rcmNet);
    var quota = impostEstalvi(baseImposable);

    // 4) Saldos que queden per a exercicis futurs
    var pendentGpp = gppNet < 0 ? -gppNet : 0;
    var pendentRcm = rcmNet < 0 ? -rcmNet : 0;

    return {
      gpp_net: gppNet,
      rcm_net: rcmNet,
      base_imposable: baseImposable,
      quota: quota,
      tipus_mitja: baseImposable > 0 ? quota / baseImposable * 100 : 0,
      tipus_marginal: marginalEstalvi(baseImposable),
      creuada_aplicada: creuadaAplicada,
      creuada_limit: limitCreuada,
      // Saldo negatiu que el topall del 25% ha deixat sense compensar enguany.
      // No es perd: s'arrossega, però costa liquiditat ara.
      creuada_bloquejada: Math.max(0, limitCreuada > 0 ? (pendentGpp + pendentRcm) : 0),
      pendent_gpp: pendentGpp,
      pendent_rcm: pendentRcm,
      pendent_total: pendentGpp + pendentRcm,
      caduca_exercici: REF.exercici + REF.anys_arrossegament,
      passos: passos,
      detall_trams: detallEstalvi(baseImposable).detall
    };
  }

  /* ---------- 6) REGLA DELS 2 MESOS (norma antiaplicació) ----------
     Vendre en pèrdues per compensar és legítim, però si recompres el mateix
     valor massa aviat, Hisenda no et deixa computar la pèrdua. */
  function reglaAntiaplicacio(diesEntreOperacions, cotitzat) {
    var limit = cotitzat === false ? REF.antiaplicacio_dies_no_cotitzat : REF.antiaplicacio_dies_cotitzat;
    var dies = _num(diesEntreOperacions);
    return {
      dies: dies,
      limit_dies: limit,
      computable: dies > limit,
      dies_restants: Math.max(0, limit - dies + 1),
      nota: dies > limit
        ? 'La pèrdua és computable: ha passat prou temps entre la venda i la recompra.'
        : 'La pèrdua NO és computable ara. Es reactivarà quan transmetis definitivament els valors recomprats — no es perd, es difereix.'
    };
  }

  /* Tax-loss harvesting: quantes pèrdues latents convé aflorar aquest any.
     No té sentit aflorar més enllà del que pots compensar. */
  function aflorarPerdues(p) {
    p = p || {};
    var guanys = Math.max(0, _num(p.guanys_realitzats));
    var rcm = Math.max(0, _num(p.rcm_positiu));
    var latents = Math.max(0, _num(p.perdues_latents));

    // Absorció òptima: tot el guany patrimonial + fins al 25% del RCM net
    var absorbible = guanys + rcm * REF.compensacio_creuada_pct / 100;
    var aflorar = Math.min(latents, absorbible);

    var senseAflorar = compensar({ gpp_positiu: guanys, rcm_positiu: rcm });
    var ambAflorar = compensar({ gpp_positiu: guanys, gpp_negatiu: aflorar, rcm_positiu: rcm });

    return {
      perdues_latents: latents,
      absorbible_enguany: absorbible,
      aflorar_recomanat: aflorar,
      sobrant: Math.max(0, latents - aflorar),
      quota_sense: senseAflorar.quota,
      quota_amb: ambAflorar.quota,
      estalvi: senseAflorar.quota - ambAflorar.quota,
      pendent_futur: ambAflorar.pendent_total,
      avis: 'Per computar la pèrdua no pots recomprar el mateix valor en ' +
            REF.antiaplicacio_dies_cotitzat + ' dies. Un producte equivalent però no idèntic (un altre índex, un altre emissor) sí que és vàlid.'
    };
  }

  /* ---------- 7) TRASPÀS DE FONS vs ETF ----------
     El règim de diferiment per traspàs (art. 94 LIRPF) permet moure diners
     entre fons d'inversió sense tributar. Els ETF n'estan exclosos: cada venda
     és un fet imposable. A canvi, els ETF solen tenir un TER menor.
     Quin dels dos efectes guanya depèn de l'horitzó i de com rebalancegis.

     p: {capital, anys, retorn_brut, ter_fons, ter_etf,
         rebalanceig_anys, rebalanceig_pct, aportacio_anual} */
  function traspasVsETF(p) {
    p = p || {};
    var C = _num(p.capital, 10000);
    var anys = Math.max(1, Math.round(_num(p.anys, 20)));
    var r = _num(p.retorn_brut, 6) / 100;
    var terF = _num(p.ter_fons, 0.30) / 100;
    var terE = _num(p.ter_etf, 0.20) / 100;
    var freq = Math.max(0, Math.round(_num(p.rebalanceig_anys, 1)));
    var pctReb = Math.max(0, Math.min(100, _num(p.rebalanceig_pct, 20))) / 100;
    var aport = _num(p.aportacio_anual, 0);

    function simular(ter, tributaAlRebalancejar) {
      var V = C, base = C, impostosPagats = 0, y;
      for (y = 1; y <= anys; y++) {
        V *= (1 + r - ter);
        if (aport > 0) { V += aport; base += aport; }
        if (tributaAlRebalancejar && freq > 0 && y % freq === 0 && y < anys && pctReb > 0) {
          var guany = Math.max(0, (V - base) * pctReb);
          var imp = impostEstalvi(guany);
          impostosPagats += imp;
          // Es ven pctReb, es paga l'impost i es reinverteix la resta:
          // el cost fiscal puja fins al valor de mercat de la part venuda.
          base = base * (1 - pctReb) + (V * pctReb - imp);
          V -= imp;
        }
      }
      var guanyFinal = Math.max(0, V - base);
      var impostFinal = impostEstalvi(guanyFinal);
      return {
        valor_brut: V,
        base_fiscal: base,
        impostos_pel_cami: impostosPagats,
        impost_final: impostFinal,
        net: V - impostFinal,
        impostos_totals: impostosPagats + impostFinal
      };
    }

    var fons = simular(terF, false);   // traspàs: no tributa pel camí
    var etf  = simular(terE, true);    // ETF: cada venda tributa

    // TER màxim que podria pagar el fons i encara guanyar a l'ETF
    var breakevenTerFons = null;
    (function () {
      var lo = terE, hi = terE + 0.03, k, mid;
      function dif(t) { return simular(t, false).net - etf.net; }
      if (dif(lo) < 0) return;           // ni amb el mateix TER guanya
      if (dif(hi) > 0) { breakevenTerFons = hi * 100; return; }
      for (k = 0; k < 60; k++) {
        mid = (lo + hi) / 2;
        if (dif(mid) > 0) lo = mid; else hi = mid;
        if (hi - lo < 1e-7) break;
      }
      breakevenTerFons = (lo + hi) / 2 * 100;
    })();

    return {
      anys: anys,
      fons: fons,
      etf: etf,
      diferencia: fons.net - etf.net,
      guanya: fons.net >= etf.net ? 'fons' : 'etf',
      estalvi_fiscal_diferiment: etf.impostos_totals - fons.impostos_totals,
      sobrecost_ter_fons: (terF - terE) * 100,
      breakeven_ter_fons: breakevenTerFons,
      nota: 'El diferiment no elimina l’impost: el retarda. El que guanyes és que el diner que hauries pagat a Hisenda segueix component per tu fins al final.'
    };
  }

  /* ---------- 8) PLA DE PENSIONS vs FONS INDEXAT ----------
     El pla dedueix ara a tipus marginal de la base general, però al rescat
     tributa TOT (aportacions incloses) com a rendiment del treball. El fons
     no dedueix res, però només tributa el guany i a tipus de l'estalvi.

     Comparació honesta: l'estalvi fiscal que genera el pla també s'inverteix.

     p: {aportacio_anual, anys_aportant, base_general_actual, ccaa,
         retorn_brut, ter, anys_rescat, pensio_publica_anual} */
  function planPensions(p) {
    p = p || {};
    var A = _num(p.aportacio_anual, 1500);
    var limit = REF.pensions.limit_individual;
    var excedeix = A > limit;
    var Adeduible = Math.min(A, limit);
    var N = Math.max(1, Math.round(_num(p.anys_aportant, 25)));
    var baseGen = _num(p.base_general_actual, 35000);
    var ccaa = p.ccaa || 'catalunya';
    var r = _num(p.retorn_brut, 6) / 100;
    var ter = _num(p.ter, 0.40) / 100;
    var M = Math.max(1, Math.round(_num(p.anys_rescat, 10)));
    var pensioPublica = _num(p.pensio_publica_anual, 18000);

    // Tipus marginal actual: el que et retorna cada euro aportat
    var margAra = marginalGeneral(baseGen, ccaa);
    var estalviAnual = Adeduible * margAra / 100;

    // ── Camí A: pla de pensions + estalvi fiscal invertit en un fons ──
    var pla = 0, sidecar = 0, sidecarBase = 0, y;
    for (y = 1; y <= N; y++) {
      pla = pla * (1 + r - ter) + A;
      sidecar = sidecar * (1 + r - ter) + estalviAnual;
      sidecarBase += estalviAnual;
    }
    // Rescat del pla repartit en M anys, tributant com a rendiment del treball
    var rescatAnual = pla / M;
    var impostRescat = 0;
    for (y = 0; y < M; y++) {
      var ambRescat = impostGeneral(pensioPublica + rescatAnual, ccaa).quota;
      var senseRescat = impostGeneral(pensioPublica, ccaa).quota;
      impostRescat += (ambRescat - senseRescat);
    }
    var margRescat = marginalGeneral(pensioPublica + rescatAnual, ccaa);
    var impostSidecar = impostEstalvi(Math.max(0, sidecar - sidecarBase));
    var netA = pla - impostRescat + sidecar - impostSidecar;

    // ── Camí B: tot en un fons indexat, sense deducció ──
    var fons = 0, fonsBase = 0;
    for (y = 1; y <= N; y++) { fons = fons * (1 + r - ter) + A; fonsBase += A; }
    var impostFons = impostEstalvi(Math.max(0, fons - fonsBase));
    var netB = fons - impostFons;

    return {
      aportacio_anual: A,
      aportacio_deduible: Adeduible,
      excedeix_limit: excedeix,
      excés: excedeix ? A - limit : 0,
      limit_individual: limit,
      anys_aportant: N,
      marginal_ara: margAra,
      marginal_rescat: margRescat,
      estalvi_fiscal_anual: estalviAnual,
      estalvi_fiscal_total: estalviAnual * N,
      pla_brut: pla,
      pla_impost_rescat: impostRescat,
      sidecar_brut: sidecar,
      sidecar_impost: impostSidecar,
      net_pla: netA,
      fons_brut: fons,
      fons_impost: impostFons,
      net_fons: netB,
      diferencia: netA - netB,
      guanya: netA >= netB ? 'pla' : 'fons',
      rescat_anual: rescatAnual,
      anys_rescat: M,
      // El pla només compensa si al rescat tributes a un tipus prou inferior
      diferencial_marginal: margAra - margRescat
    };
  }

  /* ---------- 9) DIVIDENDS ESTRANGERS I DOBLE IMPOSICIÓ ----------
     La retenció en origen només és recuperable fins al límit del conveni.
     L'excés s'ha de reclamar al país d'origen (paperassa i, sovint, oblit). */
  function dividendsEstrangers(p) {
    p = p || {};
    var brut = _num(p.dividend_brut);
    var pais = p.pais || 'US';
    var info = REF.retencions_origen[pais] || REF.retencions_origen.US;
    var retPct = (p.retencio_pct != null) ? _num(p.retencio_pct) : info.retencio;
    var convPct = (p.conveni_pct != null) ? _num(p.conveni_pct) : info.conveni;
    var altresRendiments = _num(p.altres_rendiments_estalvi);

    var retingutOrigen = brut * retPct / 100;
    var recuperableConveni = brut * Math.min(retPct, convPct) / 100;
    var excesNoDeduible = retingutOrigen - recuperableConveni;

    // Impost espanyol sobre aquest dividend (tram marginal dins la base)
    var impostTotal = impostEstalvi(altresRendiments + brut);
    var impostSense = impostEstalvi(altresRendiments);
    var impostEspanya = impostTotal - impostSense;

    // La deducció per doble imposició internacional és el menor de:
    // l'impost efectivament pagat a fora (topat al conveni) i l'impost espanyol
    var deduccio = Math.min(recuperableConveni, impostEspanya);
    var aPagarEspanya = Math.max(0, impostEspanya - deduccio);
    var totalImpostos = retingutOrigen + aPagarEspanya;

    return {
      dividend_brut: brut,
      pais: info.nom,
      retencio_origen_pct: retPct,
      conveni_pct: convPct,
      retingut_origen: retingutOrigen,
      impost_espanya: impostEspanya,
      deduccio_doble_imposicio: deduccio,
      a_pagar_espanya: aPagarEspanya,
      exces_no_deduible: excesNoDeduible,
      reclamable_origen: excesNoDeduible,
      total_impostos: totalImpostos,
      net: brut - totalImpostos,
      tipus_efectiu: brut > 0 ? totalImpostos / brut * 100 : 0,
      avis: excesNoDeduible > 0
        ? 'Hi ha ' + Math.round(excesNoDeduible) + ' € retinguts per sobre del límit del conveni. No es poden deduir a Espanya: s’han de reclamar a l’administració del país d’origen.'
        : 'Tota la retenció en origen queda dins del límit del conveni.'
    };
  }

  /* Comparació ràpida: quant costa NO tenir el W-8BEN signat amb accions dels EUA */
  function costSenseW8BEN(dividendBrut, altresRendiments) {
    var amb = dividendsEstrangers({ dividend_brut: dividendBrut, pais: 'US', altres_rendiments_estalvi: altresRendiments });
    var sense = dividendsEstrangers({ dividend_brut: dividendBrut, pais: 'US_SENSE', altres_rendiments_estalvi: altresRendiments });
    return {
      amb_w8ben: amb, sense_w8ben: sense,
      cost_anual: sense.total_impostos - amb.total_impostos,
      net_amb: amb.net, net_sense: sense.net
    };
  }

  return {
    VERSION: VERSION,
    REF: REF,
    aplicarEscala: aplicarEscala,
    impostEstalvi: impostEstalvi,
    detallEstalvi: detallEstalvi,
    marginalEstalvi: marginalEstalvi,
    impostGeneral: impostGeneral,
    marginalGeneral: marginalGeneral,
    compensar: compensar,
    reglaAntiaplicacio: reglaAntiaplicacio,
    aflorarPerdues: aflorarPerdues,
    traspasVsETF: traspasVsETF,
    planPensions: planPensions,
    dividendsEstrangers: dividendsEstrangers,
    costSenseW8BEN: costSenseW8BEN
  };
})();

try { console.log("[TBI_FISCAL] v" + TBI_FISCAL.VERSION + " carregat · exercici " + TBI_FISCAL.REF.exercici); } catch (e) {}

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_FISCAL; }
