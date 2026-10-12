# Z poľa domov

Slovenská aplikácia na rodokmeň a genealogický výskum. Zobrazuje predkov a príbuzných vybranej osoby, eviduje rodičovské, partnerské a súrodenecké väzby, rozlišuje adopciu, uchováva zdroje a neistoty. Podporuje pridávanie a úpravy osôb, hľadanie, export a kontrolovaný import JSON záloh.

## Spustenie

Vyžaduje Node.js 22 alebo novší. V tomto prostredí je overený Node.js 24.

```sh
cd /workspace/zpoledomu
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --port 3000 --strictPort
```

Bez počiatočných údajov sa otvorí prázdny rodokmeň. Zálohu možno importovať vo webovom rozhraní. Voliteľný lokálny súbor načíta vývojový server pri prvom otvorení v prehliadači:

```sh
GENEALOGY_DATA_FILE=/workspace/genealogia-private/rodokmen.json npm run dev -- --port 3000 --strictPort
```

Rodinné údaje sú uložené mimo Git repozitára. Premenná obsahuje len lokálnu cestu; osobné údaje ani dokumenty nevkladajte do zdrojových súborov. Vývojový server poskytuje tento voliteľný súbor cez `/api/family` iba v režime `dev`. Aplikácia nemá prihlasovanie; prístup k vývojovému serveru preto patrí iba oprávneným používateľom. Verejné nasadenie s rodinnými údajmi vyžaduje samostatné riešenie prístupu.

Zmeny sa ukladajú do `localStorage` daného prehliadača a pôvodu. Nejde o synchronizáciu s pôvodným súborom ani medzi zariadeniami. Exportujte zálohy, najmä pred zmenou prehliadača, importom alebo vymazaním údajov. Poškodené uložené údaje sa neprepisujú automaticky; obnovenie je možné importom platnej zálohy.

Produkčný build neobsahuje súkromný vstupný súbor ani dátový server. V statickej verzii importujte JSON zálohu v prehliadači.

## Samostatný HTML rodokmeň

Statický náhľad samotného vývojového `index.html` nevie spracovať JSX ani načítať balíky. Pre takýto náhľad alebo otvorenie na vlastnom počítači vytvorte jeden HTML súbor so všetkým JavaScriptom, štýlmi a voliteľnými rodinnými údajmi:

```sh
npm run standalone -- --data /workspace/genealogia-private/rodokmen.json --out /workspace/genealogia-private/rodokmen.html
python3 tests/standalone_smoke.py /workspace/genealogia-private/rodokmen.html
```

Súbor nepotrebuje Vite, API ani internet na zobrazenie rodokmeňa. Výstup s rodinnými údajmi musí zostať mimo Git repozitára. Možno ho stiahnuť a otvoriť v bežnom prehliadači; cloudový testovací Chromium blokuje priame `file:` adresy, preto sa kontroluje cez dočasný server poskytujúci iba tento dokument. Test zahŕňa aj izolovaný rámec bez prístupu k úložisku.

V izolovanom náhľade môže byť ukladanie prehliadača zakázané. Aplikácia to označí a umožní úpravy v pamäti; pred zatvorením použite export. Po aktualizácii výskumného vstupu HTML znovu vygenerujte. Existujúce úpravy prehliadača sa tým nesynchronizujú ani automaticky nenahrádzajú.

## Kontroly

```sh
npm test
npm run build
python3 tests/browser_smoke.py
```

Jednotkové testy kontrolujú rodinné väzby, cykly v pôvode, adopcie, dátumy, citácie, import a odstraňovanie. Test prehliadača vyžaduje bežiaci server na porte 3000, Python Playwright a Chromium, ktoré sú v tomto cloudovom prostredí dostupné. Používa izolovaný prehliadač a fiktívne dáta; skutočný rodinný súbor nemení. Voliteľne nastavte `TEST_BASE_URL` a `CHROMIUM_PATH`.

## Výskum a dôkazy

Rodinné podanie sa zaznamenáva ako **NEOVERENÉ**. Doložený údaj alebo záver vyžaduje zdroj; neisté priezviská, rodiská a roky patria do poznámok. Adoptívne väzby sa neprepisujú na biologické. Rovnomenné osoby majú rozdielne ID. Informačná stránka archívu nevytvára dôkaz o konkrétnej osobe.

Súkromný výskumný záznam, história opráv, denník a získané podklady sú v `/workspace/genealogia-private`, mimo checkoutu. Na ďalšie pátranie treba konkrétne miesto, obdobie a podľa prameňa vierovyznanie. Prístup k živým matrikám a archívnym snímkam sa riadi podmienkami ich správcov.
