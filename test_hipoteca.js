/* Tests del motor TBI_HIPOTECA. Executar: node test_hipoteca.js */
var H = require('./tbi-hipoteca.js');

var passes = 0, fails = 0;
function eq(nom, a, b, tol) {
  tol = (tol === undefined) ? 0.01 : tol;
  var ok = (a === null || b === null) ? a === b : Math.abs(a - b) <= tol;
  if (ok) { passes++; console.log('  ✓ ' + nom + '  (' + (a === null ? 'null' : (+a).toFixed(2)) + ')'); }
  else { fails++; console.log('  ✗ ' + nom + '  obtingut=' + a + '  esperat=' + b); }
}
function ok(nom, cond, info) {
  if (cond) { passes++; console.log('  ✓ ' + nom + (info ? '  ' + info : '')); }
  else { fails++; console.log('  ✗ ' + nom + (info ? '  ' + info : '')); }
}

console.log('\n── 1. Quota del sistema francès ──');
// Cas de manual: 150.000€, 3% nominal, 30 anys -> 632,41€/mes
eq('150.000€ · 3% · 30 anys = 632,41€', H.quotaFrancesa(150000, 3, 360), 632.41, 0.01);
eq('200.000€ · 2,5% · 25 anys = 897,23€', H.quotaFrancesa(200000, 2.5, 300), 897.23, 0.01);
eq('100.000€ · 0% · 10 anys = capital/mesos', H.quotaFrancesa(100000, 0, 120), 100000 / 120, 1e-9);
eq('capital 0 -> quota 0', H.quotaFrancesa(0, 3, 360), 0);
// Comprovació independent: pendent = quota * (1 - (1+i)^-(n-k)) / i
var _i = 0.03 / 12, _q = H.quotaFrancesa(150000, 3, 360);
var _pendentEsperat = _q * (1 - Math.pow(1 + _i, -(360 - 180))) / _i;
eq('pendent a meitat de vida (150k/3%/30a)', H.pendentDespres(150000, 3, 360, 180), _pendentEsperat, 0.01);
ok('a meitat de termini encara es deu >60% del capital', H.pendentDespres(150000, 3, 360, 180) / 150000 > 0.6,
   '(' + (H.pendentDespres(150000, 3, 360, 180) / 150000 * 100).toFixed(1) + '% — el sistema francès carrega els interessos al principi)');

console.log('\n── 2. Quadre d\'amortització: quadratura comptable ──');
var cfg = { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 3 };
var q = H.generarQuadre(cfg, {});
eq('nombre de quotes = 360', q.files.length, 360, 0);
var sumaPrincipal = q.files.reduce(function (s, f) { return s + f.principal + f.extra; }, 0);
eq('Σ principal = capital', sumaPrincipal, 150000, 0.05);
eq('capital pendent final = 0', q.files[360 - 1].pendent, 0, 0.01);
var sumaInteres = q.files.reduce(function (s, f) { return s + f.interes; }, 0);
eq('Σ interessos = total pagat - capital', sumaInteres, q.resum.total_pagat - 150000, 0.05);
eq('total interessos ≈ 77.666€', q.resum.total_interessos, 77666, 5);
eq('quota constant en tipus fix', q.resum.quota_maxima - q.resum.quota_minima, 0, 0.01);
// El pendent del quadre ha de coincidir amb la fórmula tancada
eq('pendent al mes 180 coincideix amb la fórmula', q.files[179].pendent, H.pendentDespres(150000, 3, 360, 180), 0.05);
// Primera quota: interès = capital * i/12
eq('interès de la 1a quota = 150000*3%/12', q.files[0].interes, 150000 * 0.03 / 12, 1e-9);

console.log('\n── 3. Variable i mixt ──');
var cfgVar = { capital: 150000, anys: 30, modalitat: 'variable', diferencial: 0.75, revisio_mesos: 12 };
var qv = H.generarQuadre(cfgVar, { escenari: 2.82 });
eq('variable amb euríbor pla = fix al 3,57%', qv.resum.quota_inicial, H.quotaFrancesa(150000, 3.57, 360), 0.02);
eq('tipus aplicat = euríbor + diferencial', H.tipusAlMes(cfgVar, 1, 2.82), 3.57, 1e-9);
// Escenari creixent per anys
var puja = [1, 2, 3, 4, 5, 5, 5, 5, 5, 5];
var qp = H.generarQuadre(cfgVar, { escenari: puja });
ok('amb euríbor creixent la quota puja', qp.resum.quota_maxima > qp.resum.quota_inicial,
   '(' + qp.resum.quota_inicial.toFixed(0) + '€ -> ' + qp.resum.quota_maxima.toFixed(0) + '€)');
// Terra i sostre
var cfgSostre = { capital: 150000, anys: 30, modalitat: 'variable', diferencial: 0.75, sostre_max: 4 };
eq('el sostre limita el tipus', H.tipusAlMes(cfgSostre, 100, 8.0), 4, 1e-9);
eq('el terra limita el tipus', H.tipusAlMes({ modalitat: 'variable', diferencial: 0.5, sol_min: 1 }, 1, 0.1), 1, 1e-9);
// Mixt: 5 anys fix, després variable
var cfgMixt = { capital: 150000, anys: 30, modalitat: 'mixt', tipus_fix: 2.5, anys_fix: 5, diferencial: 0.8 };
eq('mixt: mes 1 aplica el tipus fix', H.tipusAlMes(cfgMixt, 1, 3.0), 2.5, 1e-9);
eq('mixt: mes 60 encara és fix', H.tipusAlMes(cfgMixt, 60, 3.0), 2.5, 1e-9);
eq('mixt: mes 61 ja és variable', H.tipusAlMes(cfgMixt, 61, 3.0), 3.8, 1e-9);
var qm = H.generarQuadre(cfgMixt, { escenari: 3.0 });
eq('mixt: quadratura del principal', qm.files.reduce(function (s, f) { return s + f.principal; }, 0), 150000, 0.05);

console.log('\n── 4. Comissions LCCI (Llei 5/2019) ──');
eq('fix, any 1 -> màxim 2%', H.comissioMaximaPct({ modalitat: 'fix' }, 1), 2.0);
eq('fix, any 11 -> màxim 1,5%', H.comissioMaximaPct({ modalitat: 'fix' }, 121), 1.5);
eq('variable (opció 3a), any 1 -> 0,25%', H.comissioMaximaPct({ modalitat: 'variable' }, 1), 0.25);
eq('variable (opció 3a), any 4 -> 0%', H.comissioMaximaPct({ modalitat: 'variable' }, 37), 0);
eq('variable (opció 5a), any 4 -> 0,15%', H.comissioMaximaPct({ modalitat: 'variable', comissio_opcio: '5a' }, 37), 0.15);
eq('variable (opció 5a), any 6 -> 0%', H.comissioMaximaPct({ modalitat: 'variable', comissio_opcio: '5a' }, 61), 0);
eq('una comissió pactada menor preval', H.comissioMaximaPct({ modalitat: 'fix', comissio_amort_pct: 0.5 }, 1), 0.5);
eq('una comissió pactada abusiva es tapa al límit legal', H.comissioMaximaPct({ modalitat: 'fix', comissio_amort_pct: 5 }, 1), 2.0);

console.log('\n── 5. Amortització anticipada ──');
var qBase = H.generarQuadre(cfg, {});
var qTermini = H.generarQuadre(cfg, { amortitzacions: [{ mes: 1, import: 20000, mode: 'termini' }] });
var qQuota = H.generarQuadre(cfg, { amortitzacions: [{ mes: 1, import: 20000, mode: 'quota' }] });
ok('reduir termini escurça la hipoteca', qTermini.files.length < qBase.files.length,
   '(' + qBase.files.length + ' -> ' + qTermini.files.length + ' mesos)');
eq('reduir termini manté la quota', qTermini.resum.quota_inicial, qBase.resum.quota_inicial, 3);
eq('reduir quota manté el termini', qQuota.files.length, qBase.files.length, 1);
ok('reduir quota baixa la quota', qQuota.resum.quota_minima < qBase.resum.quota_inicial,
   '(' + qBase.resum.quota_inicial.toFixed(0) + '€ -> ' + qQuota.resum.quota_minima.toFixed(0) + '€)');
ok('reduir termini estalvia més interessos que reduir quota',
   qTermini.resum.total_interessos < qQuota.resum.total_interessos,
   '(' + Math.round(qTermini.resum.total_interessos) + '€ vs ' + Math.round(qQuota.resum.total_interessos) + '€)');
eq('quadratura amb amortització (termini)',
   qTermini.files.reduce(function (s, f) { return s + f.principal + f.extra; }, 0), 150000, 0.05);
eq('quadratura amb amortització (quota)',
   qQuota.files.reduce(function (s, f) { return s + f.principal + f.extra; }, 0), 150000, 0.05);
eq('comissió aplicada al 2% de 20.000€ (fix, any 1)', qTermini.resum.total_comissions, 400, 0.01);
// Amortitzar més que el pendent no ha de trencar res
var qExcess = H.generarQuadre(cfg, { amortitzacions: [{ mes: 12, import: 999999, mode: 'termini' }] });
eq('amortització total: acaba al mes 12', qExcess.files.length, 12, 0);
eq('amortització total: pendent 0', qExcess.files[11].pendent, 0, 0.01);
// Amortitzacions recurrents
var recurrents = [];
for (var y = 1; y <= 10; y++) recurrents.push({ mes: y * 12, import: 3000, mode: 'termini' });
var qRec = H.generarQuadre(cfg, { amortitzacions: recurrents });
ok('10 amortitzacions anuals de 3.000€ escurcen molt el termini', qRec.files.length < 300,
   '(' + qRec.files.length + ' mesos)');
eq('quadratura amb amortitzacions recurrents',
   qRec.files.reduce(function (s, f) { return s + f.principal + f.extra; }, 0), 150000, 0.05);

console.log('\n── 6. TAE real amb despeses ──');
var tae0 = H.calcularTAE(cfg, { despeses: { taxacio: 0, notaria_copia: 0, gestoria: 0 } });
eq('sense despeses la TAE ≈ TIN capitalitzat', tae0.tae, (Math.pow(1 + 0.03 / 12, 12) - 1) * 100, 0.01);
var tae1 = H.calcularTAE(cfg, {});
ok('les despeses pugen la TAE', tae1.tae > tae0.tae,
   '(' + tae0.tae.toFixed(3) + '% -> ' + tae1.tae.toFixed(3) + '%)');
eq('despeses inicials per defecte = 750€', H.despesesInicials(cfg, {}), 750, 0.01);
var tae2 = H.calcularTAE(cfg, { segurs_anuals: 600 });
ok('les assegurances vinculades pugen la TAE', tae2.tae > tae1.tae,
   '(' + tae1.tae.toFixed(3) + '% -> ' + tae2.tae.toFixed(3) + '%)');

console.log('\n── 7. Fiscalitat: base de l\'estalvi ──');
eq('guany de 6.000€ -> 19%', H.impostEstalvi(6000), 6000 * 0.19, 0.01);
eq('guany de 10.000€', H.impostEstalvi(10000), 6000 * 0.19 + 4000 * 0.21, 0.01);
eq('guany de 60.000€', H.impostEstalvi(60000), 6000 * 0.19 + 44000 * 0.21 + 10000 * 0.23, 0.01);
eq('guany de 350.000€ (arriba al 30%)', H.impostEstalvi(350000),
   6000 * 0.19 + 44000 * 0.21 + 150000 * 0.23 + 100000 * 0.27 + 50000 * 0.30, 0.01);
eq('guany 0 -> impost 0', H.impostEstalvi(0), 0);
eq('pèrdua -> impost 0', H.impostEstalvi(-5000), 0);
ok('el tipus mitjà sempre queda dins del rang legal',
   H.tipusMitjaEstalvi(10000) > 19 && H.tipusMitjaEstalvi(10000) < 21,
   '(' + H.tipusMitjaEstalvi(10000).toFixed(2) + '%)');

console.log('\n── 8. Deducció per habitatge habitual (<2013) ──');
eq('sense dret -> 0', H.deduccioHabitatge(9040, false), 0);
eq('base per sota del topall: 15% de 5.000€', H.deduccioHabitatge(5000, true), 750, 0.01);
eq('base per sobre del topall es talla a 9.040€', H.deduccioHabitatge(20000, true), 1356, 0.01);
eq('deducció màxima = 1.356€', H.deduccioHabitatge(999999, true), H.REF.deduccio.limit_any, 0.01);

console.log('\n── 9. Amortitzar vs invertir ──');
// Hipoteca al 3%, fora de comissió (any 11+ no aplica en variable; usem fix amb comissió pactada 0)
var cfgAvI = { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 3, comissio_amort_pct: 0 };
var r2 = H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: 2, ter: 0.25 });
var r8 = H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 0.25 });
ok('amb retorn esperat del 2% guanya amortitzar', r2.guanya === 'amortitzar',
   '(diferència ' + Math.round(r2.diferencia) + '€)');
ok('amb retorn esperat del 8% guanya invertir', r8.guanya === 'invertir',
   '(diferència ' + Math.round(r8.diferencia) + '€)');
ok('el break-even existeix i és raonable', r8.breakeven_pct > 2 && r8.breakeven_pct < 8,
   '(' + r8.breakeven_pct.toFixed(2) + '%)');
// Verificació creuada: al break-even, els dos escenaris han d'empatar
var rBE = H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: r8.breakeven_pct, ter: 0.25 });
ok('al break-even la diferència és ~0', Math.abs(rBE.diferencia) < 250,
   '(' + Math.round(rBE.diferencia) + '€ sobre ' + Math.round(rBE.net_amortitzar) + '€)');
ok('el break-even supera el tipus de la hipoteca (per l\'impost i el TER)',
   r8.breakeven_pct > 3, '(' + r8.breakeven_pct.toFixed(2) + '% vs hipoteca al 3%)');
eq('interessos estalviats coincideixen amb els quadres',
   r8.interessos_estalviats,
   H.generarQuadre(cfgAvI, {}).resum.total_interessos -
   H.generarQuadre(cfgAvI, { amortitzacions: [{ mes: 1, import: 20000, mode: 'termini' }] }).resum.total_interessos, 1);
// Una hipoteca cara ha de tenir un break-even més alt
var cfgCara = { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 5, comissio_amort_pct: 0 };
var rCara = H.amortitzarVsInvertir(cfgCara, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 0.25 });
ok('una hipoteca al 5% exigeix un break-even més alt que una al 3%',
   rCara.breakeven_pct > r8.breakeven_pct,
   '(' + r8.breakeven_pct.toFixed(2) + '% -> ' + rCara.breakeven_pct.toFixed(2) + '%)');
// La comissió ha de perjudicar l'amortització
var cfgComis = { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 3 }; // comissió 2%
var rComis = H.amortitzarVsInvertir(cfgComis, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 0.25 });
ok('amb comissió del 2% el break-even baixa (amortitzar és pitjor)',
   rComis.breakeven_pct < r8.breakeven_pct,
   '(' + r8.breakeven_pct.toFixed(2) + '% -> ' + rComis.breakeven_pct.toFixed(2) + '%)');
eq('la comissió cobrada és el 2% de 20.000€', rComis.comissio_amortitzacio, 400, 0.01);
// Deducció <2013: un COP GROS malbarata la deducció (supera el topall de 9.040€
// en un sol any i escurça els anys en què encara es podria deduir).
var rDed = H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 0.25, deduccio_habitatge: true });
ok('amb deducció <2013, un cop gros BAIXA el break-even (malbarata deducció)',
   rDed.breakeven_pct < r8.breakeven_pct,
   '(' + r8.breakeven_pct.toFixed(2) + '% -> ' + rDed.breakeven_pct.toFixed(2) + '%)');
ok('amortitzar de cop dedueix menys que no amortitzar',
   rDed.deduccio_amortitzar < rDed.deduccio_invertir,
   '(' + Math.round(rDed.deduccio_amortitzar) + '€ vs ' + Math.round(rDed.deduccio_invertir) + '€)');

// L'estratègia correcta amb dret a deducció: amortitzar cada any just el que
// falta per arribar als 9.040€ de base, ni un euro més.
var quotaAnual = H.quotaFrancesa(150000, 3, 360) * 12;
var forat = H.REF.deduccio.base_max - quotaAnual;
ok('el forat anual fins al topall és positiu i petit', forat > 1000 && forat < 2000,
   '(quota anual ' + Math.round(quotaAnual) + '€ · forat ' + Math.round(forat) + '€)');
function dedTotal(quadre) {
  var d = 0;
  H.perAnys(quadre.files).forEach(function (a) { d += H.deduccioHabitatge(a.interes + a.principal + a.extra, true); });
  return d;
}
// Mateix import total amortitzat (~20.000€), dues estratègies diferents.
var nAnys = Math.round(20000 / forat);
var amortsOptimes = [];
for (var yy = 1; yy <= nAnys; yy++) amortsOptimes.push({ mes: yy * 12, import: forat, mode: 'termini' });
var cfgSenseComis = { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 3, comissio_amort_pct: 0 };
var qOpt = H.generarQuadre(cfgSenseComis, { amortitzacions: amortsOptimes });
var qLump = H.generarQuadre(cfgSenseComis, { amortitzacions: [{ mes: 12, import: forat * nAnys, mode: 'termini' }] });
eq('les dues estratègies amortitzen el mateix import', qOpt.resum.total_extra, qLump.resum.total_extra, 1);
ok('repartir fins al topall conserva més deducció que un cop gros',
   dedTotal(qOpt) > dedTotal(qLump),
   '(' + Math.round(dedTotal(qOpt)) + '€ vs ' + Math.round(dedTotal(qLump)) + '€ · ' + nAnys + ' anys de ' + Math.round(forat) + '€)');
ok('i estalvia interessos gairebé igual', qOpt.resum.total_interessos < H.generarQuadre(cfgAvI, {}).resum.total_interessos,
   '(' + Math.round(qOpt.resum.total_interessos) + '€ vs ' +
   Math.round(H.generarQuadre(cfgAvI, {}).resum.total_interessos) + '€ sense amortitzar)');
// Efecte net: amb dret a deducció, amortitzar segueix guanyant tot i perdre deducció
ok('la deducció perduda és molt menor que els interessos estalviats',
   (dedTotal(H.generarQuadre(cfgAvI, {})) - dedTotal(qOpt)) <
   (H.generarQuadre(cfgAvI, {}).resum.total_interessos - qOpt.resum.total_interessos),
   '(perd ' + Math.round(dedTotal(H.generarQuadre(cfgAvI, {})) - dedTotal(qOpt)) + '€ de deducció, estalvia ' +
   Math.round(H.generarQuadre(cfgAvI, {}).resum.total_interessos - qOpt.resum.total_interessos) + '€ d\'interessos)');
ok('un TER alt penalitza invertir',
   H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 1.8 }).breakeven_pct > r8.breakeven_pct,
   '(TER 0,25% -> ' + r8.breakeven_pct.toFixed(2) + '% · TER 1,80% -> ' +
   H.amortitzarVsInvertir(cfgAvI, { import: 20000, mode: 'termini', retorn_brut: 8, ter: 1.8 }).breakeven_pct.toFixed(2) + '%)');

console.log('\n── 10. Stress d\'euríbor ──');
var st = H.stressEuribor(cfgVar);
ok('genera 4 escenaris', st.length === 4);
ok('les quotes creixen amb l\'euríbor',
   st[0].quota_inicial < st[1].quota_inicial && st[1].quota_inicial < st[2].quota_inicial && st[2].quota_inicial < st[3].quota_inicial,
   '(' + st.map(function (s) { return Math.round(s.quota_inicial) + '€'; }).join(' < ') + ')');
ok('el xoc del 5,5% encareix la quota >40% vs l\'1%',
   st[3].quota_inicial / st[0].quota_inicial > 1.4,
   '(x' + (st[3].quota_inicial / st[0].quota_inicial).toFixed(2) + ')');

console.log('\n── 11. Comparador d\'ofertes ──');
var comp = H.comparar([
  { nom: 'Fix 3,00%', cfg: { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 3.0 }, segurs_anuals: 0 },
  { nom: 'Fix 2,80% amb vinculacions', cfg: { capital: 150000, anys: 30, modalitat: 'fix', tipus_fix: 2.8 }, segurs_anuals: 700 },
  { nom: 'Variable E+0,75%', cfg: { capital: 150000, anys: 30, modalitat: 'variable', diferencial: 0.75 }, segurs_anuals: 0 }
]);
ok('retorna 3 resultats', comp.length === 3);
ok('marca exactament una millor oferta', comp.filter(function (c) { return c.millor; }).length === 1);
comp.forEach(function (c) {
  console.log('    ' + (c.millor ? '★' : ' ') + ' ' + c.nom + ': quota ' + Math.round(c.quota_inicial) +
    '€ · TAE ' + c.tae.toFixed(2) + '% · cost total ' + Math.round(c.cost_total) + '€' +
    (c.sobrecost > 0 ? ' (+' + Math.round(c.sobrecost) + '€)' : ''));
});
ok('la quota més baixa NO és sempre la millor oferta',
   comp[1].quota_inicial < comp[0].quota_inicial,
   '(és exactament la trampa que ha de detectar el comparador)');
ok('el sobrecost de la millor oferta és 0',
   comp.filter(function (c) { return c.millor; })[0].sobrecost === 0);

console.log('\n── 12. Subrogació ──');
var sub = H.avaluarSubrogacio(
  { capital: 120000, anys: 20, modalitat: 'fix', tipus_fix: 4.0 },
  { capital: 120000, anys: 20, modalitat: 'fix', tipus_fix: 2.8 },
  2000
);
ok('detecta que val la pena', sub.val_la_pena === true, '(estalvi ' + Math.round(sub.estalvi_total) + '€)');
ok('calcula els mesos de recuperació', sub.mesos_recuperacio > 0 && sub.mesos_recuperacio < 60,
   '(' + sub.mesos_recuperacio + ' mesos)');
var subNo = H.avaluarSubrogacio(
  { capital: 120000, anys: 20, modalitat: 'fix', tipus_fix: 2.9 },
  { capital: 120000, anys: 20, modalitat: 'fix', tipus_fix: 2.85 },
  3000
);
ok('detecta quan NO val la pena', subNo.val_la_pena === false, '(estalvi ' + Math.round(subNo.estalvi_total) + '€)');

console.log('\n── 13. Ràtios de deute ──');
var rt = H.ratiosDeute({ ingressos_mensuals_nets: 2500, quota_mensual: 700, altres_quotes: 100, preu_habitatge: 200000, capital: 150000 });
eq('DTI = 800/2500', rt.dti, 32, 0.01);
eq('LTV = 150/200', rt.ltv, 75, 0.01);
ok('DTI del 32% -> atenció', rt.dti_estat === 'atencio');
ok('LTV del 75% -> ok', rt.ltv_estat === 'ok');
var rtRisc = H.ratiosDeute({ ingressos_mensuals_nets: 2000, quota_mensual: 900, altres_quotes: 0, preu_habitatge: 200000, capital: 190000 });
ok('DTI del 45% -> risc', rtRisc.dti_estat === 'risc');
ok('LTV del 95% -> risc', rtRisc.ltv_estat === 'risc');

console.log('\n── 14. Casos límit ──');
eq('capital 0 -> quadre buit', H.generarQuadre({ capital: 0, anys: 30, modalitat: 'fix', tipus_fix: 3 }, {}).files.length, 0, 0);
eq('anys 0 -> quadre buit', H.generarQuadre({ capital: 100000, anys: 0, modalitat: 'fix', tipus_fix: 3 }, {}).files.length, 0, 0);
var q0 = H.generarQuadre({ capital: 120000, anys: 10, modalitat: 'fix', tipus_fix: 0 }, {});
eq('tipus 0%: 120 quotes', q0.files.length, 120, 0);
eq('tipus 0%: interessos 0', q0.resum.total_interessos, 0, 0.01);
eq('tipus 0%: quota = 1.000€', q0.resum.quota_inicial, 1000, 0.01);
ok('amortització sense import no trenca el quadre',
   H.generarQuadre(cfg, { amortitzacions: [{ mes: 5, import: 0 }] }).files.length === 360);
ok('amortitzar vs invertir amb import 0 -> null',
   H.amortitzarVsInvertir(cfg, { import: 0 }) === null);

console.log('\n════════════════════════════════════════');
console.log(passes + ' passats · ' + fails + ' fallits');
if (fails) process.exit(1);
