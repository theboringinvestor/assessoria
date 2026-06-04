/* ============================================================
   TBI · MÒDUL DE PERFIL D'INVERSOR  (font única)
   - Qüestionari MIFID-lite (~13 preguntes puntuables)
   - Scoring de dos eixos: capacitat + tolerància -> risc = min()
   - Porta de conveniència (coneixement) -> Bàsic / Mitjà / Avançat
   - 13 arquetips amb composició RV/RF/Alt/Cash (suma 100)
   - Inclou actiu de liquiditat (compte remunerat) com a monetari
   - Adaptador arquetipsPlataforma() per a ARQUETIPS_CARTERES
   ES5: var / function / concatenació. Sense dependències.
   ============================================================ */
var TBI_PERFIL = (function () {
  "use strict";

  /* ---------- 1) TAXONOMIA D'ACTIUS (defaults del mòdul) ----------
     Els ids/noms coincideixen amb ACTIUS_TAXONOMY de la plataforma. */
  var ACTIUS = {
    rv_global:    { nom: "RV Global Indexada",        color: "#1B3A6B", mu: 7.5,  sigma: 15.0, grup: "rv",   seguiment: "auto"   },
    rv_growth:    { nom: "RV Growth / Tecnològic",    color: "#4CAF82", mu: 9.0,  sigma: 20.0, grup: "rv",   seguiment: "auto"   },
    rv_emergent:  { nom: "RV Mercats Emergents",      color: "#FF6F00", mu: 8.0,  sigma: 22.0, grup: "rv",   seguiment: "auto"   },
    rv_dividend:  { nom: "RV Dividends / Renda",      color: "#2E5FA3", mu: 6.5,  sigma: 13.0, grup: "rv",   seguiment: "auto"   },
    rv_reits:     { nom: "REITs / Immobiliaris",      color: "#0F6E56", mu: 6.0,  sigma: 17.0, grup: "rv",   seguiment: "auto"   },
    rf_gov_curt:  { nom: "RF Gov. Curt termini",      color: "#78909C", mu: 2.8,  sigma: 3.0,  grup: "rf",   seguiment: "auto"   },
    rf_gov_llarg: { nom: "RF Gov. Llarg termini",     color: "#546E7A", mu: 3.5,  sigma: 7.0,  grup: "rf",   seguiment: "auto"   },
    rf_corp:      { nom: "RF Corporativa IG",         color: "#8D6E63", mu: 4.0,  sigma: 6.0,  grup: "rf",   seguiment: "auto"   },
    or_metalls:   { nom: "Or i Metalls preciosos",    color: "#C0392B", mu: 4.0,  sigma: 15.0, grup: "alt",  seguiment: "auto"   },
    crypto:       { nom: "Crypto / Actius Digitals",  color: "#534AB7", mu: 15.0, sigma: 60.0, grup: "alt",  seguiment: "auto"   },
    crowd_pe:     { nom: "Crowdlending / Private Eq.", color: "#D4943A", mu: 8.0, sigma: 12.0, grup: "alt",  seguiment: "manual" },
    cash:         { nom: "Liquiditat · Compte remunerat", color: "#90A4AE", mu: 2.5, sigma: 0.4, grup: "cash", seguiment: "manual" }
  };

  /* ---------- 2) QÜESTIONARI MIFID-lite ----------
     eix: 'capacitat' | 'tolerancia' | 'coneixement' | 'preferencia' | 'dades' */
  var PREGUNTES = [
    { id: "nom",   eix: "dades", type: "text",   dim: "Benvingut", text: "Com et dius?" },
    { id: "email", eix: "dades", type: "text",   dim: "Contacte",  text: "El teu correu electrònic" },
    { id: "edat", eix: "capacitat", type: "choice", dim: "Situació", text: "Quants anys tens?",
      opts: [
        { lbl: "Menys de 35", txt: "Tinc molt horitzó per davant.", s: 4 },
        { lbl: "35–50", txt: "En plena etapa d'acumulació.", s: 3 },
        { lbl: "50–60", txt: "M'acosto a la fase de consolidació.", s: 2 },
        { lbl: "Més de 60", txt: "Pre-retir o retir.", s: 1 }
      ] },

    { id: "A1", eix: "coneixement", type: "choice", bloc: "Coneixement", dim: "A · Coneixement",
      text: "Quina és la teva formació financera?",
      opts: [
        { lbl: "Cap", txt: "No tinc formació específica en finances.", s: 1 },
        { lbl: "Bàsica", txt: "Sé què són dipòsits, fons i ETFs.", s: 2 },
        { lbl: "Sòlida", txt: "Entenc diversificació, RV/RF i fiscalitat bàsica.", s: 3 },
        { lbl: "Avançada", txt: "Domino derivats, alternatius i estratègies complexes.", s: 4 }
      ] },
    { id: "A2", eix: "coneixement", type: "choice", bloc: "Coneixement", dim: "A · Coneixement",
      text: "Quins productes has fet servir realment?",
      opts: [
        { lbl: "Cap", txt: "Només compte corrent o dipòsit.", s: 1 },
        { lbl: "Fons", txt: "Fons indexats o ETFs.", s: 2 },
        { lbl: "Diversos", txt: "Accions, fons, ETFs i RF.", s: 3 },
        { lbl: "Complexos", txt: "També crypto, derivats o private equity.", s: 4 }
      ] },
    { id: "A3", eix: "coneixement", type: "choice", bloc: "Coneixement", dim: "A · Coneixement",
      text: "Quina experiència tens invertint pel teu compte?",
      opts: [
        { lbl: "Cap", txt: "Primera vegada que ho considero seriosament.", s: 1 },
        { lbl: "Poca", txt: "Tinc algun producte, però ho gestionava el banc.", s: 2 },
        { lbl: "Mitjana", txt: "He triat i gestionat inversions jo mateix.", s: 3 },
        { lbl: "Alta", txt: "Experiència en diversos mercats i cicles.", s: 4 }
      ] },

    { id: "B1", eix: "capacitat", type: "choice", bloc: "Situació", dim: "B · Situació", mifid: "idoneïtat",
      text: "Quina capacitat d'estalvi mensual tens?",
      opts: [
        { lbl: "Justa", txt: "Arribo a final de mes, estalvio poc o res.", s: 1 },
        { lbl: "Moderada", txt: "Puc estalviar de forma irregular.", s: 2 },
        { lbl: "Bona", txt: "Estalvio cada mes de forma estable.", s: 3 },
        { lbl: "Alta", txt: "Estalvio un percentatge important i creixent.", s: 4 }
      ] },
    { id: "B2", eix: "capacitat", type: "choice", bloc: "Situació", dim: "B · Situació", mifid: "idoneïtat",
      text: "Tens un fons d'emergència separat de la inversió?",
      opts: [
        { lbl: "No", txt: "No tinc coixí d'emergència.", s: 1 },
        { lbl: "1-2 mesos", txt: "Cobreix 1-2 mesos de despeses.", s: 2 },
        { lbl: "3-6 mesos", txt: "Cobreix 3-6 mesos de despeses.", s: 3 },
        { lbl: ">6 mesos", txt: "Més de 6 mesos coberts.", s: 4 }
      ] },
    { id: "B3", eix: "capacitat", type: "choice", bloc: "Situació", dim: "B · Situació", mifid: "idoneïtat",
      text: "Quina part del teu patrimoni vols invertir ara?",
      opts: [
        { lbl: "Gairebé tot", txt: "Necessitaré aquests diners i invertiré gairebé tot el que tinc.", s: 1 },
        { lbl: "La meitat", txt: "Una part important, però mantinc reserves.", s: 2 },
        { lbl: "Una part", txt: "Un percentatge còmode del meu patrimoni.", s: 3 },
        { lbl: "Excedent", txt: "Només diners que no necessitaré a mitjà termini.", s: 4 }
      ] },

    { id: "C1", eix: "capacitat", type: "choice", bloc: "Objectius", dim: "C · Objectius", mifid: "idoneïtat",
      text: "Quin és el teu objectiu principal?",
      opts: [
        { lbl: "Preservar", txt: "Protegir el capital de la inflació, sense ensurts.", s: 1 },
        { lbl: "Rendes", txt: "Generar ingressos regulars.", s: 2 },
        { lbl: "Equilibri", txt: "Créixer però amb estabilitat.", s: 3 },
        { lbl: "Créixer", txt: "Maximitzar el creixement a llarg termini.", s: 4 }
      ] },
    { id: "C2", eix: "capacitat", type: "choice", bloc: "Objectius", dim: "C · Objectius", mifid: "idoneïtat",
      text: "Quin és el teu horitzó temporal?",
      opts: [
        { lbl: "<3 anys", txt: "Necessitaré els diners aviat.", s: 1 },
        { lbl: "3-7 anys", txt: "Mitjà termini.", s: 2 },
        { lbl: "7-15 anys", txt: "Llarg termini.", s: 3 },
        { lbl: ">15 anys", txt: "Molt llarg termini, sense data fixa.", s: 4 }
      ] },

    { id: "D1", eix: "tolerancia", type: "choice", bloc: "Risc", dim: "D · Risc", mifid: "idoneïtat",
      text: "Quina caiguda màxima podries assumir sense canviar el pla?",
      opts: [
        { lbl: "-5%", txt: "Menys del 5%. Qualsevol caiguda gran em preocupa.", s: 1 },
        { lbl: "-15%", txt: "Entre 5-15%. Un any dolent és assumible.", s: 2 },
        { lbl: "-30%", txt: "Entre 15-30%. Entenc que és temporal.", s: 3 },
        { lbl: "-50%", txt: "Més del 30%. Part del procés a llarg termini.", s: 4 }
      ] },
    { id: "D2", eix: "tolerancia", type: "choice", bloc: "Risc", dim: "D · Risc",
      text: "La teva cartera cau un 20% en 3 mesos. Què fas?",
      opts: [
        { lbl: "Venc", txt: "Venc immediatament, no puc seguir perdent.", s: 1 },
        { lbl: "Redueixo", txt: "Probablement reduiria la posició.", s: 2 },
        { lbl: "Espero", txt: "Espero, sé que els mercats es recuperen.", s: 3 },
        { lbl: "Compro", txt: "Compro més, les caigudes són oportunitats.", s: 4 }
      ] },
    { id: "D3", eix: "tolerancia", type: "choice", bloc: "Risc", dim: "D · Risc",
      text: "Com et sents quan veus notícies financeres negatives?",
      opts: [
        { lbl: "Molt ansiós", txt: "Reviso la cartera constantment.", s: 1 },
        { lbl: "Preocupat", txt: "Em costa no actuar.", s: 2 },
        { lbl: "Tranquil", txt: "Una mica incòmode, però ho veig temporal.", s: 3 },
        { lbl: "Indiferent", txt: "Comportament habitual dels mercats.", s: 4 }
      ] },

    { id: "E1", eix: "preferencia", type: "choice", bloc: "Preferències", dim: "E · Preferències",
      text: "Quina obertura tens a actius alternatius (or, crypto, P2P)?",
      opts: [
        { lbl: "Cap", txt: "Vull només productes tradicionals i clars.", s: 1 },
        { lbl: "Poca", txt: "Or o REITs sí; crypto no.", s: 2 },
        { lbl: "Mitjana", txt: "Una capa moderada d'alternatius.", s: 3 },
        { lbl: "Alta", txt: "Obert a crypto i il·líquids si tenen sentit.", s: 4 }
      ] },
    { id: "E2", eix: "preferencia", type: "choice", bloc: "Preferències", dim: "E · Preferències", mifid: "SFDR",
      text: "Tens preferències de sostenibilitat (ESG)?",
      opts: [
        { lbl: "No", txt: "No és una prioritat per a mi.", s: 1 },
        { lbl: "Suau", txt: "Millor si és sostenible, però no excloent.", s: 2 },
        { lbl: "Important", txt: "Vull prioritzar fons ESG.", s: 3 },
        { lbl: "Estricta", txt: "Exclusions clares (armes, fòssils, etc.).", s: 4 }
      ] }
  ];

  /* ---------- 3) ARQUETIPS (13) ----------
     cell:[bandaRisc(0..4), soph(0..2)] · ciutat/sub/diff per a la plataforma · alloc suma 100 */
  var ARQUETIPS = [
    { id: "preservacio", nom: "Preservació", ep: "Fabi Màxim · 280–203 a.C.", cell: [0, 0],
      perfil: "Defensiu", soph: "Bàsic", ciutat: "Berna",
      ter: "~0,12%", retorn: "2–3%", risc: "Molt baix",
      sub: "Protecció del capital. Sense alternatius.",
      rationale: "Protegir el capital de la inflació amb mínima volatilitat. La liquiditat dona flexibilitat sense risc.",
      diff: "Tot defensiu i líquid. La RV mínima només compensa la inflació.",
      alloc: [["rv_global",15],["rf_gov_curt",45],["rf_corp",30],["cash",10]] },
    { id: "preservacio_div", nom: "Preservació diversificada", ep: "Sèneca · 4 a.C.–65 d.C.", cell: [0, 1],
      perfil: "Defensiu", soph: "Mitjà", ciutat: "Ginebra",
      ter: "~0,18%", retorn: "3–4%", risc: "Baix",
      sub: "Prudència amb capa fina de descorrelació.",
      rationale: "Mateixa prudència amb una capa fina d'or i REITs per descorrelacionar.",
      diff: "L'or i els REITs aporten descorrelació sense apujar la volatilitat global.",
      alloc: [["rv_global",15],["rf_gov_curt",38],["rf_corp",25],["or_metalls",7],["rv_reits",5],["cash",10]] },
    { id: "coixi", nom: "Coixí", ep: "Diògenes · 412–323 a.C.", cell: [1, 0],
      perfil: "Conservador", soph: "Bàsic", ciutat: "Viena",
      ter: "~0,14%", retorn: "3–4%", risc: "Baix",
      sub: "Senzill i estable. Tres productes.",
      rationale: "Senzillesa i estabilitat. RV mínima per batre la inflació, la resta defensiu i líquid.",
      diff: "La simplicitat és la fortalesa: poques peces, fàcil de mantenir.",
      alloc: [["rv_global",30],["rf_gov_curt",35],["rf_corp",26],["cash",9]] },
    { id: "conservador_div", nom: "Conservador diversificat", ep: "Adrià · 76–138 d.C.", cell: [1, 1],
      perfil: "Conservador", soph: "Mitjà", ciutat: "Munic",
      ter: "~0,20%", retorn: "4–5%", risc: "Baix-Mig",
      sub: "Dividend i alternatius líquids moderats.",
      rationale: "Afegeix dividend i alternatius líquids per millorar el retorn ajustat al risc.",
      diff: "El dividend i l'or milloren el retorn ajustat al risc sense passar de conservador.",
      alloc: [["rv_global",22],["rv_dividend",6],["rf_gov_curt",30],["rf_corp",21],["or_metalls",7],["rv_reits",5],["cash",9]] },
    { id: "conservador_sof", nom: "Conservador sofisticat", ep: "Beda el Venerable · 672–735", cell: [1, 2],
      perfil: "Conservador", soph: "Avançat", ciutat: "Frankfurt",
      ter: "~0,28%", retorn: "4–6%", risc: "Mig",
      sub: "Prudent però amb il·líquids controlats.",
      rationale: "Perfil prudent amb coneixement alt: incorpora il·líquids controlats (crowd/PE) sense apujar la RV.",
      diff: "Coneixement alt + risc baix: els il·líquids aporten prima sense tocar la RV.",
      alloc: [["rv_global",20],["rv_dividend",5],["rf_gov_llarg",25],["rf_corp",16],["or_metalls",8],["rv_reits",7],["crowd_pe",10],["cash",9]] },
    { id: "equilibri_simple", nom: "Equilibri simple", ep: "Cincinnat · 519–430 a.C.", cell: [2, 0],
      perfil: "Moderat", soph: "Bàsic", ciutat: "Brussel·les",
      ter: "~0,16%", retorn: "5–6%", risc: "Mig",
      sub: "El 50/50 de manual, només índexs.",
      rationale: "El 50/50 de manual, només amb índexs. Fàcil d'entendre i de mantenir.",
      diff: "Equilibri clàssic sense complexitat: meitat creixement, meitat estabilitat.",
      alloc: [["rv_global",40],["rv_emergent",10],["rf_gov_llarg",25],["rf_corp",18],["cash",7]] },
    { id: "equilibrat", nom: "Equilibrat", ep: "Zheng He · 1371–1433", cell: [2, 1],
      perfil: "Moderat", soph: "Mitjà", ciutat: "Roma",
      ter: "~0,19%", retorn: "5–7%", risc: "Mig",
      sub: "Equilibri amb dividend i or com a àncores.",
      rationale: "El dividend visible fa d'àncora psicològica; l'or i els REITs protegeixen en caigudes.",
      diff: "El dividend visible és la brúixola psicològica quan la RV cau.",
      alloc: [["rv_global",35],["rv_dividend",15],["rf_gov_llarg",20],["rf_corp",11],["or_metalls",7],["rv_reits",5],["cash",7]] },
    { id: "multiactiu", nom: "Multi-actiu", ep: "Brunelleschi · 1377–1446", cell: [2, 2],
      perfil: "Moderat", soph: "Avançat", ciutat: "Amsterdam",
      ter: "~0,30%", retorn: "6–8%", risc: "Mig-Alt",
      sub: "Set blocs estructurats amb il·líquids.",
      rationale: "Set blocs estructurats amb il·líquids selectius. Cada peça té funció clara.",
      diff: "Cada bloc té funció estructural; els il·líquids no superen el 28%.",
      alloc: [["rv_global",30],["rv_growth",8],["rv_emergent",7],["rf_corp",20],["or_metalls",8],["rv_reits",8],["crowd_pe",12],["cash",7]] },
    { id: "creixement_simple", nom: "Creixement simple", ep: "Magallanes · 1480–1521", cell: [3, 0],
      perfil: "Dinàmic", soph: "Bàsic", ciutat: "Dublín",
      ter: "~0,15%", retorn: "6–8%", risc: "Alt",
      sub: "Molta RV global, sense complexitat.",
      rationale: "Molta RV global i emergents, sense complexitat. Creixement amb un coixí mínim.",
      diff: "Creixement directe via índexs: sense alternatius que distreguin.",
      alloc: [["rv_global",55],["rv_emergent",17],["rf_gov_llarg",23],["cash",5]] },
    { id: "dinamic_div", nom: "Dinàmic diversificat", ep: "Shackleton · 1874–1922", cell: [3, 1],
      perfil: "Dinàmic", soph: "Mitjà", ciutat: "Londres",
      ter: "~0,24%", retorn: "7–9%", risc: "Mig-Alt",
      sub: "Creixement amb alternatius líquids.",
      rationale: "Creixement amb alternatius líquids moderats. RF curta i cash com a coixí emocional.",
      diff: "L'or i els REITs canalitzen l'energia; la RF curta és coixí, no protecció.",
      alloc: [["rv_global",50],["rv_growth",15],["rv_emergent",7],["rf_gov_curt",8],["or_metalls",8],["rv_reits",7],["cash",5]] },
    { id: "dinamic_alt", nom: "Dinàmic alternatiu", ep: "Leonardo da Vinci · 1452–1519", cell: [3, 2],
      perfil: "Dinàmic", soph: "Avançat", ciutat: "Singapur",
      ter: "~0,32%", retorn: "7–9%", risc: "Alt",
      sub: "Creixement amb crypto i il·líquids.",
      rationale: "Creixement amb una capa real d'alternatius incloent una pinzellada de crypto i il·líquids.",
      diff: "Capa real d'alternatius (28%) amb una pinzellada de crypto controlada.",
      alloc: [["rv_global",42],["rv_growth",15],["rf_corp",10],["or_metalls",8],["rv_reits",5],["crypto",5],["crowd_pe",10],["cash",5]] },
    { id: "totindex", nom: "Tot índex global", ep: "Alexandre el Gran · 356–323 a.C.", cell: [4, 0],
      perfil: "Agressiu", soph: "Bàsic", ciutat: "Nova York",
      ter: "~0,16%", retorn: "8–10%", risc: "Alt",
      sub: "Màxima RV global indexada, sense alternatius.",
      rationale: "Màxima RV global indexada, sense alternatius complexos. La simplicitat com a avantatge.",
      diff: "Tot creixement indexat: sense crypto ni il·líquids que no s'entenguin.",
      alloc: [["rv_global",60],["rv_growth",22],["rv_emergent",10],["rf_gov_curt",4],["cash",4]] },
    { id: "maxim", nom: "Màxim creixement", ep: "Marc Aureli · 121–180 d.C.", cell: [4, 2],
      perfil: "Agressiu", soph: "Avançat", ciutat: "Xangai",
      ter: "~0,34%", retorn: "8–11%", risc: "Molt alt",
      sub: "Cap RF. La liquiditat és munició.",
      rationale: "Cap RF: la liquiditat és l'únic element líquid, pura munició per al Radar d'Oportunitats.",
      diff: "Sense component defensiu de RF: el cash és l'única pólvora seca, deliberadament.",
      alloc: [["rv_global",40],["rv_growth",15],["rv_emergent",10],["or_metalls",5],["crypto",10],["crowd_pe",15],["cash",5]] }
  ];

  /* GRID[bandaRisc][soph] -> id arquetip (null = no existeix, es baixa de soph) */
  var GRID = [
    ["preservacio",       "preservacio_div", null],
    ["coixi",             "conservador_div", "conservador_sof"],
    ["equilibri_simple",  "equilibrat",      "multiactiu"],
    ["creixement_simple", "dinamic_div",     "dinamic_alt"],
    ["totindex",          null,              "maxim"]
  ];

  /* Compatibilitat: arquetips antics -> nous (clients ja existents) */
  var ALIES_ANTICS = {
    estoic: "maxim", explorador: "dinamic_alt", navegant: "equilibrat", arquitecte: "multiactiu",
    tresorer: "preservacio_div", cronista: "conservador_div", alquimista: "dinamic_alt",
    eremita: "coixi", pionier: "maxim", renda: "equilibrat"
  };

  /* ---------- 4) SCORING ---------- */
  function _sumEix(ans, eix) {
    var s = 0, n = 0;
    for (var i = 0; i < PREGUNTES.length; i++) {
      var q = PREGUNTES[i];
      if (q.eix === eix && q.type === "choice") {
        var v = ans[q.id];
        if (typeof v === "number" && v >= 1 && v <= 4) { s += v; n++; }
      }
    }
    return { suma: s, n: n };
  }
  function _norm(suma, n) {
    if (n <= 0) return 0;
    var v = ((suma - n) / (3 * n)) * 100;
    return Math.max(0, Math.min(100, Math.round(v)));
  }
  var LLINDARS_RISC = [20, 38, 55, 72];
  function _bandaRisc(risc) {
    for (var i = 0; i < LLINDARS_RISC.length; i++) { if (risc < LLINDARS_RISC[i]) return i; }
    return 4;
  }
  function _nivellSoph(con) {
    if (con >= 70) return 2;
    if (con >= 40) return 1;
    return 0;
  }
  function _getArquetipById(id) {
    if (id && ALIES_ANTICS[id]) id = ALIES_ANTICS[id];
    for (var i = 0; i < ARQUETIPS.length; i++) { if (ARQUETIPS[i].id === id) return ARQUETIPS[i]; }
    return null;
  }
  function _resolCella(banda, soph) {
    var s = soph;
    while (s >= 0 && !GRID[banda][s]) s--;
    if (s < 0) s = 0;
    return GRID[banda][s];
  }
  function _nivellPreferit(obertura) {
    if (obertura >= 4) return 2;
    if (obertura >= 3) return 1;
    return 0;
  }

  function calcPerfil(ans) {
    ans = ans || {};
    var cap = _sumEix(ans, "capacitat");   // B1,B2,B3,C1,C2,edat
    var capacitat = _norm(cap.suma, cap.n);
    var tol = _sumEix(ans, "tolerancia");
    var tolerancia = _norm(tol.suma, tol.n);
    var con = _sumEix(ans, "coneixement");
    var coneixement = _norm(con.suma, con.n);
    var risc = Math.min(capacitat, tolerancia);
    var banda = _bandaRisc(risc);
    var soph = _nivellSoph(coneixement);
    var arqId = _resolCella(banda, soph);
    var arq = _getArquetipById(arqId);
    var obertura = (typeof ans.E1 === "number") ? ans.E1 : 1;
    var esg = (typeof ans.E2 === "number") ? ans.E2 : 1;
    return {
      capacitat: capacitat, tolerancia: tolerancia, coneixement: coneixement,
      risc: risc, banda: banda, soph: soph,
      bandaNom: ["Defensiu", "Conservador", "Moderat", "Dinàmic", "Agressiu"][banda],
      sophNom: ["Bàsic", "Mitjà", "Avançat"][soph],
      arquetipId: arqId, arquetip: arq, obertura: obertura, esg: esg,
      capatPerConeixement: (soph < _nivellPreferit(obertura))
    };
  }

  function allocDetall(arq) {
    if (!arq) return [];
    var out = [];
    for (var i = 0; i < arq.alloc.length; i++) {
      var id = arq.alloc[i][0], pct = arq.alloc[i][1], a = ACTIUS[id] || {};
      out.push({ id: id, nom: a.nom || id, pct: pct, color: a.color || "#999",
                 mu: a.mu, sigma: a.sigma, grup: a.grup, seguiment: a.seguiment });
    }
    return out;
  }
  function totalsPerGrup(arq) {
    var t = { rv: 0, rf: 0, alt: 0, cash: 0 }, d = allocDetall(arq);
    for (var i = 0; i < d.length; i++) {
      var g = d[i].grup || "altres";
      if (t[g] === undefined) t[g] = 0;
      t[g] += d[i].pct;
    }
    return t;
  }

  /* ---------- 5) ADAPTADOR PER A LA PLATAFORMA ----------
     Retorna ARQUETIPS_CARTERES amb la forma que espera platform.html.
     Mapeja cash->liquiditat i crowd_pe->crowdlending (ids de la taxonomia). */
  var ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII"];
  function _actiuPlataforma(id, pct) {
    if (id === "cash")     return { id: "liquiditat",  nom: "Liquiditat · Compte remunerat", pct: pct, color: "#90A4AE" };
    if (id === "crowd_pe") return { id: "crowdlending", nom: "Crowdlending / P2P",            pct: pct, color: "#D4943A" };
    var a = ACTIUS[id] || {};
    return { id: id, nom: a.nom || id, pct: pct, color: a.color || "#999" };
  }
  function arquetipsPlataforma() {
    return ARQUETIPS.map(function (a, i) {
      var banda = a.cell[0], soph = a.cell[1];
      var actius = a.alloc.map(function (p) { return _actiuPlataforma(p[0], p[1]); });
      var dims = [3 + banda * 2, 5 + Math.round(banda * 0.8), 3 + banda * 2,
                  3 + soph * 3, 3 + banda * 2, 3 + banda * 2,
                  2 + soph * 3 + (banda >= 3 ? 1 : 0)]
        .map(function (x) { return Math.max(1, Math.min(11, x)); });
      return {
        id: a.id, nom: a.nom, ep: a.ep,
        cartNom: a.ciutat, cartRoma: ROMAN[i] + " · " + a.ciutat, cartSub: a.sub,
        rationale: a.rationale, diff: a.diff,
        actius: actius,
        ter: a.ter, retorn: a.retorn, risc: a.risc,
        riscClass: (banda >= 3 ? "amber" : "green"),
        dims: dims
      };
    });
  }

  /* ---------- 6) ADAPTADORS PER A L'ONBOARDING ----------
     preguntesOnboarding(): forma {type,id,dim,dn,text,opts:[{sym,lbl,txt,s}]}
     arquetipsOnboarding(): forma de l'objecte `ar` que espera buildResult */
  var SYM4 = ["I", "II", "III", "IV"];
  /* dn de visualització (radar 7 eixos): 1 Objectius·2 Situació·3 Horitzó·4 Coneixement·5 Risc fin.·6 Risc em.·7 Preferències */
  var DN_MAP = { edat:2, A1:4, A2:4, A3:4, B1:2, B2:2, B3:2, C1:1, C2:3, D1:5, D2:6, D3:6, E1:7, E2:7 };
  function preguntesOnboarding() {
    var arr = PREGUNTES.map(function (q) {
      if (q.type === "text") {
        return { type: "text", id: q.id, dim: q.dim, dn: 0, text: q.text,
                 isEmail: (q.id === "email"),
                 ph: (q.id === "email") ? "exemple@correu.com" : "El teu nom" };
      }
      var opts = q.opts.map(function (o, i) {
        return { sym: SYM4[i] || String(i + 1), lbl: o.lbl, txt: o.txt, s: o.s };
      });
      return { type: "choice", id: q.id, dim: q.dim, dn: (DN_MAP[q.id] || 1), text: q.text, opts: opts };
    });
    arr.push({ type: "result", id: "result", dim: "Resultat", dn: 10 }); // pas final -> pantalla de resultats
    return arr;
  }

  var FACTORS_D9 = ["Sense alternatius complexos · només índexs",
                    "Alternatius líquids moderats (or, REITs)",
                    "Inclou il·líquids i, si escau, una pinzellada de crypto"];
  var ACCENT_BANDA = ["#7FA8D4", "#6FB89A", "#D8B24A", "#E0954A", "#D45A4A"];
  function _inicials(nom) {
    return nom.split(" ").map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
  }
  /* Emblema il·lustratiu: corba de "mercat" amb volatilitat segons banda de risc + monograma */
  function emblemaSVG(banda, accent, ini) {
    var amp = 5 + banda * 6, rise = 26 + banda * 17, y0 = 152, pts = [];
    for (var i = 0; i <= 6; i++) {
      var x = 12 + i * 19.3;
      var trend = y0 - (rise * i / 6);
      var noise = (i === 0 || i === 6) ? 0 : ((i % 2 === 0 ? -1 : 1) * amp);
      pts.push(x.toFixed(1) + "," + (trend + noise).toFixed(1));
    }
    return '<svg viewBox="0 0 140 190" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">' +
      '<rect width="140" height="190" fill="#0A0A0A"/>' +
      '<circle cx="70" cy="58" r="80" fill="' + accent + '" fill-opacity="0.16"/>' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + accent + '" stroke-width="2" stroke-opacity="0.85" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<text x="70" y="108" text-anchor="middle" font-family="Playfair Display, Georgia, serif" font-size="48" fill="' + accent + '" fill-opacity="0.18">' + ini + '</text>' +
      '</svg>';
  }
  function arquetipsOnboarding() {
    return ARQUETIPS.map(function (a, i) {
      var soph = a.cell[1], banda = a.cell[0];
      var alloc = a.alloc.map(function (p) {
        var x = _actiuPlataforma(p[0], p[1]);
        return { n: x.nom, p: x.pct };
      });
      var dims = [3 + banda * 2, 5 + Math.round(banda * 0.8), 3 + banda * 2,
                  3 + soph * 3, 3 + banda * 2, 3 + banda * 2,
                  2 + soph * 3 + (banda >= 3 ? 1 : 0)]
        .map(function (x) { return Math.max(1, Math.min(11, x)); });
      return {
        id: a.id, nom: a.nom, ep: a.ep,
        lema: a.diff, desc: a.rationale,
        cartera: ROMAN[i] + " · " + a.ciutat, cartDesc: a.sub, perfil: a.perfil,
        accent: ACCENT_BANDA[banda],
        emblema: emblemaSVG(banda, ACCENT_BANDA[banda], _inicials(a.nom)),
        alloc: alloc, ter: a.ter, retorn: a.retorn, risc: a.risc,
        factorsD8: "Perfil " + a.perfil + " · horitzó i situació segons les respostes.",
        factorsD9: FACTORS_D9[soph],
        criteris: "Risc " + a.perfil + " (mínim de capacitat i tolerància) amb porta de coneixement " + a.soph + ".",
        dims: dims
      };
    });
  }

  return {
    ACTIUS: ACTIUS, PREGUNTES: PREGUNTES, ARQUETIPS: ARQUETIPS, GRID: GRID,
    ALIES_ANTICS: ALIES_ANTICS,
    calcPerfil: calcPerfil, allocDetall: allocDetall, totalsPerGrup: totalsPerGrup,
    getArquetip: _getArquetipById, arquetipsPlataforma: arquetipsPlataforma,
    preguntesOnboarding: preguntesOnboarding, arquetipsOnboarding: arquetipsOnboarding
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = TBI_PERFIL; }
