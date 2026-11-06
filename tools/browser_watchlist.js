// 在內建瀏覽器「https://www.twse.com.tw/zh/index.html」分頁用 javascript_tool 執行整段。
// 會在背景抓近 4 個月日K並算好技術指標，結果放在 window.__wl。
// 執行後每 20~30 秒用這行查進度： window.__wl.done ? JSON.stringify(window.__wl.result) : window.__wl.n
// 取得結果後存成 /tmp/wl.json，再跑： node tools/update.mjs watchlist /tmp/wl.json
// （只支援上市股票；上櫃股要另外在 tpex.org.tw 分頁抓）
window.__wl = { done: false, n: 0, result: {}, err: null };
(async () => {
  const CODES = __CODES__; // 例如 ["0050","2330"]
  const now = new Date(Date.now() + 8 * 3600e3);
  const months = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}01`;
  });
  const num = (s) => { const v = parseFloat(String(s ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
  const r2 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  const sma = (a, n) => a.length >= n ? a.slice(-n).reduce((s, v) => s + v, 0) / n : null;
  function rsi(c, n = 14) {
    if (c.length <= n) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const ch = c[i] - c[i - 1]; if (ch > 0) g += ch; else l -= ch; }
    g /= n; l /= n;
    for (let i = n + 1; i < c.length; i++) { const ch = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(ch, 0)) / n; l = (l * (n - 1) + Math.max(-ch, 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function kd(b, n = 9) {
    let k = 50, d = 50, pk = null, pd = null;
    for (let i = n - 1; i < b.length; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, b[j].h); lo = Math.min(lo, b[j].l); }
      const rsv = hi === lo ? 50 : ((b[i].c - lo) / (hi - lo)) * 100;
      pk = k; pd = d;
      k = (2 / 3) * k + rsv / 3; d = (2 / 3) * d + k / 3;
    }
    return { k, d, pk, pd };
  }
  function swings(b, k = 3, look = 120) {
    const s = Math.max(0, b.length - look), H = [], L = [];
    for (let i = s + k; i < b.length - k; i++) {
      let isH = true, isL = true;
      for (let j = i - k; j <= i + k; j++) { if (b[j].h > b[i].h) isH = false; if (b[j].l < b[i].l) isL = false; }
      if (isH) H.push(b[i].h); if (isL) L.push(b[i].l);
    }
    return { H: H.slice(-6), L: L.slice(-6) };
  }
  try {
    for (const code of CODES) {
      const rows = [];
      for (const m of [...months].reverse()) {
        const j = await (await fetch(`/rwd/zh/afterTrading/STOCK_DAY?date=${m}&stockNo=${code}&response=json`)).json();
        if (String(j.stat).toUpperCase() === "OK") rows.push(...j.data);
        window.__wl.n++;
        await new Promise((r) => setTimeout(r, 1300));
      }
      const b = rows.map((r) => ({ d: r[0], v: num(r[1]), o: num(r[3]), h: num(r[4]), l: num(r[5]), c: num(r[6]) })).filter((x) => x.o !== null && x.c !== null);
      if (b.length < 30) { window.__wl.result[code] = { error: "資料不足" }; continue; }
      const c = b.map((x) => x.c), close = c.at(-1), prev = c.at(-2);
      const sw = swings(b), K = kd(b);
      const last20 = b.slice(-20), last60 = b.slice(-60);
      window.__wl.result[code] = {
        date: b.at(-1).d, close, changePct: r2((close / prev - 1) * 100),
        ma5: r2(sma(c, 5)), ma20: r2(sma(c, 20)), ma60: r2(sma(c, 60)),
        rsi: r2(rsi(c)), k: r2(K.k), d: r2(K.d),
        support: Math.max(...sw.L.filter((p) => p < close), -Infinity),
        resistance: Math.min(...sw.H.filter((p) => p > close), Infinity),
        low20: Math.min(...last20.map((x) => x.l)), high60: Math.max(...last60.map((x) => x.h)),
        chg20: r2((close / c.at(-21) - 1) * 100), bars: b.length,
        // 篩選用：前一日數值
        open: b.at(-1).o, low: b.at(-1).l, prevClose: prev,
        ma5Prev: r2(sma(c.slice(0, -1), 5)), ma20Prev: r2(sma(c.slice(0, -1), 20)),
        rsiPrev: r2(rsi(c.slice(0, -1))), rsiMin5: r2(Math.min(...[1, 2, 3, 4, 5].map((i) => rsi(c.slice(0, c.length - i + 1)) ?? 100))),
        kPrev: r2(K.pk), dPrev: r2(K.pd),
        vol: b.at(-1).v, vol20: r2(sma(b.map((x) => x.v ?? 0), 20)),
        low3: Math.min(...b.slice(-3).map((x) => x.l)),
      };
    }
  } catch (e) { window.__wl.err = String(e); }
  window.__wl.done = true;
})();
"started";
