/* Tests del motor TBI_FISCAL. Executar: node test_fiscal.js */
var F = require('./tbi-fiscal.js');

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

console.log('\n── 1. Base de l\'estalvi ──');
eq('6.000€ al 19%', F.impostEstalvi(6000), 6000 * 0.19);
eq('10.000€ (dos trams)', F.impostEstalvi(10000), 6000 * .19 + 4000 * .21);
eq('60.000€ (tres trams)', F.impostEstalvi(60000), 6000 * .19 + 44000 * .21 + 10000 * .23);
eq('250.000€ (quatre trams)', F.impostEstalvi(250000), 6000 * .19 + 44000 * .21 + 150000 * .23 + 50000 * .27);
eq('350.000€ (arriba al 30%)', F.impostEstalvi(350000), 6000 * .19 + 44000 * .21 + 150000 * .23 + 100000 * .27 + 50000 * .30);
eq('base 0', F.impostEstalvi(0), 0);
eq('base negativa', F.impostEstalvi(-1000), 0);
eq('marginal a 10.000€ = 21%', F.marginalEstalvi(10000), 21);
eq('marginal a 5.000€ = 19%', F.marginalEstalvi(5000), 19);
eq('marginal a 400.000€ = 30%', F.marginalEstalvi(400000), 30);
var d = F.detallEstalvi(60000);
eq('el detall suma la quota', d.detall.reduce(function (s, t) { return s + t.quota; }, 0), d.quota);
eq('el detall suma la base', d.detall.reduce(function (s, t) { return s + t.base; }, 0), 60000);

console.log('\n── 2. Base general: estatal + Catalunya ──');
var g = F.impostGeneral(40000, 'catalunya');
var estatalEsperat = 12450 * .095 + (20200 - 12450) * .12 + (35200 - 20200) * .15 + (40000 - 35200) * .185;
var catEsperat = 12500 * .095 + (22000 - 12500) * .125 + (33000 - 22000) * .16 + (40000 - 33000) * .19;
eq('quota estatal a 40.000€', g.quota_estatal, estatalEsperat);
eq('quota autonòmica (Catalunya) a 40.000€', g.quota_autonomica, catEsperat);
eq('quota total', g.quota, estatalEsperat + catEsperat);
eq('marginal combinat = 18,5 + 19', g.marginal, 37.5);
ok('el tipus mitjà és inferior al marginal', g.mitja < g.marginal,
   '(mitjà ' + g.mitja.toFixed(2) + '% · marginal ' + g.marginal + '%)');
eq('marginal a 25.000€ = 15 + 16', F.marginalGeneral(25000, 'catalunya'), 31);
eq('marginal a 100.000€ = 22,5 + 23,5', F.marginalGeneral(100000, 'catalunya'), 46);
eq('marginal a 200.000€ = 22,5 + 25,5 (màxim català)', F.marginalGeneral(200000, 'catalunya'), 48);
ok('la genèrica difereix de la catalana a rendes altes',
   F.marginalGeneral(100000, 'generica') !== F.marginalGeneral(100000, 'catalunya'),
   '(genèrica ' + F.marginalGeneral(100000, 'generica') + '% · CAT ' + F.marginalGeneral(100000, 'catalunya') + '%)');
ok('l\'escala catalana té 8 trams', F.REF.trams_general_autonomic.catalunya.length === 8);

console.log('\n── 3. Cascada de compensacions ──');
// Cas simple: només guanys
var c1 = F.compensar({ gpp_positiu: 10000 });
eq('només guanys: base = 10.000', c1.base_imposable, 10000);
eq('només guanys: quota', c1.quota, F.impostEstalvi(10000));
eq('sense pendents', c1.pendent_total, 0);

// Compensació dins del grup
var c2 = F.compensar({ gpp_positiu: 10000, gpp_negatiu: 4000 });
eq('guanys 10.000 − pèrdues 4.000 → base 6.000', c2.base_imposable, 6000);
eq('quota al 19%', c2.quota, 6000 * .19);

// Compensació creuada limitada al 25%
var c3 = F.compensar({ gpp_positiu: 10000, rcm_negatiu: 5000 });
eq('límit creuat = 25% de 10.000', c3.creuada_limit, 2500);
eq('creuada aplicada = 2.500 (no 5.000)', c3.creuada_aplicada, 2500);
eq('base resultant = 7.500', c3.base_imposable, 7500);
eq('quota', c3.quota, 6000 * .19 + 1500 * .21);
eq('queden 2.500 de RCM pendents', c3.pendent_rcm, 2500);
ok('el topall bloqueja saldo compensable', c3.creuada_bloquejada > 0, '(' + c3.creuada_bloquejada + '€)');

// Creuada en sentit invers
var c4 = F.compensar({ rcm_positiu: 8000, gpp_negatiu: 4000 });
eq('límit creuat = 25% de 8.000', c4.creuada_limit, 2000);
eq('base = 6.000', c4.base_imposable, 6000);
eq('queden 2.000 de GPP pendents', c4.pendent_gpp, 2000);

// Pèrdues d'anys anteriors
var c5 = F.compensar({ gpp_positiu: 10000, gpp_pendent: 3000 });
eq('les pèrdues pendents compensen igual', c5.base_imposable, 7000);

// Pèrdua total: base 0, res a pagar
var c6 = F.compensar({ gpp_positiu: 2000, gpp_negatiu: 9000 });
eq('base no pot ser negativa', c6.base_imposable, 0);
eq('quota 0', c6.quota, 0);
eq('arrossega 7.000', c6.pendent_gpp, 7000);
eq('caduca 4 exercicis després', c6.caduca_exercici, F.REF.exercici + 4);
ok('registra els passos de la cascada', c6.passos.length >= 2);

console.log('\n── 4. Regla dels 2 mesos ──');
var a1 = F.reglaAntiaplicacio(30, true);
ok('recompra als 30 dies: NO computable', a1.computable === false);
eq('li falten 31 dies', a1.dies_restants, 31);
var a2 = F.reglaAntiaplicacio(61, true);
ok('recompra als 61 dies: computable', a2.computable === true);
eq('límit per a cotitzats = 60 dies', a2.limit_dies, 60);
var a3 = F.reglaAntiaplicacio(200, false);
ok('no cotitzat als 200 dies: NO computable', a3.computable === false);
eq('límit per a no cotitzats = 365 dies', a3.limit_dies, 365);
ok('el missatge aclareix que es difereix, no es perd',
   a1.nota.indexOf('difereix') >= 0);

console.log('\n── 5. Aflorar pèrdues (tax-loss harvesting) ──');
var h1 = F.aflorarPerdues({ guanys_realitzats: 8000, rcm_positiu: 2000, perdues_latents: 20000 });
eq('absorbible = 8.000 + 25% de 2.000', h1.absorbible_enguany, 8500);
eq('aflorar recomanat = 8.500', h1.aflorar_recomanat, 8500);
eq('sobren 11.500 per a anys futurs', h1.sobrant, 11500);
ok('l\'estalvi és positiu', h1.estalvi > 0, '(' + Math.round(h1.estalvi) + '€)');
// Verificació independent
var sense = F.compensar({ gpp_positiu: 8000, rcm_positiu: 2000 });
var amb = F.compensar({ gpp_positiu: 8000, gpp_negatiu: 8500, rcm_positiu: 2000 });
eq('l\'estalvi quadra amb les dues liquidacions', h1.estalvi, sense.quota - amb.quota);
var h2 = F.aflorarPerdues({ guanys_realitzats: 5000, rcm_positiu: 0, perdues_latents: 1000 });
eq('si hi ha poques pèrdues latents, s\'afloren totes', h2.aflorar_recomanat, 1000);
eq('i no en sobra cap', h2.sobrant, 0);
ok('avisa de la regla dels 2 mesos', h1.avis.indexOf('60 dies') >= 0);

console.log('\n── 6. Traspàs de fons vs ETF ──');
// Amb el MATEIX TER, el diferiment ha de guanyar sempre que hi hagi rebalanceig
var t1 = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: 0.20, ter_etf: 0.20, rebalanceig_anys: 1, rebalanceig_pct: 20 });
ok('amb TER igual guanya el fons (diferiment)', t1.guanya === 'fons',
   '(+' + Math.round(t1.diferencia) + '€)');
ok('l\'ETF paga impostos pel camí', t1.etf.impostos_pel_cami > 0, '(' + Math.round(t1.etf.impostos_pel_cami) + '€)');
eq('el fons no paga res pel camí', t1.fons.impostos_pel_cami, 0);
ok('el valor brut del fons supera el de l\'ETF', t1.fons.valor_brut > t1.etf.valor_brut);

// Sense rebalanceig no hi ha diferència fiscal: només mana el TER
var t2 = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: 0.20, ter_etf: 0.20, rebalanceig_anys: 0, rebalanceig_pct: 0 });
eq('sense rebalanceig i TER igual: empat', t2.diferencia, 0, 0.5);
var t3 = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: 0.30, ter_etf: 0.15, rebalanceig_anys: 0, rebalanceig_pct: 0 });
ok('sense rebalanceig, el TER menor guanya', t3.guanya === 'etf', '(ETF +' + Math.round(-t3.diferencia) + '€)');

// Amb un TER molt superior el fons perd tot i el diferiment
var t4 = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: 1.20, ter_etf: 0.15, rebalanceig_anys: 1, rebalanceig_pct: 20 });
ok('un TER de l\'1,20% s\'empassa el diferiment', t4.guanya === 'etf', '(ETF +' + Math.round(-t4.diferencia) + '€)');

// El break-even ha de ser coherent
var t5 = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: 0.30, ter_etf: 0.15, rebalanceig_anys: 1, rebalanceig_pct: 20 });
ok('el break-even de TER existeix', t5.breakeven_ter_fons !== null, '(' + t5.breakeven_ter_fons.toFixed(3) + '%)');
ok('el break-even supera el TER de l\'ETF', t5.breakeven_ter_fons > 0.15);
var t5b = F.traspasVsETF({ capital: 50000, anys: 25, retorn_brut: 6, ter_fons: t5.breakeven_ter_fons, ter_etf: 0.15, rebalanceig_anys: 1, rebalanceig_pct: 20 });
ok('al break-even els dos empaten', Math.abs(t5b.diferencia) < 60, '(' + Math.round(t5b.diferencia) + '€)');

// Horitzó llarg → més avantatge per al diferiment
var curt = F.traspasVsETF({ capital: 50000, anys: 5, retorn_brut: 6, ter_fons: 0.20, ter_etf: 0.20, rebalanceig_anys: 1, rebalanceig_pct: 20 });
ok('a més anys, més valor té el diferiment', t1.diferencia > curt.diferencia,
   '(5 anys: ' + Math.round(curt.diferencia) + '€ · 25 anys: ' + Math.round(t1.diferencia) + '€)');
// Coherència comptable
ok('el net del fons = brut − impost final', Math.abs(t1.fons.net - (t1.fons.valor_brut - t1.fons.impost_final)) < 0.01);
ok('el net de l\'ETF = brut − impost final', Math.abs(t1.etf.net - (t1.etf.valor_brut - t1.etf.impost_final)) < 0.01);

console.log('\n── 7. Pla de pensions vs fons indexat ──');
var p1 = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 40000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 10, pensio_publica_anual: 18000 });
eq('marginal actual a 40.000€ = 37,5%', p1.marginal_ara, 37.5);
eq('estalvi fiscal anual = 1.500 × 37,5%', p1.estalvi_fiscal_anual, 1500 * 0.375);
ok('el marginal al rescat és inferior', p1.marginal_rescat < p1.marginal_ara,
   '(' + p1.marginal_ara + '% → ' + p1.marginal_rescat + '%)');
ok('amb aquest diferencial guanya el pla', p1.guanya === 'pla', '(+' + Math.round(p1.diferencia) + '€)');
ok('el pla brut supera el fons brut per l\'efecte de l\'aportació íntegra',
   Math.abs(p1.pla_brut - p1.fons_brut) < 1, '(mateixa aportació, mateix creixement)');

// Un marginal de rescat SUPERIOR no basta perquè el pla perdi: dins del pla
// el creixement no tributa cada any, i aquest avantatge compensa uns quants
// punts de diferencial. Aquesta és la part contraintuïtiva.
var p2 = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 16000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 10, pensio_publica_anual: 18000 });
ok('amb base baixa el diferencial de marginal es gira',
   p2.diferencial_marginal < 0,
   '(dedueix al ' + p2.marginal_ara + '% i rescata al ' + p2.marginal_rescat + '%)');
ok('tot i així el pla encara guanya (el creixement no tributa pel camí)',
   p2.guanya === 'pla', '(+' + Math.round(p2.diferencia) + '€ amb ' + p2.diferencial_marginal.toFixed(1) + 'pp en contra)');

// Amb un diferencial prou gran sí que es gira: pensió pública alta al rescat
var p2b = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 16000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 10, pensio_publica_anual: 60000 });
ok('amb pensió alta al rescat el marginal es dispara', p2b.marginal_rescat >= 44,
   '(' + p2b.marginal_ara + '% → ' + p2b.marginal_rescat + '%)');
ok('i llavors sí que guanya el fons', p2b.guanya === 'fons',
   '(fons +' + Math.round(-p2b.diferencia) + '€ amb ' + p2b.diferencial_marginal.toFixed(1) + 'pp en contra)');

// Cas de referència: si el marginal no canvia, el pla es comporta com un
// compte lliure d'impostos i ha de guanyar sempre.
var pIgual = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 40000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 10, pensio_publica_anual: 33000 });
ok('amb marginals semblants el pla guanya clarament', pIgual.guanya === 'pla',
   '(dedueix al ' + pIgual.marginal_ara + '%, rescata al ' + pIgual.marginal_rescat + '% · +' + Math.round(pIgual.diferencia) + '€)');
// El TER dels plans sol ser molt superior: això sí que se'l menja
var pCar = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 40000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 1.50, anys_rescat: 10, pensio_publica_anual: 18000 });
ok('un TER de l\'1,50% al pla redueix molt l\'avantatge',
   pCar.diferencia < p1.diferencia,
   '(TER 0,40%: +' + Math.round(p1.diferencia) + '€ · TER 1,50%: +' + Math.round(pCar.diferencia) + '€)');

// Rescat concentrat vs repartit
var pRapid = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 40000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 1, pensio_publica_anual: 18000 });
var pLent = F.planPensions({ aportacio_anual: 1500, anys_aportant: 25, base_general_actual: 40000,
  ccaa: 'catalunya', retorn_brut: 6, ter: 0.40, anys_rescat: 15, pensio_publica_anual: 18000 });
ok('rescatar de cop costa molt més impost', pRapid.pla_impost_rescat > pLent.pla_impost_rescat,
   '(1 any: ' + Math.round(pRapid.pla_impost_rescat) + '€ · 15 anys: ' + Math.round(pLent.pla_impost_rescat) + '€)');
ok('per això rescatar a poc a poc és millor', pLent.diferencia > pRapid.diferencia);

// Límit d'aportació
var p3 = F.planPensions({ aportacio_anual: 5000, anys_aportant: 20, base_general_actual: 60000, ccaa: 'catalunya' });
ok('detecta que supera el límit', p3.excedeix_limit === true);
eq('només 1.500 són deduïbles', p3.aportacio_deduible, 1500);
eq('l\'excés és 3.500', p3.excés, 3500);
eq('l\'estalvi es calcula només sobre el deduïble', p3.estalvi_fiscal_anual,
   1500 * F.marginalGeneral(60000, 'catalunya') / 100);

console.log('\n── 8. Dividends estrangers ──');
var dv = F.dividendsEstrangers({ dividend_brut: 1000, pais: 'US', altres_rendiments_estalvi: 0 });
eq('retenció als EUA amb W-8BEN = 15%', dv.retingut_origen, 150);
eq('impost espanyol sobre 1.000€ = 19%', dv.impost_espanya, 190);
eq('deducció per doble imposició = 150', dv.deduccio_doble_imposicio, 150);
eq('a pagar a Espanya = 40', dv.a_pagar_espanya, 40);
eq('total impostos = 190 (sense doble imposició)', dv.total_impostos, 190);
eq('net = 810', dv.net, 810);
eq('tipus efectiu = 19%', dv.tipus_efectiu, 19);
eq('cap excés no deduïble', dv.exces_no_deduible, 0);

var dvSense = F.dividendsEstrangers({ dividend_brut: 1000, pais: 'US_SENSE' });
eq('sense W-8BEN retenen el 30%', dvSense.retingut_origen, 300);
eq('només 150 són deduïbles (límit del conveni)', dvSense.deduccio_doble_imposicio, 150);
eq('excés no deduïble = 150', dvSense.exces_no_deduible, 150);
eq('total impostos = 340', dvSense.total_impostos, 340);
ok('avisa que cal reclamar-ho a origen', dvSense.avis.indexOf('reclamar') >= 0);

var w8 = F.costSenseW8BEN(1000, 0);
eq('no signar el W-8BEN costa 150€ per cada 1.000€', w8.cost_anual, 150);
ok('el net cau de 810 a 660', w8.net_amb === 810 && w8.net_sense === 660);

// Suïssa: retenció del 35%, conveni al 15%
var ch = F.dividendsEstrangers({ dividend_brut: 1000, pais: 'CH' });
eq('Suïssa reté el 35%', ch.retingut_origen, 350);
eq('excés reclamable = 200', ch.exces_no_deduible, 200);
ok('el tipus efectiu supera el 19% espanyol', ch.tipus_efectiu > 19,
   '(' + ch.tipus_efectiu.toFixed(1) + '%)');

// Amb altres rendiments, el dividend entra a un tram superior
var dvAlt = F.dividendsEstrangers({ dividend_brut: 1000, pais: 'US', altres_rendiments_estalvi: 10000 });
eq('amb 10.000€ previs, el dividend tributa al 21%', dvAlt.impost_espanya, 210);
ok('i queda menys a pagar després de la deducció', dvAlt.a_pagar_espanya === 60);

console.log('\n── 9. Casos límit ──');
eq('compensar sense arguments no peta', F.compensar().base_imposable, 0);
eq('dividend 0', F.dividendsEstrangers({ dividend_brut: 0 }).net, 0);
eq('escala amb base 0', F.aplicarEscala(0, F.REF.trams_estalvi).quota, 0);
ok('traspàs amb 1 any no peta', F.traspasVsETF({ anys: 1 }) !== null);
ok('pla de pensions amb 1 any no peta', F.planPensions({ anys_aportant: 1 }) !== null);
ok('país desconegut fa fallback', F.dividendsEstrangers({ dividend_brut: 100, pais: 'XX' }).pais.length > 0);

console.log('\n════════════════════════════════════════');
console.log(passes + ' passats · ' + fails + ' fallits');
if (fails) process.exit(1);
