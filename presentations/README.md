# Презентации MAGGuarantee (инструкции по ролям)

Готовые PDF (на польском, 16:9):

| Файл | Для кого | Слайдов |
|---|---|---|
| `00-MAGGuarantee-wprowadzenie.pdf` | все роли: процесс, статусы, формула доплаты, сроки, вход, письма, словарь | 16 |
| `01-Przewoznik.pdf` | przewoźnik — самая подробная | 32 |
| `02-Opiekun.pdf` | opiekun — самая подробная | 34 |
| `03-Opiekun-wnioskow.pdf` | pracownik («Opiekun wniosków») | 17 |
| `04-Weryfikator.pdf` | weryfikator | 10 |
| `05-Eksport.pdf` | eksport | 5 |
| `06-Planista.pdf` | planista (+ lider) | 8 |
| `07-Dyspozytor.pdf` | dyspozytor | 4 |
| `08-Administrator.pdf` | admin | 11 |

Скриншоты сняты с локальной демо-копии на вымышленных данных (seed + демо-перевозчики), BugBot не упоминается.

## Как поправить и пересобрать

- Текст слайдов: `src/deck_*.py`. Общий вид (CSS, макеты): `src/build.py`.
- Скриншоты: `assets/*.jpg`.
- Пересборка (нужны Python 3 и Google Chrome/Chromium):

```bash
cd presentations
python3 src/build.py           # все PDF
python3 src/build.py 01 02     # только выбранные
python3 src/build.py --html    # только HTML в src/html/ (смотреть в браузере)
```

`UWAGI-rozbieznosci.md` — расхождения между кодом и документацией/ожиданиями, найденные во время подготовки (для разработчика, не для пользователей).
