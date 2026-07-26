/* Tests del motor TBI_OBJECTIUS.
   Comprova el que ha de ser cert sempre: que els sobres sumen el que hi ha,
   que un objectiu proper no acaba en renda variable, que la cartera
   proposada respecta el sostre de l'arquetip i que el FIRE i el full de
   ruta parlen de la mateixa xifra.
   Executar: node test_objectius.js */
global.TBI_FISCAL  = require('./tbi-fiscal.js');
global.TBI_FIRE    = require('./tbi-fire.js');
global.TBI_CARTERA = require('./tbi-cartera.js');
var O = require('./tbi-objectius.js');

var passes = 0, fails = 0;
function eq(n, a, b, t) {
  t = (t === undefined) ? 0.01 : t;
  var ok_ = (a === null || b === null) ? a === b : Math.abs(a - b) <= t;
  if (ok_) { passes++; console.log('  ✓ ' + n + '  (' + (a === null ? 'null' : (+a).toFixed(2)) + ')'); }
  else { fails++; console.log('  ✗ ' + n + '  obtingut=' + a + ' esperat=' + b); }
}
function ok(n, c, i) {
  if (c) { passes++; console.log('  ✓ ' + n + (i ? '  ' + i : '')); }
  else { fails++; console.log('  ✗ ' + n + (i ? '  ' + i : '')); }
}
var AVUI = new Date('2026-07-26T00:00:00Z');
function d(anys) { return O.dataDinsDe(anys, AVUI); }
function te(flags, codi) { return flags.some(function (f) { return f.codi === codi; }); }

console.log('\n── 1. Normalització i migració des del format antic ──');
var antic = O.normalitza({ titol: 'Entrada del pis', import: 60000, termini: '5 anys' }, { avui: AVUI });
eq('el termini de text es converteix en anys', antic.anys, 5, 0.05);
ok('i genera una data ISO', /^\d{4}-\d{2}-\d{2}$/.test(antic.dataObjectiu), '(' + antic.dataObjectiu + ')');
ok('conserva el text original per no perdre res', antic.termini === '5 anys');
ok('assigna un id estable', !!antic.id);
eq('termini en anys naturals ("2031")', O.normalitza({ termini: '2031' }, { avui: AVUI }).anys, 5, 0.05);
eq('termini en mesos ("18 mesos")', O.normalitza({ termini: '18 mesos' }, { avui: AVUI }).anys, 1.5, 0.05);
ok('termini buit → sense data', O.normalitza({ termini: '—' }, { avui: AVUI }).dataObjectiu === null);
ok('el FIRE és residual per defecte', O.normalitza({ tipus: 'fire' }).residual === true);
ok('la resta no ho són', O.normalitza({ tipus: 'vehicle' }).residual === false);
ok('el fons d\'emergència és essencial i no flexible',
   O.normalitza({ tipus: 'emergencia' }).prioritat === 'essencial' && O.normalitza({ tipus: 'emergencia' }).flexible === false);
var mantePersonalitzat = O.normalitza({ tipus: 'vehicle', prioritat: 'essencial', flexible: false });
ok('el que ha decidit l\'assessor mana sobre la plantilla',
   mantePersonalitzat.prioritat === 'essencial' && mantePersonalitzat.flexible === false);

console.log('\n── 2. Glidepath: els diners de demà no van a borsa ──');
eq('a 6 mesos, 0% de RV', O.mixPerHoritzo(0.5).rv, 0, 0.01);
ok('a 6 mesos gairebé tot és liquiditat', O.mixPerHoritzo(0.5).cash > 90);
ok('a 3 anys la RV és minoritària', O.mixPerHoritzo(3).rv <= 30, '(' + O.mixPerHoritzo(3).rv.toFixed(0) + '%)');
ok('a 10 anys la RV ja domina', O.mixPerHoritzo(10).rv >= 65, '(' + O.mixPerHoritzo(10).rv.toFixed(0) + '%)');
ok('a 25 anys és gairebé tot RV', O.mixPerHoritzo(25).rv >= 90);
ok('la RV creix de manera monòtona amb l\'horitzó', (function () {
  var prev = -1;
  for (var a = 0; a <= 35; a += 0.5) { var v = O.mixPerHoritzo(a).rv; if (v < prev - 0.001) return false; prev = v; }
  return true;
})());
ok('sempre suma 100', (function () {
  for (var a = 0; a <= 40; a += 1.5) {
    var m = O.mixPerHoritzo(a, 60);
    if (Math.abs(m.rv + m.rf + m.cash - 100) > 0.01) return false;
  }
  return true;
})());
console.log('  · el perfil mana per damunt de l\'horitzó:');
var capat = O.mixPerHoritzo(30, 40);
eq('un arquetip amb sostre del 40% retalla la RV a 30 anys', capat.rv, 40, 0.01);
ok('i ho marca', capat.retallat_per_perfil === true);
ok('l\'excés de RV baixa a RF, no desapareix', capat.rf > O.mixPerHoritzo(30).rf);
ok('un sostre alt no retalla res', O.mixPerHoritzo(3, 90).retallat_per_perfil === false);

console.log('\n── 3. Rendiment de la barreja ──');
var rLlarg = O.retornMix(O.mixPerHoritzo(25));
var rCurt  = O.retornMix(O.mixPerHoritzo(1));
ok('una barreja llarga espera més que una de curta', rLlarg.nominal > rCurt.nominal,
   '(' + rLlarg.nominal.toFixed(1) + '% vs ' + rCurt.nominal.toFixed(1) + '%)');
ok('el real sempre és menor que el nominal', rLlarg.real < rLlarg.nominal);
ok('i també té més volatilitat', rLlarg.sigma > rCurt.sigma);
ok('cap barreja arriba al 13,5% que hi ha desat a la BD', rLlarg.nominal < 10,
   '(màxim realista ' + rLlarg.nominal.toFixed(1) + '%)');
var rOverride = O.retornMix(O.mixPerHoritzo(25), { mu: { rv: 9, rf: 4, cash: 2, alt: 5 } });
ok('el host pot passar els seus propis μ', rOverride.nominal > rLlarg.nominal);

console.log('\n── 4. Sobres virtuals: la suma no pot mentir ──');
var LLISTA = [
  { tipus: 'emergencia', import: 14000, dataObjectiu: d(1),  capitalAssignat: 9000,  aportacioAssignada: 200 },
  { tipus: 'habitatge_compra', import: 60000, dataObjectiu: d(4), capitalAssignat: 20000, aportacioAssignada: 400 },
  { tipus: 'fire', import: 900000, dataObjectiu: d(20) }
];
var a1 = O.assignacio(LLISTA, { capital_total: 185000, aportacio_total: 1600, avui: AVUI });
var fire1 = a1.objectius.filter(function (o) { return o.tipus === 'fire'; })[0];
eq('el residual absorbeix el capital sobrant', fire1.capitalEfectiu, 185000 - 29000);
eq('i l\'aportació sobrant', fire1.aportacioEfectiva, 1600 - 600);
eq('res no queda lliure quan hi ha residual', a1.capital_lliure, 0);
ok('sense sobreassignació no hi ha avisos', a1.avisos.length === 0 && a1.sobreassignat === false);
eq('els sobres sumen exactament la cartera', (function () {
  var s = 0; a1.objectius.forEach(function (o) { s += o.capitalEfectiu; }); return s;
})(), 185000, 0.01);

var a2 = O.assignacio([
  { tipus: 'habitatge_compra', import: 60000, dataObjectiu: d(4), capitalAssignat: 80000, aportacioAssignada: 300 },
  { tipus: 'vehicle', import: 30000, dataObjectiu: d(3), capitalAssignat: 40000, aportacioAssignada: 300 }
], { capital_total: 100000, aportacio_total: 500, avui: AVUI });
ok('detecta que es reclama més capital del que hi ha', te(a2.avisos, 'capital_sobreassignat'));
ok('i més aportació de la que hi ha', te(a2.avisos, 'aportacio_sobreassignada'));
eq('escala el capital sense passar-se', (function () {
  var s = 0; a2.objectius.forEach(function (o) { s += o.capitalEfectiu; }); return s;
})(), 100000, 0.01);
ok('els avisos són de gravetat alta', a2.avisos.every(function (f) { return f.gravetat === 'alta'; }));

var a3 = O.assignacio([{ tipus: 'vehicle', import: 30000, dataObjectiu: d(3), capitalAssignat: 10000 }],
                      { capital_total: 100000, aportacio_total: 500, avui: AVUI });
ok('sense objectiu residual avisa del capital orfe', te(a3.avisos, 'sense_residual'));
eq('i el reporta com a lliure', a3.capital_lliure, 90000);

var a4 = O.assignacio([
  { tipus: 'viatge', import: 20000, dataObjectiu: d(2), capitalAssignat: 5000, estat: 'pausat' },
  { tipus: 'fire', import: 900000, dataObjectiu: d(20) }
], { capital_total: 100000, aportacio_total: 500, avui: AVUI });
eq('un objectiu pausat no reclama res', a4.objectius[0].capitalEfectiu, 0);
eq('i el residual s\'ho queda tot', a4.objectius[1].capitalEfectiu, 100000);

console.log('\n── 5. Projecció d\'un objectiu ──');
var pEmerg = O.projeccio(a1.objectius[0], { avui: AVUI });
ok('el fons d\'emergència a 1 any va gairebé tot en liquiditat', pEmerg.mix.cash > 80);
// 9.000 € + 200 €/mes en liquiditat = 11.400 € nominals, i en euros d'avui
// encara menys perquè el real d'un monetari és negatiu. No hi arriba, i el
// motor ho ha de dir en lloc de maquillar-ho.
ok('9.000 € + 200 €/mes no arriben als 14.000 en un any', pEmerg.estat_ritme === 'fora_ruta',
   '(projecció ' + Math.round(pEmerg.projectat) + ' € sobre 14.000 €)');
ok('el rendiment real de la liquiditat és negatiu', pEmerg.retorn_real_pct < 0,
   '(' + pEmerg.retorn_real_pct.toFixed(2) + '%)');
ok('i diu que caldrien uns 420 €/mes', Math.abs(pEmerg.aportacio_necessaria - 420) < 25,
   '(' + Math.round(pEmerg.aportacio_necessaria) + ' €/mes)');
var pPis = O.projeccio(a1.objectius[1], { avui: AVUI });
eq('el progrés és capital assignat / import', pPis.progres_pct, 20000 / 60000 * 100, 0.01);
ok('la data projectada és una data vàlida', /^\d{4}-\d{2}-\d{2}$/.test(pPis.data_projectada), '(' + pPis.data_projectada + ')');
ok('la projecció supera el capital assignat', pPis.projectat > pPis.capital_assignat);

var pImpossible = O.projeccio({ tipus: 'vehicle', import: 100000, dataObjectiu: d(2), capitalAssignat: 1000, aportacioAssignada: 50 }, { avui: AVUI });
ok('un objectiu inabastable es marca fora de ruta', pImpossible.estat_ritme === 'fora_ruta');
ok('i diu quant caldria aportar', pImpossible.aportacio_necessaria > 3000,
   '(' + Math.round(pImpossible.aportacio_necessaria) + ' €/mes)');
ok('l\'aportació necessària tanca el forat exactament', (function () {
  var o = { tipus: 'vehicle', import: 100000, dataObjectiu: d(2), capitalAssignat: 1000,
            aportacioAssignada: pImpossible.aportacio_necessaria };
  var r = O.projeccio(o, { avui: AVUI });
  return Math.abs(r.projectat - 100000) < 50;
})());
var pFet = O.projeccio({ tipus: 'viatge', import: 10000, dataObjectiu: d(3), capitalAssignat: 12000 }, { avui: AVUI });
ok('un objectiu ja cobert es marca assolit', pFet.estat_ritme === 'assolit');
ok('sense data no s\'inventa cap projecció', O.projeccio({ import: 5000 }, { avui: AVUI }).estat_ritme === 'sense_data');

console.log('\n── 6. Cartera proposada per la barreja d\'objectius ──');
var blend = O.carteraProposada(LLISTA, { capital_total: 185000, aportacio_total: 1600, avui: AVUI });
eq('la barreja suma 100', blend.rv + blend.rf + blend.cash, 100, 0.01);
ok('el FIRE, que té el gruix del capital, domina la barreja', blend.detall[0].titol.indexOf('FIRE') >= 0,
   '(' + blend.detall[0].pes_pct.toFixed(0) + '% del pes)');
ok('però l\'emergència i el pis li baixen la RV respecte al FIRE sol',
   blend.rv < O.mixPerHoritzo(20).rv, '(' + blend.rv.toFixed(0) + '% vs ' + O.mixPerHoritzo(20).rv.toFixed(0) + '%)');
var blendCapat = O.carteraProposada(LLISTA, { capital_total: 185000, aportacio_total: 1600, pct_rv_max: 45, avui: AVUI });
ok('amb un arquetip conservador la barreja no supera el sostre', blendCapat.rv <= 45.01,
   '(' + blendCapat.rv.toFixed(1) + '%)');
ok('la barreja porta el seu rendiment esperat', blend.rendiment && blend.rendiment.real < blend.rendiment.nominal);
ok('sense objectius no proposa res', O.carteraProposada([], { capital_total: 1000 }) === null);

console.log('\n── 7. Aplicar la barreja a la target existent ──');
var TARGET = [
  { id: 'rv_global', pct: 55 }, { id: 'rv_emergent', pct: 10 },
  { id: 'rf_corp', pct: 20 }, { id: 'or_metalls', pct: 10 }, { id: 'liquiditat', pct: 5 }
];
var ap = O.aplicaATarget(TARGET, blend);
eq('la nova target segueix sumant 100', (function () {
  var s = 0; ap.target.forEach(function (t) { s += t.pct; }); return s;
})(), 100, 0.15);
eq('els alternatius no es toquen', ap.target.filter(function (t) { return t.id === 'or_metalls'; })[0].pct, 10, 0.01);
// Aquesta target té un 65% de RV i els objectius (dominats pel FIRE a 20
// anys) en demanen un 81%: la reescalada ha de PUJAR-LA, no baixar-la.
// El motor mou la target cap als objectius, en la direcció que toqui.
ok('la RV es mou fins al que demanen els objectius sobre el capital no alternatiu', (function () {
  var rv = 0; ap.target.forEach(function (t) { if (t.grup === 'rv') rv += t.pct; });
  return Math.abs(rv - blend.rv / 100 * 90) < 1;
})(), '(65% → ' + ap.target.filter(function (t) { return t.grup === 'rv'; })
        .reduce(function (s, t) { return s + t.pct; }, 0).toFixed(1) + '%)');
ok('es conserva la proporció interna que va triar l\'assessor', (function () {
  var g = ap.target.filter(function (t) { return t.id === 'rv_global'; })[0].pct;
  var e = ap.target.filter(function (t) { return t.id === 'rv_emergent'; })[0].pct;
  return Math.abs(g / e - 55 / 10) < 0.05;
})());
var senseCash = O.aplicaATarget([{ id: 'rv_global', pct: 70 }, { id: 'rf_corp', pct: 30 }], O.mixPerHoritzo(1));
ok('avisa si la barreja demana liquiditat i no hi ha cap línia on posar-la',
   senseCash.grups_sense_cabuda.indexOf('cash') >= 0);
ok('i el pes sense casa se\'n va al grup més proper, no s\'evapora', (function () {
  var s = 0; senseCash.target.forEach(function (t) { s += t.pct; }); return Math.abs(s - 100) < 0.15;
})());
ok('target buida → null', O.aplicaATarget([], blend) === null);

// Cas real que va destapar el defecte: target amb 28% d'alternatius i CAP
// línia de renda fixa. En renormalitzar-ho tot, els il·líquids s'inflaven
// (crypto 10% → 12,2%) per tapar el forat de la RF que no tenia on caure.
var TARGET_REAL = [
  { id: 'rv_global', pct: 37 }, { id: 'rv_dividend', pct: 10 }, { id: 'rv_reits', pct: 10 },
  { id: 'liquiditat', pct: 5 }, { id: 'rv_growth', pct: 10 }, { id: 'or_metalls', pct: 7.5 },
  { id: 'crypto', pct: 10 }, { id: 'crowdlending', pct: 7.5 }, { id: 'private_equity', pct: 2 },
  { id: 'startups', pct: 1 }
];
var apReal = O.aplicaATarget(TARGET_REAL, O.carteraProposada(
  [{ tipus: 'fire', import: 1000000, dataObjectiu: d(10) }],
  { capital_total: 185750, aportacio_total: 1600, avui: AVUI }));
ok('avisa que la target no té cap línia de renda fixa', apReal.grups_sense_cabuda.indexOf('rf') >= 0);
ok('els alternatius segueixen EXACTAMENT igual', (function () {
  return apReal.target.filter(function (t) { return t.grup === 'alt'; })
    .every(function (t) { return Math.abs(t.pct - t.pct_abans) < 0.001; });
})(), '(crypto ' + apReal.target.filter(function (t) { return t.id === 'crypto'; })[0].pct + '%)');
eq('i el total segueix quadrant', (function () {
  var s = 0; apReal.target.forEach(function (t) { s += t.pct; }); return s;
})(), 100, 0.15);

console.log('\n── 8. Coherència global ──');
var coh = O.coherencia({
  objectius: LLISTA, capital_total: 185000, aportacio_total: 1600,
  pes_rv_real: 85, pct_rv_max: 70, target_actual: TARGET, avui: AVUI,
  fire: { objectiuFIRE: 1000000, retornEsperat: 13.5, capitalActual: 185000,
          aportacioMensual: 1600, actualitzat: '2025-01-10T00:00:00Z' }
});
ok('detecta el 13,5% de rendiment que no sosté cap cartera', te(coh.flags, 'retorn_optimista'));
ok('detecta que la calculadora i el full de ruta diuen imports diferents', te(coh.flags, 'fire_descordat'));
ok('detecta el càlcul FIRE ranci', te(coh.flags, 'fire_ranci'));
ok('detecta que no hi ha prou capital fora de borsa per als sobres propers',
   te(coh.flags, 'cobertura_segura_insuficient'),
   '(calen ' + Math.round(coh.capital_segur_necessari) + ' €, n\'hi ha ' + Math.round(coh.capital_segur_real) + ')');
ok('detecta que la cartera real no reflecteix els objectius', te(coh.flags, 'target_desalineada'));
ok('i la puntuació ho reflecteix', coh.score < 50, '(score ' + coh.score + ')');
ok('els avisos greus surten primer', coh.flags[0].gravetat === 'alta');
ok('n_alta compta els greus', coh.n_alta === coh.flags.filter(function (f) { return f.gravetat === 'alta'; }).length);

var cohBona = O.coherencia({
  objectius: [
    { tipus: 'emergencia', import: 14000, dataObjectiu: d(1), capitalAssignat: 13000, aportacioAssignada: 100 },
    { tipus: 'fire', import: 700000, dataObjectiu: d(22) }
  ],
  capital_total: 185000, aportacio_total: 1600, pes_rv_real: 82, pct_rv_max: 90, avui: AVUI
});
ok('un pla ben muntat puntua alt', cohBona.score >= 85, '(score ' + cohBona.score + ')');
ok('i no té cap avís greu', cohBona.n_alta === 0);

var cohCurt = O.coherencia({
  objectius: [{ tipus: 'habitatge_compra', import: 60000, dataObjectiu: d(2), aportacioAssignada: 300 },
              { tipus: 'fire', import: 900000, dataObjectiu: d(20) }],
  capital_total: 185000, aportacio_total: 1600, pes_rv_real: 60, avui: AVUI
});
ok('avisa d\'un objectiu a menys de 3 anys sense capital apartat', te(cohCurt.flags, 'curt_sense_capital'));
ok('un objectiu sense data es marca', te(O.coherencia({ objectius: [{ tipus: 'lliure', import: 5000 }], capital_total: 1000, avui: AVUI }).flags, 'sense_data'));
// Cas real: l'únic objectiu de la BD és tipus 'lliure', per tant no residual,
// i no té res assignat. Dir-li "fora de ruta" amagaria que no està configurat.
var cohReal = O.coherencia({
  objectius: [{ tipus: 'lliure', titol: 'Llibertat Financera', import: 1000000, termini: 'EN 10 ANYS' }],
  capital_total: 185750, aportacio_total: 1600, pes_rv_real: 67, avui: AVUI
});
ok('un objectiu sense res assignat es marca com a no configurat', te(cohReal.flags, 'sense_assignacio'));
ok('i no com a fora de ruta', !te(cohReal.flags, 'fora_ruta'));
ok('i alhora avisa que hi ha 185.750 € orfes', te(cohReal.flags, 'sense_residual'));
ok('un objectiu sense import es marca', te(O.coherencia({ objectius: [{ tipus: 'lliure', dataObjectiu: d(5) }], capital_total: 1000, avui: AVUI }).flags, 'sense_import'));

console.log('\n── 9. Pont amb la calculadora FIRE ──');
var FIRE_BD = { progresPct: 19, anyObjectiu: 2036, anysEstimats: 9.3, objectiuFIRE: 1000000,
                capitalActual: 185000, objectiuAnual: 40000, retornEsperat: 13.5, aportacioMensual: 1600 };
var objFire = O.desDeFire(FIRE_BD, { avui: AVUI, model: 'Regular FIRE' });
eq('l\'import surt de la calculadora', objFire.import, 1000000, 0);
eq('els anys estimats es converteixen en data', objFire.anys, 9.3, 0.05);
ok('i és residual', objFire.residual === true);
ok('sense objectiu calculat no crea res', O.desDeFire({}) === null);

var params = O.capAFire(objFire, { despeses_anuals_netes: 40000, edat_actual: 38, edat_retirada: 50, avui: AVUI });
ok('el retorn que es passa a TBI_FIRE surt de la barreja, no escrit a mà',
   params.retorn_brut < 10, '(' + params.retorn_brut.toFixed(1) + '% vs 13,5% desat)');
eq('el pct_rv que es passa és el de la barreja de l\'horitzó', params.pct_rv, O.mixPerHoritzo(objFire.anys).rv, 0.01);
var resFire = TBI_FIRE.objectiuFIRE(params);
ok('TBI_FIRE accepta els paràmetres i calcula', isFinite(resFire.objectiu) && resFire.objectiu > 0,
   '(objectiu ' + Math.round(resFire.objectiu) + ' €)');
ok('amb un retorn realista el FIRE queda més lluny que els 9,3 anys desats',
   resFire.anys_fins_objectiu > 9.3, '(' + resFire.anys_fins_objectiu.toFixed(1) + ' anys)');

console.log('\n── 10. Repartiment de l\'aportació mensual ──');
var rep = O.repartirAportacio(LLISTA, 500, { capital_total: 185000, aportacio_total: 1600, avui: AVUI });
eq('el repartiment suma l\'import exacte', (function () {
  var s = 0; rep.files.forEach(function (f) { s += f.import; }); return s;
})(), 500, 0.01);
ok('reparteix en proporció a l\'aportació assignada', (function () {
  var pis = rep.files.filter(function (f) { return f.titol.indexOf('habitatge') >= 0 || f.titol.indexOf('Compra') >= 0; })[0];
  return Math.abs(pis.import - 500 * 400 / 1600) < 0.05;
})());
ok('cada fila porta l\'estat de ritme i la barreja que li toca',
   rep.files.every(function (f) { return !!f.estat_ritme && !!f.mix; }));
ok('sense objectius no reparteix', O.repartirAportacio([], 500, { capital_total: 1000 }) === null);
ok('import 0 → null', O.repartirAportacio(LLISTA, 0, { capital_total: 1000 }) === null);

console.log('\n── 11. Casos límit ──');
ok('llista nul·la no peta', O.assignacio(null, { capital_total: 0 }).objectius.length === 0);
ok('coherència sense res no peta', O.coherencia({}).score >= 0);
ok('objectiu amb import negatiu es normalitza a 0', O.normalitza({ import: -500 }).import === 0);
ok('data ja passada dona anys negatius', O.anysFins('2020-01-01', AVUI) < 0);
ok('mix amb horitzó negatiu es tracta com a 0', O.mixPerHoritzo(-5).cash === 100);
ok('capital 0 i aportació 0 → mai hi arriba', O.projeccio({ import: 1000, dataObjectiu: d(5) }, { avui: AVUI }).data_projectada === null);

console.log('\n════════════════════════════════════════');
console.log(passes + ' passats · ' + fails + ' fallits');
if (fails) process.exit(1);
