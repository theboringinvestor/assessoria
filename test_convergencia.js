/* Requereix jsdom:  npm i jsdom  (i executar-lo des d'aquesta carpeta)
   Prova que tbi-app.html i platform.html donen EXACTAMENT el mateix
   amb les mateixes dades. Era el problema que hem vingut a resoldre. */
var fs=require('fs'), path=require('path');
var { JSDOM } = require('jsdom');
var DIR='/sessions/funny-amazing-bardeen/mnt/outputs';

var dom=new JSDOM('<!doctype html><body><div id="content"></div><div id="view"></div></body>',{pretendToBeVisual:true});
global.window=dom.window; global.document=dom.window.document;
global.TBI_CARTERA=require(path.join(DIR,'tbi-cartera.js'));
global.TBI_FISCAL=require(path.join(DIR,'tbi-fiscal.js'));
global.TBI_FIRE=require(path.join(DIR,'tbi-fire.js'));

// ── Dades compartides ──
var TARGET=[{id:'rv_global',pct:60},{id:'rf_corp',pct:30},{id:'or_metalls',pct:6},{id:'liquiditat',pct:4}];
var POS=[{id:'p1',cat:'rv_global',nom:'MSCI World',valor_actual:75000},
         {id:'p2',cat:'rf_corp',nom:'Bons',valor_actual:15000},
         {id:'p3',cat:'or_metalls',nom:'Or',valor_actual:6000},
         {id:'p4',cat:'liquiditat',nom:'Compte',valor_actual:4000}];
var MOV=[{id:'m1',posicio_id:'p1',data:'2022-01-15',tipus:'compra',import:45000},
         {id:'m2',posicio_id:'p2',data:'2022-01-15',tipus:'compra',import:14000},
         {id:'m3',posicio_id:'p3',data:'2022-01-15',tipus:'compra',import:5000},
         {id:'m4',posicio_id:'p4',data:'2022-01-15',tipus:'compra',import:4000}];
var SNAPS=[{mes:'2025-01',valor:80000,invertit:68000},{mes:'2025-07',valor:92000,invertit:68000}];

// ══ Entorn PLATAFORMA ══
var CLIENT={email:'t@x.cat',arquetipId:'eq',cartera_target_custom:TARGET,
  posicions:POS,moviments_posicions:MOV,snapshots_cartera:SNAPS,perfil:{edat:55}};
global.APP={role:'client',isDemo:false,clientData:CLIENT,user:{email:'t@x.cat'}};
global.getClient=function(){return CLIENT;};
global.getPosicionsV2=function(){return CLIENT.posicions;};
global.getMovimentsV2=function(){return CLIENT.moviments_posicions;};
global.getArquetip=function(){return {id:'eq',nom:'Equilibrat',retorn:'5–7%',actius:TARGET};};
global.ACTIUS_TAXONOMY=TBI_CARTERA.TAXONOMIA.map(function(t){
  return {id:t.id,grup:t.grup,emoji:t.emoji,ca:t.nom,color:t.color};});
var plat=fs.readFileSync(path.join(DIR,'platform.html'),'utf8');
var i=plat.indexOf('// ADAPTADORS AL MOTOR COMPARTIT'); i=plat.lastIndexOf('// ═',i);
var j=plat.indexOf('// FI Sistema de cartera v2'); j=plat.lastIndexOf('// ═',j);
var codiPlat=plat.slice(i,j);
// Evaluar tal qual i exportar les funcions: renombrar-les trencava les
// crides internes entre elles.
eval(codiPlat + '\n;global.PLAT={kpis:calcKPIsCartera,ter:calcTERCartera,twr:calcTWR,'
   + 'matching:calcMatchingITactic,retirada:calcRetiradaTactica,dist:calcDistribucioReal};');

// ══ Entorn APP ══
var app=fs.readFileSync(path.join(DIR,'tbi-app.html'),'utf8');
global.getPosicions=function(){return POS;};
global.getMoviments=function(){return MOV;};
global.getSnapshots=function(){return SNAPS;};
global.getTarget=function(){return TARGET;};
function extreuApp(nom, fins){
  var a=app.indexOf('function '+nom+'('); var b=app.indexOf(fins,a);
  return app.slice(a,b);
}
var codiApp = extreuApp('kpisCartera','function getSnapshots')
            + '\n' + extreuApp('ctxCartera','// Quantes aportacions');
eval(codiApp + '\n;global.APLI={kpis:kpisCartera,ter:terCartera,twr:twrCartera,matching:calcAportacio};');

var passes=0,fails=0;
function same(nom,a,b,tol){
  tol=(tol===undefined)?0.005:tol;
  var ok = (typeof a==='number'&&typeof b==='number') ? Math.abs(a-b)<=tol : JSON.stringify(a)===JSON.stringify(b);
  if(ok){passes++;console.log('  ✓ '+nom+'  ('+(typeof a==='number'?(+a).toFixed(2):'idèntic')+')');}
  else{fails++;console.log('  ✗ '+nom+'\n      app: '+JSON.stringify(a)+'\n      plat: '+JSON.stringify(b));}
}

console.log('\n── KPIs ──');
var kp=PLAT.kpis(), ka=APLI.kpis();
same('valor total', ka.valor_total, kp.valor_total);
same('cost total', ka.cost_total, kp.cost_total);
same('TIR', ka.xirr, kp.xirr);
same('P&L %', ka.pnl_pct, kp.pnl_pct);
same('ràtio de plusvàlua', ka.ratio_guany, kp.ratio_guany);

console.log('\n── TER ──');
var tp=PLAT.ter(), ta=APLI.ter();
same('TER real', ta.ter_real, tp.ter_real);
same('cost anual', ta.cost_anual_eur, tp.cost_anual_eur);
same('estalvi anual', ta.estalvi_anual_eur, tp.estalvi_anual_eur);

console.log('\n── TWR ──');
same('TWR anual', APLI.twr().anual, PLAT.twr().anual);

console.log('\n── Recomanació d\'aportació (el bug original) ──');
[100,300,500,1000,2500].forEach(function(a){
  var mp=PLAT.matching(a), ma=APLI.matching(a);
  var lp=mp.recomanacio.map(function(l){return l.cat+':'+l.import;}).join(' ');
  var la=ma.recomanacio.map(function(l){return l.cat+':'+l.import;}).join(' ');
  same('aportació de '+a+'€', la, lp);
  if(a===500) console.log('      → '+la);
});

console.log('\n── Coherència i bandes ──');
var mp0=PLAT.matching(0), ma0=APLI.matching(0);
same('coherència', ma0.resum.coherencia, mp0.resum.coherencia);
same('nombre fora de banda', ma0.resum.n_fora_banda, mp0.resum.n_fora_banda);
same('deriva màxima', ma0.resum.deriva_max_pp, mp0.resum.deriva_max_pp);
var bp=mp0.rows.map(function(r){return r.id+':'+r.banda_pp;}).join(' ');
var ba=ma0.rows.map(function(r){return r.cat+':'+r.banda;}).join(' ');
same('bandes per categoria', ba, bp);

console.log('\n── Taxonomia ──');
same('mateixos colors', TBI_CARTERA.cat('rv_global').color, '#1B3A6B');
same('mateixos noms', TBI_CARTERA.cat('or_metalls').nom, 'Or i Metalls preciosos');

console.log('\n════════════════════════════════════════');
console.log(passes+' passats · '+fails+' fallits');
if(fails) process.exit(1);
