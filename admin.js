// מסך המנהל ("מפקדה"): עריכת צוותים ותחנות, קישורי צוות, הדפסת QR ומעקב חי.
// ההגדרות נשמרות רק בדפדפן הזה (localStorage) ועוברות לטלפונים דרך קישורי הצוות.
(() => {
  const KEY = "bt:admin";
  const D = BT.DEFAULTS;
  const pane = document.getElementById("pane"), tabsEl = document.getElementById("tabs");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let A = null;
  try { A = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!A || !A.cfg) A = { cfg: clone(D), roster: D.teams.map(() => []), kids: "" };

  // ייבוא מקישור (‎#c=הגדרות&r=רשימות)
  const hp = BT.hashParams();
  if (hp.get("c")) {
    try {
      const cfg = BT.decode(hp.get("c"));
      if (!A.cfg.topic || confirm("לטעון את ההגדרות מהקישור? (יחליף את מה ששמור במכשיר הזה)")) {
        A.cfg = cfg;
        if (hp.get("r")) { const r = BT.decodeAny(hp.get("r")); A.roster = r.roster || []; A.kids = r.kids || ""; }
      }
    } catch (e) { alert("הקישור לא תקין"); }
    history.replaceState(null, "", location.pathname);
  }
  if (!A.cfg.topic) A.cfg.topic = BT.newTopic();
  fixRoster();
  save();

  function fixRoster() { A.roster = A.cfg.teams.map((_, i) => (A.roster && A.roster[i]) || []); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (e) {} }
  const N = () => A.cfg.teams.length;
  const teamLink = (i) => BT.baseUrl() + "index.html#t=" + i + "&c=" + BT.encode(A.cfg);
  const stationLink = (i) => BT.baseUrl() + "index.html?s=" + BT.CODES[i];
  const adminLink = () => BT.baseUrl() + "admin.html#c=" + BT.encode(A.cfg) + "&r=" + BT.encodeAny({ roster: A.roster, kids: A.kids });
  function qr(text, level) {
    const q = qrcode(0, level || "L");
    q.addData(text, "Byte"); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) { prompt("העתיקו:", text); }
    if (btn) { const t = btn.textContent; btn.textContent = "הועתק ✔"; setTimeout(() => (btn.textContent = t), 1500); }
  }

  const TABS = [["settings", "⚙️ הגדרות"], ["teams", "👥 צוותים"], ["links", "🔗 קישורי צוות"], ["print", "🖨️ הדפסה"], ["live", "📡 מעקב חי"]];
  let tab = "settings";
  try { tab = sessionStorage.getItem("bt:tab") || tab; } catch (e) {}
  function drawTabs() {
    tabsEl.innerHTML = TABS.map(([k, l]) => `<button data-k="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("");
    tabsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => { tab = b.dataset.k; try { sessionStorage.setItem("bt:tab", tab); } catch (e) {} draw(); }));
  }
  function draw() { drawTabs(); ({ settings, teams, links, print, live })[tab](); }

  // ---------- הגדרות ----------
  function settings() {
    const c = A.cfg;
    pane.innerHTML = `<div class="card"><h2>המשחק</h2>
      <label>שם המשחק (מופיע בטלפונים)</label><input class="f" id="title" value="${esc(c.title)}" />
      <div class="row"><div><label>שעת "חוזרים לבסיס" (אפשר להשאיר ריק)</label><input class="f" id="end" type="time" value="${esc(c.end)}" /></div>
      <div><label>קוד המטמון (כמו במנעול)</label><input class="f" id="code" inputmode="numeric" value="${esc(c.code)}" /></div></div>
      <label>מה כתוב כשמקלידים את הקוד הנכון בטלפון</label><input class="f" id="where" value="${esc(c.where)}" />
      </div>
      <div class="card"><h2>המשפט הסופי</h2><p class="dim">כל שורה היא קטע. הקטעים מתחלקים בין הצוותים לפי הסדר, והצוותים מחברים אותם יחד למשפט שהתשובה שלו היא קוד המטמון.</p>
      <textarea class="f" id="frag">${esc(c.frag.join("\n"))}</textarea><div id="fragwarn" class="small"></div></div>
      <div class="card"><h2>התחנות</h2><p class="dim">הסדר כאן הוא סדר ההליכה במעגל: כל צוות מתחיל בתחנה אחרת וממשיך לבאה בתור. קוד ה-QR של כל תחנה קבוע, כך ששינוי שם לא מחייב הדפסה מחדש.</p>
      ${c.st.map((s, i) => `<label>תחנה ${i + 1} (קוד ${BT.CODES[i]}): שם המקום</label><input class="f st" data-i="${i}" value="${esc(s)}" />
        <label>משימת השטח בתחנה ${i + 1}</label><input class="f task" data-i="${i}" value="${esc(c.tasks[i])}" />`).join("")}</div>
      <div class="card"><h2>איפוס</h2><p class="dim">אחרי משחק ניסיון: "משחק חדש" מאפס את ההתקדמות בכל הטלפונים (צריך לפתוח בהם שוב את קישור הצוות) ומנקה את המעקב החי.</p>
      <button class="btn ghost" id="newgame">🔄 משחק חדש</button></div>`;
    const warn = () => {
      const L = c.frag.length, w = document.getElementById("fragwarn");
      w.innerHTML = L < N() ? `<span class="bad">יש ${L} קטעים ו-${N()} צוותים: צריך לפחות קטע אחד לכל צוות.</span>` : `<span class="ok">${L} קטעים ל-${N()} צוותים ✔</span> המשפט: "${esc(c.frag.join(" "))}"`;
    };
    warn();
    const bind = (id, k) => (document.getElementById(id).oninput = (e) => { c[k] = e.target.value.trim(); save(); });
    bind("title", "title"); bind("end", "end"); bind("code", "code"); bind("where", "where");
    document.getElementById("frag").oninput = (e) => { c.frag = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); save(); warn(); };
    pane.querySelectorAll(".st").forEach((el) => (el.oninput = () => { c.st[+el.dataset.i] = el.value.trim() || D.st[+el.dataset.i]; save(); }));
    pane.querySelectorAll(".task").forEach((el) => (el.oninput = () => { c.tasks[+el.dataset.i] = el.value.trim() || D.tasks[+el.dataset.i]; save(); }));
    document.getElementById("newgame").onclick = () => { if (confirm("להתחיל משחק חדש? ההתקדמות של כל הצוותים תתאפס.")) { c.topic = BT.newTopic(); save(); liveReset(); alert("מוכן. שלחו לצוותים את הקישורים החדשים (לשונית קישורי צוות)."); } };
  }

  // ---------- צוותים ----------
  function setTeamCount(n) {
    const c = A.cfg, old = N();
    if (n < old) {
      const moved = A.roster.slice(n).flat();
      c.teams = c.teams.slice(0, n); A.roster = A.roster.slice(0, n);
      moved.forEach((k, i) => A.roster[i % n].push(k)); // ילדי הצוותים שבוטלו מתפזרים בין הנשארים
    } else for (let i = old; i < n; i++) { c.teams.push(D.teams[i] || "צוות " + (i + 1)); A.roster.push([]); }
    save();
  }
  function shuffleKids() {
    const kids = A.kids.split("\n").map((x) => x.trim()).filter(Boolean);
    for (let i = kids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kids[i], kids[j]] = [kids[j], kids[i]]; }
    A.roster = A.cfg.teams.map(() => []);
    kids.forEach((k, i) => A.roster[i % N()].push(k));
    save();
  }
  function teams() {
    const c = A.cfg;
    const nKids = A.kids.split("\n").filter((x) => x.trim()).length;
    pane.innerHTML = `<div class="card"><h2>כמה צוותים?</h2>
      <p class="dim">אם הגיעו פחות ילדים, פשוט מצמצמים כאן. המסלולים והמשפט הסופי מתארגנים מחדש לבד. אחרי שינוי, הצוותים צריכים לפתוח את הקישור המעודכן (לשונית קישורי צוות).</p>
      <select class="f" id="n">${[2, 3, 4, 5, 6].map((n) => `<option ${n === N() ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="card"><h2>חלוקה אוטומטית</h2><label>כל הילדים שהגיעו, שם בכל שורה (${nKids})</label>
      <textarea class="f" id="kids" placeholder="שם בכל שורה">${esc(A.kids)}</textarea>
      <button class="btn ghost" id="shuffle">🎲 חלוקה אקראית ל-${N()} צוותים</button>
      <p class="dim small">שמות הילדים נשמרים רק במכשיר הזה. הם לא נשלחים לטלפונים של הצוותים ולא לשום שרת.</p></div>
      <div class="grid2">${c.teams.map((t, i) => `<div class="card"><label>שם צוות ${i + 1}</label><input class="f tn" data-i="${i}" value="${esc(t)}" />
        <label>ילדים (שם בכל שורה): ${A.roster[i].length}</label><textarea class="f tr" data-i="${i}">${esc(A.roster[i].join("\n"))}</textarea>
        <div class="dim small">מתחיל ב: ${esc(c.st[BT.route(i, N())[0]])}</div></div>`).join("")}</div>`;
    document.getElementById("n").onchange = (e) => { setTeamCount(+e.target.value); teams(); };
    document.getElementById("kids").oninput = (e) => { A.kids = e.target.value; save(); };
    document.getElementById("shuffle").onclick = () => { if (!A.kids.trim()) return alert("קודם כתבו את שמות הילדים"); shuffleKids(); teams(); };
    pane.querySelectorAll(".tn").forEach((el) => (el.oninput = () => { c.teams[+el.dataset.i] = el.value.trim() || D.teams[+el.dataset.i]; save(); }));
    pane.querySelectorAll(".tr").forEach((el) => (el.oninput = () => { A.roster[+el.dataset.i] = el.value.split("\n").map((x) => x.trim()).filter(Boolean); save(); }));
  }

  // ---------- קישורי צוות ----------
  function links() {
    const c = A.cfg;
    pane.innerHTML = `<div class="card"><h2>קישור התחלה לכל צוות</h2><p class="dim">המלווה של כל צוות סורק את הקוד שלו מהמסך הזה (או מקבל את הקישור בווטסאפ) ופותח אותו בטלפון שילווה את הצוות. שיניתם שמות, תחנות או מספר צוותים? הקודים כאן מתעדכנים, וצריך לסרוק שוב.</p></div>
      <div class="grid2">${c.teams.map((t, i) => `<div class="card"><h2>${esc(t)}</h2><div class="dim small">${esc(A.roster[i].join(", ")) || "&nbsp;"}</div>
        <div class="dim small">מסלול: ${BT.route(i, N()).map((s) => esc(c.st[s])).join(" ← ")}</div>
        <div class="qr" style="margin-top:8px">${qr(teamLink(i))}</div>
        <button class="btn ghost cp" data-i="${i}">העתקת קישור</button><button class="btn ghost sh" data-i="${i}">שיתוף</button></div>`).join("")}</div>
      <div class="card"><h2>גיבוי המפקדה</h2><p class="dim">קישור שפותח את מסך המנהל עם כל ההגדרות והרשימות במכשיר אחר (למשל מהמחשב לטלפון). לשמור לעצמך, לא לשלוח לילדים.</p>
      <button class="btn ghost" id="cpadmin">העתקת קישור המפקדה</button></div>`;
    pane.querySelectorAll(".cp").forEach((b) => (b.onclick = () => copy(teamLink(+b.dataset.i), b)));
    pane.querySelectorAll(".sh").forEach((b) => (b.onclick = () => { const i = +b.dataset.i, d = { title: c.title, text: c.teams[i] + ": קישור ההתחלה למשחק", url: teamLink(i) }; if (navigator.share) navigator.share(d).catch(() => {}); else copy(d.url, b); }));
    document.getElementById("cpadmin").onclick = (e) => copy(adminLink(), e.target);
  }

  // ---------- הדפסה ----------
  function print() {
    const c = A.cfg, sheet = document.getElementById("print");
    pane.innerHTML = `<div class="card"><h2>דפי התחנות</h2><p class="dim">6 דפים, אחד לכל תחנה. תולים כל דף במקום שלו (כדאי בניילונית). מתחת לכל קוד מודפס מספר, למקרה שהסריקה לא עובדת.</p>
      <button class="btn" id="pst">🖨️ הדפסת 6 דפי תחנות</button><button class="btn ghost" id="ptm">🖨️ הדפסת דפי צוות (קוד התחלה + שמות)</button></div>
      <div class="grid2">${c.st.map((s, i) => `<div class="card"><b>${i + 1}. ${esc(s)}</b><div class="dim small">קוד ידני: ${BT.CODES[i]}</div><div class="qr" style="margin-top:8px">${qr(stationLink(i), "M")}</div></div>`).join("")}</div>`;
    document.getElementById("pst").onclick = () => {
      sheet.innerHTML = c.st.map((s, i) => `<div class="pcard"><div class="pstamp">סודי ביותר</div><h1>תחנה סודית ${i + 1}</h1><h2>${esc(s)}</h2>${qr(stationLink(i), "M")}
        <div class="manual">קוד ידני: ${BT.CODES[i]}</div><div class="note">סוכנים: סרקו את הקוד במצלמת הטלפון של הצוות.<br>משחק יום הולדת. בבקשה לא להזיז, נאסוף בסוף היום. תודה!</div></div>`).join("");
      window.print();
    };
    document.getElementById("ptm").onclick = () => {
      sheet.innerHTML = c.teams.map((t, i) => `<div class="pcard"><div class="pstamp">סודי ביותר</div><h1>${esc(t)}</h1><h2>${esc(A.roster[i].join(" · "))}</h2>${qr(teamLink(i))}
        <div class="note">המלווה סורק את הקוד בטלפון שילווה את הצוות.<br>תחנה ראשונה: ${esc(c.st[BT.route(i, N())[0]])}</div></div>`).join("");
      window.print();
    };
  }

  // ---------- מעקב חי ----------
  const PH = { brief: "בתדריך", goto: "בדרך אל", puzzle: "מפצחים ב", mission: "משימת שטח ב", reward: "סיימו את", word: "מסדרים את המילה", final: "סיימו! בדרך לבסיס", done: "פתחו את המטמון 🎉" };
  let snaps = {}, es = null, liveTopic = "", liveStatus = "מתחבר...";
  function ingest(line) {
    try {
      const m = typeof line === "string" ? JSON.parse(line) : line;
      if (m.event && m.event !== "message") return;
      const s = JSON.parse(m.message);
      if (typeof s.t !== "number") return;
      if (!snaps[s.t] || snaps[s.t].ts <= s.ts) snaps[s.t] = s;
    } catch (e) {}
  }
  async function poll() {
    try {
      const r = await fetch(BT.NTFY + A.cfg.topic + "/json?poll=1&since=12h");
      (await r.text()).split("\n").filter(Boolean).forEach(ingest);
      liveStatus = "מחובר ✔";
    } catch (e) { liveStatus = "אין חיבור, מנסה שוב..."; }
    if (tab === "live") drawLive();
  }
  function liveStart() {
    if (liveTopic === A.cfg.topic && es) return;
    liveReset();
    liveTopic = A.cfg.topic;
    poll();
    try {
      es = new EventSource(BT.NTFY + A.cfg.topic + "/sse");
      es.onmessage = (e) => { ingest(e.data); if (tab === "live") drawLive(); };
    } catch (e) {}
  }
  function liveReset() { if (es) es.close(); es = null; snaps = {}; liveTopic = ""; }
  setInterval(() => { if (tab === "live") { if (!es || es.readyState === 2) { es = null; liveTopic = ""; liveStart(); } else poll(); } }, 30000);
  setInterval(() => { if (tab === "live") drawLive(); }, 5000);

  const mmss = (sec) => Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
  function drawLive() {
    const c = A.cfg, box = document.getElementById("livebox");
    if (!box) return;
    const rows = c.teams.map((t, i) => {
      const s = snaps[i], stars = s ? s.stars.reduce((a, b) => a + (b || 0), 0) : 0;
      const time = s && s.a ? ((s.f || Date.now()) - s.a) / 1000 : 0;
      return { i, t, s, stars, time, fin: !!(s && s.f), pos: s ? s.pos : -1 };
    }).sort((a, b) => b.stars - a.stars || b.fin - a.fin || (a.fin && b.fin ? a.time - b.time : b.pos - a.pos));
    box.innerHTML = `<div class="tblwrap"><table><tr><th>#</th><th>צוות</th><th>מצב</th><th>תחנות (לפי סדר המסלול)</th><th>⭐</th><th>רמזים</th><th>זמן</th><th>עדכון</th></tr>
      ${rows.map((r, k) => {
        const s = r.s;
        if (!s) return `<tr><td>${k + 1}</td><td><b>${esc(r.t)}</b></td><td class="dim" colspan="6">עוד לא התחברו</td></tr>`;
        const where = s.cur >= 0 && ["goto", "puzzle", "mission", "reward"].includes(s.ph) ? PH[s.ph] + esc(c.st[s.cur]) : PH[s.ph] || s.ph;
        const dots = Array.from({ length: BT.STATIONS }, (_, j) => `<span>${j < s.pos ? (s.stars[j] || 1) + "⭐" : j === s.pos && s.ph !== "brief" ? "🏃" : "·"}</span>`).join("");
        const age = (Date.now() - s.ts) / 1000;
        return `<tr><td>${k + 1}</td><td><b>${esc(r.t)}</b></td><td>${where}</td><td class="dots">${dots}</td><td><b>${r.stars}</b></td><td>${s.h}</td>
          <td>${s.a ? mmss(r.time) + (s.f ? " ✔" : "") : "-"}</td><td class="${age > 300 ? "bad" : "dim"} small">לפני ${age < 90 ? Math.round(age) + " שנ׳" : Math.round(age / 60) + " דק׳"}</td></tr>`;
      }).join("")}</table></div><div class="dim small" style="margin-top:8px">${liveStatus} · דירוג: לפי כוכבים, ואז לפי זמן סיום</div>`;
  }
  function live() {
    const c = A.cfg;
    pane.innerHTML = `<div class="card"><h2>התקדמות הצוותים</h2><div id="livebox"></div></div>
      <div class="card"><h2>🔐 דף תשובות למפקד</h2>
      <p><b>המשפט המלא:</b> ${esc(c.frag.join(" "))}<br><b>קוד המטמון:</b> ${esc(c.code)}<br><b>המילה שהצוותים מסדרים:</b> ${BT.WORD.join("")}</p>
      <p><b>הקטע של כל צוות:</b><br>${c.teams.map((t, i) => `${esc(t)}: "${esc(BT.fragsFor(i, c).join(" "))}"`).join("<br>")}</p>
      <p><b>פתרונות התחנות:</b><br>${["המטמון מחכה לסוכנים אמיצים (אתב״ש)", "938607 (מורס)", "השם שלך (חידה בכתב ראי)", "עוגת שוקולד (תרגילים + גימטריה)", "מקישים בסדר הפוך: אדום, ירוק, כחול, צהוב, אדום, כחול, ירוק (צבעים)", "קפטן מלפפון (הסוכן הכפול)"].map((a, i) => `${i + 1}. ${esc(c.st[i])}: ${a}`).join("<br>")}</p>
      <p class="dim small">צוות שנתקע מקבל רמז אחרי 2 דקות, רמז שני אחרי 4, ופתרון מלא אחרי 6. צוות שלא סיים עד שעת הסיום מקבל כפתור "קבלו את המסמך הסודי".</p></div>`;
    liveStart(); drawLive();
  }

  draw();
  window.__admin = { get A() { return A; }, teamLink, stationLink, adminLink, setTeamCount, draw };
})();
