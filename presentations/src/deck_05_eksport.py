from build import Deck, ui, pill


def build() -> Deck:
    d = Deck("05-Eksport", "MAGGuarantee — instrukcja dla eksportu", "Eksport")
    d.cover("05", "Rola: eksport", "Instrukcja dla eksportu",
            "Oznaczanie wyjazdów jako „Załadowany” po wystawieniu zlecenia w SpedTrans, cofanie statusu i podgląd raportu km.")
    d.cols("Twoja rola", f"""
<p>Po zgłoszeniu wyjazdu przez przewoźnika szukasz ładunku i wystawiasz zlecenie w SpedTrans. W systemie potwierdzasz to statusem
{pill('Załadowany','amber')} — to akceptacja wyjazdu.</p>
<div class="box key"><p>Bez Twojego „Załadowany” weryfikator nie może oznaczyć wyjazdu jako „W trasie”.</p></div>
<h3>Ekrany</h3>
<ul><li><b>Wyjazdy</b> — lista wyjazdów wszystkich przewoźników (strona startowa);</li><li><b>Raport km — moje ciągniki</b> — przycisk w prawym górnym rogu.</li></ul>
""", f"""
<h3>Nie możesz</h3>
<ul><li>anulować wyjazdu;</li><li>oznaczać „W trasie” / „Zjechał” (weryfikator);</li><li>edytować km.</li></ul>
<h3>E-mail do przewoźnika</h3>
<p>Po „Załadowany” przewoźnik dostaje e-mail <b>„Zlecenie {{nr}} — ciągnik {{nr rej.}}”</b> z numerem zlecenia ze spedu.</p>
""")
    d.shot("Wyjazdy", "e01-delegations", f"""
<p>Filtry: status, „Pokaż historię (zjechał / anulowane)”. Domyślnie aktywne wyjazdy.</p>
<table class="compact"><thead><tr><th>Status</th><th>Akcja</th></tr></thead><tbody>
<tr><td>{pill('Zgłoszony','blue')}</td><td><span class="ui">Oznacz jako załadowany</span></td></tr>
<tr><td>{pill('Załadowany','amber')}</td><td><span class="ui">Cofnij do: zgłoszony</span></td></tr>
<tr><td>pozostałe</td><td>—</td></tr>
</tbody></table>
<p style="margin-top:8px">Kliknięcie wiersza — szczegóły: trasa, stawki, kierowca, historia statusu, przebieg, zespół prowadzący.</p>
""")
    d.two("Oznacz jako załadowany / Cofnij", "e02-mark-ready", "e03-rollback", """
<h3>Oznacz jako załadowany</h3>
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th><th>Zasady</th></tr></thead><tbody>
<tr><td>Nr zlecenia ze spedu</td><td><span class="req">TAK</span></td><td>1–64 znaki, np. ZL12345/01/26</td></tr></tbody></table>
<p style="margin-top:8px">→ „Oznaczono jako załadowany”, zapisuje kto i kiedy.</p>
<h3>Cofnij do: zgłoszony</h3>
<p>Możliwe tylko, zanim ciągnik ruszy w trasę. Bez pól. Numer zlecenia jest czyszczony — przy ponownym oznaczeniu trzeba go wpisać jeszcze raz. Bez e-maila.</p>
""")
    d.shot("Raport km — moje ciągniki", "e04-km", """
<p>Tygodniowa tablica km — <b>tylko podgląd</b> („Dane są tylko do podglądu — edytuje weryfikator.”).</p>
<ul><li>widoczne ciągniki, które jeździły w danym tygodniu;</li>
<li>nawigacja tygodni, wyszukiwarka, notatki;</li>
<li><span class="ui">Historia</span> — kalendarz miesiąca.</li></ul>
<p class="small">Powrót do wyjazdów — logo lub przycisk „wstecz” przeglądarki.</p>
""")
    return d
