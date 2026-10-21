from build import Deck, ui, pill


def build() -> Deck:
    d = Deck("00-MAGGuarantee-wprowadzenie", "MAGGuarantee — wprowadzenie i proces", "Wprowadzenie")

    d.cover("00", "Dla wszystkich ról", "MAGGuarantee — jak to działa",
            "Wspólne wprowadzenie: czym jest gwarancja kilometrowa, kto bierze udział w procesie, "
            "jak przechodzi wyjazd i wniosek, jak liczona jest dopłata oraz jak się zalogować.")

    d.text("Spis treści", """
<ol class="toc">
<li>Czym jest MAGGuarantee i gwarancja kilometrowa</li>
<li>Osiem ról w systemie</li>
<li>Kluczowe postacie: opiekun i przewoźnik</li>
<li>Proces od wyjazdu do wypłaty — krok po kroku</li>
<li>Statusy wyjazdu</li>
<li>Statusy wniosku</li>
<li>Jak liczona jest dopłata gwarancyjna</li>
<li>Dni wyłączone i dni graniczne</li>
<li>Najważniejsze terminy i limity</li>
<li>Logowanie: Google i login + hasło + kod</li>
<li>Hasło: reset i wymagania</li>
<li>Wygląd aplikacji: nagłówek, menu, język</li>
<li>Powiadomienia e-mail</li>
<li>Słowniczek pojęć</li>
</ol>
<div class="box info" style="margin-top:14px"><p><b>Osobne instrukcje dla ról:</b> 01 Przewoźnik · 02 Opiekun · 03 Opiekun wniosków · 04 Weryfikator ·
05 Eksport · 06 Planista · 07 Dyspozytor · 08 Administrator. Najwięcej szczegółów jest w instrukcjach przewoźnika i opiekuna.</p></div>
""")

    d.cols("Czym jest MAGGuarantee", """
<p><b>MAGGuarantee</b> to wewnętrzny system MAGTRANS do obsługi <b>gwarancji kilometrowej</b> dla przewoźników-podwykonawców.</p>
<div class="box key"><h2>Gwarancja kilometrowa w jednym zdaniu</h2>
<p>MAGTRANS gwarantuje przewoźnikowi określoną liczbę kilometrów na każdy dzień pracy ciągnika.
Jeżeli w danym okresie ciągnik przejechał <b>mniej</b>, niż gwarantowano, przewoźnik otrzymuje <b>dopłatę w EUR</b> za brakujące kilometry.</p></div>
<p>System zastępuje arkusze i e-maile: każdy wyjazd, przebieg i wniosek jest w jednym miejscu, z historią i jasnym statusem.</p>
""", """
<h3>Co system robi</h3>
<ul>
<li>prowadzi <b>bazę przewoźników</b> i ich floty (ciągniki, naczepy, kierowcy, dokumenty);</li>
<li>rejestruje <b>wyjazdy</b> (delegacje) i ich statusy — od zgłoszenia do zjazdu;</li>
<li>zbiera <b>dzienny przebieg km</b> każdego ciągnika (tablica km weryfikatora);</li>
<li>przyjmuje <b>wnioski o dopłatę</b>, liczy kwotę automatycznie i prowadzi weryfikację;</li>
<li>pilnuje <b>terminów</b>: dokumentów, zgłaszania wyjazdów, weryfikacji, reklamacji;</li>
<li>wysyła <b>powiadomienia e-mail</b> i wiadomości w Google Chat.</li>
</ul>
<div class="box warn"><p>Wypłata pieniędzy odbywa się <b>poza systemem</b>. MAGGuarantee zapisuje kwotę zatwierdzoną i numer zlecenia, na które zostanie wypłacona.</p></div>
""")

    d.table("Osiem ról w systemie", ["Rola", "Kto to jest", "Co robi w systemie", "Logowanie"], [
        ["Przewoźnik", "firma-podwykonawca z ciągnikami i kierowcami", "zgłasza wyjazdy, składa wnioski i reklamacje, podgląda flotę", "login + hasło + kod e-mail"],
        ["Opiekun", "pracownik MAGTRANS (DAF) prowadzący grupę przewoźników", "zakłada przewoźników i całą flotę, pilnuje dokumentów i porozumień", "Google (konto @magtrans.eu)"],
        ["Opiekun wniosków", "pracownik weryfikujący wnioski (w systemie rola „pracownik”)", "sprawdza wnioski, koryguje dane, akceptuje / odrzuca, rozpatruje reklamacje", "Google"],
        ["Weryfikator", "pracownik kontrolujący ruch ciągników", "wpisuje dzienny przebieg km, oznacza „w trasie” i „zjechał”", "Google"],
        ["Eksport", "pracownik wystawiający zlecenia w SpedTrans", "oznacza wyjazd jako „Załadowany” (z nr zlecenia)", "Google"],
        ["Planista", "spedytor prowadzący konkretne ciągniki", "podgląd floty i przebiegu, wnioski o przekazanie ciągnika", "Google"],
        ["Dyspozytor", "dyspozytor zespołu prowadzącego", "podgląd ciągników swojego zespołu i ich wyjazdów", "Google"],
        ["Administrator", "osoba zarządzająca systemem", "wszystko + użytkownicy, limity, zespoły, słowniki, audyt", "konto lokalne"],
    ], note="Każde konto ma dokładnie jedną rolę. Planista, dyspozytor, opiekun, opiekun wniosków i eksport mogą mieć dodatkowo flagę „Lider”.",
        widths=[15, 27, 38, 20], compact=True)

    d.cols("Kluczowe postacie: opiekun i przewoźnik", """
<div class="box key"><h2>Opiekun — uruchamia wszystko</h2>
<ul>
<li>zakłada konto przewoźnika i przekazuje mu hasło;</li>
<li>wprowadza ciągniki, naczepy i kierowców — <b>bez kompletnej floty przewoźnik nie zgłosi wyjazdu</b>;</li>
<li>włącza gwarancję (porozumienie) na ciągniku — <b>bez niej nie da się złożyć wniosku</b>;</li>
<li>pilnuje ważności dokumentów (OCP, licencja, prawa jazdy, karty paliwowe);</li>
<li>pilnuje, by przewoźnicy zgłaszali wyjazdy w terminie (porozumienia).</li>
</ul></div>
""", """
<div class="box key"><h2>Przewoźnik — napędza proces</h2>
<ul>
<li>zgłasza każdy wyjazd — od tego startuje praca eksportu i weryfikatora;</li>
<li>po zjeździe składa wniosek — od tego startuje praca opiekuna wniosków;</li>
<li>po decyzji może złożyć reklamację (48 h);</li>
<li>musi zgłaszać kolejne wyjazdy w ciągu 10 dni roboczych po zjeździe (porozumienie).</li>
</ul></div>
<div class="box info"><p>Pozostałe role reagują na to, co zrobili opiekun i przewoźnik: eksport → weryfikator → opiekun wniosków.
Dlatego instrukcje tych dwóch ról są najbardziej szczegółowe.</p></div>
""")

    d.text("Proces od wyjazdu do wypłaty", f"""
<div class="flow">
 <div class="st"><div class="who">Opiekun</div><div class="what">Zakłada przewoźnika i flotę, włącza porozumienie</div><div class="det">jednorazowo / przy zmianach</div></div>
 <div class="ar">→</div>
 <div class="st hl"><div class="who">Przewoźnik</div><div class="what">Zgłasza wyjazd</div><div class="det">status {pill('Zgłoszony','blue')}<br>e-mail + Google Chat</div></div>
 <div class="ar">→</div>
 <div class="st"><div class="who">Eksport</div><div class="what">Wystawia zlecenie w SpedTrans</div><div class="det">status {pill('Załadowany','amber')}<br>nr zlecenia ze spedu</div></div>
 <div class="ar">→</div>
 <div class="st"><div class="who">Weryfikator</div><div class="what">Potwierdza faktyczny wyjazd</div><div class="det">status {pill('W trasie','green')}</div></div>
</div>
<div class="flow">
 <div class="st"><div class="who">Weryfikator</div><div class="what">Codziennie wpisuje przebieg km</div><div class="det">tablica km: jechał / nie jeździ</div></div>
 <div class="ar">→</div>
 <div class="st"><div class="who">Weryfikator</div><div class="what">Potwierdza zjazd ciągnika</div><div class="det">status {pill('Zjechał','grey')}</div></div>
 <div class="ar">→</div>
 <div class="st hl"><div class="who">Przewoźnik</div><div class="what">Składa wniosek (do 7 dni)</div><div class="det">status {pill('Weryfikacja','blue')}</div></div>
 <div class="ar">→</div>
 <div class="st"><div class="who">Opiekun wniosków</div><div class="what">Weryfikuje i decyduje</div><div class="det">{pill('Zaakceptowano','green')} / {pill('Odrzucono','red')}<br>(SLA: 7 dni roboczych)</div></div>
 <div class="ar">→</div>
 <div class="st"><div class="who">Przewoźnik</div><div class="what">Opcjonalnie: reklamacja (48 h)</div><div class="det">{pill('Reklamacja','amber')} → decyzja</div></div>
</div>
<p style="margin-top:12px">Gdy dopłata przekracza próg autoryzacji, wniosek przechodzi automatycznie w {pill('Czeka na autoryzację','blue')} —
decyzję można podjąć dopiero po wgraniu potwierdzenia od Maksima. Po zakończeniu przewoźnik ma <b>10 dni roboczych</b> na zgłoszenie kolejnego wyjazdu.</p>
""", kicker="Przegląd")

    d.table("Statusy wyjazdu", ["Status", "Kto ustawia", "Co oznacza", "Co dalej"], [
        [pill("Zgłoszony", "blue"), "Przewoźnik", "wyjazd zarejestrowany w systemie", "przewoźnik może go jeszcze anulować; eksport wystawia zlecenie"],
        [pill("Załadowany", "amber"), "Eksport", "ładunek znaleziony, zlecenie ze spedu wystawione (wymagany nr zlecenia)", "eksport może cofnąć do „Zgłoszony”, dopóki ciągnik nie ruszy"],
        [pill("W trasie", "green"), "Weryfikator", "ciągnik faktycznie wyjechał — zapisana data i godzina wyjazdu", "weryfikator uzupełnia km na tablicy"],
        [pill("Zjechał", "grey"), "Weryfikator", "ciągnik wrócił — zapisana faktyczna data i godzina zjazdu (status końcowy)", "przewoźnik może złożyć wniosek w ciągu 7 dni"],
        [pill("Anulowany", "red"), "Przewoźnik (tylko ze „Zgłoszony”) lub administrator", "wyjazd nie doszedł do skutku (status końcowy)", "—"],
    ], note="Kolejność jest stała: Zgłoszony → Załadowany → W trasie → Zjechał. Na jednym ciągniku może być tylko jeden aktywny wyjazd (Zgłoszony / Załadowany / W trasie).",
        widths=[15, 20, 35, 30])

    d.table("Statusy wniosku o dopłatę", ["Status", "Skąd się bierze", "Kto działa", "Uwagi"], [
        [pill("Weryfikacja", "blue"), "przewoźnik złożył wniosek", "Opiekun wniosków", "najpierw „Zapisz weryfikację”, potem decyzja; termin 7 dni roboczych"],
        [pill("Czeka na autoryzację", "blue"), "automatycznie, gdy dopłata > próg autoryzacji", "Opiekun wniosków + Maksim", "decyzja po wgraniu zrzutu potwierdzenia Maksima"],
        [pill("Zaakceptowano", "green"), "decyzja „Zaakceptuj” (nr zlecenia, data, kwota)", "—", "przewoźnik ma 48 h na reklamację, jeśli nie wypłacono całej kwoty"],
        [pill("Odrzucono", "red"), "decyzja „Odrzuć” (wymagany powód)", "—", "przewoźnik ma 48 h na reklamację"],
        [pill("Reklamacja", "amber"), "przewoźnik złożył reklamację", "Opiekun wniosków", "„Uznaj” lub „Odrzuć” reklamację; status wraca do poprzedniego, wynik widać osobno"],
    ], note="Progi autoryzacji (liczone od dni w trasie): do 15 dni — 300 €, 16–30 — 500 €, 31–60 — 800 €, 61+ — 1000 €.", widths=[19, 28, 20, 33])

    d.cols("Jak liczona jest dopłata gwarancyjna", """
<ol class="steps">
<li><b>Limity miesięczne.</b> Dla każdego miesiąca administrator ustala: km gwarantowane na dzień (domyślnie <b>540 km</b>),
stawkę € za km (domyślnie <b>0,50 €</b>) i opcjonalnie km za sobotę. Wniosek „zamraża” limity z dnia złożenia.</li>
<li><b>Dni zaliczone.</b> System przechodzi dzień po dniu od daty załadunku do rozładunku: poniedziałek–piątek liczą się,
niedziele nigdy, święta i zakazy ruchu UE nie liczą się, soboty tylko gdy włączona gwarancja sobotnia (1., 3. i 5. sobota miesiąca).</li>
<li><b>Km gwarantowane</b> = dni zaliczone × km/dzień (+ soboty × km/sobota), sumowane po miesiącach.</li>
<li><b>Niedobór</b> = km gwarantowane − przebieg faktyczny.</li>
<li><b>Dopłata</b> = niedobór × stawka €/km (zaokrąglone do centów). Brak niedoboru = brak dopłaty, wniosku nie da się złożyć.</li>
</ol>
""", """
<div class="box key"><h2>Przykład</h2>
<p>Okres 13 dni roboczych, pierwszy dzień od 08:00, ostatni do 14:00.</p>
<p>Dni zaliczone ≈ 11,25 · km gwarantowane ≈ <b>6 075 km</b><br>
Przejechano <b>3 720 km</b> → niedobór <b>2 355 km</b><br>
Dopłata = 2 355 × 0,50 € = <b>1 177,50 €</b></p></div>
<div class="box info"><h2>Korekta godzin</h2><p>Opiekun wniosków może odjąć godziny postoju/przestoju — zmniejszają one liczbę dni zaliczonych proporcjonalnie w miesiącach z gwarancją.</p></div>
<div class="box warn"><h2>Okres mieszany</h2><p>Jeśli w którymś miesiącu okresu gwarancja jest wyłączona (0 km/dzień), przebieg bierze się z <b>tablicy km weryfikatora</b>,
a nie z deklaracji przewoźnika. Wniosku nie można zaakceptować, dopóki tablica ma luki.</p></div>
""")

    d.cols("Dni wyłączone i dni graniczne", """
<h3>Nigdy nie liczą się</h3>
<ul><li>niedziele;</li><li>soboty — chyba że miesiąc ma gwarancję sobotnią (wtedy 1., 3. i 5. sobota jako cały dzień).</li></ul>
<h3>Święta i zakazy ruchu UE (dni robocze wyłączone)</h3>
<p class="small">Nowy Rok · Trzech Króli · Święto Pracy · 2.06 (IT) · 14.07 (FR) · 21.07 (BE) · 15.08 · 3.10 (DE) · 26.10 (AT) · 1.11 · 11.11 ·
8.12 · 25–26.12 · Wielki Piątek · Poniedziałek Wielkanocny · Wniebowstąpienie · Zielone Świątki · Boże Ciało.</p>
<p>Lista wyłączonych dni jest widoczna w kalkulacji: sekcja <span class="ui">Dni wyłączone (święta / zakaz UE)</span>.</p>
""", """
<h3>Dni graniczne liczone proporcjonalnie</h3>
<div class="box"><ul>
<li><b>pierwszy dzień</b> = (24 − godzina od) / 24 — wyjazd o 08:00 daje 0,67 dnia;</li>
<li><b>ostatni dzień</b> = godzina do / 24 — powrót o 14:00 daje 0,58 dnia;</li>
<li>wyjazd jednodniowy = (do − od) / 24.</li></ul></div>
<div class="box warn"><p><b>Ważne:</b> jeśli dzień graniczny wypada w weekend, święto lub zakaz UE, godzina nic nie zmienia — taki dzień i tak się nie liczy.
To celowe zachowanie, a nie błąd. Kalkulacja pokazuje wtedy „· nie zaliczony”.</p></div>
""")

    d.table("Najważniejsze terminy i limity", ["Czego dotyczy", "Zasada", "Kogo dotyczy"], [
        ["Zgłoszenie wyjazdu", "data wyjazdu nie może być w przeszłości (10 min tolerancji)", "Przewoźnik"],
        ["Kolejny wyjazd (porozumienie)", "w ciągu <b>10 polskich dni roboczych</b> od zjazdu; przypomnienia 3 i 1 dzień przed", "Przewoźnik, Opiekun"],
        ["Złożenie wniosku", "do <b>7 dni</b> od faktycznego zjazdu (data weryfikatora)", "Przewoźnik"],
        ["Długość okresu wniosku", "maks. <b>90 dni</b>, min. <b>10,00 dni</b> przepracowanych", "Przewoźnik"],
        ["Kolejny wniosek na ten sam ciągnik", "po <b>6 dniach</b> od poprzedniego (odrzucone się nie liczą)", "Przewoźnik"],
        ["Średni przebieg", "maks. 2000 km dziennie", "Przewoźnik"],
        ["Weryfikacja wniosku", "<b>7 polskich dni roboczych</b> od złożenia (codzienny e-mail o 07:00)", "Opiekun wniosków"],
        ["Reklamacja", "do <b>48 godzin</b> od decyzji, jedna na wniosek, kwota ≤ wnioskowana − wypłacona", "Przewoźnik"],
        ["Dokumenty", "alert od 7 dni przed wygaśnięciem (OCP, licencja, prawo jazdy, karta paliwowa)", "Opiekun"],
        ["Tablica km", "wpis możliwy tylko za dni minione (dziś i przyszłość zablokowane)", "Weryfikator"],
        ["Kod logowania", "ważny 10 min, 5 prób, ponowna wysyłka co 60 s", "wszyscy z hasłem"],
    ], widths=[26, 54, 20], compact=True)

    d.two("Logowanie", "g02-login-filled-crop", "g03-verify-crop", """
<h3>Pracownicy MAGTRANS</h3>
<p>Przycisk <b>Google</b> nad formularzem — tylko konto <code>@magtrans.eu</code>. Rola wynika ze stanowiska w MAGSpace (lub nadaje ją administrator). Bez kodu SMS/e-mail.</p>
<h3>Przewoźnicy (i konta z hasłem)</h3>
<ol class="steps">
<li>Wpisz <span class="ui">Login</span> i <span class="ui">Hasło</span>, kliknij <span class="ui">Dalej →</span>.</li>
<li>Wpisz 6-cyfrowy kod z e-maila — zatwierdza się sam po 6. cyfrze.</li>
</ol>
<p class="small">10 błędnych haseł = blokada konta na 15 min. 5 błędnych kodów = blokada 5 min. Sesja trwa do 30 dni.</p>
""")

    d.shot("Hasło: reset i wymagania", "g04-forgot-crop", """
<h3>Nie pamiętam hasła</h3>
<ol class="steps">
<li>Na ekranie logowania kliknij <span class="ui">Nie pamiętam hasła</span>.</li>
<li>Wpisz login → <span class="ui">Wyślij kod</span>. Kod przychodzi na e-mail konta.</li>
<li>Wpisz kod, <span class="ui">Nowe hasło</span> i <span class="ui">Powtórz hasło</span> → <span class="ui">Ustaw hasło</span>.</li>
</ol>
<h3>Wymagania dla hasła</h3>
<ul><li>min. 10 znaków;</li><li>co najmniej 1 litera;</li><li>co najmniej 1 cyfra.</li></ul>
<h3>Hasło tymczasowe</h3>
<p>Po założeniu konta lub resecie przez opiekuna/administratora trzeba przy pierwszym logowaniu ustawić własne hasło — ekranu nie da się pominąć.</p>
<p>Zmiana hasła w dowolnym momencie: menu użytkownika → <span class="ui">Zmień hasło</span>.</p>
""")

    d.shot("Wygląd aplikacji", "c01-claims", """
<h3>Nagłówek (zawsze u góry)</h3>
<ul>
<li>logo MAGTRANS — powrót na stronę startową roli;</li>
<li><span class="ui">PL</span> / <span class="ui">EN</span> — zmiana języka (zapamiętywana);</li>
<li>księżyc/słońce — tryb jasny / ciemny;</li>
<li>menu użytkownika: imię, rola, <span class="ui">Zmień hasło</span>, <span class="ui">Wyloguj</span>.</li>
</ul>
<h3>Nawigacja</h3>
<ul>
<li><b>Admin, Opiekun, Opiekun wniosków</b> — menu boczne po lewej (na telefonie pod ikoną ☰), z licznikami spraw wymagających uwagi;</li>
<li><b>pozostałe role</b> — zakładki pod nagłówkiem.</li>
</ul>
<p class="small">Kliknięcie aktywnej zakładki/pozycji menu odświeża dane.</p>
""")

    d.table("Powiadomienia e-mail", ["Zdarzenie", "Kto dostaje e-mail"], [
        ["Kod logowania / reset hasła", "osoba logująca się"],
        ["Konto utworzone / hasło zresetowane", "nowy użytkownik lub przewoźnik (login + hasło tymczasowe)"],
        ["Nowy wyjazd", "przewoźnik (potwierdzenie) + wiadomość w Google Chat dla zespołu"],
        ["Wyjazd „Załadowany”", "przewoźnik — „Zlecenie {nr} — ciągnik {nr rej.}”"],
        ["Nowy wniosek", "przewoźnik, opiekun wniosków, admin, opiekun przewoźnika, planista (+ lider)"],
        ["Decyzja w sprawie wniosku", "przewoźnik + te same osoby wewnętrzne"],
        ["Prośba o autoryzację", "Maksim (odpowiedź trafia do opiekuna wniosków)"],
        ["Reklamacja złożona / rozpatrzona", "opiekun wniosków i admin / przewoźnik"],
        ["Przypomnienie o zgłoszeniu wyjazdu", "przewoźnik — 3 i 1 dzień roboczy przed terminem"],
        ["Dzienny przegląd porozumień", "opiekun — terminy i naruszenia jego przewoźników"],
        ["Dzienny przegląd weryfikacji (07:00)", "opiekunowie wniosków — wnioski po terminie i z bliskim terminem"],
        ["Pojazdy do usunięcia, raport tygodniowy", "administrator"],
    ], image="m03-mail-newclaim", compact=True, widths=[45, 55])

    d.table("Słowniczek", ["Pojęcie", "Znaczenie"], [
        ["Wyjazd (delegacja)", "jedna trasa ciągnika: od zgłoszenia, przez wyjazd, do zjazdu do bazy"],
        ["Wniosek (GWA/NNN/MM/RR)", "prośba przewoźnika o dopłatę gwarancyjną za jeden zakończony wyjazd"],
        ["Porozumienie", "zgoda na objęcie ciągnika gwarancją; bez niej nie ma wniosków, z nią — obowiązek zgłaszania wyjazdów"],
        ["Tablica km", "dzienny przebieg każdego ciągnika wpisywany przez weryfikatora: Jechał (km) / Nie jeździ"],
        ["Km gwarantowane", "ile km ciągnik powinien przejechać w okresie wg limitów"],
        ["Niedobór / dopłata", "brakujące km × stawka €/km = kwota dla przewoźnika"],
        ["Nr zlecenia ze spedu", "numer zlecenia wystawionego w SpedTrans przy statusie „Załadowany”"],
        ["Numer zlecenia (wniosku)", "zlecenie, na które zostanie wypłacona zatwierdzona dopłata"],
        ["Reklamacja", "odwołanie przewoźnika od decyzji, w ciągu 48 h"],
        ["Opiekun vs Opiekun wniosków", "opiekun prowadzi przewoźników i flotę; opiekun wniosków (rola „pracownik”) weryfikuje wnioski"],
        ["Zespół prowadzący", "zespół dyspozytorów (kod N.N.N), do którego przypisany jest ciągnik"],
        ["Lider", "dodatkowa flaga; lider planistów zatwierdza przekazania ciągników swoich planistów"],
    ], compact=True, widths=[27, 73])

    return d
