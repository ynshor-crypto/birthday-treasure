// הגדרות משותפות למשחק (טלפון הצוות) ולמסך המנהל.
// שמות אמיתיים (ילדים, מקומות) לא נכתבים כאן: הם מגיעים רק דרך הקישורים (‎#c=...).
const BT = (() => {
  const PUBLIC_URL = "https://ynshor-crypto.github.io/birthday-treasure/";
  const NTFY = "https://ntfy.sh/";
  const STATIONS = 6;
  const WORD = ["ס", "ו", "כ", "נ", "י", "ם"]; // אות לכל תחנה, יחד: "סוכנים"
  const CODES = ["417", "286", "953", "632", "178", "549"]; // קוד ידני לכל תחנה (מודפס מתחת ל-QR)
  const TIMES = { hint1: 120, hint2: 240, reveal: 360, wordHint: 90, wordReveal: 180 }; // שניות

  const DEFAULTS = {
    v: 1,
    title: "בעקבות המטמון",
    teams: ["צוות נשר", "צוות שועל", "צוות ינשוף", "צוות דולפין", "צוות פנתר", "צוות זאב"],
    st: ["תחנה 1", "תחנה 2", "תחנה 3", "תחנה 4", "תחנה 5", "תחנה 6"],
    tasks: [
      "כל הצוות עושה 10 קפיצות פיסוק בסנכרון מושלם",
      "ריצת שליחים: כל סוכן רץ עד הנקודה שהמלווה מסמן וחזרה",
      "צלמו תמונת צוות בפוזה של סוכנים חשאיים",
      "קרני לייזר: כל הצוות הולך 10 צעדים בשורה, יד על כתף, בלי להוציא מילה",
      "כל סוכן עובר מתקן אחד בלי לגעת ברצפה",
      "המציאו לחיצת יד סודית של הצוות והראו אותה למלווה",
    ],
    frag: ["הקוד הוא", "הגיל של", "חתן השמחה", "ואחריו", "מספר התחנות", "פעמיים"],
    code: "1066",
    where: "המטמון נפתח! רוצו אל המפקד לקבל את האוצר",
    end: "",
    topic: "",
  };

  const b64e = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

  function encode(cfg) {
    const c = Object.assign({}, cfg);
    c.tasks = cfg.tasks.map((t, i) => (t === DEFAULTS.tasks[i] ? 0 : t)); // מקצר את הקישור
    return b64e(JSON.stringify(c));
  }
  function decode(str) {
    const c = Object.assign({}, DEFAULTS, JSON.parse(b64d(str)));
    c.tasks = DEFAULTS.tasks.map((d, i) => (c.tasks && c.tasks[i]) || d);
    c.st = DEFAULTS.st.map((d, i) => (c.st && c.st[i]) || d);
    return c;
  }
  const encodeAny = (o) => b64e(JSON.stringify(o));
  const decodeAny = (s) => JSON.parse(b64d(s));

  // כל צוות מתחיל בתחנה אחרת ומתקדם במעגל, כך שאין שני צוותים באותה תחנה.
  function route(team, nTeams) {
    const off = Math.floor((team * STATIONS) / nTeams);
    return Array.from({ length: STATIONS }, (_, i) => (off + i) % STATIONS);
  }
  // קטעי המשפט הסופי מתחלקים בין הצוותים שיש (גם אם צמצמו צוותים).
  function fragsFor(team, cfg) {
    const L = cfg.frag.length, N = cfg.teams.length;
    return cfg.frag.slice(Math.floor((team * L) / N), Math.floor(((team + 1) * L) / N));
  }
  const norm = (s) => String(s || "").replace(/[^0-9א-ת]/g, "").replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ");
  function newTopic() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return "bt" + Array.from(a, (x) => (x % 36).toString(36)).join("");
  }
  function baseUrl() {
    const l = location;
    if (l.protocol.startsWith("http") && !/^(localhost|127\.)/.test(l.hostname)) return l.origin + l.pathname.replace(/[^/]*$/, "");
    return PUBLIC_URL;
  }
  const hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ""));

  return { PUBLIC_URL, NTFY, STATIONS, WORD, CODES, TIMES, DEFAULTS, encode, decode, encodeAny, decodeAny, route, fragsFor, norm, newTopic, baseUrl, hashParams };
})();
