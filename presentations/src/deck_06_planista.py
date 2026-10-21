from build import Deck, ui, pill


def build() -> Deck:
    d = Deck("06-Planista", "MAGGuarantee — instrukcja dla planisty", "Planista")
    d.cover("06", "Rola: planista", "Instrukcja dla planisty",
            "Podgląd planowanej floty i przebiegu, wnioski o przekazanie ciągnika innemu planiście oraz zatwierdzanie przekazań przez lidera.")
    d.cols("Twoja rola", """
<p>Jako planista widzisz <b>ciągniki, które obecnie prowadzisz</b>, ich wyjazdy, kierowców i naczepy oraz przebieg km. Dane floty edytuje opiekun przewoźnika.</p>
<table class="compact"><thead><tr><th>Zakładka</th><th>Co</th></tr></thead><tbody>
<tr><td>Flota</td><td>ciągniki, wyjazdy, kierowcy, naczepy</td></tr>
<tr><td>Przebieg</td><td>tygodniowe km Twoich ciągników</td></tr>
<tr><td>Moje wnioski</td><td>wnioski o przekazanie ciągnika</td></tr>
<tr><td>Do zatwierdzenia</td><td>tylko <b>lider planistów</b> — decyzje o przekazaniach</td></tr>
</tbody></table>
""", """
<h3>Zakres</h3>
<ul><li>ciągniki, których jesteś planistą <b>teraz</b> — po przekazaniu ciągnik znika z Twojej listy;</li>
<li>wyjazdy, które prowadziłeś (zostają widoczne);</li>
<li>bez wniosków o dopłatę i bez numerów kart paliwowych.</li></ul>
<h3>E-maile</h3>
<p>Dostajesz do wiadomości „Nowy wniosek” i decyzje dla Twoich ciągników (lider — także dla ciągników swoich planistów). Przekazania nie wysyłają e-maili.</p>
""")
    d.shot("Flota", "l01-flota", f"""
<p>Kafelki-filtry: Ciągniki · {pill('Aktywne','green')} · Stojące · {pill('Długo stojące','amber')} (15–28 dni) · {pill('Do usunięcia','red')} (≥ 29 dni) oraz ramki z listą długo stojących i do usunięcia.</p>
<p>Zakładki: <b>Ciągniki</b> (nr rej., bok, typ, EURO, ADR, GB/IT/FR, ostatni przejazd, status), <b>Wyjazdy</b>, <b>Kierowcy</b>, <b>Naczepy</b>.</p>
<p>Kliknięcie ciągnika — pełne szczegóły ze stawkami, opiekunem i <b>Historią planistów</b>; przycisk <span class="ui">Przekaż ciągnik</span>.</p>
""")
    d.shot("Szczegóły ciągnika", "l02-vehicle-detail-1", """
<ul><li>identyfikacja, przewoźnik, opiekun, planista, zespół prowadzący;</li><li>wyposażenie, stawki, pozwolenia;</li>
<li><b>Historia planistów</b> — kto i od kiedy prowadził ciągnik;</li>
<li>oczekujący wniosek: „Wniosek o przekazanie do: …”.</li></ul>
""", tall=True)
    d.shot("Przebieg", "l03-km", """
<p>Tygodniowa tablica km Twoich ciągników (tylko podgląd, uzupełnia weryfikator), pogrupowana według przewoźników z sumą km.</p>
<p>„Tylko jeżdżące” — domyślnie wyłączone. Nawigacja tygodni, wyszukiwarka, notatki, <span class="ui">Historia</span>.</p>
""")
    d.two("Moje wnioski — przekazanie ciągnika", "l04-przekazania", "l05-transfer-dialog", """
<p><span class="ui">Przekaż ciągnik</span> → okno „Wniosek o zmianę planisty”:</p>
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th></tr></thead><tbody>
<tr><td>Ciągnik (Twój, bez oczekującego wniosku)</td><td><span class="req">TAK</span></td></tr>
<tr><td>Obecny planista</td><td><span class="ro">odczyt</span></td></tr>
<tr><td>Nowy planista</td><td><span class="req">TAK</span></td></tr>
<tr><td>Powód (3–500 znaków)</td><td><span class="req">TAK</span></td></tr></tbody></table>
<p class="small" style="margin-top:6px">Decyduje lider obecnego planisty lub administrator. Zakładki Oczekujące / Rozpatrzone; własny wniosek można anulować.</p>
""")
    d.shot("Lider: Do zatwierdzenia", "l06-zatwierdzenia", """
<p>Widoczne tylko dla planisty z flagą <b>Lider</b>. Licznik na zakładce = wnioski czekające na decyzję.</p>
<p>Decydujesz o wnioskach dla ciągników <b>Twoich planistów</b> (także złożonych przez opiekunów).
Nie decydujesz, gdy wniosek jest Twój albo ciągnik ma przejść do Ciebie — wtedy decyduje administrator.</p>
""")
    d.two("Zatwierdź / Odrzuć przekazanie", "l07-approve", "l08-reject", """
<h3>Zatwierdź</h3>
<p>Skutki: ciągnik od razu u nowego planisty; wyjazdy „Zgłoszony” i „Załadowany” też; „W trasie” zostaje u starego do zjazdu. <span class="ui">Komentarz (opcjonalnie)</span> do 500 znaków.</p>
<h3>Odrzuć</h3>
<p><span class="ui">Powód odrzucenia</span> — <b>wymagany</b>, 3–500 znaków; wnioskujący zobaczy go na swojej liście.</p>
""")
    return d
