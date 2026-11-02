# URC Arrangementsportal

portal.urcofficial.com: Felles planleggingsverktøy for URC, arrangørklubber og partnere.

## Struktur

| Fil | URL | Innhold |
|---|---|---|
| `index.html` | `/` | Offentlig forside |
| `logg-inn.html` | `/logg-inn` | Innlogging med e-postlenke |
| `arrangementer.html` | `/arrangementer` | Dine arrangementer (admin kan opprette nye) |
| `arrangement.html` | `/lm27` | Arrangementsside med verktøy og administrasjon |
| `verktoy/lopssimulator.html` | `/lm27/lopssimulator` | Løpssimulator |
| `verktoy/arrangementskalkulator.html` | `/lm27/arrangementskalkulator` | Arrangementskalkulator |
| `verktoy/arenarigg.html` | `/lm27/arenarigg` | Plassholder, under utvikling |
| `assets/portal.js` | | Innlogging, tilgang, lagring, verktøylinje |
| `supabase/schema.sql` | | Database, roller og RLS |

Slugen i URL-en bestemmer hvilket arrangement som lastes. Samme verktøyfil brukes for alle arrangementer.

**Iterasjoner:** Nye versjoner lagres som `ddmmyy_lopssimulator.html` osv. i `Portal_Iterasjoner`. Den nyeste kopieres inn hit under fast navn.

**Verktøykontrakt:** Verktøyets hovedscript har `type="text/x-portal-tool"` og startes først når `Portal.bootTool()` har hentet data. Verktøyet leser `PORTAL.state` (og `PORTAL.internal` for admin i kalkulatoren) og kaller `PORTAL.save(state)` ved endringer.

**Demomodus:** Uten Supabase-nøkler i `assets/portal.js` (eller åpnet som lokal fil) kjører portalen i demomodus med lokale data og rollevelger.

## Roller

| | URC-admin | Arrangør | Partner |
|---|---|---|---|
| Løpssimulator | Endre | Endre | Se |
| Arrangementskalkulator | Endre + URC-intern | Endre | Ingen tilgang |
| Arenarigg | Endre | Endre | Se |
| Tilgang, låsing, versjoner | Ja | Nei | Nei |

Admin-e-poster ligger i tabellen `portal_admins`. URC-interne tall ligger i `calc_internal` og sendes aldri til andre enn admin.

## Oppsett, steg for steg

### 1. Supabase (nytt prosjekt, ikke det eksisterende)
1. Nytt prosjekt `urc-portal`, region Stockholm (eu-north-1).
2. SQL Editor: Kjør `supabase/schema.sql`. Sjekk at e-postene i `portal_admins` er riktige.
3. Kjør `311026_lm27_intern_startverdier.sql` fra `Portal_Iterasjoner` (URC-interne tall for LM27, ligger utenfor repoet med vilje).
4. **RLS skal være på.** Ikke kjør `disable row level security` på noen tabell i dette prosjektet.

### 2. Innlogging (Authentication)
1. **URL Configuration:** Site URL `https://portal.urcofficial.com`. Redirect URLs `https://portal.urcofficial.com/**`.
2. **SMTP (påkrevd):** Supabase sin innebygde e-post sender kun til medlemmer av Supabase-teamet. Sett opp egen SMTP under Authentication → Emails → SMTP Settings. Enklest: Gmail med app-passord for urcsportsno@gmail.com (`smtp.gmail.com`, port 465). Avsendernavn: URC Arrangementsportal.
3. **E-postmaler:** Sett både «Magic Link» og «Confirm signup» til:
   - Emne: `Innloggingslenke til URC Arrangementsportal`
   - Tekst:
     ```html
     <h2>Logg inn i URC Arrangementsportal</h2>
     <p>Trykk på lenken for å logge inn. Lenken er gyldig i én time og kan bare brukes én gang.</p>
     <p><a href="{{ .ConfirmationURL }}">Logg inn</a></p>
     <p>Ba du ikke om denne e-posten, kan du se bort fra den.</p>
     ```

### 3. Koble koden til Supabase
Fyll inn `SUPABASE_URL` og `SUPABASE_ANON_KEY` øverst i `assets/portal.js` (Project Settings → API). Anon-nøkkelen er offentlig av natur. Sikkerheten ligger i RLS.

### 4. GitHub og Vercel
1. Nytt repo `urcofficial/portal`, last opp innholdet i denne mappen.
2. Nytt Vercel-prosjekt fra repoet (team `urcsports`), ingen byggesteg.
3. Legg til domenet `portal.urcofficial.com` i Vercel, og legg CNAME-målet Vercel genererer inn i Domene.no.

### 5. Hold Supabase våken
Gratisprosjekter pauses etter en uke uten trafikk. `.github/workflows/keepalive.yml` pinger databasen to ganger i uka. Legg inn repo-secrets `SUPABASE_URL` og `SUPABASE_ANON_KEY`. Alternativ: Supabase Pro.

## Kjente begrensninger
- Løpssimulatoren har LM27-traseene (GPX og høydedata) bakt inn. Et nytt arrangement på en annen arena trenger egne løypedata før simulatoren gir mening der.
- Verktøykoden er offentlig tilgjengelig (statiske filer). Ingen arrangementsdata eller interne tall ligger i koden, de hentes fra Supabase etter innlogging.
- Samtidig redigering: Siste lagring vinner. Får du varsel om at noen andre har endret, last inn på nytt før du fortsetter.
- Vercel Hobby er for ikke-kommersiell bruk.
