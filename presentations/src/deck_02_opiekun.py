from build import Deck, ui, pill, REQ, OPT, COND, RO


def build() -> Deck:
    d = Deck("02-Opiekun", "MAGGuarantee — instrukcja dla opiekuna", "Opiekun")

    d.cover("02", "Rola: opiekun (DAF)", "Instrukcja dla opiekuna przewoźników",
            "Jak założyć przewoźnika i całą jego flotę, które pola są wymagane, jak pilnować dokumentów, porozumień i terminów, "
            "jak zmienić planistę ciągnika i co widzisz z wyjazdów i przebiegu.")

    d.text("Spis treści", """
<ol class="toc">
<li>Twoja rola i zakres danych</li>
<li>Logowanie i menu</li>
<li>Moja opieka — pulpit</li>
<li>Karta przewoźnika (ciągniki, wyjazdy, dokumenty, porozumienia)</li>
<li>Przewoźnicy: lista i akcje</li>
<li>Kreator „Dodaj przewoźnika” (4 kroki)</li>
<li>Formularz przewoźnika — wszystkie pola, VIES i Biała Lista</li>
<li>Edycja, dezaktywacja, reset hasła</li>
<li>Ciągniki — formularz i zasady</li>
<li>Zmiana planisty i Przekazania</li>
<li>Kierowcy i naczepy — formularze</li>
<li>Załączniki</li>
<li>Alerty dokumentów</li>
<li>Porozumienia — pilnowanie terminów</li>
<li>Wyjazdy i przebieg</li>
<li>E-maile, checklista nowego przewoźnika</li>
</ol>
""")

    d.cols("Twoja rola", """
<p>Jesteś <b>opiekunem grupy przewoźników</b>. To Ty przygotowujesz wszystko, żeby przewoźnik mógł pracować:</p>
<div class="box key"><ul>
<li><b>bez konta</b> przewoźnik się nie zaloguje;</li>
<li><b>bez aktywnego ciągnika, naczepy i kierowcy</b> nie zgłosi wyjazdu;</li>
<li><b>bez porozumienia na ciągniku</b> nie złoży wniosku o dopłatę;</li>
<li><b>bez aktualnych dokumentów</b> przewoźnik nie spełnia wymagań MAGTRANS.</li>
</ul></div>
<p>Pilnujesz też, by Twoi przewoźnicy zgłaszali kolejne wyjazdy w terminie (porozumienia).</p>
""", """
<h3>Zakres</h3>
<p>Widzisz i edytujesz <b>tylko przewoźników przypisanych do Ciebie</b> (oraz ich flotę). Dane innych opiekunów są niedostępne.</p>
<h3>Możesz</h3>
<ul>
<li>zakładać i edytować przewoźników, dezaktywować ich, resetować hasła;</li>
<li>dodawać, edytować, wyłączać i usuwać ciągniki, naczepy, kierowców;</li>
<li>wgrywać dokumenty firmowe;</li>
<li>wnioskować o zmianę planisty ciągnika;</li>
<li>podglądać wyjazdy i przebieg km.</li>
</ul>
<h3>Nie możesz</h3>
<ul><li>usuwać przewoźników (tylko admin);</li><li>weryfikować wniosków (to Opiekun wniosków);</li><li>zmieniać statusów wyjazdów.</li></ul>
""")

    d.two("Logowanie i menu boczne", "g01-login-crop", "o01-sidebar", """
<p>Logujesz się przyciskiem <b>Google</b> kontem <code>@magtrans.eu</code>. Rola „opiekun” wynika ze stanowiska <b>DAF</b> w MAGSpace.
Po zalogowaniu trafiasz na <b>Moja opieka</b>.</p>
<table class="compact"><tbody>
<tr><td>Moja opieka</td><td>pulpit; licznik = przewoźnicy wymagający uwagi</td></tr>
<tr><td>Alerty</td><td>dokumenty; licznik = przeterminowane + dziś</td></tr>
<tr><td>Przebieg</td><td>tygodniowe km ciągników</td></tr>
<tr><td>Wyjazdy</td><td>wyjazdy Twoich przewoźników</td></tr>
<tr><td>Przewoźnicy</td><td>lista + zakładanie</td></tr>
<tr><td>Ciągniki</td><td>lista + formularz</td></tr>
<tr><td>Przekazania</td><td>Twoje wnioski o zmianę planisty</td></tr>
<tr><td>Kierowcy / Naczepy</td><td>listy + formularze</td></tr>
</tbody></table>
""")

    d.shot("Moja opieka — pulpit", "o01-opieka", f"""
<p><b>Kafelki</b> (każdy jest linkiem): Przewoźnicy · Ciągniki · {pill('Aktywne','green')} · Stojące · {pill('Długo stojące','amber')} · {pill('Do usunięcia','red')}.</p>
<table class="compact"><tbody>
<tr><td>Aktywna</td><td>ma aktywny wyjazd</td></tr>
<tr><td>Stojąca</td><td>0–14 dni od zjazdu</td></tr>
<tr><td>Długo stojąca</td><td>15–28 dni</td></tr>
<tr><td>Do usunięcia</td><td>≥ 29 dni — do wycofania</td></tr>
<tr><td>Wyłączona</td><td>odznaczone „Aktywny”</td></tr>
</tbody></table>
<p style="margin-top:8px"><b>Karty przewoźników:</b> nazwa, login, NIP, liczniki ciągników. Trójkąt ⚠ = <i>niekompletna flota</i> (brak ciągnika, naczepy lub kierowcy) — taki przewoźnik nie zgłosi wyjazdu.
Kliknięcie karty otwiera kartę przewoźnika.</p>
""", right=False)

    d.shot("Karta przewoźnika", "o02-carrier-drill", """
<p>Nagłówek: firma, status, login, NIP, opiekun. Zakładki:</p>
<ul>
<li><b>Ciągniki</b> — nr rej., nr boczny, typ, EURO, ADR, GB/IT/FR, ostatni przejazd, status;</li>
<li><b>Kierowcy</b>, <b>Naczepy</b> — z oknem szczegółów;</li>
<li><b>Wyjazdy</b> — wszystkie wyjazdy przewoźnika;</li>
<li><b>Dokumenty</b> — pliki pogrupowane w kategorie;</li>
<li><b>Porozumienia</b> — stan gwarancji i historia opóźnień.</li>
</ul>
<p class="small">Okna szczegółów są tylko do odczytu — edytujesz na listach Ciągniki / Kierowcy / Naczepy.</p>
""")

    d.shot("Karta przewoźnika — Dokumenty", "o03-carrier-docs", """
<p>Pięć grup kart:</p>
<ul>
<li><b>Dokumenty firmowe</b>: Ubezpieczenie/OCP, Licencja, KREPTD, Inne — <b>tu wgrywasz i usuwasz pliki</b> (<span class="ui">Prześlij</span>, <span class="ui">Usuń</span>);</li>
<li><b>Dokumenty ciągników</b>: Umowa GPS, Porozumienie, Ubezpieczenie kabotażowe DE;</li>
<li><b>ADR ciągników</b> (klasy);</li>
<li><b>Dokumenty naczep</b>: Certyfikat XL;</li>
<li><b>Dokumenty kierowców</b>: Świadectwo ADR.</li>
</ul>
<p>Kliknięcie karty otwiera listę plików z <span class="ui">Pobierz</span>. Dokumenty floty dodajesz w formularzu ciągnika / naczepy / kierowcy.</p>
""")

    d.shot("Karta przewoźnika — Porozumienia", "o04-carrier-poroz", """
<p><b>Ciągniki z gwarancją — stan bieżący</b>: ciągnik, <i>kotwica</i> (data zjazdu lub włączenia gwarancji), termin, stan (licznik dni, „Brak odjazdu”, „W trasie”).</p>
<p><b>Historia epizodów</b>: każdy przypadek zbliżenia się lub przekroczenia terminu — stan (Ostrzeżenie / Po terminie / Zamknięty), rozliczenie
(„Zgłoszono wyjazd”, „Zdjęto gwarancję”, „Ciągnik nieaktywny”) i wynik: <b>w terminie</b> albo <b>po terminie o N dni</b>.</p>
<div class="box tip"><p>Pusta historia = przewoźnik nie miał opóźnień w zgłaszaniu wyjazdów.</p></div>
""")

    d.section("A", "Zakładanie przewoźnika", "Kreator prowadzi przez 4 kroki: przewoźnik → ciągnik → naczepa → kierowca. Dopiero komplet pozwala przewoźnikowi zgłaszać wyjazdy.")

    d.shot("Przewoźnicy — lista", "o07-carriers", """
<p>Filtry: wyszukiwanie (login / nazwa / NIP), aktywni / nieaktywni, onboarding (niedokończeni / ukończeni).</p>
<p>Kolumny: Login, Nazwa (+ plakietki <b>„Brak: Ciągnik / Naczepa / Kierowca”</b>), Firma, NIP, Opiekun, Aktywny.</p>
<h3>Menu akcji (⋯)</h3>
<ul>
<li><span class="ui">Dokończ onboarding</span> — wraca do brakującego kroku kreatora;</li>
<li><span class="ui">Edytuj</span>;</li>
<li><span class="ui">Resetuj hasło</span>.</li>
</ul>
<p>Kliknięcie wiersza — podgląd danych z przyciskiem <span class="ui">Edytuj</span>. Nowy przewoźnik: <span class="ui">+ Nowy przewoźnik</span>.</p>
""")

    d.shot("Kreator „Dodaj przewoźnika — krok 1 z 4”", "o08-carrier-wizard-1", """
<ol class="steps">
<li><b>Przewoźnik</b> — dane firmy i konta. Nie da się pominąć. <span class="ui">Zapisz i kontynuuj</span>.</li>
<li><b>Ciągnik</b> — formularz ciągnika z zablokowanym przewoźnikiem.</li>
<li><b>Przyczepa</b> — formularz naczepy.</li>
<li><b>Kierowca</b> — formularz kierowcy.</li>
</ol>
<p>Kroki 2–4 mają <span class="ui">Pomiń</span> i <span class="ui">Wyjdź</span>. Stan kreatora przetrwa odświeżenie strony; wrócisz przez <span class="ui">Dokończ onboarding</span>.</p>
<p>Po kroku 1 widać pasek <b>Hasło tymczasowe</b> (<span class="ui">Pokaż</span>, <span class="ui">Kopiuj</span>) — przekaż je przewoźnikowi lub poczekaj, aż dostanie e-mail.</p>
""", tall=True)

    d.table("Formularz przewoźnika — Konto i kontakt", ["Pole", "Wymagane", "Zasady"], [
        ["Login", REQ, "2–64 znaki: litery, cyfry, kropka, myślnik, podkreślnik; unikalny; <b>nie można go potem zmienić</b>"],
        ["E-mail", REQ, "adres logowania — na niego idą hasło tymczasowe i kody; unikalny"],
        ["Nazwa", REQ, "1–128 znaków (wyświetlana nazwa)"],
        ["Osoba kontaktowa", REQ, "1–255 znaków"],
        ["Telefon", REQ, "do 64 znaków, bez kontroli formatu"],
        ["E-mail zleceń", REQ, "skrzynka operacyjna przewoźnika (zlecenia)"],
        ["Hasło tymczasowe", OPT, "10–128 znaków, ≥ 1 litera, ≥ 1 cyfra. <b>Zostaw puste</b> — system wygeneruje hasło"],
    ], note="Formularz nowego przewoźnika zapisuje szkic w przeglądarce; „Wyczyść” go usuwa. Błąd zapisu: „Uzupełnij podświetlone pola”.",
        image="o08-carrier-wizard-1", widths=[25, 13, 62], compact=True)

    d.table("Formularz przewoźnika — Dane firmy", ["Pole", "Wymagane", "Zasady"], [
        ["NIP / Tax ID", REQ, "5–20 znaków alfanumerycznych (spacje i myślniki usuwane); PL — 10 cyfr. <b>Po wyjściu z pola</b> system sprawdza VIES i Białą Listę"],
        ["VAT-ID", OPT, "kraj (domyślnie PL) + numer (do 12 znaków)"],
        ["Firma", OPT, "do 255 znaków — <b>uzupełniana automatycznie</b> z rejestru MF / VIES, jeśli pusta"],
        ["Adres firmy", REQ, "1–500 znaków — też uzupełniany automatycznie, jeśli pusty"],
    ], intro="Plakietka przy NIP: <b>Sprawdzam…</b> → <b>Zweryfikowano — {firma}</b> / <b>Nie znaleziono</b> / <b>Usługa niedostępna</b>. "
             "Autouzupełnianie wypełnia tylko puste pola; gdy w rejestrze MF jest kilka kont, pojawi się wybór „Wybierz konto EUR”.",
        image="o08-carrier-wizard-2", widths=[22, 13, 65], compact=True)

    d.table("Formularz przewoźnika — Finanse i zezwolenia", ["Pole", "Wymagane", "Zasady"], [
        ["Konto EUR (IBAN)", REQ, "do 64 znaków; po wyjściu z pola — sprawdzenie na <b>Białej Liście</b> (dla 10-cyfrowego NIP i 26-cyfrowego konta bez „PL”)"],
        ["Konto PLN", OPT, "do 64 znaków"],
        ["Termin płatności (dni)", OPT, "0–365, domyślnie <b>30</b>"],
        ["Suma ubezpieczenia OCP", REQ, "<b>min. 250 000 EUR</b>"],
        ["Ważność OCP", REQ, "data — wpływa na <b>Alerty</b>"],
        ["Ważność licencji", REQ, "data — wpływa na <b>Alerty</b>"],
        ["Liczba ciągników (KREPTD)", OPT, "0–10 000"],
        ["Opiekun", RO, "ukryte — przewoźnik zawsze trafia do Ciebie"],
    ], image="o08-carrier-wizard-3", widths=[28, 13, 59], compact=True)

    d.cols("Po założeniu, edycja i dezaktywacja", """
<h3>Po zapisaniu kroku 1</h3>
<ul>
<li>przewoźnik dostaje e-mail <b>„Konto utworzone — MAGGuarantee”</b> z loginem i hasłem tymczasowym (na <b>E-mail</b> logowania, nie na e-mail zleceń);</li>
<li>Ty widzisz hasło w kreatorze / komunikacie (30 s) — możesz je skopiować;</li>
<li>przy pierwszym logowaniu przewoźnik ustawi własne hasło.</li>
</ul>
<h3>Edycja</h3>
<p>Lista → ⋯ → <span class="ui">Edytuj</span>. Login jest zablokowany, reszta jak przy zakładaniu.</p>
""", """
<h3>Dezaktywacja</h3>
<p>W edycji odznacz <span class="ui">Aktywny</span>: „Nieaktywny przewoźnik traci dostęp do panelu, a jego ciągniki i kierowcy znikają z list wyboru.” Zaznaczenie z powrotem przywraca dostęp.</p>
<h3>Reset hasła</h3>
<ol class="steps">
<li>⋯ → <span class="ui">Resetuj hasło</span> → potwierdź.</li>
<li>Okno „Hasło zresetowane” pokazuje login i nowe hasło <b>tylko raz</b> — skopiuj je.</li>
<li>Przewoźnik dostaje e-mail „Hasło zresetowane”; stare hasło przestaje działać.</li>
</ol>
<div class="box warn"><p>Usunąć przewoźnika może tylko administrator.</p></div>
""")

    d.section("B", "Ciągniki", "Ciągnik to centrum wszystkiego: gwarancja (porozumienie), stawki, planista, zespół prowadzący, karta paliwowa i dokumenty.")

    d.shot("Ciągniki — lista", "o11-vehicles", """
<p>Filtry: numer rejestracyjny, przewoźnik, status (Aktywne / Stojące / Długo stojące / Do usunięcia / Wyłączone).</p>
<p>Kolumny: <b>Numer rejestracyjny</b> (bursztynowa plakietka <b>„Brak skanu porozumienia”</b>), <b>Karta paliwowa</b> (aktywna / zablokowana), Przewoźnik, Planista, Zespół prowadzący, Typ, Status.</p>
<p>Akcje: <span class="ui">Edytuj</span>, <span class="ui">Usuń</span>.</p>
<div class="box warn"><p><b>Usunięcie ciągnika jest nieodwracalne</b> — tego numeru rejestracyjnego nie da się już ponownie dodać. Zwykle wystarczy odznaczyć „Aktywny”.</p></div>
""")

    d.table("Nowy ciągnik — dane podstawowe", ["Pole", "Wymagane", "Zasady"], [
        ["Przewoźnik", REQ, "tylko przy tworzeniu; potem nie do zmiany"],
        ["Numer rejestracyjny", REQ, "2–16 znaków, unikalny w ramach przewoźnika"],
        ["Numer boczny", OPT, "do 16 znaków"],
        ["Typ", REQ, "MEGA / STD / COIL"],
        ["Norma EURO", RO, "zawsze EURO VI"],
        ["Planista", REQ, "przy tworzeniu; <b>później zmiana tylko wnioskiem</b> o przekazanie"],
        ["Zespół prowadzący", REQ, "aktywny zespół dyspozytorów — jego dyspozytorzy będą widzieć ciągnik"],
        ["Notatki", OPT, "do 2000 znaków"],
        ["Certyfikat L", OPT, "pole wyboru"],
        ["Kraje specjalne GB / IT / FR", REQ, "<b>min. 2 z 3</b> — ciągnik ma wszystkie pozwolenia na wjazd"],
    ], image="o12-vehicle-new-1", widths=[30, 13, 57], compact=True)

    d.table("Nowy ciągnik — stawki, GPS, karta paliwowa", ["Pole", "Wymagane", "Zasady"], [
        ["Stawka DE / UE / eksport / import", REQ, "wszystkie 4, liczba ≥ 0 (0 dozwolone), krok 0,01"],
        ["Numer GPS", OPT, "1–32 znaki (id urządzenia)"],
        ["Umowa GPS (plik)", COND("gdy jest nr GPS"), "„Wymagany skan umowy GPS, gdy podano numer GPS.”"],
        ["Karta paliwowa", OPT, "<b>aktywna dopiero po zaznaczeniu Porozumienia</b>"],
        ["Numer karty", COND("gdy karta"), "dokładnie 16 cyfr"],
        ["Data ważności karty", COND("gdy karta"), "data — wpływa na Alerty"],
        ["PIN", COND("gdy karta"), "4–6 cyfr"],
    ], intro="Status karty liczy się na żywo: <b>Karta aktywna</b> tylko gdy zaznaczone porozumienie <b>i</b> wgrany skan porozumienia; inaczej <b>Karta zablokowana</b>.",
        image="o12-vehicle-new-2", widths=[30, 17, 53], compact=True)

    d.table("Nowy ciągnik — porozumienie, odpady, kabotaż, ADR", ["Pole", "Wymagane", "Zasady"], [
        ["Porozumienie", OPT, "<b>włącza gwarancję</b> — tylko wtedy przewoźnik złoży wniosek; uruchamia pilnowanie terminów zgłaszania wyjazdów"],
        ["Skan porozumienia", OPT, "bez skanu — ostrzeżenie „Brak skanu porozumienia” (nie blokuje zapisu, ale karta paliwowa będzie zablokowana)"],
        ["Odpady", OPT, "pole wyboru"],
        ["Kraje odpadowe", COND("gdy Odpady"), "min. 1: DE, NL, AT, BE, LUX, FR, GB, IT, CZ, PL"],
        ["Kabotaż DE / FR", OPT, "pola wyboru"],
        ["Ubezpieczenie kabotażowe (plik)", COND("gdy Kabotaż DE"), "„Wymagane ubezpieczenie kabotażowe DE.”"],
        ["ADR", OPT, "pole wyboru"],
        ["Klasy ADR", COND("gdy ADR"), "min. 1 z klas 1–9"],
        ["Aktywny", OPT, "domyślnie tak; odznaczony = ciągnik znika z list wyboru (status „Wyłączona”)"],
    ], image="o12-vehicle-new-3", widths=[30, 17, 53], compact=True)

    d.two("Szczegóły i edycja ciągnika", "o13-vehicle-detail-1", "o14-vehicle-edit-1", """
<p>Kliknięcie wiersza — okno szczegółów: identyfikacja, <b>przypisanie</b> (przewoźnik, opiekun, planista, zespół), wyposażenie (GPS, karta paliwowa z numerem i PIN, porozumienie), stawki, pozwolenia, załączniki (<span class="ui">Otwórz</span>) i <b>Historia planistów</b>.</p>
<p><span class="ui">Edytuj</span> otwiera formularz. Pole <b>Planista</b> jest zablokowane — obok przycisk <span class="ui">Poproś o zmianę planisty</span>.</p>
""")

    d.shot("Zmiana planisty — wniosek", "o15-transfer-request", """
<ol class="steps">
<li>Edycja ciągnika → <span class="ui">Poproś o zmianę planisty</span>.</li>
<li>Wybierz <span class="ui">Nowy planista</span> (dowolny inny aktywny planista) — <b>wymagane</b>.</li>
<li>Wpisz <span class="ui">Powód</span> — <b>wymagany</b>, 3–500 znaków.</li>
<li><span class="ui">Wyślij wniosek</span> — wysyła się od razu, niezależnie od zapisu formularza ciągnika.</li>
</ol>
<div class="box info"><p>Planista zmienia się dopiero po <b>zatwierdzeniu przez lidera obecnego planisty lub administratora</b>.
Nie są wysyłane powiadomienia — wniosek czeka na liście „Do decyzji” decydenta.</p></div>
<p class="small">Jeden oczekujący wniosek na ciągnik. Wyłączonego ciągnika nie da się przekazać.</p>
""", tall=True)

    d.shot("Przekazania — Twoje wnioski", "o22-przekazania", f"""
<p>Zakładki: <b>Oczekujące</b> i <b>Rozpatrzone</b> (filtr: Zatwierdzone / Odrzucone / Anulowane).</p>
<p>Karta wniosku: ciągnik, przewoźnik, z → do planisty, kto wnioskuje, powód, status {pill('Oczekuje','amber')} {pill('Zatwierdzony','green')} {pill('Odrzucony','red')} {pill('Anulowany','grey')},
decyzja z komentarzem lub <b>powodem odrzucenia</b>, przycisk <span class="ui">Historia planistów</span>.</p>
<p>Własny oczekujący wniosek możesz <span class="ui">Anuluj wniosek</span>.</p>
<h3>Po zatwierdzeniu</h3>
<ul><li>ciągnik od razu przechodzi do nowego planisty;</li><li>wyjazdy „Zgłoszony” i „Załadowany” też;</li><li>wyjazd „W trasie” zostaje u starego planisty do zjazdu.</li></ul>
""")

    d.section("C", "Kierowcy, naczepy i dokumenty", "Kompletna flota = co najmniej jeden aktywny ciągnik, naczepa i kierowca.")

    d.table("Kierowca — formularz", ["Pole", "Wymagane", "Zasady"], [
        ["Przewoźnik", REQ, "tylko przy tworzeniu"],
        ["Imię / Nazwisko", REQ, "1–64 znaki każde"],
        ["Nr prawa jazdy", REQ, "1–64 znaki, dowolny format"],
        ["Ważność prawa jazdy", REQ, "data — wpływa na Alerty"],
        ["Prefiks telefonu", OPT, "tylko podpowiedź formatu numeru"],
        ["Telefon", REQ, "1–32 znaki; nietypowy format = ostrzeżenie, nie blokuje"],
        ["Telefon (drugi), E-mail", OPT, "e-mail poprawny, do 160 znaków"],
        ["Narodowość", REQ, "Białoruś, Rosja, Ukraina, Polska, Uzbekistan, Kirgistan, Kazachstan, Inne"],
        ["Języki komunikacji", REQ, "min. 1: polski, rosyjski, angielski, ukraiński, niemiecki, inny"],
        ["ADR → Klasy ADR + Świadectwo ADR", COND("gdy ADR"), "min. 1 klasa i <b>wymagany skan świadectwa</b>"],
        ["Notatki / Aktywny", OPT, "do 2000 znaków / domyślnie aktywny"],
    ], image="o17-driver-new-1", widths=[30, 15, 55], compact=True)

    d.table("Naczepa — formularz", ["Pole", "Wymagane", "Zasady"], [
        ["Przewoźnik", REQ, "tylko przy tworzeniu"],
        ["Numer rejestracyjny", REQ, "2–16 znaków, unikalny w ramach przewoźnika"],
        ["Typ naczepy", REQ, "ze słownika (np. STD, MEGA, COIL, IZO, CHŁO)"],
        ["Długość / Szerokość / Wysokość wewn. (m), Ładowność (t)", OPT, "liczby ≥ 0"],
        ["Boczny prześwit ład. (cm)", REQ, "liczba całkowita ≥ 0"],
        ["Dach podnoszony / przesuwany (+ Edscha)", OPT, "Edscha pojawia się przy dachu przesuwanym"],
        ["Kosz paletowy, Multilock", OPT, "pola wyboru"],
        ["Pasy / Maty / Belki", OPT, "po zaznaczeniu — <b>liczba wymagana, min. 3</b>"],
        ["Certyfikat XL", OPT, "po zaznaczeniu — <b>wymagany plik PDF</b>"],
        ["Notatki / Aktywny", OPT, "do 2000 znaków / domyślnie aktywna"],
    ], image="o19-trailer-new-1", widths=[36, 12, 52], compact=True)

    d.cols("Załączniki i usuwanie", """
<h3>Pliki</h3>
<ul>
<li>pole „Dodaj plik lub upuść”: <b>JPG, PNG, WebP, PDF</b>, maks. <b>10 MB</b> na plik, do 10 plików na pole;</li>
<li>Certyfikat XL naczepy — <b>tylko PDF</b>;</li>
<li>błędy: „Plik przekracza 10 MB”, „Nieobsługiwany typ pliku”.</li>
</ul>
<h3>Pliki wymagane warunkowo</h3>
<table class="compact"><tbody>
<tr><td>Umowa GPS</td><td>gdy podano numer GPS</td></tr>
<tr><td>Ubezpieczenie kabotażowe</td><td>gdy Kabotaż DE</td></tr>
<tr><td>Świadectwo ADR kierowcy</td><td>gdy kierowca ma ADR</td></tr>
<tr><td>Certyfikat XL (PDF)</td><td>gdy naczepa ma Certyfikat XL</td></tr>
<tr><td>Skan porozumienia</td><td>zalecany — bez niego karta paliwowa zablokowana</td></tr>
</tbody></table>
""", """
<h3>Wyłączanie zamiast usuwania</h3>
<p>W każdym formularzu jest pole <span class="ui">Aktywny</span>. Odznaczony ciągnik / naczepa / kierowca znika z list wyboru, ale zostaje w historii.</p>
<h3>Usuwanie</h3>
<ul>
<li><b>Ciągnik</b> — nieodwracalnie; numer rejestracyjny nie wróci do systemu;</li>
<li><b>Kierowca, naczepa</b> — usunięcie można cofnąć (przywraca administrator);</li>
<li><b>Przewoźnik</b> — tylko administrator.</li>
</ul>
<div class="box warn"><p>Wyłączenie lub usunięcie ciągnika anuluje oczekujący wniosek o zmianę planisty.</p></div>
""")

    d.section("D", "Pilnowanie terminów", "Alerty dokumentów i porozumienia pokazują, którzy przewoźnicy wymagają Twojej reakcji.")

    d.shot("Alerty dokumentów", "o06-alerts", f"""
<p>Dokumenty wygasające w ciągu 7 dni lub przeterminowane, liczone codziennie (dni kalendarzowe):</p>
<table class="compact"><tbody>
<tr><td>{pill('Przeterminowane','red')}</td><td>po dacie ważności</td></tr>
<tr><td>{pill('Wygasają dziś','red')}</td><td>0 dni</td></tr>
<tr><td>{pill('Za ≤3 dni','amber')}</td><td>1–3 dni</td></tr>
<tr><td>{pill('Za ≤7 dni','blue')}</td><td>4–7 dni</td></tr>
</tbody></table>
<p style="margin-top:8px">Śledzone: <b>Ubezpieczenie OCP</b>, <b>Licencja transportowa</b> (przewoźnik), <b>Karta paliwowa</b> (ciągnik), <b>Prawo jazdy</b> (kierowca).
Kliknięcie wiersza prowadzi do listy, gdzie zaktualizujesz datę.</p>
<p class="small">Alerty są tylko w aplikacji (licznik w menu), bez e-maila.</p>
""")

    d.shot("Porozumienia — zgłaszanie wyjazdów", "o05-porozumienia", f"""
<div class="box key"><p>Ciągnik z porozumieniem musi mieć <b>zgłoszony kolejny wyjazd w ciągu 10 polskich dni roboczych</b> od zjazdu (lub od włączenia gwarancji).</p></div>
<p>Sekcje: {pill('Po terminie','red')} → {pill('Zbliża się termin','amber')} (≤ 3 dni) → <b>Pod obserwacją</b> (zwinięta).</p>
<p>Wiersz: ciągnik, przewoźnik, ostatni zjazd / od włączenia gwarancji, termin, licznik. Kliknięcie → karta przewoźnika, zakładka Porozumienia.</p>
<h3>Codziennie o 07:10</h3>
<ul><li>przewoźnik dostaje przypomnienie 3 i 1 dzień przed terminem;</li>
<li><b>Ty dostajesz przegląd</b> „Gwarancje: przypomnienia i naruszenia — {{data}}” (gdy jest co pokazać).</li></ul>
""")

    d.two("Wyjazdy Twoich przewoźników", "o20-delegations", "o21-delegation-detail-1", """
<p>Podgląd tylko do odczytu. Filtry: status, przewoźnik / nr rej., data od–do; 50 na stronę.</p>
<p>Okno wyjazdu: trasa (zgłoszone / planowane / faktyczne daty), stawki, ciągnik i kierowca, historia statusu, nr zlecenia ze spedu, przebieg dzień po dniu, zespół prowadzący.</p>
<p class="small">Statusy zmieniają eksport i weryfikator; anulować może przewoźnik (Zgłoszony) lub admin.</p>
""")

    d.shot("Przebieg ciągników", "o23-km", """
<p>Tygodniowa tablica km, <b>tylko podgląd</b> (uzupełnia weryfikator), pogrupowana według przewoźników z sumą km.</p>
<ul>
<li>komórki: km ✓ / Nie jeździ / — (nie sprawdzono);</li>
<li>„Tylko jeżdżące” domyślnie <b>wyłączone</b> — widzisz całą flotę, łącznie ze stojącymi;</li>
<li>nawigacja tygodni, wyszukiwarka, notatki, <span class="ui">Historia</span> miesiąca.</li>
</ul>
<div class="box tip"><p>Dobry sposób, by zobaczyć, które ciągniki stoją, zanim system oznaczy je jako „Długo stojące”.</p></div>
""")

    d.table("E-maile opiekuna", ["E-mail", "Kiedy"], [
        ["Gwarancje: przypomnienia i naruszenia — {data}", "codziennie 07:10, jeśli któryś ciągnik zbliża się do terminu albo go przekroczył"],
        ["Nowy wniosek: {nr}", "Twój przewoźnik złożył wniosek (do wiadomości)"],
        ["Wniosek {nr}: ZAAKCEPTOWANO / ODRZUCONO", "decyzja w sprawie wniosku Twojego przewoźnika"],
        ["Kod weryfikacyjny / Reset hasła", "tylko jeśli logujesz się hasłem zamiast Google"],
    ], intro="Przewoźnik dostaje automatycznie e-maile, które wywołujesz: „Konto utworzone” i „Hasło zresetowane”.",
        note="Nie wysyłamy e-maili o: przekazaniach planistów, alertach dokumentów (są w aplikacji), reklamacjach (idą do opiekuna wniosków).", widths=[45, 55])

    d.cols("Checklista: nowy przewoźnik od zera", """
<ol class="steps">
<li><span class="ui">Przewoźnicy</span> → <span class="ui">+ Nowy przewoźnik</span>.</li>
<li>Krok 1: login, e-mail logowania, nazwa, osoba kontaktowa, telefon, e-mail zleceń; NIP → sprawdź plakietkę VIES/MF; adres; konto EUR; OCP ≥ 250 000 EUR i daty ważności OCP i licencji.</li>
<li>Krok 2: ciągnik — nr rej., typ, planista, zespół, 2 z 3 GB/IT/FR, 4 stawki; <b>zaznacz Porozumienie</b> i wgraj skan.</li>
<li>Krok 3: naczepa — nr rej., typ, prześwit boczny.</li>
<li>Krok 4: kierowca — dane, prawo jazdy z datą, narodowość, języki.</li>
</ol>
""", """
<ol class="steps" style="counter-reset:s 5">
<li>Wgraj dokumenty firmowe: karta przewoźnika → <span class="ui">Dokumenty</span> (OCP, licencja, KREPTD).</li>
<li>Upewnij się, że przewoźnik dostał e-mail z hasłem (albo przekaż hasło z kreatora).</li>
<li>Sprawdź na <span class="ui">Moja opieka</span>, że karta nie ma ⚠ „niekompletna flota”.</li>
<li>Poinformuj przewoźnika: zgłaszać każdy wyjazd przed wyjazdem; po zjeździe wniosek w 7 dni; kolejny wyjazd w 10 dni roboczych.</li>
</ol>
<div class="box tip"><p>Przy kolejnych ciągnikach / kierowcach korzystaj z list Ciągniki / Kierowcy / Naczepy → <span class="ui">+ Nowy …</span>.</p></div>
""")

    return d
