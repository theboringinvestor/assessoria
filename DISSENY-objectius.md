# Arquitectura d'objectius · FIRE ↔ pla ↔ cartera

Disseny per lligar els objectius financers amb el full de ruta i la cartera, i
fer-los arribar a l'app. Sessió del 26 de juliol de 2026, sobre el commit
`bf95168`.

---

## 1. D'on venim

Els objectius viuen avui en tres llocs que no es parlen.

| On | Forma | Qui hi escriu |
|---|---|---|
| `perfil.objectius[]` | `{nom, import, horitzo}` | Fitxa del client |
| `fullderuta.objectius[]` | `{titol, meta, import, termini:"5 anys"}` | Editor del Full de Ruta |
| `clients.fire` | snapshot de la calculadora | Vista FIRE del portal |

`fireVincularRuta()` copia el resultat de la calculadora dins de
`fullderuta.objectius` com a text congelat. És unidireccional, manual i es
desactualitza el mateix dia que canvia qualsevol input.

### Les tres incoherències

**La cartera no sap que hi ha objectius.** `cartera_target_custom` surt de
l'arquetip MiFID aplicat en abstracte. Un objectiu a 3 anys i el FIRE a 20
comparteixen la mateixa exposició a renda variable. És el forat gros: els
diners que fan falta aviat no poden dependre d'una recuperació que no tindrà
temps de passar.

**El FIRE no sap què hi ha a la cartera.** `retornEsperat` és un número escrit
a mà. A la base de dades hi ha un **13,5%**. Cap barreja realista d'actius
indexats s'hi acosta: la barreja més agressiva del glidepath (92% RV) n'espera
un 6,5% nominal descomptat el TER. Amb el supòsit inflat, el càlcul diu **9,3
anys**; amb el rendiment que la cartera pot sostenir de veritat, en surten
**24,9**. No és un detall d'afinament: és la diferència entre jubilar-se als 47
o als 63.

**Res no suma.** Ningú comprova que el capital reclamat pels objectius càpiga a
la cartera, ni que les aportacions assignades càpiguen a l'aportació real.

---

## 2. El model: sobres virtuals

Una sola cartera real. Cada objectiu reclama un tros del capital i un tros de
l'aportació mensual. El client segueix tenint un broker i una cartera; els
sobres són una capa de comptabilitat, no d'operativa.

```
Cartera real 185.000 €  ·  aportació 1.600 €/mes
├── Fons d'emergència    14.000 € el 2027   →  9.000 €  ·  200 €/mes
├── Entrada del pis      60.000 € el 2030   → 20.000 €  ·  400 €/mes
└── FIRE (residual)     900.000 € el 2046   → 156.000 € · 1.000 €/mes
                                               ─────────   ──────────
                                               185.000 €    1.600 €/mes
```

L'objectiu marcat `residual` — normalment el FIRE — absorbeix el que no reclama
ningú. Així la suma quadra sempre i no cal que l'assessor faci d'àbac.

**Per què això i no subcarteres reals:** subcarteres per objectiu multipliquen
posicions, rebalancejos i cost fiscal per una precisió que el client no notarà.
Els sobres donen el 90% del valor amb el 10% de la complexitat operativa.

---

## 3. El glidepath: cada sobre amb el risc del seu horitzó

Cada objectiu té la barreja que li correspon pel temps que li queda:

| Horitzó | RV | RF | Liquiditat |
|---|---|---|---|
| < 1 any | 0% | 0–15% | 85–100% |
| 2 anys | 12% | 33% | 55% |
| 3 anys | 25% | 50% | 25% |
| 5 anys | 45% | 47% | 8% |
| 8 anys | 65% | 32% | 3% |
| 12 anys | 80% | 19% | 1% |
| 20 anys | 92% | 8% | 0% |
| 30 anys | 95% | 5% | 0% |

Entremig s'interpola. **El sostre de l'arquetip MiFID mana sempre**: si el
perfil no admet més d'un 40% de RV, l'excés baixa a renda fixa encara que
l'horitzó en permeti més. Mai més risc del que el perfil aguanta, mai més risc
del que l'horitzó aguanta.

### La cartera target passa a ser derivada

```
target proposada = Σ (pes del sobre × barreja del seu horitzó ∩ sostre arquetip)
```

Es proposa al Full de Ruta amb el detall de qui demana què. Tu l'aproves o la
sobreescrius — l'override existent es manté i queda traçat qui va decidir.

La reescalada **preserva les categories i les proporcions internes** que hagis
triat: si tens RV Global i RV Emergent en proporció 55/10, la mantenen; només
canvia el pes del bloc. Els alternatius (il·líquids, decisió deliberada) no es
toquen mai.

---

## 4. Esquema de dades

`fullderuta.objectius[]` v2. Retrocompatible: el motor llegeix el format antic
i el migra en memòria.

```js
{
  id: 'obj_fire_1',            // estable, per referenciar-lo des de la cartera
  tipus: 'fire',               // fire | habitatge_compra | emergencia | ...
  titol: 'Independència financera (FIRE)',
  icona: '<svg…>',
  meta: 'Regular FIRE · retirada 4,12%',
  import: 900000,              // EUROS D'AVUI
  dataObjectiu: '2046-07-01',  // ISO · substitueix termini:"20 anys"
  prioritat: 'essencial' | 'important' | 'desitjable',
  capitalAssignat: 156000,     // € de la cartera real
  aportacioAssignada: 1000,    // €/mes
  residual: true,              // absorbeix el sobrant (només un)
  flexible: true,              // la data es pot moure
  estat: 'actiu' | 'assolit' | 'pausat',
  termini: '20 anys'           // el text original, no es perd
}
```

**Tot en euros d'avui.** Rendiment sempre descomptada la inflació, com fa
`TBI_FIRE`. Barrejar imports en euros d'avui amb creixement nominal és l'error
que fa semblar viables tots els plans.

### Migració

No cal DDL: `fullderuta` ja és JSONB. `normalitza()` fa la conversió en
memòria cada cop que es llegeix, i la forma nova es persisteix el primer cop
que l'assessor desa el Full de Ruta. Els camps derivats (`termini` de text →
`dataObjectiu`) es converteixen amb un parser que entén `"5 anys"`, `"18
mesos"`, `"2031"` i `"juny 2031"`.

Els objectius sense data ni import no s'inventen: es marquen com a incomplets
perquè els acabis d'omplir.

---

## 5. El motor · `tbi-objectius.js`

Funcions pures, ES5, sense DOM ni Supabase. Mateix patró que `tbi-fire.js` i
`tbi-cartera.js`, i els dos hosts hi deleguen. 96 tests a `test_objectius.js`.

| Funció | Què fa |
|---|---|
| `normalitza(obj)` | Migra i completa un objectiu. No perd camps desconeguts |
| `mixPerHoritzo(anys, pctRvMax)` | Barreja RV/RF/cash del glidepath, retallada pel perfil |
| `retornMix(mix, opts)` | Rendiment nominal i real esperat. El host hi pot passar els seus μ |
| `assignacio(objs, ctx)` | Reparteix capital i aportació. Detecta sobreassignació |
| `projeccio(obj, ctx)` | On arribarà, quant falta, quina aportació ho tancaria, data projectada |
| `carteraProposada(objs, ctx)` | La barreja ponderada amb el detall de qui demana què |
| `aplicaATarget(target, blend)` | Reescala la target existent preservant categories i proporcions |
| `coherencia(ctx)` | Puntuació + llista del que no lliga |
| `desDeFire(fire)` / `capAFire(obj)` | Pont bidireccional amb la calculadora |
| `repartirAportacio(objs, import)` | Els 500 € d'aquest mes, per objectiu |

### Els avisos de coherència

| Codi | Gravetat | Quan salta |
|---|---|---|
| `capital_sobreassignat` | alta | Els sobres reclamen més del que hi ha |
| `aportacio_sobreassignada` | alta | Idem amb l'aportació mensual |
| `cobertura_segura_insuficient` | alta | No hi ha prou € fora de borsa per als sobres propers |
| `curt_sense_capital` | alta | Objectiu a < 3 anys sense diners apartats |
| `retorn_optimista` | alta | El rendiment del FIRE no el sosté cap barreja |
| `fora_ruta` | alta/mitjana/baixa | El ritme actual no hi arriba (baixa si és flexible) |
| `fire_descordat` | mitjana | Calculadora i full de ruta diuen imports diferents |
| `target_desalineada` | mitjana | La cartera no reflecteix el que demanen els objectius |
| `sense_residual` | mitjana | Hi ha capital que no pertany a cap objectiu |
| `sense_assignacio` | mitjana | L'objectiu no té ni capital ni aportació: no està configurat |
| `sense_data` / `sense_import` | mitjana | Objectiu incomplet |
| `fire_ranci` | baixa | Fa més de 9 mesos que no es recalcula |
| `just` | baixa | Cobertura entre el 90% i el 100% |

**`cobertura_segura_insuficient` mereix una nota.** La primera versió comparava
el % de RV de tota la cartera amb el sostre de l'objectiu més proper, i
castigava una cartera agressiva encara que el fons d'emergència hi pesés un 5%
i estigués perfectament cobert. La regla bona compara euros: suma el que cada
sobre necessita fora de renda variable i ho contrasta amb el que la cartera
té de veritat en RF i liquiditat.

---

### Provat contra dades reals

El motor s'ha passat pel client `gpuigreig@gmail.com` tal com està a Supabase
ara mateix, i hi ha trobat coses que els tests sintètics no haurien vist:

- L'objectiu `"EN 10 ANYS"` es migra bé a `2036-07-25`.
- És de tipus `lliure`, per tant **no residual**: els 185.750 € de la cartera
  no pertanyen a cap objectiu i el motor ho canta.
- La target **no té cap línia de renda fixa**. La barreja en demana un 26% i no
  hi ha on posar-lo. El motor ho reubica a liquiditat i avisa amb
  `grups_sense_cabuda: ['rf']`, però la decisió de fons és teva: o s'hi afegeix
  una línia de RF, o s'assumeix que aquesta cartera no en porta.

Dos defectes del motor van sortir precisament d'aquesta prova, i cap dels dos
hauria aparegut amb dades inventades:

1. **Els alternatius s'inflaven.** En renormalitzar la target al final, els
   il·líquids que havien de quedar intactes pujaven per tapar el forat de la
   renda fixa inexistent: crypto 10% → 12,2%. Ara el quadrament només toca el
   que no és alternatiu.
2. **Un objectiu sense configurar es marcava "fora de ruta"**, amb un
   *"caldrien 7.006 €/mes"* que amagava el problema real: que no tenia ni un
   euro assignat. Ara té avís propi.

També cal dir-ho: **`test_convergencia.js` està trencat al repositori**. Té una
ruta absoluta d'una sessió antiga (`/sessions/funny-amazing-bardeen/...`) i peta
en arrencar. No té res a veure amb això, però convé arreglar-ho.

---

## 6. Què canvia a cada lloc

### `platform.html` · Full de Ruta

L'editor d'objectius passa de 4 camps de text a la fitxa completa: data amb
selector, prioritat, capital i aportació assignats, i un interruptor de
residual. A sota, un panell de coherència amb la puntuació i els avisos
ordenats per gravetat, i la cartera proposada amb el botó d'aplicar-la a la
target (amb el diff abans/després).

### `platform.html` · Calculadora FIRE

Els inputs deixen de ser camps lliures amb fallbacks encadenats:

- `capitalActual` i `aportacioMensual` → del sobre residual, no escrits a mà
- `retornEsperat` → de `retornMix()` sobre la barreja real, amb el valor
  manual disponible com a override explícit i visible
- El resultat escriu de tornada l'objectiu FIRE via `desDeFire()`, i el
  vincle deixa de ser un botó manual

### `tbi-app.html` · pestanya Objectius

Cinquena pestanya. Per objectiu: anella de progrés, capital assignat sobre
import, data projectada contra data objectiu, i un estat en llenguatge planer
(*en ruta* / *just* / *no hi arriba*). Sense jargó de barreges ni de SWR.

### `tbi-app.html` · Aportar

L'aportació es reparteix primer per objectiu i després per actiu, encadenant
`repartirAportacio()` amb el `TBI_CARTERA.matching()` que ja hi ha. El client
passa de "500 € a RF Corp" a "300 € cap al pis, 200 € cap al FIRE — i dins
d'això, RF Corp".

---

## 7. Ordre d'implementació

| Fase | Què | Estat |
|---|---|---|
| 0 | Motor `tbi-objectius.js` + `test_objectius.js` | **fet** · 103/103 |
| 1 | Editor d'objectius al Full de Ruta + panell de coherència | pendent |
| 2 | FIRE bidireccional amb inputs derivats de la cartera | pendent |
| 3 | Cartera proposada amb aprovació i diff | pendent |
| 4 | Pestanya Objectius a l'app | pendent |
| 5 | Repartiment de l'aportació per objectiu | pendent |

Les fases 1–3 toquen `platform.html` i poden anar en un sol desplegament. Les
4–5 toquen l'app i en volen un altre, perquè el client no ha de veure objectius
a mig configurar.

---

## 8. Decisions pendents

**Un sol residual o diversos.** Ara només se n'admet un. Si algun dia hi ha un
client amb dos objectius igualment oberts, caldrà repartir el sobrant en
proporció a l'import.

**Els μ per grup.** El motor porta uns valors per defecte (RV 7%, RF 3,2%,
cash 2%) que el host pot sobreescriure. `platform.html` ja té una taula
d'actius amb μ i σ per categoria: val la pena connectar-la perquè no hi hagi
dos jocs de supòsits.

**`perfil.objectius[]`.** La fitxa segueix tenint la seva llista d'objectius,
que ara duplica la del full de ruta. O es converteix en la font d'entrada que
alimenta el full de ruta, o s'elimina. Deixar-les totes dues és tornar al
problema d'avui.

**Llenguatge regulatori.** Els avisos de coherència diuen coses com "caldrien
420 €/mes". Mentre no hi hagi registre CNMV, convé revisar que el to sigui
d'anàlisi i no de recomanació personalitzada.
