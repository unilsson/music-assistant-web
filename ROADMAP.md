# Music Assistant Web – Roadmap

Det här dokumentet samlar produktidéer, planerade funktioner och designprinciper för **Music Assistant Web**.

Målet är inte att kopiera hela Music Assistant-, Tidal- eller Spotify-gränssnittet. Appen ska i stället vara ett mycket enklare och modernare lager ovanpå Music Assistant, med fokus på snabb vardagsanvändning och en UI som även fungerar för personer som inte vill hantera ett avancerat musiksystem.

> **Grundprincip:** välj spelare → välj musik eller radio → spela.

---

## Nuvarande status

### Sprint 1 – Backend

Klart.

- Express/TypeScript-backend
- kommunikation med Music Assistant API
- Music Assistant-token hålls på serversidan
- grundläggande API-lager för frontend

### Sprint 2 – Frontend dashboard

Klart.

- React/Vite/TypeScript
- enkel modern layout
- spelare från Music Assistant
- grundläggande status och styrning

### Sprint 3 – Player UI

Klart.

- vald spelare sparas lokalt i webbläsaren
- previous/current/next-preview för musik
- previous/next-kontroller
- live progress
- faktisk volym
- kompakt header/footer

### Sprint 4 – Radio

Klart och mergat till `main`.

- Music / Radio som toppnivånavigation
- vald spelare delas mellan Music och Radio
- dedikerad radio-player
- stationens artwork och namn
- LIVE-status endast när radion faktiskt spelar
- metadata för aktuell radiosändning
- riktig Stop för live-radio
- ingen previous/next/progress för live-radio
- volymkontroll
- stoppad radio behåller senaste stationen synlig
- Play startar om samma sparade `library://radio/...`-URI
- dynamiska radiogenrer från Music Assistant
- `Alla` först och `Övriga` sist
- stationer kan tillhöra flera genrer
- valt genre-filter sparas i `localStorage`
- fallback-artwork med enkel broadcast/radio-ikon
- frontend får bara starta `library://radio/...`-URI:er, inte godtyckliga externa URL:er

---

# Sprint 5 – Musik

Nästa stora steg är att göra musikdelen användbar utan att försöka återskapa hela Music Assistant-gränssnittet.

## Sprint 5A – Musikhem + spellistor

Första versionen bör ha en mycket enkel startvy:

```text
Musik

[ 🔍 Sök efter artist, album, låt... ]

┌────────────────────┐   ┌────────────────────┐
│ ♥ Favoriter        │   │ ♫ Spellistor       │
└────────────────────┘   └────────────────────┘
```

### Spellistor

- visa Music Assistant-spellistor som enkla kort
- klick på spellista öppnar spåren
- stor knapp för `Spela`
- gärna `Blanda`
- klick på en enskild låt spelar den
- första versionen kan låta Play ersätta aktuell kö

Vi undviker initialt avancerade queue-funktioner som "play next" och "add to queue".

## Sprint 5B – Favoriter

Favoriter kan grupperas i enkla sektioner eller tabs:

- Låtar
- Album
- Artister
- Spellistor

Visa bara kategorier som faktiskt innehåller något.

## Sprint 5C – Sök

En stor central sökruta som söker via Music Assistant över anslutna providers, till exempel Tidal.

Resultaten grupperas i:

- Låtar
- Album
- Artister
- Spellistor

Frontend ska inte behöva känna till detaljer om Tidal eller andra providers. Music Assistant är abstraheringslagret.

## Sprint 5D – Album- och artistvyer

### Album

Exempel:

```text
← Tillbaka

[ omslag ]  Kind of Blue
            Miles Davis
            1959

            [ ▶ Spela album ]

1  So What                   9:22
2  Freddie Freeloader        9:46
...
```

### Artist

En enkel artistsida kan innehålla:

- artistnamn
- Play
- album
- populära eller utvalda låtar

Målet är fortfarande enkel navigation, inte en fullständig katalogbrowser.

---

# Radiofynd

En särskilt värdefull funktion är att kunna spara en låt som just hörs på radio.

I radio-playern kan vi lägga till:

```text
♡ Spara låten
```

eller senare en kompakt kontrollrad:

```text
[ ♥ ]   [ ⓘ ]   [ ■ ]
```

- ♥ = spara som Radiofynd
- ⓘ = visa information om artist/låt
- ■ = stoppa radion

## Tänkbar arbetsgång

```text
ICY/radiometadata
      ↓
normalisera artist + titel
      ↓
sök Music Assistant / Tidal
      ↓
poängsätt kandidater
      ↓
spara bästa träffen i spellistan "Radiofynd"
```

Matchningen bör bland annat kunna normalisera:

- `&` kontra `and`
- `feat.` / `featuring`
- parenteser
- versaler/gemener
- mindre variationer i artist- och låtnamn

Om träffen är mycket säker kan den sparas direkt. Om flera kandidater är rimliga bör användaren hellre få välja mellan 2–3 alternativ än att fel låt sparas.

## Radiofynd som upptäcktsdagbok

På sikt kan varje fynd även bära egen metadata i vår backend:

- låt
- artist
- radiostation
- tidpunkt

Det kan ge vyer som:

```text
12 nya artister upptäckta denna månad
```

och en historik över var låten först hördes.

---

# "Vad var det där?" – radiohistorik

Appen kan hålla en lokal historik över radiometadata även när användaren inte aktivt sparar en låt.

Exempel:

```text
16:42 – Bill Evans – Waltz for Debby – Radio Swiss Jazz
16:36 – Miles Davis – So What – Radio Swiss Jazz
```

Om man senare undrar vilken låt som spelades kan man gå tillbaka och:

- spela den igen via Music Assistant
- spara den som Radiofynd
- öppna artist-/låtinformation

Det här är en funktion som vanliga streamingappar ofta inte kan ge på samma sätt eftersom vi har direkt tillgång till hemmets radiouppspelning och metadata.

---

# Artist- och låtinformation

Radio-playern och musikvyerna kan få en `ⓘ`-knapp som öppnar en tillfällig informationspanel eller modal utan att musiken stoppas.

Exempel:

```text
Miles Davis
Amerikansk jazztrumpetare och kompositör
1926–1991

Genre
Jazz · Modal jazz · Jazz fusion

Album
Kind of Blue
Bitches Brew
In a Silent Way
```

Senare kan vi även visa:

- album och utgivningsår
- kompositör
- medverkande musiker
- instrument
- relaterade artister
- länkar till mer information

## Metadata-arkitektur

Frontend ska inte bindas direkt till en viss extern tjänst. Backend bör i stället erbjuda ett gemensamt API, exempelvis:

```text
/api/music-info/artist?artist=Miles%20Davis
```

Backend kan kombinera flera källor och returnera ett normaliserat svar.

Tänkbar modell:

```text
MusicBrainz
    ↓
  MBID
    ↓
├─ Cover Art Archive
├─ Wikidata / Wikipedia
├─ TheAudioDB
└─ eventuellt ListenBrainz
```

### Kandidater för externa källor

- **MusicBrainz** – lämpligt som central identitet och katalogkälla
- **Cover Art Archive** – omslagsbilder via MusicBrainz-ID
- **Wikidata / Wikipedia** – biografi, land, årtal, instrument, occupation med mera
- **TheAudioDB** – artist-, album- och artwork-data
- **ListenBrainz** – intressant senare för lyssningshistorik och rekommendationer
- **Discogs** – möjlig kompletterande källa, men inte ett krav eller förstahandsval

API-villkor och rate limits ska alltid verifieras på nytt innan en integration byggs.

Resultat bör cachelagras lokalt, sannolikt i SQLite, med rimlig TTL så att externa tjänster inte behöver anropas för varje sidvisning.

---

# Vardagsrumsplatta / kiosk-läge

Appen ska kunna användas på en Samsung-platta som permanent står i vardagsrummet.

Det bör vara samma webbapp, inte ett separat projekt, men med ett särskilt presentationsläge.

Tänkbara lägen:

```text
Normal desktop
Responsive mobile/tablet
Living-room tablet
```

Vardagsrumsläget kan aktiveras explicit, till exempel med:

- URL-parameter som `?display=livingroom`
- eller en inställning sparad i `localStorage`

Exempel:

```text
Visningsläge:
○ Automatisk
○ Dator
● Vardagsrumsplatta
```

Det är bättre än att enbart använda viewport-bredd, eftersom en laptop och en platta kan ha liknande upplösning men olika användningssätt.

## Vardagsrums-UI

- större touch targets
- större text
- större artwork
- färre kontroller samtidigt
- mindre scrollning
- volym alltid lättillgänglig
- snabb åtkomst till radio och genrer
- senare stora knappar för Favoriter / Spellistor / Sök

Målet är mer "Sonos-touchpanel" än desktop-app.

## Fullskärmsläge / now playing display

När ingen aktivt använder plattan kan den gå över till en lugn fullskärmsvy med:

- stort albumomslag eller radio-artwork
- artist och låt
- radiostation vid radio
- diskreta kontroller
- eventuellt klocka

Tryck på skärmen återgår till normala kontroller.

---

# Musikscener kopplade till huset

Eftersom appen körs i hemmiljön kan den göra sådant som vanliga streamingappar inte känner till.

Exempel på scenknappar:

```text
Morgon
Middag
Läsa
Fest
Kväll
Köket
```

En scen kan styra flera saker samtidigt:

- vald spelare
- spellista eller radiostation
- volym
- eventuell multiroom-gruppering
- Home Assistant-belysning

Exempel:

```text
Middag
→ vardagsrumsspelaren
→ jazz-spellista
→ volym 28 %
→ dämpad belysning via Home Assistant
```

Det här bör hållas enkelt i UI även om backend senare får fler möjligheter.

---

# "Spela något åt mig"

En enkel knapp som väljer musik utan att användaren behöver bestämma exakt vad.

Den kan använda:

- favoriter
- Radiofynd
- nyligen spelat
- vald genre
- tid på dagen
- eventuellt rum/spelare

Första versionen behöver inte använda AI. Regelbaserade val kan ge ett bra resultat.

Senare kan man erbjuda val som:

```text
Lugnt
Jazz
Energi
Något nytt
```

---

# Naturligt språk för musik

En framtida funktion kan låta användaren skriva saker som:

```text
spela lugn jazz från 50-talet
```

eller:

```text
något liknande Bill Evans men lite mer upbeat
```

Backend kan tolka önskemålet och översätta det till Music Assistant-sökningar, genreval, artistrelationer eller spellistor.

Det här är ett område där AI kan ge verkligt mervärde, men det ska vara ett extra lager ovanpå den enkla grundappen.

---

# Artist-rabbit-hole / upptäcktsläge

Från en artistinfosida kan man kunna välja `Utforska vidare`.

Tänkbara funktioner:

- relaterade artister
- influenser
- bandmedlemmar
- viktiga album
- "Spela 5 låtar som introduktion till Miles Davis"

MusicBrainz, Wikidata och ListenBrainz kan vara användbara källor för detta.

---

# DJ-läge

En mer experimentell framtidsidé är ett lokalt DJ-läge.

Exempel:

```text
DJ

Utgångspunkt: Bill Evans

Bekant  ─────────●────  Upptäck nytt
Lugnt   ───●──────────  Energiskt

[ Starta ]
```

DJ-läget kan:

- undvika att samma artist spelas för ofta
- hålla reda på vad som spelats de senaste timmarna
- blanda välkända låtar med nya fynd
- bygga en kontinuerlig ström från Music Assistant/Tidal

Music Assistant står för playback medan externa metadata/rekommendationskällor kan hjälpa till med relationer mellan artister och låtar.

---

# Familjeläge

En framtida enkel profilfunktion kan ge olika startvyer utan att införa ett tungt kontosystem.

Exempel:

```text
Ulf
Pappa
Gäst
```

En profil kan styra:

- favoritstartvy
- stora snabbknappar
- föredragna stationer
- spellistor
- standardspelare

En förenklad "Pappa"-vy kan till exempel ha sex stora knappar i stället för hela gränssnittet.

---

# Gästkö via QR-kod

Vid fest eller besök kan vardagsrumsplattan visa en QR-kod.

Gästen öppnar en begränsad sida i mobilen och får:

- söka musik
- lägga en låt i en gästkö

Gästen ska inte få:

- ändra systeminställningar
- styra andra spelare
- ändra volym fritt
- komma åt resten av hemnätets funktioner

---

# Timer och sömnfunktioner

Enkla vardagsfunktioner:

- spela i 30 minuter
- stoppa 23:00
- sänk volymen gradvis under 20 minuter

De kan implementeras via vår backend ovanpå Music Assistant.

---

# Diskret Home Assistant-integration

Music Assistant Web ska inte bli en kopia av House Portal, men vardagsrumsplattan kan visa korta viktiga overlays ovanpå musiken.

Exempel:

- dörrklocka
- "tvättmaskinen är klar"
- viktig Home Assistant-notis

Notisen visas några sekunder och försvinner utan att musikgränssnittet slutar vara ett musikgränssnitt.

---

# Designprinciper

Följande principer ska styra utvecklingen:

1. **Enkelt först.** Färre val är bättre än att exponera hela Music Assistant-modellen.
2. **Music Assistant är backend för musik.** Frontend ska inte behöva känna till Tidal-specifika detaljer.
3. **Administration stannar i Music Assistant.** Vår app är för vardagsanvändning, inte provider- och biblioteksadministration.
4. **Touch-friendly.** UI ska fungera bra på vardagsrumsplatta och mobil.
5. **En klickning ska ofta räcka.** Framför allt för radio, favoriter och spellistor.
6. **Delad player-modell.** Radio och musik använder samma valda Music Assistant-spelare.
7. **Live-radio behandlas som live.** Ingen falsk progress/seek/next-modell när den inte finns.
8. **Osäker intelligens ska vara försiktig.** Om Radiofynd-matchning är osäker ska användaren få välja i stället för att appen sparar fel låt.

---

# Säkerhetsprinciper

- Music Assistant-token får aldrig exponeras i frontend.
- tokens och externa API-nycklar ska ligga i backend `.env`.
- `.env` och andra secrets ska aldrig committas.
- publikt repo ska inte innehålla personlig debug-data, råa snapshots eller lokala hemdetaljer.
- endpoints som startar uppspelning ska validera tillåtna URI-typer.
- gästfunktioner ska få mycket begränsade rättigheter.

---

# Föreslagen prioritering

När utvecklingen återupptas är den naturliga ordningen:

1. Sprint 5A – Musikhem + spellistor
2. Sprint 5B – Favoriter
3. Sprint 5C – Sök
4. Sprint 5D – Album/artistvyer
5. Radiofynd
6. "Vad var det där?"-historik
7. Artist-/låtinfo
8. Vardagsrumsplatta / now playing display
9. Musikscener via Home Assistant
10. Därefter experimentella funktioner som DJ, naturligt språk, familjeläge och gästkö

Prioriteringen kan ändras när vi börjar använda appen mer i vardagen.

---

## Kort produktvision

Music Assistant Web ska inte vara ännu en stor streamingapp.

Det ska vara **hemmets enkla musikgränssnitt**:

```text
Välj spelare
     ↓
Radio / Favoriter / Spellistor / Sök
     ↓
Play
```

Och ovanpå det kan vi lägga sådant som bara ett lokalt, hemmaanpassat system kan göra riktigt bra: Radiofynd, historik, vardagsrumsdisplay, Home Assistant-scener och smart musikupptäckt.
