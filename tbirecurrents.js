/* ══════════════════════════════════════════════════════════════════════════
   TBI · APORTACIONS RECORRENTS  (motor compartit platform.html + tbi-app.html)

   Problema que resol: molts clients tenen una ordre permanent al broker
   (p. ex. 160 €/mes a RV Global el dia 1). Fins ara calia registrar cada
   compra a mà, mes rere mes, i si passaven mesos sense revisió el cost real
   de la cartera quedava desactualitzat i el rendiment sortia distorsionat.

   Model: UNA REGLA PER POSICIÓ.
     {
       id: 'apr_xxx',
       posicio_id: 'pos_xxx',
       import: 160,
       periodicitat: 'mensual'|'bimensual'|'trimestral'|'semestral'|'anual',
       data_inici: '2026-01-01',   // 1a aportació; el seu dia és el dia recurrent
       data_fi: null,              // opcional
       actiu: true,
       processada_fins: '2026-04-01', // marca d'aigua: res anterior torna a sortir
       saltades: ['2026-03-01'],   // ocurrències descartades (traçabilitat)
       nota: 'Ordre permanent MyInvestor'
     }

   Filosofia: la regla NO inventa moviments. Proposa les ocurrències vençudes
   i és la persona qui les confirma (o en salta alguna si aquell mes el rebut
   va tornar o l'import va canviar). Els moviments creats queden marcats amb
   origen:'recurrent' perquè sempre se sàpiga d'on venen.
   ══════════════════════════════════════════════════════════════════════════ */
var TBI_RECURRENTS = (function () {
  'use strict';

  var MAX_OCURRENCIES = 240; // salvavides: 20 anys de mensuals

  var PERIODICITATS = [
    { id: 'mensual',    mesos: 1,  label: 'Mensual',    curt: '/mes',       adv: 'cada mes' },
    { id: 'bimensual',  mesos: 2,  label: 'Bimensual',  curt: '/2 mesos',   adv: 'cada 2 mesos' },
    { id: 'trimestral', mesos: 3,  label: 'Trimestral', curt: '/trimestre', adv: 'cada trimestre' },
    { id: 'semestral',  mesos: 6,  label: 'Semestral',  curt: '/semestre',  adv: 'cada semestre' },
    { id: 'anual',      mesos: 12, label: 'Anual',      curt: '/any',       adv: 'cada any' }
  ];

  function periodicitat(id) {
    for (var i = 0; i < PERIODICITATS.length; i++) {
      if (PERIODICITATS[i].id === id) return PERIODICITATS[i];
    }
    return PERIODICITATS[0];
  }

  // ── Dates (tot en ISO 'YYYY-MM-DD', sense zones horàries) ────────────────
  function _iso(d) {
    var m = String(d.getMonth() + 1), dia = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (dia.length < 2 ? '0' + dia : dia);
  }
  function _parse(s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function _ultimDiaMes(any, mes) { return new Date(any, mes + 1, 0).getDate(); }

  // Suma mesos conservant el dia; si el mes destí és més curt, agafa l'últim dia.
  // 31 gener + 1 mes = 28/29 febrer (i el mes següent torna a 31, no es queda encallat).
  function _sumaMesos(base, n) {
    var any = base.getFullYear(), mes = base.getMonth() + n, dia = base.getDate();
    var anyN = any + Math.floor(mes / 12), mesN = ((mes % 12) + 12) % 12;
    return new Date(anyN, mesN, Math.min(dia, _ultimDiaMes(anyN, mesN)));
  }
  function avuiISO() { return _iso(new Date()); }

  // ── Normalització defensiva ──────────────────────────────────────────────
  function normalitza(r) {
    if (!r || typeof r !== 'object') return null;
    var p = periodicitat(r.periodicitat);
    return {
      id: r.id || ('apr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)),
      posicio_id: r.posicio_id || '',
      import: parseFloat(r['import']) || 0,
      periodicitat: p.id,
      data_inici: r.data_inici ? String(r.data_inici).slice(0, 10) : '',
      data_fi: r.data_fi ? String(r.data_fi).slice(0, 10) : null,
      actiu: r.actiu !== false,
      processada_fins: r.processada_fins ? String(r.processada_fins).slice(0, 10) : null,
      saltades: Array.isArray(r.saltades) ? r.saltades.slice() : [],
      nota: r.nota || ''
    };
  }
  function normalitzaLlista(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) { var n = normalitza(arr[i]); if (n) out.push(n); }
    return out;
  }

  function valida(r) {
    var n = normalitza(r);
    if (!n) return 'Regla buida';
    if (!n.posicio_id) return 'Cal triar una posició';
    if (!(n.import > 0)) return 'L’import ha de ser més gran que 0';
    if (!_parse(n.data_inici)) return 'Cal una data de la primera aportació';
    if (n.data_fi && !_parse(n.data_fi)) return 'La data de fi no és vàlida';
    if (n.data_fi && n.data_fi < n.data_inici) return 'La data de fi és anterior a l’inici';
    return null;
  }

  // ── Ocurrències ──────────────────────────────────────────────────────────
  // Totes les dates teòriques de la regla dins [desDe, finsA] (inclosos).
  function ocurrencies(regla, finsA, desDe) {
    var r = normalitza(regla);
    if (!r || !r.data_inici) return [];
    var inici = _parse(r.data_inici); if (!inici) return [];
    var limit = finsA || avuiISO();
    if (r.data_fi && r.data_fi < limit) limit = r.data_fi;
    var mesos = periodicitat(r.periodicitat).mesos;
    var out = [];
    for (var k = 0; k < MAX_OCURRENCIES; k++) {
      var iso = _iso(_sumaMesos(inici, k * mesos));
      if (iso > limit) break;
      if (!desDe || iso > desDe) out.push(iso);
    }
    return out;
  }

  // Ocurrències vençudes i encara no processades (ni confirmades ni saltades).
  function pendents(regla, avui) {
    var r = normalitza(regla);
    if (!r || !r.actiu) return [];
    var dates = ocurrencies(r, avui || avuiISO(), r.processada_fins);
    if (!r.saltades.length) return dates;
    var out = [];
    for (var i = 0; i < dates.length; i++) {
      var trobat = false;
      for (var j = 0; j < r.saltades.length; j++) { if (r.saltades[j] === dates[i]) { trobat = true; break; } }
      if (!trobat) out.push(dates[i]);
    }
    return out;
  }

  // Propera ocurrència futura (informativa). null si la regla ja ha acabat.
  function properaData(regla, avui) {
    var r = normalitza(regla);
    if (!r || !r.actiu || !r.data_inici) return null;
    var ref = avui || avuiISO();
    var inici = _parse(r.data_inici); if (!inici) return null;
    var mesos = periodicitat(r.periodicitat).mesos;
    for (var k = 0; k < MAX_OCURRENCIES; k++) {
      var iso = _iso(_sumaMesos(inici, k * mesos));
      if (iso > ref) return (r.data_fi && iso > r.data_fi) ? null : iso;
    }
    return null;
  }

  // Resum de totes les regles: què hi ha pendent, per posició i en total.
  // -> { files:[{regla,posicio,dates,import,total}], total_eur, total_mov, regles_amb_pendents }
  function resumPendents(regles, posicions, avui) {
    var llista = normalitzaLlista(regles), ref = avui || avuiISO();
    var files = [], totalEur = 0, totalMov = 0;
    for (var i = 0; i < llista.length; i++) {
      var r = llista[i];
      var pos = null;
      for (var j = 0; j < (posicions || []).length; j++) {
        if (posicions[j].id === r.posicio_id) { pos = posicions[j]; break; }
      }
      if (!pos) continue; // regla òrfena: la posició s'ha esborrat
      var dates = pendents(r, ref);
      if (!dates.length) continue;
      files.push({ regla: r, posicio: pos, dates: dates, 'import': r['import'], total: r['import'] * dates.length });
      totalEur += r['import'] * dates.length;
      totalMov += dates.length;
    }
    return { files: files, total_eur: totalEur, total_mov: totalMov, regles_amb_pendents: files.length };
  }

  // Regles actives que apunten a una posició existent (per pintar la llista).
  function reglesDePosicio(regles, posicio_id) {
    var llista = normalitzaLlista(regles), out = [];
    for (var i = 0; i < llista.length; i++) if (llista[i].posicio_id === posicio_id) out.push(llista[i]);
    return out;
  }

  // Total teòric aportat per totes les regles actives en un any.
  function importAnualitzat(regles) {
    var llista = normalitzaLlista(regles), t = 0;
    for (var i = 0; i < llista.length; i++) {
      if (!llista[i].actiu) continue;
      t += llista[i]['import'] * (12 / periodicitat(llista[i].periodicitat).mesos);
    }
    return t;
  }

  // ── Materialització ──────────────────────────────────────────────────────
  // Converteix ocurrències confirmades en moviments 'compra' del model v2.
  // confirmacions: [{data:'2026-05-01', import:160}] (import editable per ocurrència)
  function crearMoviments(regla, confirmacions, novaId) {
    var r = normalitza(regla); if (!r) return [];
    var gen = novaId || function (p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5); };
    var out = [];
    for (var i = 0; i < (confirmacions || []).length; i++) {
      var c = confirmacions[i];
      var imp = parseFloat(c['import']);
      if (!(imp > 0)) continue;
      out.push({
        id: gen('mov'),
        posicio_id: r.posicio_id,
        data: c.data,
        tipus: 'compra',
        'import': imp,
        unitats: null,
        preu_unitat: null,
        nota: 'Aportació recorrent' + (r.nota ? ' · ' + r.nota : ''),
        origen: 'recurrent',
        regla_id: r.id
      });
    }
    return out;
  }

  // Avança la marca d'aigua i registra les saltades. Retorna la regla nova.
  function marcarProcessada(regla, datesConfirmades, datesSaltades) {
    var r = normalitza(regla); if (!r) return null;
    var totes = (datesConfirmades || []).concat(datesSaltades || []);
    if (!totes.length) return r;
    var max = r.processada_fins || '';
    for (var i = 0; i < totes.length; i++) if (totes[i] > max) max = totes[i];
    r.processada_fins = max || r.processada_fins;
    for (var j = 0; j < (datesSaltades || []).length; j++) {
      if (r.saltades.indexOf(datesSaltades[j]) === -1) r.saltades.push(datesSaltades[j]);
    }
    r.saltades.sort();
    return r;
  }

  // Aplica un lot de confirmacions sobre tot el conjunt.
  // lots: [{regla_id, confirmades:[{data,import}], saltades:[data]}]
  // -> { regles: [...], moviments_nous: [...] }
  function aplicarLot(regles, lots, novaId) {
    var llista = normalitzaLlista(regles), nous = [];
    for (var i = 0; i < (lots || []).length; i++) {
      var lot = lots[i];
      for (var j = 0; j < llista.length; j++) {
        if (llista[j].id !== lot.regla_id) continue;
        nous = nous.concat(crearMoviments(llista[j], lot.confirmades, novaId));
        var datesConf = [];
        for (var k = 0; k < (lot.confirmades || []).length; k++) datesConf.push(lot.confirmades[k].data);
        llista[j] = marcarProcessada(llista[j], datesConf, lot.saltades || []);
        break;
      }
    }
    return { regles: llista, moviments_nous: nous };
  }

  // Neteja regles que apunten a posicions inexistents (després d'esborrar-ne una).
  function netejaOrfanes(regles, posicions) {
    var llista = normalitzaLlista(regles), ids = {}, out = [];
    for (var i = 0; i < (posicions || []).length; i++) ids[posicions[i].id] = 1;
    for (var j = 0; j < llista.length; j++) if (ids[llista[j].posicio_id]) out.push(llista[j]);
    return out;
  }

  // ── Format ───────────────────────────────────────────────────────────────
  var MESOS_CA = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol',
                  'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

  function dataCurta(iso) {
    var d = _parse(iso); if (!d) return iso || '—';
    return d.getDate() + ' ' + MESOS_CA[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
  }
  function mesLlarg(iso) {
    var d = _parse(iso); if (!d) return iso || '—';
    return MESOS_CA[d.getMonth()] + ' ' + d.getFullYear();
  }
  function eur(v) { return Math.round(v || 0).toLocaleString('ca-ES') + '€'; }

  // "160€/mes · dia 1 · des del 12 gen 2026"
  function resumRegla(regla) {
    var r = normalitza(regla); if (!r) return '';
    var p = periodicitat(r.periodicitat);
    var d = _parse(r.data_inici);
    var txt = eur(r['import']) + p.curt;
    if (d) txt += ' · dia ' + d.getDate();
    if (r.data_fi) txt += ' · fins al ' + dataCurta(r.data_fi);
    return txt;
  }

  return {
    PERIODICITATS: PERIODICITATS,
    MAX_OCURRENCIES: MAX_OCURRENCIES,
    periodicitat: periodicitat,
    normalitza: normalitza,
    normalitzaLlista: normalitzaLlista,
    valida: valida,
    ocurrencies: ocurrencies,
    pendents: pendents,
    properaData: properaData,
    resumPendents: resumPendents,
    reglesDePosicio: reglesDePosicio,
    importAnualitzat: importAnualitzat,
    crearMoviments: crearMoviments,
    marcarProcessada: marcarProcessada,
    aplicarLot: aplicarLot,
    netejaOrfanes: netejaOrfanes,
    dataCurta: dataCurta,
    mesLlarg: mesLlarg,
    resumRegla: resumRegla,
    avuiISO: avuiISO,
    _iso: _iso,
    _parse: _parse,
    _sumaMesos: _sumaMesos
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TBI_RECURRENTS;
