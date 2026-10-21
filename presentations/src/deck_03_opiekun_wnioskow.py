from build import Deck, ui, pill, REQ, OPT, COND, RO


def build() -> Deck:
    d = Deck("03-Opiekun-wnioskow", "MAGGuarantee — instrukcja dla opiekuna wniosków", "Opiekun wniosków")

    d.cover("03", "Rola: opiekun wniosków (pracownik)", "Instrukcja dla opiekuna wniosków",
            "Jak weryfikować wnioski o dopłatę gwarancyjną: dashboard i terminy, porównanie danych przewoźnika i weryfikatora, korekty, "
            "autoryzacja Maksima, decyzje i reklamacje.")

    d.cols("Twoja rola", """
<p>Jesteś <b>opiekunem wniosków</b> (w systemie rola <code>pracownik</code>). Sprawdzasz każdy wniosek przewoźnika i podejmujesz decyzję.</p>
<div class="box key"><ul>
<li>porównujesz deklarację przewoźnika z danymi weryfikatora i SpedTrans;</li>
<li>korygujesz daty, godziny, przebieg, korektę godzin postoju;</li>
<li><b>zapisujesz weryfikację</b>, a potem <b>akceptujesz</b> (z numerem zlecenia) lub <b>odrzucasz</b> (z powodem);</li>
<li>rozpatrujesz <b>reklamacje</b>.</li>
</ul></div>
<p>Termin: <b>7 polskich dni roboczych</b> na każdy wniosek.</p>
""", """
<h3>Menu</h3>
<table class="compact"><tbody>
<tr><td>Dashboard</td><td>wskaźniki, wykresy, wnioski z terminem</td></tr>
<tr><td>Wnioski</td><td>lista wszystkich wniosków i okno weryfikacji</td></tr>
</tbody></table>
<h3>Logowanie</h3>
<p>Przycisk Google, konto <code>@magtrans.eu</code>. Rolę nadaje ręcznie administrator.</p>
<div class="box info"><p>Nie mylić z rolą <b>Opiekun</b> — ta prowadzi przewoźników i flotę. Opiekun wniosków zajmuje się wyłącznie wnioskami; nie widzi wyjazdów ani floty.</p></div>
""")

    d.shot("Dashboard", "p01-dashboard", """
<p><b>Kafelki:</b> Wszystkie wnioski · Na weryfikacji · Zaakceptowane · Odrzucone · Oczekuje na autoryzację.</p>
<p><b>Wykresy:</b> trend miesięczny (liczba wniosków i suma dopłat, 12 mies.) oraz rozkład statusów.</p>
<p><b>Prawa kolumna:</b></p>
<ul>
<li><b>Po terminie</b> (czerwone) i <b>Zbliża się termin</b> (bursztynowe) — kliknięcie otwiera wniosek;</li>
<li>Ostatnia aktywność — 10 ostatnich zdarzeń;</li>
<li>Top przewoźnicy — wg sumy zaakceptowanych dopłat;</li>
<li>Reklamacje — ile otwartych.</li>
</ul>
""")

    d.cols("Termin weryfikacji (SLA)", f"""
<div class="box key"><h2>7 polskich dni roboczych</h2><p>Liczone od dnia następnego po wejściu wniosku w {pill('Weryfikacja','blue')}.
Nie liczą się soboty, niedziele i święta polskie (Wielki Piątek jest dniem roboczym).</p></div>
<table class="compact"><thead><tr><th>Grupa</th><th>Warunek</th></tr></thead><tbody>
<tr><td>{pill('Po terminie','red')}</td><td>termin minął — „N dni po terminie”</td></tr>
<tr><td>{pill('Zbliża się termin','amber')}</td><td>0–3 dni robocze („dziś ostatni dzień”)</td></tr>
<tr><td>w terminie</td><td>więcej niż 3 dni — bez wyróżnienia</td></tr>
</tbody></table>
""", f"""
<h3>Kiedy zegar stoi</h3>
<ul>
<li>wniosek w {pill('Czeka na autoryzację','blue')} — zegar zatrzymany;</li>
<li>po decyzji — koniec;</li>
<li>reklamacje nie mają terminu SLA.</li>
</ul>
<h3>Przypomnienie</h3>
<p>Codziennie o <b>07:00</b> e-mail <b>„Weryfikacja zgłoszeń — N wymaga uwagi”</b> z sekcjami „Po terminie” i „Zbliża się termin” oraz przyciskiem <span class="ui">Otwórz panel weryfikacji</span>.
Wysyłany tylko, gdy coś wymaga uwagi.</p>
""")

    d.shot("Lista wniosków", "p02-claims", f"""
<p>Filtry: wyszukiwanie (nr zgłoszenia, nr rej., nr zlecenia; od 2 znaków), status, okres od / do.</p>
<p>Kolumny:</p>
<ul>
<li><b>Nr zgłoszenia</b>, Przewoźnik, Ciągnik, Okres, Przebieg;</li>
<li><b>Wnioskowana</b> — kwota z dnia złożenia;</li>
<li><b>Zatwierdzona</b> — po decyzji (zielona / czerwona);</li>
<li><b>Status</b> (+ plakietka reklamacji), czas od złożenia.</li>
</ul>
<p>Najnowsze na górze, 50 na stronę. Kliknięcie wiersza otwiera <b>okno wniosku</b>.</p>
<p>{pill('Weryfikacja','blue')} {pill('Czeka na autoryzację','blue')} {pill('Zaakceptowano','green')} {pill('Odrzucono','red')} {pill('Reklamacja','amber')}</p>
""")

    d.shot("Okno wniosku — podgląd", "p04-claim-view-pending-1", """
<p>Nagłówek: numer, status, przewoźnik · ciągnik, data złożenia, plakietka „Zweryfikowano {data} przez {osoba}”.</p>
<ul>
<li><b>Powiązany wyjazd</b> — ciągnik, planowany powrót, faktyczny zjazd;</li>
<li><b>Dane</b> — daty, godziny, przebieg, korekta godzin;</li>
<li><b>Dopłata gwarancyjna</b> z wyjaśnieniem niedoboru i tabelą miesięcy;</li>
<li><b>Decyzja</b>.</li>
</ul>
<p>Przyciski: <span class="ui">Zamknij</span> i — gdy możliwa decyzja — <span class="ui">Edycja</span>.</p>
<p class="small">Wnioski zaakceptowane / odrzucone bez reklamacji są w stanie końcowym — brak edycji.</p>
""", tall=True)

    d.shot("Tryb edycji — trzy kolumny", "p05-claim-edit-1", """
<table class="compact"><tbody>
<tr><td>Dane wniosku</td><td>deklaracja przewoźnika</td></tr>
<tr><td>Dane weryfikatora</td><td>faktyczny wyjazd/zjazd i <b>suma km z tablicy</b> — różnice podświetlone na bursztynowo</td></tr>
<tr><td>Dane po weryfikacji</td><td>pola do edycji — Twoje ustalenia</td></tr>
</tbody></table>
<p style="margin-top:10px">Pod przebiegiem: „Wg tablicy przebiegów: X km” + <span class="ui">Zastosuj</span> — kopiuje sumę z tablicy km.</p>
<p>Pod korektą: „Czas: X h surowych / Y h zaliczonych”.</p>
<div class="box info"><p>Różnica to informacja, nie błąd — decyzję podejmujesz na podstawie SpedTrans i tablicy km.</p></div>
""", tall=True)

    d.table("Pola korekty (Dane po weryfikacji)", ["Pole", "Wymagane", "Zasady"], [
        ["Data załadunku", OPT, "data; puste = bez zmian"],
        ["Data rozładunku", OPT, "data"],
        ["Godz. zjazdu (załadunku)", OPT, "HH:MM, 00:00–23:59"],
        ["Godz. przyjazdu (rozładunku)", OPT, "HH:MM"],
        ["Przebieg / km zrealizowane", OPT, "liczba całkowita 0 – 9 999 999; <span class=\"ui\">Zastosuj</span> wstawia sumę z tablicy"],
        ["Korekta godzin — postój / przestój", OPT, "0 – 999,99 h, krok 0,5; odejmowana od dni zaliczonych w miesiącach z gwarancją"],
    ], intro="Każda zmiana od razu przelicza <b>Dopłatę gwarancyjną</b> (pole zablokowane — liczy ją system).",
        note="Pusty zapis weryfikacji jest dozwolony — oznacza „potwierdzam dane bez zmian”.", widths=[32, 12, 56])

    d.shot("Dopłata gwarancyjna i rozbicie", "p05-claim-edit-2", """
<p>Zdanie wyjaśniające, np.: „Pojazd przejechał o <b>2 387 km mniej</b>, niż gwarantowano.” i wzór:
<i>Niedojazd: gwarant. − przebieg = km × stawka €/km</i>.</p>
<p>Gdy gwarancja wyjeżdżona: „Gwarancja wyjeżdżona — dopłata nie przysługuje” → można tylko <b>odrzucić</b>.</p>
<p><b>Próg autoryzacji:</b> ostrzeżenie, gdy dopłata przekroczy próg — po zapisaniu weryfikacji wniosek przejdzie w „Czeka na autoryzację”.</p>
<p><span class="ui">Przelicz wg aktualnych limitów</span> — porównanie z dzisiejszymi limitami i <span class="ui">Zastosuj nowe kwoty</span> (tylko w „Weryfikacja”).</p>
<p class="small">Tabela: miesiące, dni rob., km/dz., €/km, soboty, dni wyłączone, dni graniczne.</p>
""", tall=True)

    d.cols("Krok 1: Zapisz weryfikację", f"""
<ol class="steps">
<li>Otwórz wniosek → <span class="ui">Edycja</span>.</li>
<li>Porównaj kolumny; skoryguj pola lub zostaw bez zmian.</li>
<li>Kliknij <span class="ui">Zapisz weryfikację</span> (lewy dół okna) — komunikat „Zapisano weryfikację”.</li>
</ol>
<div class="box key"><p>Bez zapisanej weryfikacji <b>wybór decyzji jest zablokowany</b>: „Zapisz weryfikację, aby podjąć decyzję”.
Po zmianach bez zapisu: „Masz niezapisane korekty — zapisz weryfikację”.</p></div>
""", f"""
<h3>Co się dzieje po zapisie</h3>
<ul>
<li>wniosek dostaje plakietkę „Zweryfikowano”;</li>
<li>kwota przeliczona wg limitów z dnia złożenia;</li>
<li>gdy dopłata <b>&gt; próg</b> → automatycznie {pill('Czeka na autoryzację','blue')} i e-mail do Maksima (odpowiedź przyjdzie do Ciebie).</li>
</ul>
<table class="compact"><thead><tr><th>Dni w trasie</th><th>Próg</th></tr></thead><tbody>
<tr><td>do 15</td><td>300 €</td></tr><tr><td>16–30</td><td>500 €</td></tr><tr><td>31–60</td><td>800 €</td></tr><tr><td>61+</td><td>1000 €</td></tr>
</tbody></table>
<p class="small">Jeśli weryfikator zmieni km na tablicy po Twoim zapisie, akceptacja zgłosi „Kwota dopłaty różni się od zapisanej…” — zapisz weryfikację ponownie.</p>
""")

    d.shot("Czeka na autoryzację — Maksim", "p09-claim-authorization-2", """
<p>Wniosek powyżej progu wymaga potwierdzenia Maksima:</p>
<ol class="steps">
<li>System wysłał e-mail „Potwierdzenie autoryzacji: {nr}” (data w polu „Powiadomiono Maksima”).</li>
<li>Gdy Maksim odpowie, zrób zrzut ekranu potwierdzenia.</li>
<li>W oknie wniosku: <span class="ui">Zrzut ekranu potwierdzenia Maksima</span> — 1 plik JPG / PNG / WebP / PDF, maks. 10 MB.</li>
<li>„Potwierdzenie autoryzacji wgrane — decyzja odblokowana” → podejmij decyzję.</li>
</ol>
<div class="box warn"><p>W tym stanie dane weryfikacji są zablokowane — poprawić je może tylko administrator. Bez zrzutu nie da się ani zaakceptować, ani odrzucić.</p></div>
""", tall=True)

    d.shot("Krok 2: Decyzja — Zaakceptuj", "p07-decision-accept-3", """
<p>Pole <span class="ui">Decyzja</span> → <b>Zaakceptuj</b>:</p>
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th><th>Zasady</th></tr></thead><tbody>
<tr><td>Numer zlecenia</td><td><span class="req">TAK</span></td><td>1–64 znaki — zlecenie, na które idzie wypłata</td></tr>
<tr><td>Data zlecenia</td><td><span class="req">TAK</span></td><td>data</td></tr>
<tr><td>Kwota zatwierdzona (EUR)</td><td><span class="ro">auto</span></td><td>= wyliczona dopłata</td></tr>
<tr><td>Komentarz</td><td><span class="opt">nie</span></td><td>do 4000 znaków, widzi przewoźnik</td></tr>
</tbody></table>
<p style="margin-top:8px"><span class="ui">Zapisz decyzję</span> → „Zapisano”, e-mail do przewoźnika i zespołu.</p>
<p class="small">„Zaakceptuj” znika, gdy: gwarancja wyjeżdżona; w okresie mieszanym brakuje dni na tablicy km („Brak danych za N dni”).</p>
""", tall=True)

    d.shot("Decyzja — Odrzuć", "p08-decision-reject-3", f"""
<p>Pole <span class="ui">Decyzja</span> → <b>Odrzuć</b>:</p>
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th><th>Zasady</th></tr></thead><tbody>
<tr><td>Powód odrzucenia</td><td><span class="req">TAK</span></td><td>1–4000 znaków; trafia do przewoźnika</td></tr>
</tbody></table>
<p style="margin-top:10px">Status {pill('Odrzucono','red')}. Przewoźnik ma 48 h na reklamację (do pełnej kwoty wnioskowanej). Odrzucony wniosek nie blokuje kolejnego wniosku na ten ciągnik.</p>
<div class="box tip"><p>Pisz powód konkretnie — np. rozbieżność z SpedTrans, dni postoju, błędny okres. Przewoźnik zobaczy go w szczegółach wniosku.</p></div>
""", tall=True)

    d.shot("Reklamacja — rozpatrzenie", "p10-claim-reklamacja-2", f"""
<p>Sekcja <b>Reklamacja</b>: kwota, maksimum (wnioskowana − wypłacona), data, treść.</p>
<table class="compact"><thead><tr><th>Decyzja</th><th>Pola</th></tr></thead><tbody>
<tr><td>Uznaj reklamację</td><td><b>Nr zlecenia</b> (wymagany, podpowiadany z wniosku — można wpisać nowy) · kwota z reklamacji (tylko odczyt) · komentarz (opcjonalny)</td></tr>
<tr><td>Odrzuć reklamację</td><td><b>Powód odrzucenia reklamacji</b> (wymagany, 1–4000) — przewoźnik zobaczy go jako „Odpowiedź MAGTRANS”</td></tr>
</tbody></table>
<p style="margin-top:8px">Po zapisie status wraca do poprzedniego ({pill('Zaakceptowano','green')} / {pill('Odrzucono','red')}), wynik widać jako „Reklamacja uznana / odrzucona”.</p>
<p class="small">E-mail o nowej reklamacji: „Reklamacja: {{nr}} — {{kwota}} EUR”. Reklamacja jest jedna na wniosek.</p>
""", tall=True)

    d.table("Statusy i dozwolone przejścia", ["Z", "Do", "Jak"], [
        ["(nowy)", pill("Weryfikacja", "blue"), "przewoźnik składa wniosek"],
        [pill("Weryfikacja", "blue"), pill("Czeka na autoryzację", "blue"), "automatycznie przy zapisie weryfikacji, gdy dopłata &gt; próg"],
        [pill("Czeka na autoryzację", "blue"), pill("Weryfikacja", "blue"), "automatycznie, gdy administrator poprawi dane poniżej progu"],
        [pill("Weryfikacja", "blue") + " / " + pill("Czeka na autoryzację", "blue"), pill("Zaakceptowano", "green") + " / " + pill("Odrzucono", "red"), "Twoja decyzja (w autoryzacji — po wgraniu zrzutu)"],
        [pill("Zaakceptowano", "green") + " / " + pill("Odrzucono", "red"), pill("Reklamacja", "amber"), "przewoźnik w ciągu 48 h"],
        [pill("Reklamacja", "amber"), "poprzedni status", "Uznaj / Odrzuć reklamację"],
    ], note="Wypłata odbywa się poza systemem — nie ma statusu „wypłacono”. System zapisuje kwotę i numer zlecenia.", widths=[30, 30, 40])

    d.cols("Okres mieszany i tablica km", """
<p>Jeśli w okresie wniosku jest miesiąc z <b>wyłączoną gwarancją</b> (0 km/dzień), dopłatę liczy się z <b>tablicy km weryfikatora</b>, tylko w miesiącach z gwarancją.</p>
<ul>
<li>w tabeli pojawiają się kolumny „Km wg weryfikatora” i „Wpisane dni (X z Y)”;</li>
<li>jeśli brakuje dni: „Brak danych za N dni” z listą dat — <b>akceptacja zablokowana</b>, odrzucić można zawsze;</li>
<li>zwykle brakuje dnia zjazdu — weryfikator może go wpisać dopiero następnego dnia.</li>
</ul>
""", """
<h3>Limity zamrożone</h3>
<p>Wniosek pamięta limity (km/dzień, €/km) z dnia złożenia. Jeśli administrator zmienił limity, możesz użyć <span class="ui">Przelicz wg aktualnych limitów</span>:
okno pokazuje „Wniosek (obecnie)” vs „Wg aktualnych limitów” i różnicę → <span class="ui">Zastosuj nowe kwoty</span>.</p>
<div class="box warn"><p>Dostępne tylko w statusie „Weryfikacja”.</p></div>
""")

    d.cols("Procedura dnia — checklista", """
<ol class="steps">
<li>Rano: e-mail „Weryfikacja zgłoszeń” lub Dashboard → najpierw <b>Po terminie</b>, potem <b>Zbliża się termin</b>.</li>
<li>Otwórz wniosek → <span class="ui">Edycja</span>.</li>
<li>Porównaj <b>Dane wniosku</b> z <b>Danymi weryfikatora</b> i SpedTrans; skoryguj okres, godziny, przebieg, postój.</li>
<li><span class="ui">Zapisz weryfikację</span>.</li>
<li>Jeśli „Czeka na autoryzację” — poczekaj na Maksima i wgraj zrzut.</li>
<li><span class="ui">Decyzja</span>: Zaakceptuj (nr i data zlecenia) albo Odrzuć (powód) → <span class="ui">Zapisz decyzję</span>.</li>
</ol>
""", """
<h3>E-maile, które dostajesz</h3>
<table class="compact"><tbody>
<tr><td>Weryfikacja zgłoszeń — N wymaga uwagi</td><td>codziennie 07:00</td></tr>
<tr><td>Nowy wniosek: {nr}</td><td>przy każdym nowym wniosku</td></tr>
<tr><td>Wniosek {nr}: ZAAKCEPTOWANO / ODRZUCONO</td><td>po decyzji</td></tr>
<tr><td>Reklamacja: {nr} — {kwota} EUR</td><td>nowa reklamacja</td></tr>
<tr><td>Odpowiedź Maksima</td><td>na Twój adres (Reply-To)</td></tr>
</tbody></table>
<div class="box tip" style="margin-top:12px"><p>Otwieraj wnioski z listy <span class="ui">Wnioski</span> lub z Dashboardu — tam działa bezpośrednie otwieranie okna wniosku.</p></div>
""")

    return d
