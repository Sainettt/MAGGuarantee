// =================================================================
// Repository: AUDIT_LOG (zapis wpisów audytu + email do admina)
// =================================================================

// Helper: zapisz wpis do AUDIT_LOG + opcjonalnie wyślij email do admina
// user: login wykonującego; rola: user.rola; akcja: np. 'carrier_delete'; target: np. login przewoźnika
// before/after: stara/nowa wartość (może być string lub JSON); powod: wymagany dla destrukcji; metadata: JSON object
function _writeAuditLog(user, rola, akcja, target, before, after, powod, metadata, sendMail) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_AUDIT_LOG);
    if (!sheet) { ensureAuditLogSheet(ss); sheet = ss.getSheetByName(CONFIG.SHEET_AUDIT_LOG); }
    var timestamp = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    var metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : '';
    sheet.appendRow([timestamp, user || '', rola || '', akcja || '', target || '', (before || '').toString(), (after || '').toString(), powod || '', metaStr]);

    // Email do admina przy destrukcyjnych akcjach
    if (sendMail !== false) {
      try {
        var icon = '🔔';
        if (akcja.indexOf('delete') >= 0) icon = '🗑️';
        else if (akcja.indexOf('deactivate') >= 0 || akcja.indexOf('toggle') >= 0) icon = '⏸️';
        else if (akcja.indexOf('planista') >= 0 || akcja.indexOf('stawka') >= 0) icon = '✏️';
        MailApp.sendEmail({
          to: CONFIG.ADMIN_EMAIL,
          subject: icon + ' AUDIT: ' + akcja + ' przez ' + (user || '?') + ' (' + (rola || '?') + ')',
          htmlBody: '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto">' +
            '<div style="background:#7c2d12;padding:16px 24px;border-radius:12px 12px 0 0">' +
              '<h2 style="color:#fff;margin:0;font-size:17px">' + icon + ' Akcja w systemie MAGGuarantee</h2>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 24px">' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Data:</b></td><td style="padding:8px 12px">' + timestamp + '</td></tr>' +
                '<tr><td style="padding:8px 12px;color:#64748b"><b>Użytkownik:</b></td><td style="padding:8px 12px;font-weight:700">' + escHtml(user || '') + ' (' + escHtml(rola || '') + ')</td></tr>' +
                '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Akcja:</b></td><td style="padding:8px 12px;font-family:monospace;color:#b91c1c;font-weight:700">' + escHtml(akcja) + '</td></tr>' +
                '<tr><td style="padding:8px 12px;color:#64748b"><b>Target:</b></td><td style="padding:8px 12px;font-family:monospace">' + escHtml(target || '') + '</td></tr>' +
                (before ? '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Przed:</b></td><td style="padding:8px 12px">' + escHtml(before.toString()) + '</td></tr>' : '') +
                (after  ? '<tr><td style="padding:8px 12px;color:#64748b"><b>Po:</b></td><td style="padding:8px 12px">' + escHtml(after.toString()) + '</td></tr>' : '') +
                (powod  ? '<tr style="background:#fef3c7"><td style="padding:8px 12px;color:#92400e"><b>Powód:</b></td><td style="padding:8px 12px;color:#78350f">' + escHtml(powod) + '</td></tr>' : '') +
              '</table>' +
            '</div>' +
          '</div>'
        });
      } catch(me) { Logger.log('audit email ERR: ' + me.message); }
    }
  } catch(e) {
    Logger.log('_writeAuditLog ERR: ' + e.message);
  }
}
