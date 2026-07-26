/* Verificació de la fase 1: extreu el bloc d'objectius v2 de platform.html,
   l'executa amb stubs mínims i comprova que el render surt correcte amb
   dades reals de client. Sense navegador: si el bloc depèn de res que no
   existeixi, aquí peta.
   Executar: node test_fase1_render.js */
var fs = require('fs');

global.TBI_FISCAL   = require('./tbi-fiscal.js');
global.TBI_FIRE     = require('./tbi-fire.js');
global.TBI_CARTERA  = require('./tbi-cartera.js');
global.TBI_PERFIL   = require('./tbi-perfil.js');
global.TBI_OBJECTIUS = require('./tbi-objectius.js');

var passes = 0, fails = 0;
function ok(n, c, i) {
  if (c) { passes++; console.log('  ✓ ' + n + (i ? '  ' + i : '')); }
  else { fails++; console.log('  ✗ ' + n + (i ? '  ' + i : '')); }
}

// ── Extreure el bloc nou de platform.html ────────────────────────────────
var html = fs.readFileSync('./platform.html', 'utf8');
var ini = html.indexOf('OBJECTIUS v2 · sobres virtuals');
var fi = html.indexOf("OVERRIDES · l'assessor sobreescriu");
ok('el bloc d\'objectius v2 hi és', ini > 0 && fi > ini);
// Començar just després del comentari de capçalera i acabar just abans del
// comentari d'obertura del bloc següent: així el que s'avalua és JS pur.
var iniCode = html.indexOf('*/', ini) + 2;
var finCode = html.lastIndexOf('/*', fi);
var bloc = html.slice(iniCode, finCode);

// ── Stubs ────────────────────────────────────────────────────────────────
var CLIENT = null;
global.getClient = function () { return CLIENT; };
global.APP = { role: 'admin', user: { email: 'gpuigreig@gmail.com' } };
global.TBI_ICO = { svg: function (n) { return '<svg data-i="' + n + '"></svg>'; } };
global.escapeHtml = function (s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
global.getArquetip = function (id) {
  var arqs = TBI_PERFIL.arquetipsPlataforma();
  for (var i = 0; i < arqs.length; i++) if (arqs[i].id === id) return arqs[i];
  for (var j = 0; j < arqs.length; j++) if (arqs[j].id === 'equilibrat') return arqs[j];
  return arqs[0];
};
// Els dos parsers s'extreuen de platform.html en lloc d'imitar-los: si un
// dia canvien, el test se n'assabenta. És justament aquí on hi havia el bug.
function extreuFn(nom) {
  var i = html.indexOf('\nfunction ' + nom + '(');
  if (i < 0) throw new Error('no trobo ' + nom);
  var fi2 = html.indexOf('\n}', i);
  return html.slice(i, fi2 + 2);
}
(new Function(extreuFn('_frParseEur') + extreuFn('_fireParsePerfilAport')
  + '\nglobal._frParseEur=_frParseEur;global._fireParsePerfilAport=_fireParsePerfilAport;'))();
var rerenders = 0, dirties = 0;
global._frMarkDirty = function () { dirties++; };
global._frRerender = function () { rerenders++; };

// ── Executar el bloc ─────────────────────────────────────────────────────
try {
  (new Function(bloc + '\nglobal._frObjCtx=_frObjCtx;global._frObjectiusHtml=_frObjectiusHtml;'
    + 'global._frCoherenciaHtml=_frCoherenciaHtml;global._frSetObjCamp=_frSetObjCamp;'
    + 'global._frSetObjResidual=_frSetObjResidual;global._frSostreRV=_frSostreRV;'
    + 'global._frPesCreixement=_frPesCreixement;global._frTargetArquetip=_frTargetArquetip;'
    + 'global._frObjMesData=_frObjMesData;global._frObjEur=_frObjEur;'))();
  ok('el bloc s\'executa sense dependències que faltin', true);
} catch (e) {
  ok('el bloc s\'executa sense dependències que faltin', false, e.message);
  console.log('\n' + passes + ' passats · ' + fails + ' fallits');
  process.exit(1);
}

// ── Client real: gpuigreig@gmail.com tal com és a Supabase ──────────────
console.log('\n── 1. Context des d\'un client real ──');
CLIENT = {
  email: 'gpuigreig@gmail.com',
  arquetipId: 'maxim',
  perfil: { capitalInicial: '185.000€', aportacioMensual: '1.600€', edat: '38' },
  posicions: [
    { id: 'p1', cat: 'rv_global', valor_actual: 100000 },
    { id: 'p2', cat: 'rv_growth', valor_actual: 40000 },
    { id: 'p3', cat: 'crypto', valor_actual: 25750 },
    { id: 'p4', cat: 'liquiditat', valor_actual: 20000 }
  ],
  moviments_posicions: [
    { id: 'm1', posicio_id: 'p1', data: '2024-01-15', tipus: 'compra', import: 80000 },
    { id: 'm2', posicio_id: 'p2', data: '2024-06-10', tipus: 'compra', import: 35000 },
    { id: 'm3', posicio_id: 'p3', data: '2024-03-01', tipus: 'compra', import: 15000 },
    { id: 'm4', posicio_id: 'p4', data: '2024-01-15', tipus: 'compra', import: 20000 }
  ],
  cartera_target_custom: [
    { id: 'rv_global', nom: 'RV Global Indexada', pct: 37 },
    { id: 'rv_dividend', nom: 'RV Dividends', pct: 10 },
    { id: 'rv_reits', nom: 'REITs', pct: 10 },
    { id: 'liquiditat', nom: 'Liquiditat', pct: 5 },
    { id: 'rv_growth', nom: 'RV Growth', pct: 10 },
    { id: 'or_metalls', nom: 'Or', pct: 7.5 },
    { id: 'crypto', nom: 'Crypto', pct: 10 },
    { id: 'crowdlending', nom: 'Crowdlending', pct: 7.5 },
    { id: 'private_equity', nom: 'Private Equity', pct: 2 },
    { id: 'startups', nom: 'Start-ups', pct: 1 }
  ],
  fire: { objectiuFIRE: 1000000, retornEsperat: 13.5, capitalActual: 185000,
          aportacioMensual: 1600, anysEstimats: 9.3, actualitzat: '2025-01-10T00:00:00Z' },
  fullderuta: {
    overrides: {},
    objectius: [
      { tipus: 'lliure', icona: '<svg/>', titol: 'Llibertat Financera',
        meta: 'Descripció breu', import: 1000000, termini: 'EN 10 ANYS' }
    ]
  }
};

var ctx = _frObjCtx(CLIENT);
ok('el capital surt de la cartera real, no del perfil', ctx.capital_total === 185750,
   '(' + ctx.capital_total + ' €)');
ok('marca que és capital real', ctx.capital_real === 185750);
ok('l\'aportació surt del perfil quan no hi ha override', ctx.aportacio_total === 1600,
   '(' + ctx.aportacio_total + ' €/mes)');
ok('el parser antic de la calculadora FIRE segueix trencat amb "1.600€"',
   _fireParsePerfilAport({ aportacioMensual: '1.600€' }) === 1.6,
   '(retorna ' + _fireParsePerfilAport({ aportacioMensual: '1.600€' }) + ' — bug preexistent, documentat)');
ok('i el del full de ruta el parseja bé', _frParseEur('1.600€') === 1600);
// 20.000 € de 185.750 en liquiditat = 10,8% segur → 89,2% en creixement.
// Comptant només la RV en sortirien un 75%, i el 25% "no RV" (crypto) faria
// de capital segur fantasma.
ok('el pes de creixement compta la crypto com a risc, no com a refugi',
   ctx.pes_rv_real > 88 && ctx.pes_rv_real < 90, '(' + ctx.pes_rv_real.toFixed(1) + '% en creixement)');
ok('el sostre de risc surt de l\'arquetip', ctx.pct_rv_max > 0 && ctx.pct_rv_max <= 100,
   '(arquetip màxim: ' + ctx.pct_rv_max + '% en creixement)');
ok('i el sostre és més alt que el pes de RV pur, perquè inclou alternatius',
   ctx.pct_rv_max > 70, '(' + ctx.pct_rv_max + '%)');
ok('arrossega la calculadora FIRE', ctx.fire && ctx.fire.retornEsperat === 13.5);
ok('arrossega els objectius del full de ruta', ctx.objectius.length === 1);

console.log('\n── 2. Fallback quan no hi ha cartera real ──');
var buit = JSON.parse(JSON.stringify(CLIENT));
buit.posicions = []; buit.moviments_posicions = [];
buit.fullderuta.overrides = { capitalInicial: '90000', aportacioMensual: '700' };
var ctx2 = _frObjCtx(buit);
ok('cau a l\'override de capital', ctx2.capital_total === 90000, '(' + ctx2.capital_total + ' €)');
ok('cau a l\'override d\'aportació', ctx2.aportacio_total === 700);
ok('el pes de RV es deriva de la target', ctx2.pes_rv_real !== null,
   '(' + ctx2.pes_rv_real.toFixed(1) + '%)');
var sensRes = _frObjCtx({ arquetipId: 'navegant', perfil: {}, fullderuta: {} });
ok('un client buit no fa petar el context', sensRes.capital_total === 0 && sensRes.objectius.length === 0);

console.log('\n── 3. Render de la llista (assessor) ──');
var h = _frObjectiusHtml(ctx.objectius, ctx, true);
ok('genera HTML', h.length > 500, '(' + h.length + ' caràcters)');
ok('embolcalla cada objectiu amb .fr-objw', (h.match(/class="fr-objw"/g) || []).length === 1);
ok('migra "EN 10 ANYS" a una data llegible', h.indexOf('2036') >= 0);
ok('mostra l\'import formatat en català', h.indexOf('1.000.000€') >= 0);
ok('inclou el selector de data', h.indexOf('type="month"') >= 0);
ok('inclou els camps de capital i aportació assignats',
   h.indexOf("'capitalAssignat'") >= 0 && h.indexOf("'aportacioAssignada'") >= 0);
ok('inclou el selector de prioritat', h.indexOf("'prioritat'") >= 0 && h.indexOf('Essencial') >= 0);
ok('inclou la casella de residual', h.indexOf('_frSetObjResidual') >= 0);
ok('marca l\'objectiu com a sense assignar', h.indexOf('Sense assignar') >= 0);
ok('manté els camps contenteditable existents', h.indexOf('data-obj-field="titol"') >= 0);
ok('el botó d\'eliminar segueix apuntant a l\'índex', h.indexOf('_frRemoveObjectiu(0)') >= 0);
ok('no deixa cap "undefined" pel camí', h.indexOf('undefined') < 0);
ok('no deixa cap "NaN" pel camí', h.indexOf('NaN') < 0);
ok('les etiquetes obren i tanquen igual', (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length,
   '(' + (h.match(/<div/g) || []).length + ' divs)');

console.log('\n── 4. Render de la llista (client) ──');
var hc = _frObjectiusHtml(ctx.objectius, ctx, false);
ok('el client no rep controls d\'edició', hc.indexOf('fr-obj-ctrl') < 0);
ok('ni camps contenteditable', hc.indexOf('contenteditable') < 0);
ok('ni el botó d\'eliminar', hc.indexOf('_frRemoveObjectiu') < 0);
ok('però sí la franja de progrés', hc.indexOf('fr-obj-proj last') >= 0);
ok('i el badge d\'estat', hc.indexOf('fr-obj-badge') >= 0);
ok('les etiquetes obren i tanquen igual', (hc.match(/<div/g) || []).length === (hc.match(/<\/div>/g) || []).length);

console.log('\n── 5. Un pla ben configurat ──');
var BO = JSON.parse(JSON.stringify(CLIENT));
BO.fullderuta.objectius = [
  { tipus: 'emergencia', titol: 'Fons d\'emergència', import: 14000,
    dataObjectiu: '2027-06', capitalAssignat: 13000, aportacioAssignada: 150 },
  { tipus: 'habitatge_compra', titol: 'Entrada del pis', import: 60000,
    dataObjectiu: '2031-01', capitalAssignat: 25000, aportacioAssignada: 450 },
  { tipus: 'fire', titol: 'Independència financera', import: 900000,
    dataObjectiu: '2046-07', residual: true }
];
var ctxBo = _frObjCtx(BO);
var hbo = _frObjectiusHtml(ctxBo.objectius, ctxBo, true);
ok('renderitza els tres objectius', (hbo.match(/class="fr-objw"/g) || []).length === 3);
ok('el residual té els camps d\'assignació desactivats', hbo.indexOf('disabled') >= 0);
ok('mostra la barreja de cada horitzó', hbo.indexOf('creixement/RF/liq') >= 0);
var _aBo = TBI_OBJECTIUS.assignacio(ctxBo.objectius, ctxBo);
var _prEm = TBI_OBJECTIUS.projeccio(_aBo.objectius[0], ctxBo);
ok('el fons d\'emergència surt amb barreja conservadora', _prEm.mix.rv < 25,
   '(RV de l\'emergència: ' + Math.round(_prEm.mix.rv) + '%)');
ok('el FIRE residual absorbeix el sobrant',
   Math.abs(_aBo.objectius[2].capitalEfectiu - (185750 - 38000)) < 1,
   '(' + Math.round(_aBo.objectius[2].capitalEfectiu) + ' €)');

console.log('\n── 6. Panell de coherència ──');
var pc = _frCoherenciaHtml(ctx);
ok('genera el panell', pc.indexOf('fr-coh') >= 0);
ok('mostra la puntuació', /fr-coh-score[^>]*>\d+</.test(pc));
ok('llista els avisos', pc.indexOf('fr-coh-flag') >= 0);
ok('avisa del 13,5% de rendiment', pc.indexOf('13,5%') >= 0);
ok('mostra els sobres', pc.indexOf('Sense objectiu') >= 0);
ok('mostra el capital fora de borsa', pc.indexOf('Fora de borsa') >= 0);
ok('mostra la barreja proposada amb el rendiment realista',
   pc.indexOf('Rendiment esperat') >= 0 && /[4-7],\d% nominal/.test(pc));
ok('compara amb el sostre del perfil', pc.indexOf('sostre del perfil') >= 0);
ok('escapa el text dels avisos', pc.indexOf('<script') < 0);
ok('les etiquetes obren i tanquen igual', (pc.match(/<div/g) || []).length === (pc.match(/<\/div>/g) || []).length,
   '(' + (pc.match(/<div/g) || []).length + ' divs)');
ok('sense "undefined" ni "NaN"', pc.indexOf('undefined') < 0 && pc.indexOf('NaN') < 0);

var pcBo = _frCoherenciaHtml(ctxBo);
function _score(s) { var m = s.match(/fr-coh-score[^>]*>(\d+)</); return m ? +m[1] : -1; }
// Configurar bé els objectius NO ha de pujar la nota per art de màgia: el
// que fa és destapar problemes de cartera que abans eren invisibles perquè
// cap objectiu reclamava res. El que ha de desaparèixer són els avisos
// d'objectius mal configurats.
ok('desapareixen els avisos de configuració', pcBo.indexOf('no té ni capital ni aportació') < 0);
ok('i el de capital orfe', pcBo.indexOf('Hi ha capital sense objectiu') < 0);
ok('però continua veient els problemes de cartera', pcBo.indexOf('fora de borsa') >= 0);
ok('el diagnòstic passa de "no està configurat" a "la cartera no hi encaixa"',
   _score(pcBo) >= 0 && _score(pc) >= 0, '(bé configurat: ' + _score(pcBo) + ' · sense configurar: ' + _score(pc) + ')');

console.log('\n── 7. Handlers ──');
CLIENT.fullderuta.objectius = [
  { tipus: 'emergencia', titol: 'Emergència', import: 14000 },
  { tipus: 'fire', titol: 'FIRE', import: 900000, residual: true }
];
dirties = 0; rerenders = 0;
_frSetObjCamp(0, 'dataObjectiu', '2028-03');
ok('desa la data', CLIENT.fullderuta.objectius[0].dataObjectiu === '2028-03');
ok('i esborra el termini de text obsolet', CLIENT.fullderuta.objectius[0].termini === null);
_frSetObjCamp(0, 'capitalAssignat', '9500');
ok('desa el capital com a número', CLIENT.fullderuta.objectius[0].capitalAssignat === 9500);
_frSetObjCamp(0, 'capitalAssignat', 'text sense números');
ok('un valor invàlid es queda a 0', CLIENT.fullderuta.objectius[0].capitalAssignat === 0);
_frSetObjCamp(0, 'prioritat', 'essencial');
ok('desa la prioritat', CLIENT.fullderuta.objectius[0].prioritat === 'essencial');
ok('cada canvi marca el full de ruta com a pendent de desar', dirties === 4, '(' + dirties + ' marques)');
ok('i torna a pintar', rerenders === 4);
_frSetObjResidual(0, true);
ok('només un objectiu pot ser residual',
   CLIENT.fullderuta.objectius[0].residual === true && CLIENT.fullderuta.objectius[1].residual === false);
_frSetObjResidual(0, false);
ok('i es pot desmarcar', CLIENT.fullderuta.objectius[0].residual === false);
_frSetObjCamp(99, 'import', 5);
ok('un índex inexistent no fa petar res', true);

console.log('\n── 8. Formatadors ──');
ok('data ISO → mes llegible', _frObjMesData('2036-07-25') === 'jul 2036', '(' + _frObjMesData('2036-07-25') + ')');
ok('mes ISO curt també', _frObjMesData('2031-01') === 'gen 2031');
ok('data buida → guió', _frObjMesData(null) === '—');
ok('euros amb separador de milers', _frObjEur(1234567) === '1.234.567€', '(' + _frObjEur(1234567) + ')');
ok('null → guió', _frObjEur(null) === '—');

console.log('\n════════════════════════════════════════');
console.log(passes + ' passats · ' + fails + ' fallits');
if (fails) process.exit(1);
