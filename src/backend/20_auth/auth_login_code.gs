// =================================================================
// Auth: 2FA z kodem na email (sendLoginCode/verifyLoginCode/resendLoginCode)
// =================================================================

// ── Maskuje email: maksim.siankevich@magtrans.eu → ma***@magtrans.eu ──
function maskEmail(email) {
  if (!email) return '(brak emaila w bazie)';
  var parts = email.split('@');
  if (parts.length !== 2) return email;
  var name = parts[0];
  var masked = name.substring(0, Math.min(2, name.length)) + '***';
  return masked + '@' + parts[1];
}

// ── KROK 1: Sprawdź login+hasło, wyślij kod na email ──
function sendLoginCode(login, password) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var u, rola;
    u = findUserInSheet(ss, CONFIG.SHEET_ADMIN, login, password);
    if (u) rola = 'admin';
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_PRACOWNIK, login, password); if (u) rola = 'pracownik'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_OPIEKUN, login, password); if (u) rola = 'opiekun'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_PLANISCI, login, password); if (u) rola = 'planista'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_DYSPOZYTOR, login, password); if (u) rola = 'dyspozytor'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_EKSPORT, login, password); if (u) rola = 'eksport'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_WERYFIKATOR, login, password); if (u) rola = 'weryfikator'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_UZYTKOWNICY, login, password); if (u) rola = 'przewoznik'; }

    if (!u) return { error: 'Nieprawidłowy login lub hasło' };
    // Blokada dezaktywowanych kont przewoźników
    if (rola === 'przewoznik' && (u.aktywny || 'Tak').toString().toUpperCase() === 'NIE') {
      return { error: 'Konto zostało dezaktywowane. Skontaktuj się z opiekunem Magtrans.' };
    }
    if (!u.email) return { error: 'Brak adresu email w bazie dla tego konta. Skontaktuj się z administratorem.' };

    // Generuj 6-cyfrowy kod
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    var cacheKey = 'loginCode_' + login.trim();

    // Zapisz kod w CacheService (ważny 10 minut = 600 sekund)
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify({ code: code, rola: rola, nazwa: u.nazwa, email: u.email, przewoznik: u.przewoznik, auta: u.auta || [] }), 600);

    // Wyślij email z kodem
    MailApp.sendEmail({
      to: u.email,
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">' +
        '<div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0">' +
          '<h2 style="color:#fff;margin:0;font-size:18px">🚛 MAGGuarantee</h2>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">' +
          '<p style="color:#334155;font-size:15px;margin:0 0 8px">Cześć, <b>' + u.nazwa + '</b></p>' +
          '<p style="color:#64748b;font-size:14px;margin:0 0 24px">Twój jednorazowy kod logowania:</p>' +
          '<div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px;margin-bottom:20px">' +
            code +
          '</div>' +
          '<p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kod ważny przez <b>10 minut</b>. Nie udostępniaj go nikomu.</p>' +
          '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
          '<p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">Jeśli to nie Ty próbujesz się zalogować, zignoruj tę wiadomość.</p>' +
        '</div>' +
        '</div>'
    });

    Logger.log('Kod logowania wysłany do: ' + u.email + ' dla loginu: ' + login);
    return { step: 'code', emailHint: maskEmail(u.email) };

  } catch(e) {
    Logger.log('sendLoginCode ERR: ' + e.message);
    return { error: 'Błąd wysyłki kodu: ' + e.message };
  }
}

// ── KROK 2: Zweryfikuj kod, zwróć obiekt użytkownika ──
function verifyLoginCode(login, code) {
  try {
    if (!login || !code) return { error: 'Brak danych' };
    var cacheKey = 'loginCode_' + login.trim();
    var cache = CacheService.getScriptCache();
    var raw = cache.get(cacheKey);
    if (!raw) return { error: 'Kod wygasł lub jest nieprawidłowy. Spróbuj zalogować się ponownie.' };

    var data = JSON.parse(raw);
    if (data.code !== code.trim()) {
      // Zliczaj błędne próby (max 5, potem usuń kod)
      data.attempts = (data.attempts || 0) + 1;
      if (data.attempts >= 5) {
        cache.remove(cacheKey);
        return { error: 'Zbyt wiele błędnych prób. Zaloguj się ponownie.' };
      }
      cache.put(cacheKey, JSON.stringify(data), 600);
      return { error: 'Nieprawidłowy kod. Pozostało prób: ' + (5 - data.attempts) };
    }

    // Kod poprawny — usuń z cache i zwróć użytkownika
    cache.remove(cacheKey);

    // Dla przewoźnika — sprawdź czy konto nie zostało dezaktywowane między sendLoginCode
    // a verifyLoginCode (cache trwa 10 min). Przy okazji zapisz LastLogin.
    if (data.rola === 'przewoznik') {
      var deactivated = false;
      try {
        var ssLog = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        var suLog = ssLog.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
        if (suLog) {
          var uData = suLog.getDataRange().getValues();
          var lTr = login.trim();
          for (var li = 1; li < uData.length; li++) {
            if ((uData[li][0] || '').toString().trim() === lTr) {
              // Recheck Aktywny (col H = index 7)
              var akt = (uData[li][7] || 'Tak').toString().trim().toUpperCase();
              if (akt === 'NIE') { deactivated = true; break; }
              // Update LastLogin (col I = pozycja 9)
              suLog.getRange(li + 1, 9).setValue(
                Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss')
              );
              break;
            }
          }
        }
      } catch(ll) { Logger.log('verifyLoginCode recheck/LastLogin ERR: ' + ll.message); }
      if (deactivated) {
        return { error: 'Konto zostało dezaktywowane. Skontaktuj się z opiekunem Magtrans.' };
      }
    }

    return {
      login: login.trim(),
      rola: data.rola,
      nazwa: data.nazwa,
      email: data.email,
      przewoznik: data.przewoznik || '',
      auta: data.auta || []
    };
  } catch(e) {
    Logger.log('verifyLoginCode ERR: ' + e.message);
    return { error: 'Błąd weryfikacji' };
  }
}

// ── Ponowne wysłanie kodu (tylko jeśli istnieje sesja w cache) ──
function resendLoginCode(login) {
  try {
    var cacheKey = 'loginCode_' + login.trim();
    var cache = CacheService.getScriptCache();
    var raw = cache.get(cacheKey);
    if (!raw) return { ok: false, error: 'Sesja wygasła' };
    var data = JSON.parse(raw);

    var code = Math.floor(100000 + Math.random() * 900000).toString();
    data.code = code;
    data.attempts = 0;
    cache.put(cacheKey, JSON.stringify(data), 600);

    MailApp.sendEmail({
      to: data.email,
      subject: 'Nowy kod weryfikacyjny — MAGGuarantee',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">' +
        '<div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0">' +
          '<h2 style="color:#fff;margin:0">🚛 Nowy kod weryfikacyjny</h2>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">' +
          '<div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px">' +
            code +
          '</div>' +
          '<p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">Kod ważny przez 10 minut.</p>' +
        '</div>' +
        '</div>'
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
