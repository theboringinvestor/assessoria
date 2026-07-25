# Desplegar els canvis a theboringinvestor/assessoria

Res del que hem fet aquestes sessions és al repo encara. Aquests són els fitxers
que cal copiar-hi i pujar.

## 1. Fitxers a copiar

**Nous** (cap existeix avui al repo):

```
tbi-cartera.js
tbi-hipoteca.js
tbi-fiscal.js
tbi-fire.js
calculadora-hipoteca.html
```

**Modificats** (sobreescriuen els actuals):

```
platform.html
tbi-app.html
sitemap.xml
sw.js
```

**Sense tocar**: `tbi-perfil.js`, `index.html`, `manifest.webmanifest` i la resta.

## 2. Ordre de còpia i push

```bash
cd ~/on/tinguis/assessoria     # el teu clon del repo
git pull

# copia els 9 fitxers de la carpeta de sortida aquí dins

git add tbi-cartera.js tbi-hipoteca.js tbi-fiscal.js tbi-fire.js \
        calculadora-hipoteca.html
git add platform.html tbi-app.html sitemap.xml sw.js

git status          # comprova que hi surten 9 fitxers i cap més
git commit -m "Motor de cartera compartit, hipoteca, fiscalitat i FIRE v2"
git push
```

Recorda: **push per terminal**, mai per l'editor web de GitHub — trunca
`platform.html`, que fa 1,5 MB.

Després del push, GitHub Pages triga 1–2 minuts. Refresca amb `Ctrl+Shift+R`
(o `Cmd+Shift+R`).

## 3. Comprovacions després de pujar

Obre la consola del navegador a `platform.html`. Han de sortir cinc línies:

```
[TBI_CARTERA] v2026-07-25 carregat · 25 categories
[TBI_PERFIL] v... carregat · 13 arquetips
[TBI_HIPOTECA] v2026-07-25 carregat
[TBI_FISCAL] v2026-07-25 carregat · exercici 2026
[TBI_FIRE] v2026-07-25 carregat
```

Si en falta cap, aquell fitxer no s'ha pujat i la pàgina fallarà en silenci.

A `tbi-app.html` n'han de sortir tres: `TBI_CARTERA`, `TBI_FISCAL`, `TBI_FIRE`.

**Què has de veure diferent a l'app:**

- Sparkline darrere el valor total (només si tens ≥3 snapshots mensuals)
- «Rendiment anual» amb la TIR, o «Rendiment acumulat» si hi ha <6 mesos d'històric
- Targeta blanca de coherència amb un número sobre 100
- Targeta «Cost real de la teva cartera» amb el TER contra l'1,80% del banc
- A Aportar: pastilles ok/infra/sobre i «banda ±X pp» a cada categoria

**Què has de veure diferent a la plataforma:**

- Menú: «Hipoteca i deute» i «Fiscalitat» (abans «Calculadora fiscal»)
- Cartera → Resum: targeta de cost real i «Rendiment anual (TIR)»
- Cartera → Matching: barra de coherència i columna «Banda»
- Pla d'aportacions: selector Acumular / Retirar
- Fiscalitat: cinc pestanyes
- FIRE: els objectius pujaran força (SWR dinàmica + impostos + inflació)

## 4. Ja fet, no cal tocar res

La migració de Supabase (`hipoteques` JSONB a `clients`) ja està aplicada al
projecte `nvcmwhzcskihgktltavm`. Verificat: 11 clients, tots amb array vàlid.

## 5. Abans de comunicar-ho als clients

Els números de rendiment i els objectius FIRE canviaran. Val la pena avisar-ho:

- El **rendiment anual** passa de CAGR a TIR. Pujarà, perquè el càlcul antic
  assumia que tot el capital havia entrat el primer dia.
- L'**objectiu FIRE** pujarà entre un 10% i un 47% segons l'edat de jubilació.
  El càlcul antic assumia 30 anys de retirada, cap impost i cap inflació.

## 6. Fitxers que NO s'han de pujar

Tota la resta de la carpeta de sortida són eines de desenvolupament:
`test_*.js`, `patch_*.py`, `adaptadors_cartera.js`, `retirades_v1.js`,
`render_retirades.js`, `portal_*.js`, `app_cartera_v2.js`, `motor_v3_block.js`,
`kpis_v3.js`, `matching_v3.js`, `render_*.js`.

Els tests els pots guardar en una carpeta `tests/` del repo si vols poder
reexecutar-los, però no fan cap falta en producció.
