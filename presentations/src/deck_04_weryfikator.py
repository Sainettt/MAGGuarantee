from build import Deck, ui, pill, REQ, OPT, COND, RO


def build() -> Deck:
    d = Deck("04-Weryfikator", "MAGGuarantee — instrukcja dla weryfikatora", "Weryfikator")

    d.cover("04", "Rola: weryfikator", "Instrukcja dla weryfikatora",
            "Jak prowadzić dzienną tablicę km ciągników, oznaczać wyjazdy „w trasie” i „zjechał” oraz jak Twoje dane wpływają na wnioski o dopłatę.")

    d.cols("Twoja rola", """
<p>Jesteś <b>źródłem faktów</b> o ruchu ciągników. Na Twoich danych opierają się wnioski przewoźników i decyzje opiekuna wniosków.</p>
<div class="box key"><h2>Dwa zadania</h2><ol>
<li><b>Tablica km</b> — codziennie dla każdego ciągnika: <i>Jechał</i> + km albo <i>Nie jeździ</i>.</li>
<li><b>Wyjazdy</b> — potwierdzasz faktyczny wyjazd ({pill_t}) i faktyczny zjazd ({pill_z}) z datą i godziną.</li>
</ol></div>
""".replace("{pill_t}", pill("W trasie", "green")).replace("{pill_z}", pill("Zjechał", "grey")), """
<h3>Zakładki</h3>
<table class="compact"><tbody>
<tr><td>Ciągniki / km</td><td>tygodniowa tablica km (strona startowa)</td></tr>
<tr><td>Wyjazdy</td><td>lista wyjazdów i zmiana statusu</td></tr>
</tbody></table>
<h3>Nie możesz</h3>
<ul><li>anulować wyjazdów (przewoźnik / admin);</li><li>oznaczać „Załadowany” (eksport);</li><li>widzieć ani decydować o wnioskach.</li></ul>
<p>Widzisz <b>wszystkie aktywne ciągniki i wszystkie wyjazdy</b> — bez podziału na przewoźników.</p>
""")

    d.shot("Tablica km — widok tygodnia", "w01-km-board", """
<p><b>Kafelki:</b> Tydzień · Ciągniki · W ruchu · Nie jeżdżą · Σ km · Notatek.</p>
<p>„Dane aktualne na poprzedni dzień. Dzień bieżący i przyszłe są zablokowane.” oraz postęp „X z Y ciągników uzupełnionych w tym tygodniu”.</p>
<ul>
<li>‹ › poprzedni / następny tydzień, przycisk tygodnia otwiera kalendarz, <span class="ui">Bieżący tydzień</span>;</li>
<li>tydzień jest w adresie strony — link można wysłać;</li>
<li>wyszukiwarka: nr rej. / nr boczny / przewoźnik.</li>
</ul>
<p>Wiersz: ciągnik (nr rej., bok, przewoźnik · opiekun · planista), dni Pn–Nd, Σ km, notatka, <span class="ui">Historia</span>.</p>
""")

    d.table("Stany komórki", ["Stan", "Wygląd", "Znaczenie"], [
        ["Jechał", "zielony ✓ + liczba km", "ciągnik jechał tego dnia, podano przebieg"],
        ["Nie jeździ", "ikona parkingu, szare tło", "ciągnik stał"],
        ["Nie sprawdzono", "„—”, białe tło", "brak wpisu — do uzupełnienia"],
        ["Zablokowane", "przyciemnione, kłódka", "dzisiaj lub przyszłość: „Można uzupełnić dopiero następnego dnia.”"],
        ["Z notatką", "mała ikona notatki", "dzień ma notatkę (lista w kolumnie Notatka)"],
    ], intro="Dzisiejszy dzień ma czerwone podkreślenie w nagłówku, weekendy — szare tło.",
        note="Kolumna Σ km to suma tygodnia; kafelek „W ruchu” liczy ciągniki, których ostatni wpis w tygodniu to „Jechał”.", widths=[20, 32, 48])

    d.two("Wpisywanie km", "w02-km-cell-editor", "w03-km-cell-empty", """
<ol class="steps">
<li>Kliknij komórkę minionego dnia (lub Tab + Enter).</li>
<li><span class="ui">Status dnia</span>: <b>Jechał</b> / <b>Nie jeździ</b>.</li>
<li>Przy „Jechał” wpisz <span class="ui">Przebieg (km)</span> — <b>wymagany</b>, tylko cyfry, &gt; 0.</li>
<li>Opcjonalnie <span class="ui">Notatka</span> (do 2000 znaków).</li>
<li><span class="ui">Zapisz</span> (Enter) lub <span class="ui">Anuluj</span> (Esc).</li>
</ol>
<p class="small">0 km → podpowiedź „0 km? oznacz „nie jeździ””. Puste → „Podaj km”.
<span class="ui">Wyczyść ten dzień</span> przywraca „Nie sprawdzono” (z potwierdzeniem).</p>
""")

    d.cols("Zasady edycji tablicy", """
<ul>
<li>edytować można <b>tylko dni minione</b> (czas polski) — także dowolnie stare tygodnie;</li>
<li>jeden wpis na ciągnik i dzień — kolejny zapis go nadpisuje;</li>
<li>każdy zapis i wyczyszczenie trafia do audytu;</li>
<li>zapis „Jechał” przesuwa datę <b>ostatniego przejazdu</b> ciągnika (statusy floty);</li>
<li>brak operacji zbiorczych — każdy dzień wpisuje się osobno.</li>
</ul>
<div class="box warn"><p>Maksymalna wartość km to 9 999 999; za duże wartości odrzuci serwer („Nie udało się zapisać km”) — sprawdź liczbę.</p></div>
""", """
<h3>Wpływ na wnioski</h3>
<ul>
<li>opiekun wniosków widzi <b>sumę km z tablicy</b> za okres wyjazdu w kolumnie „Dane weryfikatora” i może ją zastosować;</li>
<li>w okresach mieszanych (miesiąc bez gwarancji) dopłata liczy się <b>bezpośrednio z tablicy</b> — <b>akceptacja jest zablokowana, dopóki są luki</b>;</li>
<li>zmiana km po weryfikacji wniosku wymusza ponowny zapis weryfikacji.</li>
</ul>
<div class="box key"><p>Uzupełniaj tablicę codziennie — szczególnie <b>dzień zjazdu</b> (możliwy do wpisania dopiero następnego dnia).</p></div>
""")

    d.two("Historia ciągnika i bieżący tydzień", "w04-km-history", "w05-km-current-week", """
<p><span class="ui">Historia</span> w wierszu — kalendarz miesiąca (od miesiąca utworzenia ciągnika do bieżącego), suma „Σ km w miesiącu”, tylko podgląd.</p>
<p>Bieżący tydzień: dni od dziś są zablokowane — widać kłódki.</p>
""")

    d.shot("Wyjazdy", "w06-delegations", f"""
<p>Filtry: status, <span class="ui">Pokaż historię (zjechał / anulowane)</span>. Domyślnie widać aktywne: {pill('Zgłoszony','blue')} {pill('Załadowany','amber')} {pill('W trasie','green')}.</p>
<p>Kolumny: Ciągnik, Przewoźnik, Trasa, Okres, Status, Akcje.</p>
<table class="compact"><thead><tr><th>Status wiersza</th><th>Akcja</th></tr></thead><tbody>
<tr><td>{pill('Załadowany','amber')}</td><td><span class="ui">Oznacz w trasie</span></td></tr>
<tr><td>{pill('W trasie','green')}</td><td><span class="ui">Oznacz zjechał</span></td></tr>
<tr><td>pozostałe</td><td>—</td></tr>
</tbody></table>
<p class="small" style="margin-top:6px">„W trasie” można oznaczyć dopiero po „Załadowany” od eksportu. Kliknięcie wiersza — szczegóły wyjazdu. Lista pokazuje 50 najnowszych.</p>
""")

    d.two("Oznacz w trasie / Oznacz zjechał", "w07-mark-in-transit", "w08-mark-returned", f"""
<h3>Oznacz w trasie</h3>
<p><span class="ui">Data i godzina faktycznego wyjazdu</span> — <b>wymagana</b>; domyślnie zgłoszona; nie w przyszłości i nie wcześniej niż dzień zgłoszonego wyjazdu.</p>
<h3>Oznacz zjechał</h3>
<p><span class="ui">Data i godzina zjazdu</span> — <b>wymagana</b>; nie w przyszłości i nie przed faktycznym wyjazdem.</p>
<p class="small">Ostrzeżenie „dla N dni tego wyjazdu nie wpisano przebiegu na tablicy km” — nie blokuje, ale uzupełnij tablicę. Po „Zjechał” przewoźnik może złożyć wniosek (7 dni). Statusu nie da się cofnąć.</p>
""")

    d.cols("Codzienna rutyna", """
<ol class="steps">
<li><b>Tablica km</b> — przejdź na bieżący tydzień i uzupełnij <b>wczoraj</b> dla wszystkich ciągników (cel: „X z Y uzupełnionych”).</li>
<li>Sprawdź puste komórki „—” z poprzednich dni — szczególnie po weekendzie.</li>
<li><b>Wyjazdy</b> — dla „Załadowany”, które faktycznie ruszyły: <span class="ui">Oznacz w trasie</span> z faktyczną godziną.</li>
<li>Dla „W trasie”, które wróciły: <span class="ui">Oznacz zjechał</span> z faktyczną datą i godziną.</li>
<li>Następnego dnia uzupełnij km za dzień zjazdu.</li>
</ol>
""", """
<div class="box info"><h2>Powiadomienia</h2><p>Twoje akcje nie wysyłają e-maili — są zapisywane w audycie. Przewoźnik widzi statusy i km w swoim panelu.</p></div>
<div class="box"><h2>Współpraca z eksportem</h2><p>Eksport oznacza „Załadowany” po wystawieniu zlecenia w SpedTrans i może cofnąć ten status, dopóki Ty nie oznaczysz „W trasie”.</p></div>
""")

    return d
