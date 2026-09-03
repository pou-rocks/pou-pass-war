/* PoU Pass Occupation War — UI layer.
   Roster comes from the published Google Sheet (same feed the hive map uses), with the
   bundled members.csv as the fallback. The LINEUP is the thing that drives placement:
   an explicit priority order, seeded from BGB CP, which the user reorders and mixes
   mercenaries into. Mercenaries carry no BGB CP -- their position in the lineup IS their rank. */
(function () {
  "use strict";

  const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9nTYasjEgPo-Mb7Qtu" +
                "AoLxUf1PBmiRKMIa46L7wruZZY2zXNxTGJrzb_YkJbyng/pub?output=csv";
  const STORE = "pouwar.state.v1";
  const $ = (s) => document.querySelector(s);

  const state = {
    roster: [],       // sheet members, BGB desc
    lineup: [],       // ordered member objects -- the priority list
    source: "",
    opts: {
      version: 1, orient: "bottom", portalOwners: 24, portalLayers: 4,
      shelterBias: "left", showZones: true, tile: 30, mapTiles: 40, rivalDepth: 6
    }
  };

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  // ------------------------------- persistence ------------------------------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        opts: state.opts,
        order: state.lineup.map((m) => m.name),
        mercs: state.lineup.filter((m) => m.merc).map((m) => ({ name: m.name, bgb: m.bgb }))
      }));
    } catch (e) { /* private mode */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { return null; }
  }

  /* Merge the roster into the lineup: saved order wins for names it knows, anything new
     falls in at its BGB rank behind them, and departed members drop out. Mercenaries are
     local-only so they always survive. */
  function syncLineup(saved) {
    const mercs = state.lineup.filter((m) => m.merc);
    const order = saved ? saved.order : state.lineup.map((m) => m.name);
    const idx = new Map((order || []).map((n, i) => [n, i]));
    const pool = state.roster.concat(mercs);
    pool.forEach((m, i) => { m._seed = idx.has(m.name) ? idx.get(m.name) : 1e6 + i; });
    pool.sort((a, b) => a._seed - b._seed);
    state.lineup = pool;
  }

  function addMerc(name, bgb) {
    name = (name || "").trim();
    if (!name) return "Give the mercenary a name.";
    if (state.lineup.some((m) => m.name.toLowerCase() === name.toLowerCase()))
      return `"${name}" is already in the lineup.`;
    state.lineup.unshift({ name, bgb: Number(bgb) || 0, cp: 0, lvl: null, merc: true });
    return null;
  }

  const move = (i, to) => {
    if (to < 0 || to >= state.lineup.length) return;
    const [m] = state.lineup.splice(i, 1);
    state.lineup.splice(to, 0, m);
  };

  // ------------------------------- roster load ------------------------------
  async function loadRoster(live) {
    const saved = load();
    if (saved && saved.opts) Object.assign(state.opts, saved.opts);
    if (saved && saved.mercs) state.lineup = saved.mercs.map((m) => Object.assign({ merc: true, cp: 0, lvl: null }, m));

    let text = null;
    if (live !== false) {
      try {
        const r = await fetch(SHEET, { cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const t = await r.text();
        if (/^\s*</.test(t)) throw new Error("sheet not public?");
        text = t; state.source = "live Google Sheet";
      } catch (e) { state.source = "bundled snapshot (" + e.message + ")"; }
    }
    if (text === null) {
      text = await fetch("members.csv", { cache: "no-store" }).then((r) => r.text());
      if (!state.source) state.source = "bundled snapshot";
    }
    state.roster = PassWar.parseMembers(text);
    syncLineup(saved);
  }

  // ------------------------------- rendering --------------------------------
  let plan = null;
  function draw() {
    const o = state.opts;
    plan = PassWar.buildPlan(state.lineup, o);
    plan.showZones = o.showZones;
    PassWar.render($("#map"), plan, state.roster, stamp());
    $("#wrap").style.width = plan.g.W + "px";
    const s = plan.stats;
    $("#status").textContent =
      `v${o.version} · pass at ${o.orient} · ${s.shelters} shelters · ${s.portals} portals ` +
      `(${s.owned} prioritised + ${s.free} free) · ${s.named} of ${state.roster.length + countMercs()} placed`;
    $("#src").textContent = "roster: " + state.source;
    renderLineup();
    save();
  }
  const countMercs = () => state.lineup.filter((m) => m.merc).length;

  function renderLineup() {
    const o = state.opts, shelters = o.version === 3 ? 0 : 8;
    const list = $("#lineup"); list.innerHTML = "";
    $("#slotinfo").textContent = shelters
      ? `${shelters} shelters + ${o.portalOwners} portals`
      : `${o.portalOwners} portals (v3 has no shelters)`;

    state.lineup.forEach((m, i) => {
      const row = document.createElement("li");
      row.className = "row" + (i < Math.max(shelters, o.portalOwners) ? " on" : "");
      const badges = [];
      if (i < shelters) badges.push(`<b class="bg s">S${i + 1}</b>`);
      if (i < o.portalOwners) badges.push(`<b class="bg p">P${i + 1}</b>`);
      row.innerHTML =
        `<span class="n">${i + 1}</span>` +
        `<span class="who"><span class="nm">${esc(m.name)}</span>` +
        `<span class="cp">${m.merc ? "mercenary" : ""}${m.bgb ? (m.merc ? " · " : "") + PassWar.shortCP(m.bgb) : (m.merc ? "" : "—")}</span></span>` +
        `<span class="badges">${badges.join("")}</span>` +
        `<span class="acts">` +
          `<button title="to top" data-a="top" data-i="${i}">⤒</button>` +
          `<button title="up" data-a="up" data-i="${i}">↑</button>` +
          `<button title="down" data-a="dn" data-i="${i}">↓</button>` +
          (m.merc ? `<button title="remove" class="rm" data-a="rm" data-i="${i}">✕</button>` : "") +
        `</span>`;
      list.appendChild(row);
      if (i + 1 === Math.max(shelters, o.portalOwners)) {
        const div = document.createElement("li");
        div.className = "cut";
        div.textContent = "— assigned above · bench below —";
        list.appendChild(div);
      }
    });
  }
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ------------------------------- wiring -----------------------------------
  function bind() {
    const o = state.opts;
    const set = (k, v, redraw) => { o[k] = v; if (redraw !== false) draw(); };

    $("#version").onchange = (e) => set("version", parseInt(e.target.value, 10));
    $("#orient").onchange = (e) => set("orient", e.target.value);
    $("#bias").onchange = (e) => set("shelterBias", e.target.value);
    $("#layers").onchange = (e) => set("portalLayers", Math.max(0, Math.min(8, +e.target.value)));
    $("#owners").oninput = (e) => {
      $("#ownersOut").textContent = e.target.value;
      set("portalOwners", Math.max(0, +e.target.value));
    };
    $("#zones").onchange = (e) => set("showZones", e.target.checked);

    $("#refresh").onclick = async (e) => {
      e.target.disabled = true; $("#src").textContent = "roster: fetching…";
      await loadRoster(true); draw(); e.target.disabled = false;
    };
    $("#reset").onclick = () => {
      const mercs = state.lineup.filter((m) => m.merc);
      state.lineup = state.roster.slice();
      mercs.forEach((m) => state.lineup.unshift(m));
      draw();
    };
    $("#full").onclick = () => {
      $("#stage").classList.toggle("full");
      $("#full").textContent = $("#stage").classList.contains("full") ? "⤢ Fit width" : "⤢ Actual size";
    };
    $("#png").onclick = () => {
      $("#map").toBlob((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = `pass_war_map_v${o.version}_${o.orient}_${stamp()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    };

    $("#addmerc").onclick = () => {
      const err = addMerc($("#mname").value, $("#mcp").value);
      $("#mercerr").textContent = err || "";
      if (!err) { $("#mname").value = ""; $("#mcp").value = ""; draw(); }
    };
    $("#mname").onkeydown = (e) => { if (e.key === "Enter") $("#addmerc").click(); };
    $("#mcp").onkeydown = (e) => { if (e.key === "Enter") $("#addmerc").click(); };

    $("#lineup").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.a === "top") move(i, 0);
      else if (b.dataset.a === "up") move(i, i - 1);
      else if (b.dataset.a === "dn") move(i, i + 1);
      else if (b.dataset.a === "rm") state.lineup.splice(i, 1);
      draw();
    };
    $("#logout").onclick = () => Auth.logout();
  }

  function syncControls() {
    const o = state.opts;
    $("#version").value = o.version; $("#orient").value = o.orient;
    $("#bias").value = o.shelterBias; $("#layers").value = o.portalLayers;
    $("#owners").value = o.portalOwners; $("#ownersOut").textContent = o.portalOwners;
    $("#zones").checked = o.showZones;
  }

  // ------------------------------- boot -------------------------------------
  async function start(who) {
    $("#gate").hidden = true; $("#app").hidden = false;
    $("#whoami").textContent = who.name;
    await loadRoster(true);
    syncControls(); bind(); draw();
  }

  window.addEventListener("DOMContentLoaded", () => {
    const who = Auth.current();
    if (who) return start(who);
    $("#gate").hidden = false;
    const submit = async () => {
      const btn = $("#signin");
      btn.disabled = true; $("#gateerr").textContent = "checking…";
      const u = await Auth.login($("#uid").value, $("#pw").value).catch(() => null);
      if (u) return start(u);
      $("#gateerr").textContent = "Wrong ID or password.";
      btn.disabled = false; $("#pw").select();
    };
    $("#signin").onclick = submit;
    $("#pw").onkeydown = (e) => { if (e.key === "Enter") submit(); };
    $("#uid").onkeydown = (e) => { if (e.key === "Enter") $("#pw").focus(); };
    $("#uid").focus();
  });
})();
