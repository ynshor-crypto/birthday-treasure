// KidsLearn — מודול למידה משותף לכל המשחקים בסטודיו.
// כרטיסי "הידעת?" שמוקראים בקול + "אלבום גילויים" שהילד אוסף לאורך המשחק.
// קובץ JS רגיל (לא module) כדי שיעבוד גם בפתיחה ישירה של index.html (file://).
// מדריך שימוש: shared/README.md. עקרונות תוכן: context/learning-design.md.
//
// שימוש מינימלי:
//   index.html: לטעון את ../../shared/learn.js ואז facts.js (מגדיר const FACTS = [...]) לפני game.js
//   KidsLearn.init({ gameId: "my-game", facts: FACTS, isMuted: () => muted });
//   KidsLearn.addAlbumButton(document.getElementById("topBar"));
//   await KidsLearn.show();                   // בהפסקה טבעית (סוף שלב / פריט חדש)

(function () {
  "use strict";

  const LEVELS = ["little", "mid", "big"]; // 3–4, 5–7, 8–10
  const LEVEL_ICONS = { little: "🐣", mid: "🧒", big: "🧑" };
  const LEVEL_KEY = "kidslearn:level";
  const VOICE_KEY = "kidslearn:autoVoice"; // הקראה אוטומטית — משותף לכל המשחקים

  let opts = null;
  let facts = [];
  let collected = new Set();
  let level = "mid";
  let autoVoice = true;
  let openState = null; // { resolve, el } כשכרטיס/אלבום פתוח
  let albumBtn = null;
  let hebrewVoice = null;

  // ---------- אחסון (עטוף ב-try כי localStorage יכול לזרוק במצב פרטי/ארטיפקט) ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* ממשיכים בלי שמירה */ }
  }
  const collectedKey = () => `kidslearn:${opts.gameId}:collected`;

  // ---------- הקראה בקול ----------
  let pendingText = null; // טקסט שמחכה שהקולות של הדפדפן ייטענו
  let voiceWaitTimer = null;

  function matchesLang(v) {
    // "he-IL" / "he_IL", ובחלק מהמכשירים (אנדרואיד ישן) עברית מסומנת "iw"
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    const p = opts.lang.slice(0, 2).toLowerCase();
    const prefixes = p === "he" ? ["he", "iw"] : [p];
    return prefixes.some((x) => l === x || l.startsWith(x + "-"));
  }

  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices().filter(matchesLang);
    hebrewVoice = voices.find((v) => v.localService) || voices[0] || null;
    if (hebrewVoice && pendingText) {
      const t = pendingText;
      pendingText = null;
      speakNow(t);
    }
  }

  // בכרום רשימת הקולות נטענת באיחור, ובספארי לפעמים בלי אירוע voiceschanged — בודקים שוב כמה פעמים
  function waitForVoice() {
    if (voiceWaitTimer) return;
    let tries = 0;
    voiceWaitTimer = setInterval(() => {
      pickVoice();
      if (hebrewVoice || ++tries >= 8) {
        clearInterval(voiceWaitTimer);
        voiceWaitTimer = null;
        pendingText = null;
      }
    }, 250);
  }

  // מקריאים משפט-משפט בלי סימני פיסוק בכלל: יש קולות שמקריאים "." ו-"!" בשמם ("dot"),
  // והפיצול למשפטים שומר על ההפסקה הטבעית ביניהם
  function speakNow(clean) {
    clean
      .split(/[.!?…]+/)
      .map((s) => s.replace(/[,:;"'״׳()\[\]\-–—]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .forEach((sentence) => {
        const u = new SpeechSynthesisUtterance(sentence);
        u.lang = opts.lang;
        u.voice = hebrewVoice;
        u.rate = 0.9;
        u.pitch = 1.1;
        speechSynthesis.speak(u);
      });
  }

  // הקראה אוטומטית (כרטיס שנפתח, קריאות של המשחק). כבויה = שקט, אבל כפתור 🔊 בכרטיס עדיין מקריא
  function say(text) {
    if (autoVoice) speakText(text);
  }

  function speakText(text) {
    if (!text || !("speechSynthesis" in window)) return;
    if (opts && opts.isMuted && opts.isMuted()) return;
    stopSpeaking();
    const clean = text.replace(/[\p{Extended_Pictographic}️‍]/gu, "").trim();
    if (!clean) return;
    if (!hebrewVoice) pickVoice();
    // אף פעם לא מדברים בלי קול עברי: קול ברירת מחדל (אנגלי) מדלג על האותיות ומקריא רק
    // את הפיסוק ("exclamation point", "dot"). אם הקולות עוד לא נטענו — מחכים להם.
    if (!hebrewVoice) {
      pendingText = clean;
      waitForVoice();
      return;
    }
    speakNow(clean);
  }

  function stopSpeaking() {
    pendingText = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  // ---------- עזרי תוכן ----------
  function textFor(fact, lvl) {
    // אם אין טקסט לרמה המבוקשת — לוקחים את הרמה הקרובה ביותר שקיימת
    const i = LEVELS.indexOf(lvl);
    const order = [i, i - 1, i + 1, i - 2, i + 2].filter((n) => n >= 0 && n < LEVELS.length);
    for (const n of order) if (fact[LEVELS[n]]) return { text: fact[LEVELS[n]], level: LEVELS[n] };
    return { text: "", level: lvl };
  }

  function nextUncollected() {
    return facts.find((f) => !collected.has(f.id)) || null;
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function picture(fact, cls) {
    if (fact.image) return `<img class="${cls}" src="${escapeHtml(fact.image)}" alt="">`;
    return `<div class="${cls}">${escapeHtml(fact.emoji || "💡")}</div>`;
  }

  // ---------- שכבת-על (overlay) ----------
  function openOverlay(content, onClose) {
    const overlay = el("div", "kl-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    return new Promise((resolve) => {
      openState = { el: overlay, resolve: () => { onClose && onClose(); resolve(); } };
    });
  }

  function closeOverlay() {
    if (!openState) return;
    const { el: overlay, resolve } = openState;
    openState = null;
    stopSpeaking();
    overlay.remove();
    updateAlbumBadge();
    resolve();
  }

  // מקשים בזמן שכרטיס פתוח: רווח/אנטר/Esc סוגרים, והמשחק לא מקבל אותם
  function onKey(e) {
    if (!openState) return;
    if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
    }
    e.stopPropagation();
  }

  // ---------- כרטיס "הידעת?" ----------
  function renderCard(fact, isNew) {
    let shown = textFor(fact, level);
    const card = el("div", "kl-card");
    card.innerHTML = `
      ${isNew ? '<div class="kl-badge" aria-hidden="true">✨ חדש! ✨</div>' : ""}
      ${picture(fact, "kl-pic")}
      ${fact.title ? `<div class="kl-title">${escapeHtml(fact.title)}</div>` : ""}
      <div class="kl-text"></div>
      <div class="kl-row">
        <button class="kl-btn kl-voice" aria-label="הקראה">${opts.isMuted && opts.isMuted() ? "🔇" : "🔊"}</button>
        <button class="kl-btn kl-more" aria-label="עוד">➕</button>
        <button class="kl-btn kl-ok" aria-label="סגירה">✔️</button>
      </div>`;
    const textEl = card.querySelector(".kl-text");
    const moreBtn = card.querySelector(".kl-more");
    const refresh = () => {
      textEl.textContent = shown.text;
      // ➕ מופיע רק אם יש רמת הסבר עמוקה יותר מזו שמוצגת
      const deeper = LEVELS.slice(LEVELS.indexOf(shown.level) + 1).some((l) => fact[l]);
      moreBtn.style.visibility = deeper ? "visible" : "hidden";
    };
    refresh();
    card.querySelector(".kl-voice").onclick = () => speakText(shown.text);
    moreBtn.onclick = () => {
      const next = LEVELS.slice(LEVELS.indexOf(shown.level) + 1).find((l) => fact[l]);
      if (!next) return;
      shown = { text: fact[next], level: next };
      refresh();
      say(shown.text);
    };
    card.querySelector(".kl-ok").onclick = closeOverlay;
    return { card, speak: () => say(shown.text) };
  }

  /**
   * מציג כרטיס עובדה. בלי id — העובדה הבאה שעוד לא נאספה (ואם הכל נאסף — אקראית).
   * מחזיר Promise שמתממש כשהכרטיס נסגר, כדי שהמשחק יוכל לחכות/להשהות.
   */
  function show(id) {
    if (!opts) throw new Error("KidsLearn.init() must be called first");
    if (openState) closeOverlay();
    let fact = id ? facts.find((f) => f.id === id) : nextUncollected();
    if (!fact) fact = facts[Math.floor(Math.random() * facts.length)];
    if (!fact) return Promise.resolve();
    const isNew = !collected.has(fact.id);
    collect(fact.id);
    const { card, speak } = renderCard(fact, isNew);
    opts.onOpen && opts.onOpen(fact);
    const p = openOverlay(card, () => opts.onClose && opts.onClose(fact));
    card.querySelector(".kl-ok").focus();
    speak();
    return p;
  }

  // ---------- אלבום גילויים ----------
  function openAlbum() {
    if (!opts) throw new Error("KidsLearn.init() must be called first");
    if (openState) closeOverlay();
    const box = el("div", "kl-card kl-album");
    const draw = () => {
      box.innerHTML = `
        <div class="kl-title">📖 ${collected.size} / ${facts.length}</div>
        <div class="kl-levels" role="group" aria-label="רמה">
          ${LEVELS.map((l) => `<button class="kl-lvl${l === level ? " on" : ""}" data-l="${l}" aria-label="${l}">${LEVEL_ICONS[l]}</button>`).join("")}
          <span class="kl-sep" aria-hidden="true"></span>
          <button class="kl-lvl kl-autoVoice${autoVoice ? " on" : ""}" aria-pressed="${autoVoice}" aria-label="הקראה אוטומטית">${autoVoice ? "🗣️" : "🤐"}</button>
        </div>
        <div class="kl-grid">
          ${facts.map((f) => collected.has(f.id)
            ? `<button class="kl-cell" data-id="${escapeHtml(f.id)}">${picture(f, "kl-cellpic")}</button>`
            : `<div class="kl-cell kl-locked" aria-hidden="true">❓</div>`).join("")}
        </div>
        <div class="kl-row"><button class="kl-btn kl-ok" aria-label="סגירה">✔️</button></div>`;
      box.querySelectorAll(".kl-lvl[data-l]").forEach((b) => (b.onclick = () => { setLevel(b.dataset.l); draw(); }));
      box.querySelector(".kl-autoVoice").onclick = () => { setAutoVoice(!autoVoice); draw(); };
      box.querySelectorAll(".kl-cell[data-id]").forEach((b) => (b.onclick = () => {
        // פותחים את הכרטיס מתוך האלבום, וחוזרים לאלבום כשסוגרים
        const fact = facts.find((f) => f.id === b.dataset.id);
        const { card, speak } = renderCard(fact, false);
        card.querySelector(".kl-ok").onclick = () => { stopSpeaking(); card.replaceWith(box); };
        box.replaceWith(card);
        speak();
      }));
      box.querySelector(".kl-ok").onclick = closeOverlay;
    };
    draw();
    opts.onOpen && opts.onOpen(null);
    const p = openOverlay(box, () => opts.onClose && opts.onClose(null));
    box.querySelector(".kl-ok").focus();
    return p;
  }

  // ---------- כפתור הקראה 🗣️/🤐 (נפרד מ-🔊 של הצלילים) ----------
  let voiceBtns = [];
  function paintVoiceButtons() {
    voiceBtns.forEach((b) => {
      b.textContent = autoVoice ? "🗣️" : "🤐";
      b.setAttribute("aria-label", autoVoice ? "כיבוי הקראה" : "הפעלת הקראה");
      b.setAttribute("aria-pressed", String(!autoVoice));
      b.classList.toggle("kl-off", !autoVoice);
    });
  }

  function addVoiceButton(parent) {
    const b = el("button", "kl-albumBtn kl-voiceBtn");
    b.type = "button";
    b.onclick = () => setAutoVoice(!autoVoice);
    (parent || document.body).appendChild(b);
    if (!parent) b.classList.add("kl-floating", "kl-floating-voice");
    voiceBtns.push(b);
    paintVoiceButtons();
    return b;
  }

  function addAlbumButton(parent) {
    // כפתור ההקראה מגיע אוטומטית לפני האלבום, כדי שיהיה בכל משחק.
    // משחק שיש לו כפתור הקראה משלו: init({ voiceButton: false }) ומחברים אותו ל-setAutoVoice.
    if (opts.voiceButton !== false && !voiceBtns.length) addVoiceButton(parent);
    albumBtn = el("button", "kl-albumBtn");
    albumBtn.setAttribute("aria-label", "אלבום גילויים");
    albumBtn.innerHTML = '📖<span class="kl-count"></span>';
    albumBtn.onclick = openAlbum;
    (parent || document.body).appendChild(albumBtn);
    if (!parent) albumBtn.classList.add("kl-floating");
    updateAlbumBadge();
    return albumBtn;
  }

  function updateAlbumBadge() {
    if (albumBtn) albumBtn.querySelector(".kl-count").textContent = collected.size || "";
  }

  // ---------- מצב ----------
  function collect(id) {
    if (collected.has(id) || !facts.some((f) => f.id === id)) return false;
    collected.add(id);
    save(collectedKey(), [...collected]);
    updateAlbumBadge();
    return true;
  }

  function setAutoVoice(on) {
    autoVoice = !!on;
    save(VOICE_KEY, autoVoice);
    if (!autoVoice) stopSpeaking();
    paintVoiceButtons();
  }

  function setLevel(l) {
    if (!LEVELS.includes(l)) return;
    level = l;
    save(LEVEL_KEY, l);
  }

  function init(options) {
    opts = Object.assign({ lang: "he-IL", isMuted: null, onOpen: null, onClose: null, level: null, voiceButton: true }, options);
    if (!opts.gameId) throw new Error("KidsLearn.init: gameId is required");
    facts = (opts.facts || []).filter((f) => f && f.id);
    collected = new Set(load(collectedKey(), []).filter((id) => facts.some((f) => f.id === id)));
    // רמה: מה שההורה בחר באלבום (נשמר) > ברירת מחדל של המשחק > בינונית
    level = load(LEVEL_KEY, null) || opts.level || "mid";
    autoVoice = load(VOICE_KEY, true) !== false;
    if (!LEVELS.includes(level)) level = "mid";
    injectStyle();
    if ("speechSynthesis" in window) {
      pickVoice();
      speechSynthesis.addEventListener("voiceschanged", pickVoice);
    }
    window.addEventListener("keydown", onKey, true);
    // ההגדרה שונתה בלשונית/משחק אחר (localStorage משותף ב-file://)
    window.addEventListener("storage", (e) => {
      if (e.key !== VOICE_KEY) return;
      autoVoice = load(VOICE_KEY, true) !== false;
      if (!autoVoice) stopSpeaking();
      paintVoiceButtons();
    });
    updateAlbumBadge();
  }

  // ---------- עיצוב (מוזרק, כדי שהמודול יהיה קובץ אחד) ----------
  function injectStyle() {
    if (document.getElementById("kidslearn-style")) return;
    const s = document.createElement("style");
    s.id = "kidslearn-style";
    s.textContent = `
.kl-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:rgba(40,30,80,.55);padding:16px;direction:rtl;font-family:"Segoe UI",system-ui,sans-serif}
.kl-card{background:#fffaf0;border-radius:28px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:24px 20px;
  width:min(92vw,520px);max-height:92vh;overflow:auto;text-align:center;color:#2b2140;
  animation:kl-pop .35s ease-out}
.kl-badge{display:inline-block;background:#ffd60a;color:#5a3d00;font-weight:800;font-size:1.3rem;
  padding:4px 16px;border-radius:999px;margin-bottom:8px}
.kl-pic{font-size:6.5rem;line-height:1.1;margin:4px auto 8px;max-width:70%;max-height:220px;display:block;object-fit:contain}
.kl-title{font-size:1.8rem;font-weight:800;margin-bottom:8px}
.kl-text{font-size:1.7rem;line-height:1.45;font-weight:600;margin:4px 6px 18px}
.kl-row{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.kl-btn{width:84px;height:84px;border-radius:50%;border:none;font-size:2.4rem;cursor:pointer;
  background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.18)}
.kl-btn.kl-ok{background:#8ee39b;width:100px;height:100px;font-size:3rem}
.kl-btn:active,.kl-cell:active,.kl-lvl:active,.kl-albumBtn:active{transform:scale(.94)}
.kl-btn:focus-visible,.kl-cell:focus-visible,.kl-lvl:focus-visible{outline:5px solid #6c5ce7;outline-offset:3px}
.kl-levels{display:flex;gap:10px;justify-content:center;margin-bottom:14px}
.kl-lvl{font-size:2rem;width:64px;height:64px;border-radius:18px;border:3px solid transparent;background:#fff;
  cursor:pointer;opacity:.5;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.kl-lvl.on{opacity:1;border-color:#6c5ce7}
.kl-sep{width:3px;border-radius:2px;background:#ddd;margin:6px 4px}
.kl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px;margin-bottom:18px}
.kl-cell{aspect-ratio:1;border-radius:20px;border:none;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.14);
  display:flex;align-items:center;justify-content:center;font-size:3rem;cursor:pointer;padding:6px;overflow:hidden}
.kl-cellpic{font-size:3.2rem;max-width:100%;max-height:100%;object-fit:contain}
.kl-locked{background:#e8e4f3;color:#9b93b5;cursor:default;box-shadow:none}
.kl-albumBtn{position:relative;font-size:2rem;width:60px;height:60px;border-radius:50%;border:none;background:#fff;
  cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.15)}
.kl-albumBtn.kl-floating{position:fixed;bottom:16px;left:16px;z-index:50}
.kl-albumBtn.kl-floating-voice{left:86px}
.kl-voiceBtn.kl-off{background:#e8e4f3}
.kl-count{position:absolute;top:-6px;right:-6px;background:#ff6b6b;color:#fff;font-size:.95rem;font-weight:800;
  min-width:26px;height:26px;line-height:26px;border-radius:13px;padding:0 6px}
.kl-count:empty{display:none}
@keyframes kl-pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.kl-card{animation:none}}
@media (max-height:520px){.kl-pic{font-size:4rem;max-height:120px}.kl-text{font-size:1.35rem}}`;
    document.head.appendChild(s);
  }

  window.KidsLearn = {
    init,
    show,
    openAlbum,
    addAlbumButton,
    collect,
    isCollected: (id) => collected.has(id),
    say,
    stopSpeaking,
    setLevel,
    getLevel: () => level,
    setAutoVoice,
    getAutoVoice: () => autoVoice,
    addVoiceButton,
    isOpen: () => !!openState,
    progress: () => ({ count: collected.size, total: facts.length }),
    close: closeOverlay,
  };
})();
