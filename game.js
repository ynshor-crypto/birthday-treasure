// בעקבות המטמון: המשחק בטלפון של הצוות.
// מצב המשחק נשמר ב-localStorage, כך שסריקת QR (שנפתחת בלשונית חדשה) ממשיכה מאותה נקודה.
(() => {
  const KEY = "bt:state";
  const app = document.getElementById("app");
  const T = BT.TIMES;
  let S = load();
  let muted = false;
  try { muted = localStorage.getItem("bt:muted") === "1"; } catch (e) {}
  let flash = "";
  let tickFn = null;
  let view;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} report(); }
  const now = () => Date.now();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const route = () => BT.route(S.team, S.cfg.teams.length);
  const cur = () => route()[S.pos];
  const totalStars = () => (S.stars || []).reduce((a, b) => a + (b || 0), 0);
  const mmss = (sec) => Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");

  // ---------- צלילים ----------
  let ac = null;
  function beep(freq = 660, dur = 0.12, type = "sine", when = 0, vol = 0.12) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      const t = ac.currentTime + when;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  const sfx = {
    ok: () => [523, 659, 784].forEach((f, i) => beep(f, 0.14, "triangle", i * 0.1)),
    no: () => beep(220, 0.18, "sine"),
    tap: () => beep(880, 0.05, "square", 0, 0.05),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.18, "triangle", i * 0.13)),
  };

  // ---------- דיווח למסך המנהל (רק מספר צוות והתקדמות, בלי שמות) ----------
  let dirty = false, sending = false;
  function snap() {
    return { t: S.team, ph: S.phase, pos: S.pos, cur: S.pos < BT.STATIONS ? cur() : -1, stars: S.stars || [], h: S.hints || 0, a: S.startedAt || 0, f: S.finishedAt || 0, o: S.opened ? 1 : 0, ts: now() };
  }
  function report() { dirty = true; flush(); }
  async function flush() {
    if (!S || !S.cfg.topic || sending || !dirty) return;
    sending = true; dirty = false;
    try { const r = await fetch(BT.NTFY + S.cfg.topic, { method: "POST", body: JSON.stringify(snap()) }); if (!r.ok) dirty = true; } catch (e) { dirty = true; }
    sending = false;
  }
  setInterval(flush, 20000);
  setInterval(() => { if (S && S.startedAt && !S.opened) report(); }, 120000);

  // ---------- שלד ----------
  function shell() {
    app.innerHTML = `<div class="top"><div class="name" id="tname"></div><button id="mute" aria-label="השתקה"></button></div><div id="view"></div>`;
    view = document.getElementById("view");
    const m = document.getElementById("mute");
    const paint = () => (m.textContent = muted ? "🔇" : "🔊");
    paint();
    m.onclick = () => { muted = !muted; try { localStorage.setItem("bt:muted", muted ? "1" : "0"); } catch (e) {} paint(); };
    KidsLearn.init({ gameId: "birthday-treasure", facts: FACTS, isMuted: () => muted, level: "big" });
    KidsLearn.addAlbumButton(document.querySelector(".top"));
    // לחיצה ארוכה על שם הצוות: איפוס (למלווה)
    let h;
    const n = document.getElementById("tname");
    const startHold = () => (h = setTimeout(() => { if (confirm("לאפס את המשחק בטלפון הזה?")) { try { localStorage.removeItem(KEY); } catch (e) {} location.href = location.pathname; } }, 2000));
    const endHold = () => clearTimeout(h);
    n.addEventListener("touchstart", startHold); n.addEventListener("touchend", endHold);
    n.addEventListener("mousedown", startHold); n.addEventListener("mouseup", endHold);
  }

  function timeUp() {
    const m = /^(\d{1,2}):(\d{2})$/.exec((S.cfg.end || "").trim());
    if (!m || !S.startedAt) return false;
    const end = new Date(); end.setHours(+m[1], +m[2], 0, 0);
    return S.startedAt < end.getTime() && now() >= end.getTime();
  }
  function maybeBanner() {
    if (!S || !["goto", "puzzle", "mission", "reward", "word"].includes(S.phase) || !timeUp() || document.getElementById("timeup")) return;
    const b = document.createElement("div");
    b.className = "banner"; b.id = "timeup";
    b.innerHTML = `⏰ הזמן נגמר! חוזרים לבסיס<button class="btn">קבלו את המסמך הסודי</button>`;
    b.querySelector("button").onclick = () => { S.finishedAt = S.finishedAt || now(); S.phase = "final"; save(); render(); };
    view.prepend(b);
    sfx.no();
  }

  function render() {
    tickFn = null;
    document.getElementById("tname").textContent = S ? "🕵️ " + S.cfg.teams[S.team] : "🕵️";
    document.title = S ? S.cfg.title : "בעקבות המטמון";
    if (!S) return noTeam();
    ({ brief, goto: gotoScreen, puzzle, mission, reward, word, final, done }[S.phase] || brief)();
    maybeBanner();
    window.scrollTo(0, 0);
  }
  setInterval(() => { if (tickFn) tickFn(); maybeBanner(); }, 1000);

  function noTeam(msg) {
    view.innerHTML = `<div class="card center"><div class="huge">🕵️</div><h1>בעקבות המטמון</h1>
      <p>${msg || "כדי להתחיל, סרקו את קוד הצוות שלכם אצל המפקד (או פתחו את הקישור שקיבלתם)."}</p></div>`;
  }

  // ---------- תדריך ----------
  function brief() {
    view.innerHTML = `<div class="card"><span class="stamp">סודי ביותר</span>
      <h1>${esc(S.cfg.title)}</h1>
      <p>שלום <b>${esc(S.cfg.teams[S.team])}</b>! מישהו החביא את המטמון של יום ההולדת, ורק סוכנים חשאיים יכולים למצוא אותו.</p>
      <p>במושב מחכות לכם <b>${BT.STATIONS} תחנות סודיות</b>. בכל תחנה:</p>
      <p>📷 סורקים את הקוד<br>🧩 מפצחים צופן<br>🏃 מבצעים משימת שטח<br>🔤 מקבלים אות סודית</p>
      <p class="dim">נתקעתם? אחרי כמה דקות המפקדה שולחת רמזים. פחות רמזים = יותר כוכבים ⭐</p>
      <button class="btn" id="go">יוצאים למשימה 🕵️</button></div>`;
    document.getElementById("go").onclick = () => { S.startedAt = now(); S.phase = "goto"; sfx.ok(); save(); render(); };
  }

  // ---------- בדרך לתחנה ----------
  function slotsHtml() {
    const r = route();
    return `<div class="slots">${r.map((s, i) => `<div class="slot ${i < S.pos ? "full" : ""}">${i < S.pos ? BT.WORD[s] : ""}</div>`).join("")}</div>`;
  }
  function gotoScreen() {
    view.innerHTML = `<div class="card"><div class="dim center">תחנה ${S.pos + 1} מתוך ${BT.STATIONS}</div>
      <h2 class="center">היעד הבא שלכם</h2>
      <div class="dest">📍 ${esc(S.cfg.st[cur()])}</div>
      <p class="center">מצאו שם את דף הקוד הסודי וסרקו אותו.</p>
      <button class="btn" id="scan">📷 סריקת הקוד</button>
      <div class="msg" id="msg">${esc(flash)}</div></div>
      <div class="card"><p class="dim center">הסריקה לא עובדת? אפשר לסרוק גם במצלמה הרגילה של הטלפון, או להקליד את המספר שמודפס מתחת לקוד:</p>
      <input class="in" id="code" inputmode="numeric" maxlength="3" placeholder="_ _ _" autocomplete="off" />
      <button class="btn ghost" id="enter">פתיחת התחנה</button></div>
      <div class="card"><div class="dim center">האותיות הסודיות שלכם</div>${slotsHtml()}<div class="stars">⭐ ${totalStars()}</div></div>`;
    flash = "";
    const go = () => { const v = document.getElementById("code").value.trim(); if (v) { arrive(v); render(); } };
    document.getElementById("enter").onclick = go;
    document.getElementById("scan").onclick = openScanner;
    document.getElementById("code").onkeydown = (e) => { if (e.key === "Enter") go(); };
  }
  // סריקת QR בתוך האפליקציה (מצלמה אחורית + jsQR). אם אין הרשאה, נשארות המצלמה הרגילה וההקלדה.
  async function openScanner() {
    const ov = document.createElement("div");
    ov.className = "scanner";
    ov.innerHTML = `<video playsinline muted></video><div class="frame"></div><div class="scanmsg">כוונו את המצלמה אל הקוד</div><button class="btn ghost">סגירה ✕</button>`;
    document.body.appendChild(ov);
    const video = ov.querySelector("video"), cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
    let stream = null, alive = true;
    const close = () => { alive = false; if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); };
    ov.querySelector("button").onclick = close;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!alive) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream; await video.play();
    } catch (e) {
      close(); flash = "אין גישה למצלמה. סרקו במצלמה הרגילה של הטלפון, או הקלידו את המספר 🙂"; render(); return;
    }
    const loop = () => {
      if (!alive) return;
      if (video.videoWidth) {
        const k = Math.min(1, 720 / video.videoWidth);
        cv.width = video.videoWidth * k; cv.height = video.videoHeight * k;
        cx.drawImage(video, 0, 0, cv.width, cv.height);
        const hit = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: "dontInvert" });
        if (hit && hit.data) {
          const m = /[?&]s=(\d{3})\b/.exec(hit.data);
          if (m) { close(); arrive(m[1]); render(); return; }
          ov.querySelector(".scanmsg").textContent = "זה לא קוד של תחנה. חפשו את הדף הסודי";
        }
      }
      setTimeout(loop, 150);
    };
    loop();
  }
  function arrive(code) {
    const idx = BT.CODES.indexOf(String(code).trim());
    if (!S) return;
    if (idx < 0) { flash = "קוד לא מוכר. בדקו את המספר ונסו שוב 🙂"; sfx.no(); return; }
    if (S.phase === "brief") { S.startedAt = now(); S.phase = "goto"; }
    if (S.phase !== "goto") return;
    const r = route();
    if (idx === r[S.pos]) {
      S.phase = "puzzle"; S.st = { start: now(), hints: 0, wrong: 0, revealed: false };
      sfx.ok(); save();
    } else {
      flash = (r.indexOf(idx) < S.pos ? "את התחנה הזאת כבר פיצחתם! " : "זו לא התחנה שלכם עכשיו. ") + "היעד שלכם: " + S.cfg.st[r[S.pos]];
      sfx.no();
    }
  }

  // ---------- צפנים ----------
  const ALEF = "אבגדהוזחטיכלמנסעפצקרשת";
  const base = (ch) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" }[ch] || ch);
  const atbash = (s) => [...s].map((ch) => { const i = ALEF.indexOf(base(ch)); return i < 0 ? ch : ALEF[21 - i]; }).join("");
  const MORSE = { 0: "–––––", 1: "•––––", 2: "••–––", 3: "•••––", 4: "••••–", 5: "•••••", 6: "–••••", 7: "––•••", 8: "–––••", 9: "––––•" };

  function textAnswer(box, ctx, answer, opts = {}) {
    const d = document.createElement("div");
    d.innerHTML = `<input class="in" ${opts.numeric ? 'inputmode="numeric"' : ""} placeholder="${opts.placeholder || "התשובה שלכם"}" autocomplete="off" autocapitalize="off" /><button class="btn">בדיקה</button>`;
    const inp = d.querySelector("input");
    const check = () => {
      if (!inp.value.trim()) return;
      if ([].concat(answer).some((a) => BT.norm(a) === BT.norm(inp.value))) ctx.solve();
      else { inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); ctx.msg("כמעט! בדקו שוב ונסו עוד פעם 🙂"); sfx.no(); }
    };
    d.querySelector("button").onclick = check;
    inp.onkeydown = (e) => { if (e.key === "Enter") check(); };
    box.appendChild(d);
  }

  const COLORS = { g: ["#2ee68a", "ירוק"], r: ["#ff5a5a", "אדום"], b: ["#4aa8ff", "כחול"], y: ["#ffd84a", "צהוב"] };
  const TONES = { g: 392, r: 494, b: 587, y: 698 };
  const SEQ = ["g", "b", "r", "y", "b", "g", "r"]; // מקישים בסדר הפוך
  const SEQ_IN = SEQ.slice().reverse();
  const SUSPECTS = [
    { n: "גברת ענב", f: "🍇", a: ["👓 עם משקפיים", "בלי כובע", "🧥 מעיל כחול", "🧳 מזוודה"] },
    { n: "מר תפוז", f: "🍊", a: ["בלי משקפיים", "🎩 עם כובע", "🧥 מעיל אדום", "☂️ מטרייה"] },
    { n: "קפטן מלפפון", f: "🥒", a: ["בלי משקפיים", "🎩 עם כובע", "🧥 מעיל ירוק", "🧳 מזוודה"], guilty: true },
    { n: "גברת ורד", f: "🌹", a: ["👓 עם משקפיים", "🎩 עם כובע", "🧥 מעיל כחול", "☂️ מטרייה"] },
    { n: "פרופסור גזר", f: "🥕", a: ["👓 עם משקפיים", "בלי כובע", "🧥 מעיל ירוק", "☂️ מטרייה"] },
    { n: "דוקטור לימון", f: "🍋", a: ["בלי משקפיים", "בלי כובע", "🧥 מעיל ירוק", "📰 עיתון"] },
  ];
  // גימטריה: כל תרגיל נותן ערך של אות
  const GEM = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
  const GEM_EX = [["ע", "7×10"], ["ו", "2×3"], ["ג", "12÷4"], ["ת", "8×50"], null, ["ש", "6×50"], ["ו", "36÷6"], ["ק", "4×25"], ["ו", "18÷3"], ["ל", "5×6"], ["ד", "28÷7"]];

  const PUZZLES = [
    {
      title: "צופן אתב״ש", fact: "atbash", plain: "המטמון מחכה לסוכנים אמיצים",
      build(box, ctx) {
        const pairs = [...ALEF.slice(0, 4)].map((ch, i) => `<div><b>${ch}</b> ↔ <b>${ALEF[21 - i]}</b></div>`).join("") + "<div>...</div><div>?</div>";
        box.innerHTML = `<p>הודעה מוצפנת הגיעה מהמפקדה! בצופן אתב״ש האות הראשונה באלף-בית מתחלפת באחרונה, השנייה באחת לפני האחרונה, וכך הלאה. את שאר הטבלה תצטרכו להשלים לבד.</p>
          <div class="cipher" style="font-size:25px">${atbash(this.plain)}</div><div class="key">${pairs}</div><p class="dim">מה כתוב בהודעה? (4 מילים)</p>`;
        textAnswer(box, ctx, this.plain);
      },
      hints: [`הטבלה המלאה:<div class="key" style="grid-template-columns:repeat(4,1fr)">${[...ALEF.slice(0, 11)].map((ch, i) => `<div><b>${ch}</b> ↔ <b>${ALEF[21 - i]}</b></div>`).join("")}</div>`, "שתי המילים הראשונות: <b>המטמון מחכה</b>"],
      solution: "ההודעה: המטמון מחכה לסוכנים אמיצים",
    },
    {
      title: "שידור מורס", fact: "morse", code: "938607",
      build(box, ctx) {
        const key = [1, 2, 3, 4, 5].map((d) => `<div dir="ltr"><b>${d}</b> ${MORSE[d]}</div>`).join("") + `<div>6 עד 0: ?</div>`;
        const chips = [...this.code].map((d, i) => `<div class="chip"><small>ספרה ${i + 1}</small>${MORSE[d]}</div>`).join("");
        box.innerHTML = `<p>המפקדה משדרת קוד בן 6 ספרות בקוד מורס. חלק מהטבלה נמחק! מצאו את החוקיות והשלימו את הספרות החסרות.</p>
          <div class="chips" dir="ltr">${chips}</div><button class="btn ghost" id="play">▶ השמעת השידור</button>
          <div class="key" style="grid-template-columns:repeat(2,1fr)">${key}</div>`;
        box.querySelector("#play").onclick = () => {
          let t = 0; const u = 0.11;
          [...this.code].forEach((d) => { [...MORSE[d]].forEach((s) => { const len = s === "•" ? u : u * 3; beep(700, len, "sine", t, 0.15); t += len + u; }); t += u * 4; });
        };
        textAnswer(box, ctx, this.code, { numeric: true, placeholder: "6 ספרות" });
      },
      hints: ["בכל ספרה יש 5 סימנים. מ-1 עד 5 הנקודות בהתחלה ומתרבות. מ-6 הכול מתהפך: 6 הוא קו אחד ואחריו ארבע נקודות, 7 הוא שני קווים ושלוש נקודות...", `הטבלה המלאה:<div class="key" style="grid-template-columns:repeat(2,1fr)">${Object.keys(MORSE).map((d) => `<div dir="ltr"><b>${d}</b> ${MORSE[d]}</div>`).join("")}</div>`],
      solution: "הקוד: 938607",
    },
    {
      title: "חידה בכתב ראי", fact: "mirror",
      build(box, ctx) {
        box.innerHTML = `<p>ההודעה הזאת נכתבה בכתב ראי, ומסתתרת בה חידה. פענחו את החידה וכתבו את הפתרון שלה.</p><div class="mirror">הוא שייך רק לך,<br>אבל כל האחרים משתמשים בו<br>הרבה יותר ממך.<br>מה זה?</div>`;
        textAnswer(box, ctx, ["שם", "השם", "השם שלי", "השם שלך", "שמי", "השם שלנו", "שם פרטי"], { placeholder: "הפתרון לחידה" });
      },
      hints: ["החידה אומרת: ״הוא שייך רק לך, אבל כל האחרים משתמשים בו הרבה יותר ממך. מה זה?״", "קוראים לך בו כל יום. יש לכל אחד מכם אחד כזה, והוא כתוב על המחברות שלכם."],
      solution: "הפתרון: השם שלך",
    },
    {
      title: "צופן הגימטריה", fact: "caesar", plain: "עוגת שוקולד",
      build(box, ctx) {
        const chips = GEM_EX.map((e) => (e ? `<div class="chip" dir="ltr" style="font-size:19px;min-width:0;padding:6px 8px">${e[1]}</div>` : `</div><div class="dim center small">מילה שנייה</div><div class="chips">`)).join("");
        box.innerHTML = `<p>פתרו כל תרגיל. התוצאה היא אות בגימטריה (א=1, י=10, ק=100...). אילו שתי מילים מסתתרות כאן? קוראים מימין לשמאל.</p><div class="dim center small">מילה ראשונה</div><div class="chips">${chips}</div>`;
        textAnswer(box, ctx, this.plain, { placeholder: "שתי מילים" });
      },
      hints: [`טבלת גימטריה:<div class="key">${Object.keys(GEM).map((ch) => `<div><b>${ch}</b> ${GEM[ch]}</div>`).join("")}</div>`, "המילה הראשונה היא: <b>עוגת</b>"],
      solution: "ההודעה: עוגת שוקולד",
    },
    {
      title: "קוד הצבעים ההפוך", fact: "lemon",
      build(box, ctx) {
        box.innerHTML = `<p>המפקדה משדרת קוד של 7 צבעים. כדי לבלבל את האויב, צריך להקיש אותו <b>בסדר הפוך</b>: מהצבע האחרון עד הראשון.</p>
          <div class="lamp" id="lamp"></div><div class="center dim" id="prog"></div>
          <button class="btn ghost" id="play">▶ הפעלת השידור</button>
          <div class="pads" style="margin-top:12px">${Object.keys(COLORS).map((c) => `<button class="pad" data-c="${c}" style="background:${COLORS[c][0]}" aria-label="${COLORS[c][1]}"></button>`).join("")}</div>`;
        const lamp = box.querySelector("#lamp"), prog = box.querySelector("#prog");
        let input = [], playing = false;
        const paint = () => (prog.textContent = "● ".repeat(input.length) + "○ ".repeat(SEQ.length - input.length));
        paint();
        box.querySelector("#play").onclick = () => {
          if (playing) return;
          playing = true; input = []; paint();
          SEQ.forEach((c, i) => {
            setTimeout(() => { lamp.style.background = COLORS[c][0]; beep(TONES[c], 0.3, "sine"); }, i * 650);
            setTimeout(() => { lamp.style.background = ""; }, i * 650 + 450);
          });
          setTimeout(() => (playing = false), SEQ.length * 650);
        };
        box.querySelectorAll(".pad").forEach((p) => (p.onclick = () => {
          if (playing) return;
          const c = p.dataset.c;
          beep(TONES[c], 0.2, "sine");
          if (c === SEQ_IN[input.length]) {
            input.push(c); paint();
            if (input.length === SEQ.length) ctx.solve();
          } else { input = []; paint(); ctx.msg("כמעט! צפו שוב בשידור ונסו מההתחלה 🙂"); prog.classList.remove("shake"); void prog.offsetWidth; prog.classList.add("shake"); }
        }));
      },
      hints: ["טיפ של סוכנים: חלקו תפקידים. כל סוכן זוכר צבע אחד לפי המקום שלו בשידור, ואז מקישים מהסוכן האחרון לראשון.", "ארבעת הראשונים שמקישים: אדום, ירוק, כחול, צהוב."],
      solution: "מקישים: " + SEQ_IN.map((c) => COLORS[c][1]).join(", "),
    },
    {
      title: "מי הסוכן הכפול?", fact: "fingerprint",
      build(box, ctx) {
        box.innerHTML = `<p>אחד מששת החשודים הוא סוכן כפול. חמישה רמזים אמיתיים הגיעו מהמפקדה. שימו לב: כל ניחוש שגוי מוריד כוכב!</p>
          <ul class="clues"><li>הסוכן הכפול <b>לא</b> לובש מעיל אדום</li><li>אם יש לו כובע, אז <b>אין</b> לו משקפיים</li><li>הוא מחזיק משהו ששמו מתחיל באות <b>מ</b></li><li>הוא מרכיב משקפיים <b>רק אם</b> המעיל שלו כחול</li><li>לו ולמר תפוז יש <b>אותו דבר</b> על הראש</li></ul>
          <div class="suspects">${SUSPECTS.map((s, i) => `<button class="suspect" data-i="${i}"><span class="face">${s.f}</span><b>${s.n}</b><br>${s.a.join("<br>")}</button>`).join("")}</div>`;
        box.querySelectorAll(".suspect").forEach((b) => (b.onclick = () => {
          const s = SUSPECTS[+b.dataset.i];
          if (s.guilty) return ctx.solve();
          b.disabled = true; S.st.wrong = (S.st.wrong || 0) + 1; save();
          ctx.msg(s.n + " לא אשם/ה! קראו שוב את הרמזים 🙂"); sfx.no();
        }));
      },
      hints: ["עברו רמז-רמז ומחקו חשודים. הרמז על האות מ׳ מוחק את מי שמחזיק עיתון, והרמז על המעיל האדום מוחק את מר תפוז עצמו.", "למר תפוז יש כובע, אז גם לסוכן הכפול יש כובע. ומי שיש לו כובע, אין לו משקפיים."],
      solution: "הסוכן הכפול: קפטן מלפפון",
    },
  ];

  function puzzle() {
    const s = cur(), P = PUZZLES[s];
    view.innerHTML = `<div class="card"><div class="dim">📍 ${esc(S.cfg.st[s])}</div><h2>${P.title}</h2><div id="pz"></div><div class="msg" id="msg"></div><div id="hints"></div></div>
      <div class="card"><div class="timer" id="timer"></div><button class="btn warn" id="hintbtn"></button><button class="btn ghost" id="revealbtn" hidden>📡 המפקדה שולחת את הפתרון</button></div>`;
    const hintsEl = document.getElementById("hints"), hb = document.getElementById("hintbtn"), rb = document.getElementById("revealbtn");
    let finished = false;
    const solved = () => {
      if (finished) return; finished = true;
      S.stars[S.pos] = S.st.revealed ? 1 : Math.max(1, 3 - S.st.hints - (S.st.wrong || 0));
      S.phase = "mission"; sfx.ok(); save(); render();
    };
    const ctx = { solve: solved, msg: (t) => (document.getElementById("msg").textContent = t) };
    P.build(document.getElementById("pz"), ctx);
    const showHints = () => (hintsEl.innerHTML = P.hints.slice(0, S.st.hints).map((h) => `<div class="hint">💡 ${h}</div>`).join("") + (S.st.revealed ? `<div class="hint">📡 <b>${P.solution}</b><button class="btn" id="cont">הבנו, ממשיכים</button></div>` : ""));
    const wire = () => { const c = document.getElementById("cont"); if (c) c.onclick = solved; };
    showHints(); wire();
    hb.onclick = () => { S.st.hints++; S.hints = (S.hints || 0) + 1; save(); showHints(); wire(); tickFn(); };
    rb.onclick = () => { S.st.revealed = true; save(); showHints(); wire(); tickFn(); };
    tickFn = () => {
      const el = (now() - S.st.start) / 1000;
      document.getElementById("timer").textContent = "⏱ " + mmss(el);
      const nextAt = S.st.hints === 0 ? T.hint1 : S.st.hints === 1 ? T.hint2 : null;
      if (S.st.revealed) { hb.hidden = true; rb.hidden = true; return; }
      if (nextAt === null) hb.hidden = true;
      else if (el >= nextAt) { hb.disabled = false; hb.textContent = "💡 רמז מהמפקדה (מוריד כוכב)"; }
      else { hb.disabled = true; hb.textContent = "💡 רמז ייפתח בעוד " + mmss(nextAt - el); }
      rb.hidden = !(el >= T.reveal);
    };
    tickFn();
  }

  // ---------- משימת שטח ----------
  function mission() {
    const s = cur();
    view.innerHTML = `<div class="card center"><div class="huge">🏃</div><h2>הצופן פוצח! עכשיו משימת שטח</h2>
      <p style="font-size:21px"><b>${esc(S.cfg.tasks[s])}</b></p>
      <p class="dim">המלווה לוחץ/ת כשהמשימה בוצעה</p><button class="btn" id="ok">✔ בוצע!</button></div>`;
    document.getElementById("ok").onclick = () => { S.phase = "reward"; sfx.ok(); save(); render(); };
  }

  // ---------- אות סודית ----------
  function reward() {
    const s = cur(), st = S.stars[S.pos] || 1;
    view.innerHTML = `<div class="card center"><h2>אות סודית חדשה!</h2><div class="big-letter">${BT.WORD[s]}</div>
      <div class="stars" style="font-size:34px">${"⭐".repeat(st)}</div><p class="dim">שמרו עליה. בסוף תצטרכו את כל האותיות.</p>
      <button class="btn" id="next">ממשיכים ➜</button></div>`;
    sfx.win();
    let busy = false;
    document.getElementById("next").onclick = async () => {
      if (busy) return; busy = true;
      await KidsLearn.show(PUZZLES[s].fact);
      S.pos++; S.st = null;
      if (S.pos >= BT.STATIONS) { S.phase = "word"; S.wordStart = now(); } else S.phase = "goto";
      save(); render();
    };
  }

  // ---------- המילה הסודית ----------
  function word() {
    const order = [3, 0, 5, 1, 4, 2];
    let picked = [];
    view.innerHTML = `<div class="card"><h2 class="center">כל האותיות אצלכם!</h2><p class="center">סדרו אותן למילה שפותחת את המסמך הסודי של הצוות.</p>
      <div class="slots" id="ws"></div><div class="letters" id="wl"></div><div class="msg" id="msg"></div><div id="hints"></div>
      <button class="btn ghost" id="wrev" hidden>📡 המפקדה פותחת את המסמך</button></div>`;
    const ws = document.getElementById("ws"), wl = document.getElementById("wl");
    const finish = async () => { S.finishedAt = now(); S.phase = "final"; sfx.win(); save(); await KidsLearn.show("qr"); render(); };
    const paint = () => {
      ws.innerHTML = BT.WORD.map((_, i) => `<div class="slot ${picked[i] !== undefined ? "full" : ""}">${picked[i] !== undefined ? BT.WORD[picked[i]] : ""}</div>`).join("");
      wl.innerHTML = order.map((k) => `<button class="letter" data-k="${k}" ${picked.includes(k) ? "disabled" : ""}>${BT.WORD[k]}</button>`).join("");
      wl.querySelectorAll(".letter").forEach((b) => (b.onclick = () => {
        picked.push(+b.dataset.k); sfx.tap(); paint();
        if (picked.length === BT.WORD.length) {
          if (picked.every((k, i) => BT.WORD[k] === BT.WORD[i])) finish();
          else { sfx.no(); document.getElementById("msg").textContent = "כמעט! נסו סדר אחר 🙂"; ws.classList.add("shake"); setTimeout(() => { picked = []; ws.classList.remove("shake"); paint(); }, 600); }
        }
      }));
      ws.querySelectorAll(".slot").forEach((sl) => (sl.onclick = () => { if (picked.length < BT.WORD.length) { picked.pop(); paint(); } }));
    };
    paint();
    document.getElementById("wrev").onclick = finish;
    tickFn = () => {
      const el = (now() - (S.wordStart || now())) / 1000;
      if (el >= T.wordHint && !document.getElementById("hints").innerHTML) document.getElementById("hints").innerHTML = `<div class="hint">💡 המילה מתארת אתכם, והיא מתחילה באות <b>ס</b>.</div>`;
      document.getElementById("wrev").hidden = el < T.wordReveal;
    };
    tickFn();
  }

  // ---------- המסמך הסודי + קוד המטמון ----------
  function final() {
    const fr = BT.fragsFor(S.team, S.cfg).join(" ");
    view.innerHTML = `<div class="card center"><span class="stamp">המסמך הסודי</span><h2 style="margin-top:10px">הקטע של ${esc(S.cfg.teams[S.team])}</h2>
      <div class="frag">${esc(fr)}</div>
      <p><b>רוצו לבסיס!</b> שם כל הצוותים מחברים את הקטעים שלהם למשפט אחד. המשפט הוא חידה, והתשובה שלה היא קוד בן ${S.cfg.code ? S.cfg.code.length : 4} ספרות שפותח את המטמון.</p>
      <div class="stars">הכוכבים שלכם: ⭐ ${totalStars()}</div></div>
      ${S.cfg.code ? `<div class="card"><p class="center dim">פיצחתם יחד את הקוד? אפשר להקליד אותו כאן:</p>
      <input class="in" id="tc" inputmode="numeric" maxlength="${S.cfg.code.length}" placeholder="קוד המטמון" autocomplete="off" />
      <button class="btn" id="open">🔓 פתיחת המטמון</button><div class="msg" id="msg"></div></div>` : ""}`;
    const b = document.getElementById("open");
    if (!b) return;
    const inp = document.getElementById("tc");
    const check = () => {
      if (BT.norm(inp.value) === BT.norm(S.cfg.code)) { S.opened = true; S.phase = "done"; save(); render(); }
      else { inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); document.getElementById("msg").textContent = "זה עדיין לא הקוד. חשבו שוב יחד 🙂"; sfx.no(); }
    };
    b.onclick = check; inp.onkeydown = (e) => { if (e.key === "Enter") check(); };
  }
  function done() {
    const sec = S.startedAt && S.finishedAt ? (S.finishedAt - S.startedAt) / 1000 : 0;
    view.innerHTML = `<div class="card center"><div class="huge">🎉🔓🎁</div><h1>המטמון נפתח!</h1>
      <p style="font-size:22px"><b>${esc(S.cfg.where)}</b></p>
      <div class="stars" style="font-size:26px">⭐ ${totalStars()}</div>${sec ? `<p class="dim">זמן המשימה: ${mmss(sec)}</p>` : ""}
      <p class="dim">כל הכבוד, סוכנים!</p></div>`;
    sfx.win();
  }

  // ---------- אתחול ----------
  function boot() {
    shell();
    const hp = BT.hashParams();
    let err = "";
    if (hp.get("c") && hp.get("t") !== null) {
      try {
        const cfg = BT.decode(hp.get("c")), team = +hp.get("t");
        if (!(team >= 0 && team < cfg.teams.length)) throw new Error("team");
        if (S && S.team === team && S.cfg.topic === cfg.topic) S.cfg = cfg; // עדכון שמות בלי לאבד התקדמות
        else S = { team, cfg, phase: "brief", pos: 0, stars: [], hints: 0 };
        save();
      } catch (e) { err = "קישור הצוות לא תקין. בקשו מהמפקד קישור חדש."; }
    }
    const q = new URLSearchParams(location.search);
    const sc = q.get("s");
    if (sc) {
      history.replaceState(null, "", location.pathname + location.hash);
      if (S) arrive(sc);
      else err = err || "מצאתם תחנה סודית! אבל קודם צריך לפתוח את קישור הצוות בטלפון הזה (אצל המפקד).";
    }
    if (q.get("fast")) Object.keys(T).forEach((k) => (T[k] = T[k] / 60)); // לבדיקות: דקה = שנייה
    render();
    if (!S && err) noTeam(err);
    else if (err) alert(err);
  }
  // חזרה ללשונית ישנה אחרי סריקה בלשונית אחרת: טוענים את המצב העדכני
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const fresh = load();
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(S)) { S = fresh; render(); }
  });
  boot();
  window.__bt = { get S() { return S; }, set S(v) { S = v; }, save, render, arrive, snap };
})();
