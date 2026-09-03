/* Access gate. Credentials are PBKDF2-SHA256 (200k iterations, per-user salt) in users.json,
   so no password is readable in the source. This keeps the tool to the people you hand
   accounts to; it is NOT server-side security -- everything a static host serves is
   fetchable, and the roster Sheet is published separately anyway. */
(function (global) {
  "use strict";
  const ITER = 200000, SESSION = "pouwar.session";

  const b64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function derive(password, saltB64) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password),
      "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: unb64(saltB64), iterations: ITER, hash: "SHA-256" }, key, 256);
    return b64(bits);
  }

  async function login(id, password) {
    const users = global.__USERS__ ||
      await fetch("users.json", { cache: "no-store" }).then((r) => r.json());
    const u = users[String(id).trim().toLowerCase()];
    if (!u) return null;
    const hash = await derive(password, u.salt);
    if (hash !== u.hash) return null;
    const who = { id: String(id).trim().toLowerCase(), name: u.name || id };
    sessionStorage.setItem(SESSION, JSON.stringify(who));
    return who;
  }

  function current() {
    try { return JSON.parse(sessionStorage.getItem(SESSION) || "null"); } catch (e) { return null; }
  }
  function logout() { sessionStorage.removeItem(SESSION); location.reload(); }

  global.Auth = { login, current, logout, derive, b64 };
})(window);
