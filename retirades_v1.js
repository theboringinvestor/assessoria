// ════════════════════════════════════════════════════════════════════════════
// FASE DE RETIRADA — el matching a la inversa
// Mentre acumules, l'aportació va a les categories INFRAponderades.
// Mentre liquides, la venda surt de les SOBREponderades: cada retirada
// rebalanceja sola i evites vendre justament el que va endarrerit.
//
// Dues capes de decisió:
//   1. QUINA CATEGORIA — per excés sobre el target, amb bandes 5/25
//   2. QUINA POSICIÓ dins la categoria — la de menor ràtio de plusvàlua,
//      perquè el mateix euro de caixa generi menys impost
// ════════════════════════════════════════════════════════════════════════════

// Ràtio de plusvàlua latent de tota la cartera: (valor − cost) / valor.
// És el que determina quant has de vendre de més per obtenir un net.
function calcRatioGuanyCartera() {
  var posAgg = calcPosicionsAmbAgregats();
  var valor = 0, cost = 0;
  posAgg.forEach(function (p) {
    var v = parseFloat(p.valor_actual) || 0;
    if (v <= 0) return;
    valor += v;
    cost += Math.max(0, p.cost_base);
  });
  if (valor <= 0) return 0;
  return Math.max(0, Math.min(1, (valor - cost) / valor));
}

// Ràtio de plusvàlua d'una posició concreta
function _ratioGuanyPosicio(p) {
  var v = parseFloat(p.valor_actual) || 0;
  if (v <= 0) return 0;
  var cost = Math.max(0, p.cost_base);
  return Math.max(0, Math.min(1, (v - cost) / v));
}

// Reparteix un import de venda entre categories sobreponderades.
// Simètric a _repartirAportacio: allà s'omplien els forats, aquí es retallen
// els excessos, sense passar-se mai de l'excés de cada categoria.
function _repartirVenda(candidats, totsElsRows, importVenda) {
  var assign = {}, i;
  candidats.forEach(function (r) { assign[r.id] = 0; });
  var restant = importVenda;
  for (i = 0; i < 8 && restant > 0.01; i++) {
    var oberts = candidats.filter(function (r) { return assign[r.id] < r.exces_plan - 0.01; });
    if (oberts.length === 0) break;
    var sumE = 0;
    oberts.forEach(function (r) { sumE += (r.exces_plan - assign[r.id]); });
    if (sumE <= 0) break;
    var disponible = restant;
    oberts.forEach(function (r) {
      var quota = (r.exces_plan - assign[r.id]) / sumE;
      var add = Math.min(disponible * quota, r.exces_plan - assign[r.id]);
      assign[r.id] += add;
      restant -= add;
    });
  }
  // Si retallar els excessos no arriba, la resta surt de tothom a pes de
  // target: així la cartera es manté proporcionada mentre es va buidant.
  if (restant > 0.01) {
    var base = (totsElsRows && totsElsRows.length) ? totsElsRows : candidats;
    var sumT = 0;
    base.forEach(function (r) { sumT += (r.real_eur || 0); });
    base.forEach(function (r) {
      if (assign[r.id] === undefined) assign[r.id] = 0;
      var quota = sumT > 0 ? (r.real_eur || 0) / sumT : 1 / base.length;
      assign[r.id] += restant * quota;
    });
  }
  return assign;
}

// ════════════════════════════════════════════════════════════════════════
// calcRetiradaTactica(importNet, opts)
// importNet: euros que el client vol tenir a la butxaca DESPRÉS d'impostos.
// Retorna les ordres de venda concretes, l'impost estimat i el brut real.
// ════════════════════════════════════════════════════════════════════════
function calcRetiradaTactica(importNet, opts) {
  var c = getClient();
  if (!c) return null;
  opts = opts || {};
  var net = parseFloat(importNet) || 0;
  if (net <= 0) return null;

  var importMin = (opts.import_min_ordre != null) ? opts.import_min_ordre : MOTOR_V3.import_min_ordre;
  var altresRend = parseFloat(opts.altres_rendiments) || 0;
  var ambImpostos = (opts.considerar_impostos !== false);

  var posAgg = calcPosicionsAmbAgregats().filter(function (p) { return (parseFloat(p.valor_actual) || 0) > 0; });
  if (!posAgg.length) return null;

  var valorTotal = 0;
  posAgg.forEach(function (p) { valorTotal += (parseFloat(p.valor_actual) || 0); });
  if (valorTotal <= 0) return null;

  // ── Brut necessari per obtenir el net demanat ──
  // Primera estimació amb la ràtio de plusvàlua de tota la cartera. No és
  // suficient: la venda concreta surt de les posicions que triem, que poden
  // tenir molta més (o molta menys) plusvàlua que la mitjana. Després de
  // construir les ordres reals cal tornar-hi i ajustar.
  var ratioCartera = calcRatioGuanyCartera();
  var grossUp = ambImpostos && typeof TBI_FIRE !== 'undefined'
    ? TBI_FIRE.brutPerNet(net, ratioCartera, altresRend)
    : { brut: net, impost: 0, guany: 0, tipus_efectiu: 0 };
  var brut = Math.min(grossUp.brut, valorTotal);
  var insuficient = grossUp.brut > valorTotal;

  // ── Capa 1: quina categoria ──
  var arq = getArquetip(c.arquetipId || 'navegant');
  var target = (c.cartera_target_custom && c.cartera_target_custom.length > 0)
    ? c.cartera_target_custom : (arq.actius || []);
  var real = calcDistribucioReal();
  var valorPost = Math.max(0, valorTotal - brut);

  var idsTarget = {};
  var rows = (target || []).map(function (t) {
    var catId = t.id || (function () {
      var f = ACTIUS_TAXONOMY.find(function (a) { return a.ca === t.nom || a.id === t.nom; });
      return f ? f.id : t.nom;
    })();
    idsTarget[catId] = true;
    var taxon = ACTIUS_TAXONOMY.find(function (a) { return a.id === catId; });
    var realRow = real.find(function (r) { return r.id === catId; });
    var targetPct = parseFloat(t.pct) || 0;
    var realEur = realRow ? realRow.valor : 0;
    var realPct = valorTotal > 0 ? realEur / valorTotal * 100 : 0;
    var banda = Math.max(MOTOR_V3.banda_min_pp, Math.min(MOTOR_V3.banda_abs_pp, targetPct * MOTOR_V3.banda_rel));
    return {
      id: catId, nom: taxon ? taxon.ca : (t.nom || catId), emoji: taxon ? taxon.emoji : '•',
      color: t.color || (taxon ? taxon.color : '#888'),
      target_pct: targetPct, real_eur: realEur, real_pct: realPct,
      // Excés sobre el target un cop feta la retirada: és el que convé vendre
      exces_plan: realEur - targetPct / 100 * valorPost,
      exces_pct: realPct - targetPct,
      banda_pp: banda,
      fora_banda: Math.abs(realPct - targetPct) > banda,
      fora_pla: false
    };
  });
  // Categories que no són al pla: es venen primer, sempre
  real.forEach(function (r) {
    if (idsTarget[r.id] || r.valor <= 0) return;
    rows.push({
      id: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
      target_pct: 0, real_eur: r.valor,
      real_pct: valorTotal > 0 ? r.valor / valorTotal * 100 : 0,
      exces_plan: r.valor, exces_pct: valorTotal > 0 ? r.valor / valorTotal * 100 : 0,
      banda_pp: MOTOR_V3.banda_min_pp, fora_banda: true, fora_pla: true
    });
  });

  var sobre = rows.filter(function (r) { return r.exces_plan > 0.5; });
  // Primer les que estan fora de banda o fora de pla; si no n'hi ha, totes
  var prioritaris = sobre.filter(function (r) { return r.fora_banda || r.fora_pla; });
  var baseCands = prioritaris.length > 0 ? prioritaris : sobre;

  // ── Capa 2: quina posició dins de cada categoria ──
  // A igual categoria, ven primer la que porta menys plusvàlua: mateixa
  // caixa, menys factura fiscal. No és evasió, és ordre de venda.
  function _construirOrdres(brutObjectiu) {
    var assignCat = baseCands.length > 0
      ? _repartirVenda(baseCands, rows, brutObjectiu)
      : (function () {
          // Cartera perfectament alineada: venda proporcional a tot arreu
          var a = {}, sumV = 0;
          rows.forEach(function (r) { sumV += r.real_eur; });
          rows.forEach(function (r) { a[r.id] = sumV > 0 ? brutObjectiu * r.real_eur / sumV : 0; });
          return a;
        })();

    var res = [];
    Object.keys(assignCat).forEach(function (catId) {
      var aVendre = assignCat[catId];
      if (!(aVendre > 0.5)) return;
      var pos = posAgg.filter(function (p) { return p.cat === catId; })
        .map(function (p) {
          return {
            id: p.id, nom: p.nom || catId, cat: catId,
            valor: parseFloat(p.valor_actual) || 0,
            cost_base: Math.max(0, p.cost_base),
            ratio_guany: _ratioGuanyPosicio(p)
          };
        })
        .sort(function (a, b) { return a.ratio_guany - b.ratio_guany; });

      var restant = aVendre;
      for (var i = 0; i < pos.length && restant > 0.5; i++) {
        var imp = Math.min(restant, pos[i].valor);
        if (imp <= 0.5) continue;
        var taxon = ACTIUS_TAXONOMY.find(function (a) { return a.id === catId; });
        res.push({
          posicio_id: pos[i].id, nom: pos[i].nom, cat: catId,
          nom_cat: taxon ? taxon.ca : catId, emoji: taxon ? taxon.emoji : '•',
          color: taxon ? taxon.color : '#888',
          import: imp,
          valor_posicio: pos[i].valor,
          ratio_guany: pos[i].ratio_guany,
          guany: imp * pos[i].ratio_guany,
          pct_posicio: pos[i].valor > 0 ? imp / pos[i].valor * 100 : 0,
          liquida_tot: imp >= pos[i].valor - 0.5
        });
        restant -= imp;
      }
    });

    // Mínim per ordre: agrupar les engrunes a l'ordre més gran de la categoria
    res = res.filter(function (o) { return o.import > 0.5; })
             .sort(function (a, b) { return b.import - a.import; });
    if (res.length > 1) {
      var guard = 0;
      while (res.length > 1 && guard++ < 40 && res[res.length - 1].import < importMin) {
        var petita = res.pop();
        var receptor = null;
        for (var k = 0; k < res.length; k++) {
          if (res[k].cat === petita.cat) { receptor = res[k]; break; }
        }
        if (!receptor) receptor = res[0];
        var marge = Math.max(0, receptor.valor_posicio - receptor.import);
        var mou = Math.min(petita.import, marge);
        receptor.import += mou;
        receptor.guany = receptor.import * receptor.ratio_guany;
        receptor.pct_posicio = receptor.valor_posicio > 0 ? receptor.import / receptor.valor_posicio * 100 : 0;
        receptor.liquida_tot = receptor.import >= receptor.valor_posicio - 0.5;
        if (mou < petita.import - 0.5) { petita.import -= mou; res.push(petita); break; }
        res.sort(function (a, b) { return b.import - a.import; });
      }
    }
    return res;
  }

  function _impostDe(guany) {
    return (ambImpostos && typeof TBI_FISCAL !== 'undefined')
      ? TBI_FISCAL.impostEstalvi(altresRend + guany) - TBI_FISCAL.impostEstalvi(altresRend)
      : 0;
  }

  // ── Punt fix: ajustar el brut fins que el NET sigui el demanat ──
  // La ràtio de plusvàlua de les posicions que acabem venent no és la de la
  // cartera sencera, així que la primera estimació es queda curta o llarga.
  // Com que l'impost marginal és < 30%, la iteració convergeix de pressa.
  var ordres = [], brutReal = 0, guanyReal = 0, impostReal = 0, netReal = 0, it;
  for (it = 0; it < 12; it++) {
    ordres = _construirOrdres(Math.min(brut, valorTotal));
    brutReal = 0; guanyReal = 0;
    ordres.forEach(function (o) { brutReal += o.import; guanyReal += o.guany; });
    impostReal = _impostDe(guanyReal);
    netReal = brutReal - impostReal;
    var err = net - netReal;
    // Si ja hem tocat sostre no es pot ajustar més
    if (brutReal >= valorTotal - 0.5) { insuficient = insuficient || (netReal < net - 0.5); break; }
    if (Math.abs(err) < 0.5) break;
    brut = Math.min(valorTotal, brutReal + err);
  }

  // Com queda la cartera després de la venda
  var perCat = {};
  ordres.forEach(function (o) { perCat[o.cat] = (perCat[o.cat] || 0) + o.import; });
  var despres = rows.map(function (r) {
    var venut = perCat[r.id] || 0;
    var nou = Math.max(0, r.real_eur - venut);
    var totalDespres = Math.max(1, valorTotal - brutReal);
    return {
      id: r.id, nom: r.nom, emoji: r.emoji, color: r.color,
      target_pct: r.target_pct, fora_pla: r.fora_pla,
      abans_pct: r.real_pct, venut: venut,
      despres_pct: nou / totalDespres * 100,
      desviacio_abans: r.real_pct - r.target_pct,
      desviacio_despres: nou / totalDespres * 100 - r.target_pct
    };
  }).sort(function (a, b) { return b.venut - a.venut; });

  var derivaAbans = 0, derivaDespres = 0;
  despres.forEach(function (d) {
    derivaAbans += Math.abs(d.desviacio_abans);
    derivaDespres += Math.abs(d.desviacio_despres);
  });

  return {
    net_demanat: net,
    brut_necessari: brutReal,
    guany_realitzat: guanyReal,
    impost: impostReal,
    net_real: netReal,
    tipus_efectiu: brutReal > 0 ? impostReal / brutReal * 100 : 0,
    ratio_guany_cartera: ratioCartera,
    valor_abans: valorTotal,
    valor_despres: valorTotal - brutReal,
    pct_cartera_venut: valorTotal > 0 ? brutReal / valorTotal * 100 : 0,
    ordres: ordres,
    rows: rows,
    despres: despres,
    coherencia_abans: Math.max(0, Math.round(100 - derivaAbans / 2)),
    coherencia_despres: Math.max(0, Math.round(100 - derivaDespres / 2)),
    insuficient: insuficient,
    import_min_ordre: importMin,
    considerar_impostos: ambImpostos
  };
}

// Taxa de retirada actual de la cartera respecte de la SWR recomanada.
// És el semàfor de la fase de liquidació.
function calcSalutRetirada(retiradaAnualNeta) {
  var c = getClient();
  if (!c) return null;
  var kpis = calcKPIsCartera();
  if (!kpis.valor_total) return null;

  // Pes de RV real de la cartera
  var dist = calcDistribucioReal();
  var pctRV = 0;
  dist.forEach(function (d) {
    var taxon = ACTIUS_TAXONOMY.find(function (a) { return a.id === d.id; });
    if (taxon && taxon.grup === 'rv') pctRV += d.pct;
    if (taxon && taxon.grup === 'mixt') pctRV += d.pct * 0.6;
  });

  var ter = 0.25;
  try { var t = calcTERCartera(); if (t) ter = t.ter_real; } catch (e) {}

  var edat = parseFloat(c.perfil && c.perfil.edat) || 55;
  var anysRet = TBI_FIRE.anysRetirada(edat, TBI_FIRE.REF.esperanca_vida_defecte);
  var s = TBI_FIRE.swr({ anys_retirada: anysRet, pct_rv: pctRV, ter: ter });

  var ratio = calcRatioGuanyCartera();
  var brut = TBI_FIRE.brutPerNet(retiradaAnualNeta, ratio, 0);
  var taxaActual = brut.brut / kpis.valor_total * 100;

  return {
    valor_cartera: kpis.valor_total,
    retirada_neta: retiradaAnualNeta,
    retirada_bruta: brut.brut,
    impost_anual: brut.impost,
    taxa_actual: taxaActual,
    swr_recomanada: s.swr,
    swr_detall: s,
    pct_rv: pctRV,
    ter: ter,
    anys_retirada: anysRet,
    marge: s.swr - taxaActual,
    estat: taxaActual <= s.swr * 0.85 ? 'folgat' : (taxaActual <= s.swr ? 'ajustat' : 'excessiu'),
    capital_per_sostenible: brut.brut / (s.swr / 100)
  };
}
