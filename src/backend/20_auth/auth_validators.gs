// =================================================================
// Auth: walidatory pól (email/login/nrRej/nrNaczepy/loginKierowcy)
// =================================================================

// Walidacja emaila (prosty regex)
function _isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toString().trim());
}

// Walidacja loginu (3-20 znaków, lowercase alnum + _ -)
function _isValidLogin(login) {
  if (!login) return false;
  return /^[a-z0-9_\-]{3,20}$/.test(login.toString().trim());
}

// Walidacja nr rej. (3-10 znaków, tylko A-Z0-9, bez spacji)
function _isValidVehicleNr(nrRej) {
  if (!nrRej) return false;
  return /^[A-Z0-9]{3,10}$/.test(nrRej.toString().trim().toUpperCase());
}

// Walidacja loginu kierowcy (3-30 znaków, lowercase alnum + _- .)
function _isValidDriverLogin(login) {
  if (!login) return false;
  return /^[a-z0-9_\-\.]{3,30}$/.test(login.toString().trim());
}

// Walidacja nr rej. naczepy (3-12 znaków, A-Z0-9)
function _isValidNaczepaNr(nrRej) {
  if (!nrRej) return false;
  return /^[A-Z0-9]{3,12}$/.test(nrRej.toString().trim().toUpperCase());
}
