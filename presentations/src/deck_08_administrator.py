from build import Deck, ui, pill, REQ, OPT, COND, RO


def build() -> Deck:
    d = Deck("08-Administrator", "MAGGuarantee — instrukcja dla administratora", "Administrator")
    d.cover("08", "Rola: administrator", "Instrukcja dla administratora",
            "Użytkownicy i logowanie Google, zespoły, limity gwarancji, typy naczep, przekazania, audyt i diagnostyka. "
            "Administrator może też wszystko, co opiekun, opiekun wniosków, eksport i weryfikator.")
    d.cols("Uprawnienia administratora", """
<ul>
<li>pełna obsługa wszystkich przewoźników i floty (także trwałe usuwanie — z podaniem powodu 3–500 znaków);</li>
<li>weryfikacja wniosków jak opiekun wniosków; jedyny, kto koryguje dane w „Czeka na autoryzację”;</li>
<li>anulowanie dowolnego aktywnego wyjazdu, statusy eksportu i weryfikatora, tablica km;</li>
<li>decyzje o wszystkich przekazaniach planistów (sam ich nie składa);</li>
<li>limity, typy naczep, zespoły, mapowanie stanowisk, użytkownicy, audyt, diagnostyka.</li>
</ul>
""", """
<h3>Menu (dodatkowe pozycje)</h3>
<p>Typy naczep · Zespoły prowadzące · Wyjazdy · Limity · Użytkownicy · Logowanie Google · Audyt · Diagnostyka. Przekazania z licznikiem oczekujących.</p>
<div class="box info"><p>Konto administratora jest zawsze <b>lokalne</b> (login + hasło + kod) — działa także, gdy Google lub MAGSpace są niedostępne.</p></div>
<h3>E-maile</h3>
<p>Wszystkie e-maile o wnioskach i reklamacjach, „Pojazdy do usunięcia” (codziennie, co 3 dni dla tych samych) i raport tygodniowy (pon. 09:00).</p>
""")
    d.shot("Użytkownicy", "a01-users", """
<p>Filtry: login / nazwa, rola, aktywni / nieaktywni, <span class="ui">Tylko liderzy</span>.</p>
<p>Kolumny: login, imię i nazwisko, e-mail, rola (+ „Lider”, „ręcznie”), aktywny, zarządzanie (MAGSpace / Lokalne), utworzono.</p>
<p>Akcje: <span class="ui">Edytuj</span>, <span class="ui">Zresetuj hasło…</span>, <span class="ui">Dezaktywuj</span> / <span class="ui">Aktywuj</span>. Użytkowników nie usuwa się.</p>
<p class="small">Konto zarządzane przez MAGSpace ma rolę i aktywność tylko do odczytu — zmienia je synchronizacja (zwolnienie = wyłączenie w ~15 min).</p>
""")
    d.table("Formularz użytkownika", ["Pole", "Wymagane", "Zasady"], [
        ["Login", REQ, "przy tworzeniu; 2–64 znaki [a-zA-Z0-9._-]"],
        ["Imię i nazwisko", REQ, "1–128"],
        ["E-mail", REQ, "do 160 znaków"],
        ["Rola", REQ, "admin, pracownik (Opiekun wniosków), opiekun, planista, dyspozytor, eksport, weryfikator — <b>przewoźnika zakłada się w Przewoźnikach</b>"],
        ["Lider", OPT, "tylko planista, dyspozytor, opiekun, pracownik, eksport"],
        ["Przełożony (lider)", OPT, "tylko planista — aktywny planista-lider; „brak” = decyduje administrator"],
        ["Hasło tymczasowe", OPT, "przy tworzeniu; ≥ 10 znaków, litera i cyfra; puste = wygenerowane"],
        ["Aktywny / Zarządzanie / Rola przyznana ręcznie", OPT, "przy edycji"],
    ], image="a02-user-new", widths=[30, 12, 58], compact=True)
    d.shot("Logowanie Google (SSO)", "a03-sso", """
<p>Status MAGSpace i ostatnia synchronizacja.</p>
<p><b>Mapowanie stanowisk</b>: stanowisko → rola (+ lider). Automatycznie: DYSPOZYTOR* → dyspozytor, PLANISTA* → planista, DAF → opiekun.</p>
<p><b>Odrzucone logowania</b> — osoby bez roli; <span class="ui">Nadaj dostęp</span> → rola (wymagana) i lider. Tak nadaje się role pracownik / weryfikator / eksport — <b>ręcznie, osobno dla każdej osoby</b>.</p>
""")
    d.shot("Zespoły prowadzące", "a04-teams", """
<table class="compact"><thead><tr><th>Pole</th><th>Wym.</th><th>Zasady</th></tr></thead><tbody>
<tr><td>Kod</td><td><span class="req">TAK</span></td><td>format N.N.N (np. 1.1.13), unikalny</td></tr>
<tr><td>Nazwa</td><td><span class="opt">nie</span></td><td>do 120 znaków</td></tr>
<tr><td>Dyspozytorzy</td><td><span class="opt">nie</span></td><td>do 20 aktywnych; dodanie przenosi z innego zespołu</td></tr>
<tr><td>Aktywny</td><td></td><td></td></tr></tbody></table>
<p style="margin-top:8px">Ciągnik przypisuje się do zespołu w formularzu ciągnika (pole wymagane). Dyspozytorzy widzą ciągniki swojego zespołu.</p>
""")
    d.two("Limity gwarancji km", "a05-limits", "a11-limits-bulk-1", """
<p>Rok (2020 … bieżący + 2), 12 miesięcy: <b>Km / dzień</b>, <b>Km / sobota</b>, <b>Stawka € / km</b>. Zapis po wyjściu z pola.</p>
<p>Gwarancja dzienna i sobotnia są niezależne (pola wyboru). Brak konfiguracji = 540 km/dzień i 0,50 €/km. 0 km = gwarancja wyłączona.</p>
<p><span class="ui">Zastosuj do wielu miesięcy</span> — zakres, „Bez zmian / Włącz i ustaw / Wyłącz”. Nie można cofnąć (stare wartości w audycie).</p>
<p class="small">Wnioski zamrażają limity z dnia złożenia.</p>
""")
    d.two("Typy naczep i wyjazdy", "a07-trailer-types", "a08-delegations", """
<h3>Typy naczep</h3>
<p>Nazwa (wymagana, 1–64), skrót (do 16), opis (do 500), aktywny. Trwałe usunięcie z powodem.</p>
<h3>Wyjazdy</h3>
<p>Wszystkie wyjazdy, tylko podgląd: status, przewoźnik / nr rej., daty. Akcje na wyjazdach wykonuje się w panelach eksportu i weryfikatora (admin ma do nich dostęp).</p>
""")
    d.shot("Przekazania — decyzje", "a10-przekazania", """
<p>Wszystkie wnioski o zmianę planisty. Zatwierdzasz lub odrzucasz (powód 3–500 znaków), szczególnie gdy planista nie ma lidera albo lider jest stroną wniosku.</p>
<p>Nawet administrator nie zmienia planisty bezpośrednio — tylko wnioskiem.</p>
""")
    d.two("Audyt i diagnostyka", "a06-audit", "a09-diagnostics", """
<h3>Audyt</h3>
<p>Filtry: typ obiektu, użytkownik, akcja, daty. Szczegóły zdarzenia: IP, przed / po, metadane.</p>
<h3>Diagnostyka</h3>
<p><b>Maile</b> — kolejka i <span class="ui">Wyślij ponownie</span>; <b>Wnioski</b> — alerty jakości danych; <b>Baza danych</b> — stan PostgreSQL, Redis, MAGSpace.</p>
""")
    d.table("Zadania automatyczne (czas polski)", ["Kiedy", "Co", "Kto dostaje"], [
        ["codziennie 07:00", "przegląd terminów weryfikacji wniosków", "opiekunowie wniosków"],
        ["codziennie 07:10", "pilnowanie porozumień (10 dni roboczych)", "przewoźnicy (3 i 1 dzień przed), opiekunowie (przegląd)"],
        ["codziennie 07:20", "pojazdy do usunięcia (stoją ≥ 29 dni)", "administratorzy"],
        ["poniedziałek 09:00", "raport tygodniowy", "administratorzy"],
        ["co 15 min", "synchronizacja z MAGSpace — wyłączanie kont zwolnionych", "—"],
    ], widths=[20, 45, 35])
    return d
