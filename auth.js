/* Discord sign-in, reusing the alliance bot's API.

   The API owns the whole flow: it redirects to Discord, verifies the caller is a
   member of the alliance guild, and hands back a short-lived JWT in the URL
   fragment (never the query string, so it stays out of server logs and Referer
   headers). Officers get is_admin in the token, which is what lets them save the
   shared plan; everyone else reads it.

   Nothing here is a security check -- the API re-verifies the token on every
   request. The claims are read only to decide what the UI should offer. */
(function (global) {
  "use strict";
  const API = "https://dws-api.xronocore.qzz.io";
  const SESSION = "pouwar.session";

  function claims(token) {
    try {
      const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return { id: String(p.sub), name: p.name || "?", admin: !!p.adm, exp: p.exp || 0 };
    } catch (e) { return null; }
  }

  function begin() { location.href = `${API}/auth/login?app=passwar`; }

  /* A token or an error comes back in the fragment; consume it and clean the URL
     so a reload or a shared link never carries the token. */
  function consumeHash() {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const token = h.get("token"), error = h.get("error");
    if (token || error) history.replaceState(null, "", location.pathname + location.search);
    if (token) {
      const c = claims(token);
      if (c) { sessionStorage.setItem(SESSION, JSON.stringify({ token, ...c })); return { who: c }; }
      return { error: "bad_token" };
    }
    return error ? { error } : {};
  }

  function current() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION) || "null");
      if (!s || !s.token) return null;
      if (s.exp && Date.now() / 1000 > s.exp) { sessionStorage.removeItem(SESSION); return null; }
      return s;
    } catch (e) { return null; }
  }

  function logout() { sessionStorage.removeItem(SESSION); location.replace(location.pathname); }

  async function api(path, opts) {
    const s = current();
    if (!s) throw new Error("not signed in");
    const r = await fetch(API + path, Object.assign({ cache: "no-store" }, opts, {
      headers: Object.assign({ Authorization: "Bearer " + s.token },
                             (opts && opts.body) ? { "Content-Type": "application/json" } : {},
                             (opts && opts.headers) || {})
    }));
    if (r.status === 401) { sessionStorage.removeItem(SESSION); throw new Error("session expired"); }
    if (r.status === 403) throw new Error("officers only");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.status === 204 ? null : r.json();
  }

  const MESSAGES = {
    not_in_guild: "That Discord account is not in the PoU alliance server.",
    not_authorised: "That account is not an alliance officer.",
    bad_token: "The sign-in reply could not be read. Try again."
  };

  global.Auth = { API, begin, consumeHash, current, logout, api, MESSAGES };
})(window);
