from build import Deck, ui, pill


def build() -> Deck:
    d = Deck("07-Dyspozytor", "MAGGuarantee — instrukcja dla dyspozytora", "Dyspozytor")
    d.cover("07", "Rola: dyspozytor", "Instrukcja dla dyspozytora",
            "Podgląd ciągników zespołu prowadzącego, ich wyjazdów i przebiegu oraz powiadomienia o wyjazdach w Google Chat.")
    d.shot("Panel dyspozytora", "d01-panel", f"""
<p>Widzisz <b>ciągniki swojego zespołu prowadzącego</b> (np. 1.1.13) — wszyscy dyspozytorzy zespołu (np. zmiany 6–14 i 14–22) widzą to samo.</p>
<p>Kafelki: Ciągniki · {pill('Aktywne','green')} · Stojące · {pill('Długo stojące','amber')} · {pill('Do usunięcia','red')}.</p>
<p>Zakładki: Ciągniki · Wyjazdy · Kierowcy · Naczepy. Przycisk <span class="ui">Przebieg</span> w nagłówku strony.</p>
<div class="box warn"><p>Tylko podgląd — dane edytuje opiekun / administrator. Bez stawek i bez kart paliwowych.</p></div>
""")
    d.shot("Wyjazdy zespołu", "d02-wyjazdy", """
<p>Lista wyjazdów ciągników zespołu: ciągnik, kierowca, trasa, okres, status. Kliknięcie — szczegóły.</p>
<h3>Google Chat</h3>
<p>Przy każdym nowym wyjeździe przewoźnika na wspólny kanał trafia wiadomość:</p>
<p class="small mono" style="display:block;white-space:pre-line;padding:10px">ZESTAW: nr rej. / naczepa / nr boczny / tel. GPS
KIEROWCA: imię nazwisko / telefon
WYJAZD: data godzina / kraj / kod
ZJAZD: data / kraj / kod
ZESPÓŁ PROWADZĄCY: planista / dyspozytorzy
OPIEKUN: opiekun</p>
""")
    d.shot("Przebieg", "d03-km", """
<p>Tygodniowa tablica km ciągników zespołu — tylko podgląd, pogrupowana według przewoźników. Komórki: km ✓ / Nie jeździ / —.</p>
<p>Flaga <b>Lider dyspozytorów</b> zmienia tylko etykietę — uprawnienia są te same.</p>
""")
    return d
