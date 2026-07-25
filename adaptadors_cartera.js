// ════════════════════════════════════════════════════════════════════════════
// ADAPTADORS AL MOTOR COMPARTIT (tbi-cartera.js)
// Els càlculs viuen a TBI_CARTERA. Aquí només hi ha la capa que llegeix
// les dades del client i hi delega. tbi-app.html fa exactament el mateix
// amb les seves dades: així els dos no poden tornar a divergir.
// ════════════════════════════════════════════════════════════════════════════

// Àlies de compatibilitat: hi ha codi que encara referencia aquests noms.
var MOTOR_V3 = TBI_CARTERA.PARAMS;
var TER_PER_CATEGORIA = (function () {
  var m = {};
  TBI_CARTERA.TAXONOMIA.forEach(function (t) { m[t.id] = t.ter; });
  return m;
})();
function terDeCategoria(id) { return TBI_CARTERA.terDeCategoria(id); }

// Context de cartera del client actualment visualitzat
function _ctxCartera() {
  var c = getClient();
  var target = [];
  if (c) {
    if (c.cartera_target_custom && c.cartera_target_custom.length > 0) target = c.cartera_target_custom;
    else {
      var arq = getArquetip(c.arquetipId || 'navegant');
      target = (arq && arq.actius) || [];
    }
  }
  return { posicions: getPosicionsV2(), moviments: getMovimentsV2(), target: target };
}

function calcPosicionsAmbAgregats() {
  return TBI_CARTERA.agregats(getPosicionsV2(), getMovimentsV2());
}

function calcKPIsCartera() {
  return TBI_CARTERA.kpis(getPosicionsV2(), getMovimentsV2());
}

function calcXIRR(flows) { return TBI_CARTERA.xirr(flows); }
function calcFluxosCaixa() { return TBI_CARTERA.fluxos(getPosicionsV2(), getMovimentsV2()); }

function calcTWR() {
  var c = getClient();
  var snaps = (c && Array.isArray(c.snapshots_cartera)) ? c.snapshots_cartera : [];
  return TBI_CARTERA.twr(snaps, getPosicionsV2(), getMovimentsV2());
}

function calcDistribucioReal() {
  return TBI_CARTERA.distribucio(getPosicionsV2(), getMovimentsV2());
}

function calcTERCartera() {
  var ctx = _ctxCartera();
  return TBI_CARTERA.ter(ctx.posicions, ctx.moviments, ctx.target);
}

function calcMatchingITactic(aportacio, opts) {
  var c = getClient();
  if (!c) return null;
  var ctx = _ctxCartera();
  if (!ctx.target || !ctx.target.length) return null;
  return TBI_CARTERA.matching(ctx, aportacio, opts);
}

function calcRatioGuanyCartera() {
  return TBI_CARTERA.kpis(getPosicionsV2(), getMovimentsV2()).ratio_guany;
}

function calcRetiradaTactica(importNet, opts) {
  var c = getClient();
  if (!c) return null;
  return TBI_CARTERA.retirada(_ctxCartera(), importNet, opts);
}

// Sèrie d'evolució temporal (per al gràfic). Depèn només dels moviments.
function calcEvolucioCartera() {
  var moviments = getMovimentsV2().slice().sort(function (a, b) {
    return (a.data || '').localeCompare(b.data || '');
  });
  if (!moviments.length) return [];
  var serie = [], cum = 0;
  moviments.forEach(function (m) {
    var imp = parseFloat(m.import) || 0;
    if (m.tipus === 'compra') cum += imp;
    if (m.tipus === 'venda') cum -= imp;
    serie.push({ data: m.data, invertit_acum: cum, tipus: m.tipus });
  });
  var kpis = calcKPIsCartera();
  serie.push({ data: new Date().toISOString().slice(0, 10), invertit_acum: kpis.cost_total,
               valor_actual: kpis.valor_total, tipus: 'snapshot' });
  return serie;
}

// Salut de la fase de retirada: taxa actual contra la SWR dinàmica
function calcSalutRetirada(retiradaAnualNeta) {
  var c = getClient();
  if (!c) return null;
  var pos = getPosicionsV2(), mov = getMovimentsV2();
  var k = TBI_CARTERA.kpis(pos, mov);
  if (!k.valor_total) return null;

  var pctRV = TBI_CARTERA.pesRV(pos, mov);
  var t = TBI_CARTERA.ter(pos, mov, _ctxCartera().target);
  var ter = t ? t.ter_real : TBI_CARTERA.PARAMS.ter_defecte;

  var edat = parseFloat(c.perfil && c.perfil.edat) || 55;
  var anysRet = TBI_FIRE.anysRetirada(edat, TBI_FIRE.REF.esperanca_vida_defecte);
  var s = TBI_FIRE.swr({ anys_retirada: anysRet, pct_rv: pctRV, ter: ter });
  var brut = TBI_FIRE.brutPerNet(retiradaAnualNeta, k.ratio_guany, 0);
  var taxaActual = brut.brut / k.valor_total * 100;

  return {
    valor_cartera: k.valor_total, retirada_neta: retiradaAnualNeta,
    retirada_bruta: brut.brut, impost_anual: brut.impost,
    taxa_actual: taxaActual, swr_recomanada: s.swr, swr_detall: s,
    pct_rv: pctRV, ter: ter, anys_retirada: anysRet,
    marge: s.swr - taxaActual,
    estat: taxaActual <= s.swr * 0.85 ? 'folgat' : (taxaActual <= s.swr ? 'ajustat' : 'excessiu'),
    capital_per_sostenible: brut.brut / (s.swr / 100)
  };
}
