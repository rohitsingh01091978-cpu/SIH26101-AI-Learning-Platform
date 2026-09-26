// Single place that knows where the session lives.
//
// "Remember me" checked   -> localStorage   (survives closing the browser)
// "Remember me" unchecked -> sessionStorage (cleared when the tab is closed)
//
// The JWT is readable by page scripts in either case (that is the tradeoff of
// not using HttpOnly cookies); keeping the app free of XSS is what protects it.

const TOKEN_KEY = 'sih_token';
const USER_KEY = 'sih_user';
const stores = () => [localStorage, sessionStorage];

function read(key) {
  for (const store of stores()) {
    try {
      const value = store.getItem(key);
      if (value) return value;
    } catch {
      /* storage unavailable */
    }
  }
  return null;
}

export const getToken = () => read(TOKEN_KEY);

export function getStoredUser() {
  try {
    const raw = read(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user, remember = true) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  try {
    // Only the other store is cleared first; clearing the target too would fire
    // a spurious "signed out" storage event in this app's other open tabs.
    other.removeItem(TOKEN_KEY);
    other.removeItem(USER_KEY);
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable - session lasts until reload */
  }
}

// Refreshes the cached user without moving the session between stores.
export function updateStoredUser(user) {
  const store = sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage;
  try {
    store.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

// Removes the session from BOTH stores so no stale token is left behind.
export function clearSession() {
  for (const store of stores()) {
    try {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;
