/* Tests del motor compartit TBI_CARTERA.
   Substitueix test_motor_v3.js i test_retirades.js: ara els càlculs viuen
   en un sol lloc, així que es proven en un sol lloc.
   Executar: node test_cartera.js */
global.TBI_FISCAL = require('./tbi-fiscal.js');
global.TBI_FIRE   = require('./tbi-fire.js');
var C = require('./tbi-cartera.js');

var passes = 0, fails = 0;
function eq(n, a, b, t) {
  t = (t === undefined) ? 0.01 : t;
  var ok = (a === null || b === null) ? a === b : Math.abs(a - b) <= t;
  if (ok) { passes++; console.log('  ✓ ' + n + '  (' + (a === null ? 'null' : (+a).toFixed(2)) + ')'); }
  else { fails++; console.log('  ✗ ' + n + '  obtingut=' + a + ' esperat=' + b); }
}
function ok(n, c, i) {
  if (c) { passes++; console.log('  ✓ ' + n + (i ? '  ' + i : '')); }
  else { fails++; console.log('  ✗ ' + n + (i ? '  ' + i : '')); }
}
var DIA = 86400000;
function iso(d) { return new Date(Date.now() - d * DIA).toISOString().slice(0, 10); }

// Constructor de carteres per als tests
function cartera(defs) {
  var pos = [], mov = [];
  defs.forEach(function (d, i) {
    pos.push({ id: 'p' + i, cat: d.cat, nom: d.nom || d.cat, valor_actual: d.valor, ter: d.ter });
    (d.compres || [{ import: d.cost, dies: 400 }]).forEach(function (c, j) {
      mov.push({ id: 'm' + i + '_' + j, posicio_id: 'p' + i, data: iso(c.dies), tipus: 'compra', import: c.import });
    });
  });
  return { posicions: pos, moviments: mov };
}
var TARGET = [{ id: 'rv_global', pct: 60 }, { id: 'rf_corp', pct: 30 },
              { id: 'or_metalls', pct: 6 }, { id: 'liquiditat', pct: 4 }];

console.log('\n── 1. Taxonomia canònica ──');
eq('25 categories', C.TAXONOMIA.length, 25, 0);
ok('cat() resol per id', C.cat('rv_global').nom === 'RV Global Indexada');
ok('cat() desconeguda fa fallback segur', C.cat('inexistent').color === '#888');
ok('resolCat per id', C.resolCat({ id: 'rf_corp' }) === 'rf_corp');
ok('resolCat per nom (targets antics)', C.resolCat({ nom: 'Or i Metalls preciosos' }) === 'or_metalls');
eq('TER per defecte de rv_global', C.terDeCategoria('rv_global'), 0.20);
eq('TER de categoria desconeguda', C.terDeCategoria('xxx'), C.PARAMS.ter_defecte);
ok('el mínim per ordre és 50€', C.PARAMS.import_min_ordre === 50);

console.log('\n── 2. Agregats i KPIs ──');
var c1 = cartera([{ cat: 'rv_global', valor: 2600, compres: (function () {
  var a = []; for (var k = 24; k >= 1; k--) a.push({ import: 100, dies: k * 30.44 }); return a; })() }]);
var k1 = C.kpis(c1.posicions, c1.moviments);
eq('cost total', k1.cost_total, 2400);
eq('valor total', k1.valor_total, 2600);
eq('P&L', k1.pnl_eur, 200);
ok('la TIR supera el CAGR ingenu', (function () {
  var anys = (24 * 30.44) / 365.25;
  var cagr = (Math.pow(2600 / 2400, 1 / anys) - 1) * 100;
  return k1.xirr > cagr * 1.6;
})(), '(TIR ' + k1.xirr.toFixed(2) + '%)');
ok('marca la TIR com a fiable amb 2 anys', k1.xirr_fiable === true);
eq('ratio de plusvàlua', k1.ratio_guany, 200 / 2600, 0.0001);
var curt = cartera([{ cat: 'rv_global', valor: 2600, compres: [{ import: 2400, dies: 60 }] }]);
ok('històric curt: TIR no fiable', C.kpis(curt.posicions, curt.moviments).xirr_fiable === false);
var senseValor = cartera([{ cat: 'rv_global', valor: 0, cost: 1000 }]);
eq('sense valor de mercat, TIR null', C.kpis(senseValor.posicions, senseValor.moviments).xirr, null);
eq('XIRR 1000→1100 en 1 any', C.xirr([{ t: Date.now() - 365.25 * DIA, a: -1000 }, { t: Date.now(), a: 1100 }]) * 100, 10, 0.05);
eq('XIRR sense flux negatiu', C.xirr([{ t: 1, a: 1 }, { t: 2, a: 1 }]), null);

console.log('\n── 3. TWR ──');
var cT = cartera([{ cat: 'rv_global', valor: 1210, cost: 1000 }]);
var mesA = new Date(Date.now() - 180 * DIA).toISOString().slice(0, 7);
var mesB = new Date(Date.now() - 90 * DIA).toISOString().slice(0, 7);
var tw = C.twr([{ mes: mesA, valor: 1000, invertit: 1000 }, { mes: mesB, valor: 1100, invertit: 1000 }],
               cT.posicions, cT.moviments);
eq('TWR 1000→1100→1210 = +21%', tw.total, 21, 0.001);
var cT2 = cartera([{ cat: 'rv_global', valor: 1600, cost: 1500 }]);
var tw2 = C.twr([{ mes: mesA, valor: 1000, invertit: 1000 }, { mes: mesB, valor: 1600, invertit: 1500 }],
                cT2.posicions, cT2.moviments);
eq('TWR aïlla l\'aportació: +10%', tw2.total, 10, 0.001);
ok('sense prou snapshots retorna null', C.twr([], [], []) === null);

console.log('\n── 4. Distribució i pes de RV ──');
var c2 = cartera([{ cat: 'rv_global', valor: 6000, cost: 4000 }, { cat: 'rf_corp', valor: 3000, cost: 2900 },
                  { cat: 'or_metalls', valor: 600, cost: 500 }, { cat: 'liquiditat', valor: 400, cost: 400 }]);
var d = C.distribucio(c2.posicions, c2.moviments);
eq('4 categories', d.length, 4, 0);
eq('rv_global al 60%', d[0].pct, 60);
ok('ordenat per valor descendent', d[0].valor >= d[1].valor);
eq('pes de RV', C.pesRV(c2.posicions, c2.moviments), 60);
var cMixt = cartera([{ cat: 'fons_6040', valor: 10000, cost: 9000 }]);
eq('els mixtos compten al 60%', C.pesRV(cMixt.posicions, cMixt.moviments), 60);

console.log('\n── 5. TER ponderat ──');
var c3 = cartera([{ cat: 'rv_global', valor: 6000, cost: 5000 }, { cat: 'rf_corp', valor: 3000, cost: 3000 },
                  { cat: 'crypto', valor: 1000, cost: 500, ter: 0.50 }]);
var t3 = C.ter(c3.posicions, c3.moviments, TARGET);
eq('TER ponderat', t3.ter_real, (6000 * .20 + 3000 * .20 + 1000 * .50) / 10000, 1e-9);
eq('cost anual', t3.cost_anual_eur, 10000 * t3.ter_real / 100, 1e-9);
eq('cost del banc a l\'1,80%', t3.cost_banc_eur, 180);
eq('cobertura amb TER explícit', t3.cobertura_pct, 10);
eq('TER del target 60/30/6/4', t3.ter_target, (60 * .20 + 30 * .20 + 6 * .25 + 4 * .05) / 100, 1e-9);
ok('estalvi a 10 anys > estalvi anual', t3.estalvi_10a_eur > t3.estalvi_anual_eur);
ok('cartera buida retorna null', C.ter([], [], TARGET) === null);

console.log('\n── 6. Bandes 5/25 i matching ──');
var desv = cartera([{ cat: 'rv_global', valor: 7000, cost: 4000 }, { cat: 'rf_corp', valor: 2000, cost: 2000 },
                    { cat: 'or_metalls', valor: 600, cost: 500 }, { cat: 'liquiditat', valor: 400, cost: 400 }]);
var ctx = { posicions: desv.posicions, moviments: desv.moviments, target: TARGET };
var m = C.matching(ctx, 0);
var by = {}; m.rows.forEach(function (r) { by[r.id] = r; });
eq('banda de rv_global (60%) = 5pp', by.rv_global.banda_pp, 5);
eq('banda de or_metalls (6%) = 1,5pp', by.or_metalls.banda_pp, 1.5);
eq('banda de liquiditat (4%) = 1pp', by.liquiditat.banda_pp, 1);
ok('rv_global fora de banda i sobreponderada', by.rv_global.fora_banda && by.rv_global.estat === 'sobre');
ok('rf_corp fora de banda i infraponderada', by.rf_corp.fora_banda && by.rf_corp.estat === 'infra');
ok('or_metalls dins de banda', !by.or_metalls.fora_banda);
eq('coherència = 90', m.resum.coherencia, 90);
ok('cal rebalanceig', m.resum.cal_rebalanceig === true);
var perf = C.matching({ posicions: c2.posicions, moviments: c2.moviments, target: TARGET }, 0);
eq('cartera perfecta: coherència 100', perf.resum.coherencia, 100);
eq('cap fora de banda', perf.resum.n_fora_banda, 0, 0);
// Fora de pla
var ambCry = cartera([{ cat: 'rv_global', valor: 6000, cost: 4000 }, { cat: 'rf_corp', valor: 3000, cost: 2900 },
                      { cat: 'crypto', valor: 1000, cost: 300 }]);
var mc = C.matching({ posicions: ambCry.posicions, moviments: ambCry.moviments, target: TARGET }, 0);
var cry = mc.rows.filter(function (r) { return r.id === 'crypto'; })[0];
ok('crypto apareix com a fora de pla', cry && cry.fora_pla === true, '(' + cry.real_pct.toFixed(1) + '%)');
ok('resum.fora_pla_pct el recull', mc.resum.fora_pla_pct > 9);

console.log('\n── 7. Repartiment de l\'aportació ──');
[100, 300, 500, 1000, 5000].forEach(function (a) {
  var r = C.matching(ctx, a);
  var suma = r.recomanacio.reduce(function (s, l) { return s + l.import; }, 0);
  var minOk = r.recomanacio.every(function (l) { return l.import >= Math.min(a, 50); });
  console.log('    ' + String(a).padStart(5) + '€ → ' + r.recomanacio.map(function (l) { return l.nom + ' ' + l.import + '€'; }).join(' · '));
  ok('  suma exacta', suma === a, '(' + suma + ')');
  ok('  cap línia sota el mínim', minOk);
});
ok('cap "1 € d\'or": totes les línies ≥ 50€ o cap',
   C.matching(ctx, 500).recomanacio.every(function (l) { return l.import >= 50; }));
var buida = C.matching({ posicions: [], moviments: [], target: TARGET }, 1000);
eq('client nou: coherència null', buida.resum.coherencia, null);
eq('client nou: suma exacta', buida.recomanacio.reduce(function (s, l) { return s + l.import; }, 0), 1000, 0);
var rvL = buida.recomanacio.filter(function (l) { return l.cat === 'rv_global'; })[0];
ok('client nou: RV Global ~60%', rvL && Math.abs(rvL.import - 600) <= 60, '(' + (rvL ? rvL.import : '?') + '€)');
var petit = C.matching(ctx, 20);
ok('aportació de 20€ → una sola línia', petit.recomanacio.length === 1 && petit.recomanacio[0].import === 20);
ok('sense target retorna null', C.matching({ posicions: [], moviments: [], target: [] }, 100) === null);

console.log('\n── 8. Retirades (procés invers) ──');
// Cartera de 100.000€ per als tests de retirada (retirar-ho tot és un cas a part)
var gran = cartera([{ cat: 'rv_global', valor: 75000, cost: 45000 }, { cat: 'rf_corp', valor: 15000, cost: 14000 },
                    { cat: 'or_metalls', valor: 6000, cost: 5000 }, { cat: 'liquiditat', valor: 4000, cost: 4000 }]);
var ctxG = { posicions: gran.posicions, moviments: gran.moviments, target: TARGET };
var rr = C.retirada(ctxG, 10000, { considerar_impostos: true });
ok('genera ordres', rr.ordres.length > 0);
ok('ven de la sobreponderada', rr.ordres[0].cat === 'rv_global', '(' + rr.ordres[0].nom_cat + ')');
eq('el net real és el demanat', rr.net_real, 10000, 1);
ok('el brut supera el net', rr.brut_necessari > 10000, '(peatge ' + Math.round(rr.impost) + '€)');
ok('la coherència millora', rr.coherencia_despres > rr.coherencia_abans,
   '(' + rr.coherencia_abans + ' → ' + rr.coherencia_despres + ')');
eq('l\'impost quadra amb el guany', rr.impost, TBI_FISCAL.impostEstalvi(rr.guany_realitzat), 0.5);
// Tria la posició de menys plusvàlua
var dues = cartera([{ cat: 'rv_global', valor: 40000, cost: 10000, nom: 'Antiga' },
                    { cat: 'rv_global', valor: 40000, cost: 39000, nom: 'Recent' },
                    { cat: 'rf_corp', valor: 20000, cost: 20000, nom: 'Bons' }]);
var r2 = C.retirada({ posicions: dues.posicions, moviments: dues.moviments, target: TARGET }, 5000, { considerar_impostos: true });
ok('ven primer la de menys plusvàlua', r2.ordres[0].nom === 'Recent', '(' + r2.ordres[0].nom + ')');
ok('i realitza molt menys guany', r2.guany_realitzat < 500, '(' + Math.round(r2.guany_realitzat) + '€)');
// Fora de pla primer
var r3 = C.retirada({ posicions: ambCry.posicions, moviments: ambCry.moviments, target: TARGET }, 800, { considerar_impostos: true });
ok('prioritza el que és fora de pla', r3.ordres[0].cat === 'crypto', '(' + r3.ordres[0].nom + ')');
var r4 = C.retirada(ctxG, 10000, { considerar_impostos: false });
eq('sense impostos brut = net', r4.brut_necessari, 10000, 1);
ok('import 0 → null', C.retirada(ctxG, 0) === null);
// Liquidació total: cas límit que abans deixava la venda curta
var tot = C.retirada(ctxG, 100000, { considerar_impostos: false });
eq('liquidar-ho tot ven els 100.000€ sencers', tot.brut_necessari, 100000, 1);
ok('i buida totes les posicions', tot.ordres.every(function (o) { return o.liquida_tot; }),
   '(' + tot.ordres.length + ' ordres, totes completes)');
ok('cartera buida → null', C.retirada({ posicions: [], moviments: [], target: TARGET }, 100) === null);
var petita = cartera([{ cat: 'rv_global', valor: 5000, cost: 1000 }]);
var r5 = C.retirada({ posicions: petita.posicions, moviments: petita.moviments, target: TARGET }, 50000, { considerar_impostos: true });
ok('demanar de més marca insuficient', r5.insuficient === true);
ok('i no ven més del que hi ha', r5.brut_necessari <= 5000.5);

console.log('\n── 9. Simetria acumular ↔ retirar ──');
// El mateix desequilibri: aportar ha d'anar a l'infraponderat i vendre al sobreponderat
var ma = C.matching(ctxG, 3000);
var mr = C.retirada(ctxG, 3000, { considerar_impostos: false });
ok('aportar va a RF Corp (infraponderada)', ma.recomanacio[0].cat === 'rf_corp', '(' + ma.recomanacio[0].nom + ')');
ok('retirar surt de RV Global (sobreponderada)', mr.ordres[0].cat === 'rv_global', '(' + mr.ordres[0].nom_cat + ')');
ok('les dues operacions milloren la coherència',
   ma.resum.coherencia < 100 && mr.coherencia_despres >= mr.coherencia_abans);

console.log('\n════════════════════════════════════════');
console.log(passes + ' passats · ' + fails + ' fallits');
if (fails) process.exit(1);
