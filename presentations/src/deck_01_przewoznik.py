from build import Deck, ui, pill, REQ, OPT, COND, RO


def build() -> Deck:
    d = Deck("01-Przewoznik", "MAGGuarantee — instrukcja dla przewoźnika", "Przewoźnik")

    d.cover("01", "Rola: przewoźnik", "Instrukcja dla przewoźnika",
            "Jak zalogować się, zgłaszać wyjazdy, składać wnioski o dopłatę gwarancyjną i reklamacje, "
            "sprawdzać flotę, przebieg i terminy porozumienia. Wszystkie pola formularzy z zasadami wypełniania.")

    d.text("Spis treści", """
<ol class="toc">
<li>Twoja rola i panel przewoźnika</li>
<li>Logowanie, pierwsze logowanie, hasło</li>
<li>Wyjazdy: kiedy i jak zgłaszać</li>
<li>Formularz „Nowy wyjazd” — wszystkie pola</li>
<li>Lista wyjazdów, szczegóły, anulowanie</li>
<li>Cykl życia wyjazdu</li>
<li>Wnioski: warunki złożenia</li>
<li>Formularz „Nowy wniosek” — wszystkie pola</li>
<li>Podgląd kalkulacji i komunikaty</li>
<li>Lista i szczegóły wniosku</li>
<li>Reklamacja</li>
<li>Flota: ciągniki, kierowcy, naczepy</li>
<li>Przebieg km</li>
<li>Porozumienie o gwarancji i terminy</li>
<li>E-maile, ściągawka terminów, FAQ</li>
</ol>
""")

    d.cols("Twoja rola w systemie", """
<p>Jesteś <b>przewoźnikiem-podwykonawcą</b> MAGTRANS. To Ty uruchamiasz cały proces: bez Twojego zgłoszenia wyjazdu nikt w MAGTRANS nie zacznie pracy,
a bez Twojego wniosku nie będzie dopłaty.</p>
<h3>Co robisz w systemie</h3>
<ul>
<li><b>zgłaszasz wyjazdy</b> swoich ciągników;</li>
<li>po zjeździe <b>składasz wnioski</b> o dopłatę gwarancyjną;</li>
<li>w razie niezgody z decyzją — <b>reklamację</b> (48 h);</li>
<li>podglądasz <b>flotę</b>, <b>przebieg km</b> i <b>terminy porozumienia</b>.</li>
</ul>
""", """
<h3>Czego nie możesz</h3>
<ul>
<li>dodawać ani zmieniać ciągników, naczep, kierowców — robi to <b>Twój opiekun</b>;</li>
<li>edytować złożonego wniosku;</li>
<li>widzieć danych innych przewoźników.</li>
</ul>
<div class="box info"><h2>Twój opiekun</h2><p>Każdy przewoźnik ma przypisanego opiekuna w MAGTRANS. Zmiany floty, dokumentów, objęcie ciągnika gwarancją — zgłaszaj opiekunowi
(w zakładce Flota jest link <span class="ui">Skontaktuj się z opiekunem</span>).</p></div>
""")

    d.shot("Panel przewoźnika — zakładki", "c01-claims", f"""
<p>Po zalogowaniu widzisz listę wniosków. U góry są zakładki:</p>
<table class="compact"><tbody>
<tr><td>📋 Wnioski</td><td>Twoje wnioski o dopłatę</td></tr>
<tr><td>➕ Nowy</td><td>złożenie nowego wniosku</td></tr>
<tr><td>🚛 Flota</td><td>ciągniki, kierowcy, naczepy (podgląd)</td></tr>
<tr><td>🗺️ Wyjazdy</td><td>zgłaszanie i lista wyjazdów</td></tr>
<tr><td>🤝 Porozumienie</td><td>terminy zgłoszenia kolejnego wyjazdu</td></tr>
<tr><td>📈 Przebieg</td><td>dzienne km Twoich ciągników</td></tr>
</tbody></table>
<p class="small" style="margin-top:10px">Na zakładce Porozumienie pojawia się licznik: <b>czerwony</b> — termin minął, <b>bursztynowy</b> — zbliża się.</p>
""")

    d.two("Logowanie", "g02-login-filled-crop", "g03-verify-crop", """
<ol class="steps">
<li>Wpisz <span class="ui">Login</span> i <span class="ui">Hasło</span> → <span class="ui">Dalej →</span>.</li>
<li>Sprawdź e-mail: przyjdzie <b>6-cyfrowy kod</b> („Kod weryfikacyjny — MAGGuarantee”).</li>
<li>Wpisz kod — po 6. cyfrze zatwierdza się sam.</li>
</ol>
<div class="box warn"><p>Przycisk Google <b>nie jest dla przewoźników</b> — zawsze login i hasło.</p></div>
<p class="small">Kod ważny 10 min · <span class="ui">Wyślij kod ponownie</span> co 60 s · 5 złych kodów = blokada 5 min · 10 złych haseł = blokada 15 min.</p>
""")

    d.cols("Pierwsze logowanie i hasło", """
<h3>Pierwsze logowanie</h3>
<p>Opiekun zakłada Ci konto — dostajesz e-mail <b>„Konto utworzone — MAGGuarantee”</b> z loginem i <b>hasłem tymczasowym</b>.</p>
<ol class="steps">
<li>Zaloguj się loginem i hasłem tymczasowym, wpisz kod z e-maila.</li>
<li>System pokaże ekran <b>„Ustaw własne hasło”</b> — nie da się go pominąć.</li>
<li>Wpisz <span class="ui">Nowe hasło</span> i <span class="ui">Powtórz hasło</span> → <span class="ui">Zapisz i kontynuuj</span>.</li>
</ol>
<p>To samo dzieje się po resecie hasła przez opiekuna (e-mail „Hasło zresetowane”).</p>
""", """
<h3>Wymagania dla hasła</h3>
<ul><li>od 10 do 128 znaków;</li><li>co najmniej 1 litera;</li><li>co najmniej 1 cyfra.</li></ul>
<h3>Zapomniałeś hasła?</h3>
<p><span class="ui">Nie pamiętam hasła</span> → login → <span class="ui">Wyślij kod</span> → kod z e-maila + nowe hasło dwa razy → <span class="ui">Ustaw hasło</span>.</p>
<h3>Zmiana hasła po zalogowaniu</h3>
<p>Menu z Twoim imieniem (prawy górny róg) → <span class="ui">Zmień hasło</span>. Stare hasło nie jest potrzebne, zostajesz zalogowany.</p>
<div class="box"><p>Sesja trwa do 30 dni. Wyloguj się na wspólnych komputerach: menu → <span class="ui">Wyloguj</span>.</p></div>
""")

    d.section("A", "Wyjazdy", "Zgłoszenie wyjazdu to pierwszy krok całego procesu. Bez zgłoszonego i zakończonego wyjazdu nie złożysz wniosku.")

    d.cols("Kiedy i jak zgłaszać wyjazd", """
<div class="box key"><h2>Zasada</h2><p>Każdy wyjazd ciągnika zgłaszasz w systemie <b>przed wyjazdem</b> (data wyjazdu nie może być w przeszłości).
Po każdym zjeździe ciągnika objętego gwarancją masz <b>10 polskich dni roboczych</b> na zgłoszenie kolejnego wyjazdu.</p></div>
<h3>Warunki</h3>
<ul>
<li>masz co najmniej jeden <b>aktywny ciągnik, naczepę i kierowcę</b> — inaczej zobaczysz ekran „Nie można zarejestrować wyjazdu” (skontaktuj się z opiekunem);</li>
<li>ciągnik <b>nie ma innego aktywnego wyjazdu</b> (Zgłoszony / Załadowany / W trasie).</li>
</ul>
""", """
<h3>Krok po kroku</h3>
<ol class="steps">
<li>Zakładka <span class="ui">Wyjazdy</span> → <span class="ui">Nowy wyjazd</span>.</li>
<li>Wybierz ciągnik, kierowcę i naczepę.</li>
<li>Podaj datę i godzinę wyjazdu, kraj i kod pocztowy.</li>
<li>Podaj planowany dzień powrotu, kraj i kod pocztowy.</li>
<li>Opcjonalnie komentarz (np. rodzaj ładunku) → <span class="ui">Zarejestruj wyjazd</span>.</li>
</ol>
<p>Dostaniesz e-mail <b>„Nowy wyjazd: {nr rej.}”</b>, a zespół MAGTRANS — wiadomość w Google Chat. Zgłoszenie od razu zatrzymuje licznik porozumienia.</p>
""")

    d.shot("Formularz „Nowy wyjazd”", "c09-delegation-new", """
<p>Formularz ma trzy sekcje: <b>Ciągnik i kierowca</b>, <b>Wyjazd</b>, <b>Powrót</b> + komentarz.</p>
<p>Gwiazdka <b style="color:var(--red)">*</b> oznacza pole wymagane. Puste pole listy pokazuje „Wybierz wartość z listy”.</p>
<p>Przyciski:</p>
<ul><li><span class="ui">Wyczyść</span> — czyści formularz;</li><li><span class="ui">Zarejestruj wyjazd</span> — wysyła zgłoszenie.</li></ul>
<p class="small">Na listach są tylko aktywne ciągniki, kierowcy i naczepy. Jeśli kogoś brakuje — opiekun musi go dodać lub aktywować.</p>
""", tall=True)

    d.table("„Nowy wyjazd” — pola", ["Pole", "Wymagane", "Zasady i komunikaty"], [
        ["Ciągnik", REQ, "Twój aktywny ciągnik bez innego aktywnego wyjazdu. Błąd: „Ta maszyna jest już przypisana do aktywnego wyjazdu (…)”"],
        ["Kierowca", REQ, "aktywny kierowca Twojej firmy"],
        ["Naczepa", REQ, "Twoja naczepa (numer + typ)"],
        ["Data i godzina wyjazdu", REQ, "nie w przeszłości (10 min tolerancji): „Data wyjazdu nie może być w przeszłości.”"],
        ["Kraj wyjazdu", REQ, "lista krajów UE; zmiana kraju czyści kod pocztowy"],
        ["Kod pocztowy wyjazdu", REQ, "format zależny od kraju, np. PL <code>00-001</code>, DE <code>10115</code>, NL <code>1011 AB</code>, CZ <code>999 99</code>"],
        ["Planowany powrót", REQ, "sama data; ten sam dzień co wyjazd lub później"],
        ["Kraj powrotu", REQ, "jak przy wyjeździe"],
        ["Kod pocztowy powrotu", REQ, "jak przy wyjeździe: „Nieprawidłowy format kodu pocztowego dla XX”"],
        ["Komentarz", OPT, "do 2000 znaków — widoczny jako „Notatki” w szczegółach wyjazdu"],
    ], widths=[24, 12, 64], compact=True)

    d.shot("Lista wyjazdów i anulowanie", "c07-delegations", f"""
<p>Kolumny: Ciągnik, Kierowca, Wyjazd (data i godzina), Planowany powrót, Status.</p>
<p>Filtr <span class="ui">Wszystkie statusy</span> pozwala pokazać np. tylko „Zjechał”.</p>
<h3>Anulowanie</h3>
<p>Przycisk <span class="ui">Anuluj</span> jest tylko przy wyjazdach {pill('Zgłoszony','blue')}.
Potwierdzenie: „Anulować wyjazd? Tej operacji nie można cofnąć.” → <span class="ui">Anuluj wyjazd</span>.</p>
<div class="box warn"><p>Gdy eksport oznaczy wyjazd jako {pill('Załadowany','amber')}, nie możesz go już anulować — skontaktuj się z opiekunem.</p></div>
""")

    d.shot("Szczegóły wyjazdu", "c08-delegation-detail-1", """
<p>Kliknij wiersz, aby otworzyć szczegóły (tylko podgląd):</p>
<ul>
<li><b>Trasa</b> — wyjazd i powrót: <i>zgł.</i> = zgłoszone, <i>plan.</i> = planowane, <i>fakt.</i> = faktyczne (wpisuje weryfikator), kody pocztowe, liczba dni;</li>
<li><b>Stawki</b> DE / UE / eksport / import;</li>
<li><b>Ciągnik i kierowca</b>, naczepa;</li>
<li><b>Historia statusu</b> — kto zgłosił, kiedy zaakceptował eksport, kiedy potwierdzono trasę; <b>Nr zlecenia ze spedu</b>;</li>
<li><b>Przebieg w trakcie wyjazdu</b> — km dzień po dniu i suma;</li>
<li><b>Zespół prowadzący</b> — planista i eksport.</li>
</ul>
""", tall=True)

    d.table("Cykl życia wyjazdu", ["Status", "Kto ustawia", "Co możesz zrobić"], [
        [pill("Zgłoszony", "blue"), "Ty — po rejestracji", "anulować; poczekać na eksport"],
        [pill("Załadowany", "amber"), "Eksport — po wystawieniu zlecenia w SpedTrans", "tylko podgląd. Dostajesz e-mail „Zlecenie {nr} — ciągnik {nr rej.}”"],
        [pill("W trasie", "green"), "Weryfikator — faktyczna data i godzina wyjazdu", "tylko podgląd"],
        [pill("Zjechał", "grey"), "Weryfikator — faktyczna data i godzina zjazdu", "<b>złożyć wniosek</b> w ciągu 7 dni; zgłosić kolejny wyjazd w ciągu 10 dni roboczych"],
        [pill("Anulowany", "red"), "Ty (ze „Zgłoszony”) lub administrator", "—"],
    ], note="Kolejność jest stała. Status „Zjechał” jest końcowy i od niego liczy się termin złożenia wniosku.", widths=[16, 40, 44])

    d.section("B", "Wnioski o dopłatę", "Wniosek składasz do zakończonego wyjazdu („Zjechał”). System sam liczy kwotę — Ty podajesz okres, godziny i przebieg.")

    d.cols("Warunki złożenia wniosku", """
<ol class="steps">
<li><b>Wyjazd ma status „Zjechał”</b> i nie ma jeszcze wniosku (jeden wniosek na wyjazd).</li>
<li><b>Ciągnik jest objęty gwarancją</b> (porozumienie). Jeśli nie: „Ten samochód nie jest objęty gwarancją” — skontaktuj się z opiekunem.</li>
<li><b>Do 7 dni</b> od faktycznego zjazdu (data weryfikatora, nie data, którą wpiszesz). Dzień 7. jest jeszcze dozwolony.</li>
<li><b>Min. 10,00 dni przepracowanych</b> w okresie.</li>
<li><b>Okres maks. 90 dni</b>, daty nie w przyszłości, data od nie wcześniej niż zgłoszona data wyjazdu.</li>
</ol>
""", """
<ol class="steps" start="6" style="counter-reset:s 5">
<li><b>6 dni odstępu</b> od poprzedniego wniosku na ten sam ciągnik (odrzucone wnioski nie blokują).</li>
<li><b>Przebieg &gt; 0</b> i średnio maks. <b>2000 km/dzień</b>.</li>
<li><b>Musi być niedobór</b>: przebieg mniejszy niż km gwarantowane. Inaczej: „Km zrealizowane (X) są równe lub wyższe niż km gwarantowane (Y). Brak podstaw do dopłaty.”</li>
</ol>
<div class="box tip"><p>Formularz sprawdza większość warunków na bieżąco — przycisk <span class="ui">Złóż wniosek</span> jest aktywny dopiero, gdy wszystko się zgadza.</p></div>
""")

    d.shot("Formularz „Nowy wniosek”", "c02-claim-new-empty", """
<p>Zakładka <span class="ui">Nowy</span> lub przycisk <span class="ui">Nowy wniosek</span>.</p>
<ul>
<li>po lewej — formularz: <b>Wyjazd</b>, <b>Okres</b>, <b>Ciągnik i kierowca</b>, <b>Wartości</b>, komentarz;</li>
<li>po prawej — <b>podgląd kalkulacji</b>, odświeżany po każdej zmianie.</li>
</ul>
<p>Najpierw wybierz wyjazd — ciągnik, naczepa i kierowca zostaną pobrane z wyjazdu automatycznie.</p>
<p class="small">Wpisane dane zapamiętują się w tej karcie przeglądarki. <span class="ui">Wyczyść</span> usuwa je.</p>
""")

    d.table("„Nowy wniosek” — pola", ["Pole", "Wymagane", "Zasady"], [
        ["Wybierz wyjazd", REQ, "tylko Twoje wyjazdy „Zjechał” bez wniosku; opcja: <i>nr rej. · data wyjazdu → data powrotu</i>; „· (bez gwarancji)” = nie da się złożyć"],
        ["Data od (załadunku)", REQ, "nie wcześniej niż zgłoszona data wyjazdu, nie w przyszłości"],
        ["Data do (rozładunku)", REQ, "≥ Data od, nie w przyszłości; okres maks. 90 dni"],
        ["Godzina od", REQ, "HH:MM — godzina wyjazdu w pierwszym dniu (wpływa na ułamek pierwszego dnia)"],
        ["Godzina do", REQ, "HH:MM — godzina powrotu w ostatnim dniu"],
        ["Ciągnik / Kierowca / Naczepa", RO, "pobierane z wybranego wyjazdu"],
        ["Przebieg (km)", REQ, "liczba całkowita &gt; 0, <b>zgodnie z SpedTrans</b>; maks. 2000 km/dzień średnio"],
        ["Komentarz", OPT, "rozwiń „Dodaj komentarz”; do 2000 znaków"],
    ], note="Pola nie są wypełniane automatycznie z wyjazdu — wpisz okres, godziny i przebieg zgodnie z dokumentami. Weryfikację danych robi Opiekun wniosków.",
        widths=[24, 12, 64])

    d.shot("Podgląd kalkulacji", "c03-claim-new-filled", """
<p>Po prawej widzisz na żywo:</p>
<ul>
<li><b>Km gwarantowane</b> — ile powinieneś przejechać;</li>
<li><b>Różnica km</b> — niedobór;</li>
<li><b>Stawka €/km</b>;</li>
<li><b>Dopłata gwarancyjna (EUR)</b>.</li>
</ul>
<p>Pod spodem tabela miesięcy: <i>Miesiąc, Dni rob., Km/dz., €/km, Km/mc</i>, wiersz sobót, dni wyłączone (święta / zakaz UE) oraz
<b>pierwszy / ostatni dzień</b> liczony proporcjonalnie do godzin.</p>
<div class="box info"><p>Kwota może się zmienić po weryfikacji — opiekun wniosków porównuje Twoje dane z tablicą km i SpedTrans.</p></div>
""")

    d.table("Komunikaty przy składaniu wniosku", ["Komunikat (skrót)", "Co zrobić"], [
        ["„Data rozładunku musi być równa lub późniejsza od daty załadunku.”", "popraw daty"],
        ["„Data rozładunku (D) jest w przyszłości…”", "wniosek składasz dopiero po zjeździe"],
        ["„Okres wniosku nie może przekraczać 90 dni”", "skróć okres"],
        ["„Data załadunku nie może być wcześniejsza niż zgłoszona data wyjazdu”", "data od ≥ data zgłoszona w wyjeździe"],
        ["„Wniosek można złożyć dopiero, gdy przepracowano co najmniej 10,00 dni”", "okres za krótki — nie przysługuje wniosek"],
        ["„Termin na złożenie wniosku minął… masz 7 dni od daty rozładunku”", "termin liczony od faktycznego zjazdu — nie da się złożyć"],
        ["„Następny wniosek na ten pojazd można złożyć od …”", "6 dni odstępu na ten sam ciągnik"],
        ["„Średni przebieg dzienny (X km/dzień) przekracza … 2000”", "sprawdź wpisany przebieg"],
        ["„Km zrealizowane … równe lub wyższe niż km gwarantowane”", "brak niedoboru = brak dopłaty"],
        ["„Ten samochód nie jest objęty gwarancją”", "skontaktuj się z opiekunem"],
    ], note="Po wysłaniu błędy serwera pojawiają się jako lista nad formularzem: „Wniosek nie może zostać zapisany:”.", compact=True, widths=[60, 40])

    d.shot("Lista wniosków", "c01-claims", f"""
<p>Filtry: numer zgłoszenia (format <code>GWA/NNN/MM/RR</code>), status, ciągnik.</p>
<p>Każda karta pokazuje:</p>
<ul>
<li>numer i status;</li>
<li>kwotę: <b>kalkulacja</b> (przed decyzją) lub <b>kwota zatwierdzona</b> (po decyzji) — zielona przy akceptacji, czerwona przy odrzuceniu;</li>
<li>okres, ciągnik, km: przebieg / gwarantowane;</li>
<li>znacznik reklamacji: „Reklamacja zgłoszona”, „uznana” lub „odrzucona”.</li>
</ul>
<p>Statusy: {pill('Weryfikacja','blue')} {pill('Czeka na autoryzację','blue')} {pill('Zaakceptowano','green')} {pill('Odrzucono','red')} {pill('Reklamacja','amber')}</p>
""")

    d.shot("Szczegóły wniosku", "c04-claim-detail-accepted", """
<ul>
<li>duża kwota: <b>kwota zatwierdzona</b>, <b>kalkulacja</b> lub <b>wypłacono łącznie</b> (decyzja + uznana reklamacja);</li>
<li>„Wnioskowano” przekreślone — gdy weryfikacja zmieniła kwotę; „Po weryfikacji” — nowa kwota;</li>
<li>okres, czas (h), ciągnik, przebieg, km gwarantowane;</li>
<li><b>Podział na miesiące</b> — jak w podglądzie;</li>
<li><b>Szczegóły</b>: data zgłoszenia i decyzji, kwoty, <b>Numer zlecenia</b> i <b>Data zlecenia</b> (na nie zostanie wypłacona kwota), komentarz.</li>
</ul>
<p>Przycisk <span class="ui">Złóż reklamację</span> widać przez 48 h po decyzji.</p>
""", tall=True)

    d.cols("Reklamacja — kiedy można", f"""
<p>Reklamacja to odwołanie od decyzji. Warunki:</p>
<ul>
<li>wniosek jest {pill('Zaakceptowano','green')} lub {pill('Odrzucono','red')};</li>
<li>nie minęło <b>48 godzin</b> od decyzji;</li>
<li>to pierwsza reklamacja do tego wniosku (<b>tylko jedna</b>);</li>
<li>jest kwota do odzyskania: <b>maksimum = kwota wnioskowana − wypłacona</b>. Przy odrzuceniu — cała kwota wnioskowana.</li>
</ul>
<p>Gdy nie można złożyć, zamiast przycisku zobaczysz np. „Termin reklamacji upłynął (48 godzin od decyzji).” lub
„Reklamacja nie jest możliwa — wypłacona kwota pokrywa całą kwotę wnioskowaną.”</p>
""", f"""
<h3>Wynik reklamacji</h3>
<ul>
<li><b>Uznana</b> — wypłacona zostanie dokładnie kwota z reklamacji, na podany numer zlecenia;</li>
<li><b>Odrzucona</b> — uzasadnienie zobaczysz jako „Odpowiedź MAGTRANS”.</li>
</ul>
<p>Po rozpatrzeniu status wniosku wraca do poprzedniego ({pill('Zaakceptowano','green')} / {pill('Odrzucono','red')}), a wynik widać w sekcji „Reklamacja”.</p>
<div class="box info"><p>Dostaniesz e-maile: „Reklamacja złożona: {{nr}}” i potem „Wniosek {{nr}}: reklamacja uznana / odrzucona”.</p></div>
""")

    d.shot("Formularz reklamacji", "c05-reklamacja-sheet", f"""
<p>Panel otwiera się z prawej strony. U góry licznik <b>„Pozostało: Xh Ymin”</b> (czerwony poniżej 1 h).</p>
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th><th>Zasady</th></tr></thead><tbody>
<tr><td>Treść reklamacji</td><td><span class="req">TAK</span></td><td>1–4000 znaków; opisz powód</td></tr>
<tr><td>Kwota reklamacji (EUR)</td><td><span class="req">TAK</span></td><td>&gt; 0 i ≤ maksimum (podpowiedź pod polem)</td></tr>
</tbody></table>
<p style="margin-top:10px"><span class="ui">Anuluj</span> / <span class="ui">Wyślij reklamację</span> → komunikat „Reklamacja wysłana”, status {pill('Reklamacja','amber')}.</p>
""")

    d.shot("Wniosek z reklamacją", "c06-claim-detail-reklamacja", """
<p>Sekcja <b>Reklamacja</b> pokazuje:</p>
<ul>
<li>stan: „Reklamacja została zgłoszona i czeka na rozpatrzenie.” / „Reklamacja uznana — kwota X € zostanie wypłacona.” / „Reklamacja odrzucona.”;</li>
<li>kwotę i datę zgłoszenia, treść;</li>
<li>po decyzji: nr zlecenia (przy uznaniu), datę rozpatrzenia, <b>Odpowiedź MAGTRANS</b>.</li>
</ul>
<p>W szczegółach w polu „Komentarz” może pojawić się uzasadnienie decyzji opiekuna wniosków.</p>
""", tall=True)

    d.section("C", "Flota, przebieg i porozumienie", "Podgląd Twoich zasobów i terminów. Dane floty prowadzi opiekun — Ty je sprawdzasz.")

    d.shot("Flota — ciągniki", "c10-fleet", f"""
<p>Kafelki u góry działają jak filtry: <b>Ciągniki</b> (wszystkie), {pill('Aktywne','green')}, <b>Stojące</b>, {pill('Długo stojące','amber')}, {pill('Do usunięcia','red')}.</p>
<table class="compact"><tbody>
<tr><td>Aktywna</td><td>ma aktywny wyjazd</td></tr>
<tr><td>Stojąca</td><td>wróciła ≤ 14 dni temu</td></tr>
<tr><td>Długo stojąca</td><td>stoi 15–28 dni</td></tr>
<tr><td>Do usunięcia</td><td>stoi ≥ 29 dni</td></tr>
<tr><td>Wyłączona</td><td>wyłączona przez MAGTRANS</td></tr>
</tbody></table>
<p class="small" style="margin-top:8px">Kolumny: nr rej. (plakietka „Brak skanu porozumienia”), karta paliwowa (aktywna/zablokowana), typ, EURO, ADR, GB/IT/FR, ostatni przejazd, status, <b>Gwarancja</b> (licznik dni).</p>
""")

    d.two("Szczegóły ciągnika i kierowcy", "c11-vehicle-detail-1", "c12-fleet-drivers", """
<p>Kliknij wiersz ciągnika, aby zobaczyć: identyfikację, przypisanie (opiekun, planista, zespół), wyposażenie i porozumienie, stawki, pozwolenia, załączniki.</p>
<p>Zakładki <span class="ui">Kierowcy</span> i <span class="ui">Naczepy</span> — wyszukiwanie, telefon, nr prawa jazdy, typ naczepy, status.</p>
<div class="box warn"><p>Coś się nie zgadza? <span class="ui">Skontaktuj się z opiekunem</span> — tylko on zmienia dane floty.</p></div>
""")

    d.shot("Przebieg km", "c13-km", """
<p>Tygodniowa tablica dziennego przebiegu Twoich ciągników — <b>tylko podgląd</b>, uzupełnia ją weryfikator MAGTRANS (dane na poprzedni dzień).</p>
<ul>
<li>komórka: <b>km ✓</b> (jechał), <b>Nie jeździ</b>, <b>—</b> (nie sprawdzono);</li>
<li>‹ › zmiana tygodnia, <span class="ui">Bieżący tydzień</span>, wybór tygodnia z kalendarza;</li>
<li><span class="ui">Tylko jeżdżące</span>, wyszukiwarka, kolumny Σ km i Notatka;</li>
<li><span class="ui">Historia</span> — kalendarz miesiąca z sumą km.</li>
</ul>
<p class="small">Wniosek liczony jest z przebiegu, który wpiszesz (SpedTrans); tablica służy do porównania przy weryfikacji.</p>
""")

    d.shot("Porozumienie o gwarancji", "c14-porozumienie", f"""
<div class="box key"><p>Ciągnik objęty gwarancją: <b>po każdym zjeździe zgłoś kolejny wyjazd w ciągu 10 polskich dni roboczych</b>
(bez sobót, niedziel i świąt PL). Licznik startuje od zjazdu lub od dnia objęcia gwarancją.</p></div>
<p>Grupy: {pill('Po terminie','red')} {pill('Zbliża się termin','amber')} (≤ 3 dni) · <b>Pod obserwacją</b> · <b>W trasie / wyjazd zgłoszony</b> (licznik wstrzymany).</p>
<p>Przy każdym ciągniku: ostatni zjazd, termin, licznik i <span class="ui">Zgłoś wyjazd</span> (wybierz ten ciągnik z listy w formularzu).</p>
<p class="small">E-mail przypomnienia „Przypomnienie: zgłoś wyjazd” przychodzi 3 i 1 dzień roboczy przed terminem. Poniżej — historia epizodów.</p>
""", tall=True)

    d.two("E-maile, które dostajesz", "m02-mail-decision", "m04-mail-reklamacja", """
<table class="compact"><tbody>
<tr><td>Kod weryfikacyjny</td><td>przy logowaniu</td></tr>
<tr><td>Konto utworzone / Hasło zresetowane</td><td>login + hasło tymczasowe</td></tr>
<tr><td>Nowy wyjazd: {nr rej.}</td><td>potwierdzenie zgłoszenia</td></tr>
<tr><td>Zlecenie {nr} — ciągnik</td><td>wyjazd Załadowany</td></tr>
<tr><td>Nowy wniosek: {nr}</td><td>potwierdzenie z kwotą</td></tr>
<tr><td>Wniosek {nr}: ZAAKCEPTOWANO / ODRZUCONO</td><td>decyzja + link</td></tr>
<tr><td>Reklamacja złożona / rozpatrzona</td><td>potwierdzenie i wynik</td></tr>
<tr><td>Przypomnienie: zgłoś wyjazd</td><td>3 i 1 dzień przed terminem</td></tr>
</tbody></table>
""")

    d.table("Ściągawka terminów", ["Co", "Termin / limit"], [
        ["Zgłoszenie wyjazdu", "przed wyjazdem (data nie w przeszłości)"],
        ["Kolejny wyjazd ciągnika z gwarancją", "<b>10 polskich dni roboczych</b> od zjazdu"],
        ["Złożenie wniosku", "<b>7 dni</b> od faktycznego zjazdu"],
        ["Okres wniosku", "maks. 90 dni, min. 10,00 dni przepracowanych"],
        ["Kolejny wniosek na ten sam ciągnik", "po 6 dniach (odrzucone się nie liczą)"],
        ["Przebieg", "&gt; 0, średnio ≤ 2000 km/dzień"],
        ["Reklamacja", "<b>48 h</b> od decyzji, jedna, ≤ wnioskowana − wypłacona"],
        ["Komentarz do wyjazdu / wniosku", "do 2000 znaków; treść reklamacji do 4000"],
        ["Kod logowania", "10 minut"],
    ], widths=[45, 55])

    d.table("Najczęstsze pytania", ["Pytanie", "Odpowiedź"], [
        ["Nie widzę wyjazdu na liście „Wybierz wyjazd”", "wniosek składa się tylko do wyjazdu „Zjechał” bez wniosku; jeśli wyjazd jest „W trasie”, czekaj na potwierdzenie zjazdu przez weryfikatora"],
        ["Nie mogę zarejestrować wyjazdu", "brakuje aktywnego ciągnika, naczepy lub kierowcy — skontaktuj się z opiekunem"],
        ["Ciągnik „bez gwarancji”", "ciągnik nie ma porozumienia — tylko opiekun może je włączyć"],
        ["Pomyliłem się w zgłoszonym wyjeździe", "anuluj go (tylko „Zgłoszony”) i zgłoś ponownie; później — przez opiekuna"],
        ["Kwota po weryfikacji jest niższa", "opiekun wniosków skorygował dane (np. przebieg wg SpedTrans); możesz złożyć reklamację w 48 h"],
        ["Kod nie przychodzi", "sprawdź SPAM, odczekaj 60 s i kliknij „Wyślij kod ponownie”; kod idzie na e-mail konta"],
        ["Wpisałem godzinę, a dzień i tak „nie zaliczony”", "dzień graniczny w weekend/święto/zakaz UE nie liczy się niezależnie od godziny"],
    ], compact=True, widths=[34, 66])

    return d
