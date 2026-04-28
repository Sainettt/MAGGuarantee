// =================================================================
// Auth: generator haseł (przyszłość: hash)
// =================================================================

// Generator losowego hasła (10 znaków: małe/duże litery + cyfry, bez mylących 0/O/l/1)
function _generateRandomPassword() {
  var chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var result = '';
  for (var i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
