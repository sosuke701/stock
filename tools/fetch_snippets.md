# 瀏覽器抓資料用的程式片段

在內建瀏覽器用 javascript_tool 執行。每段要在**對應網站的分頁**上跑（同網域才不會被 CORS 擋）。
把 `__IDS__` 換成實際值。

## A. 即時報價／指數（分頁先開 https://mis.twse.com.tw/stock/index.jsp）

```js
const ids = __IDS__; // 例如 ["tse_t00.tw","otc_o00.tw","tse_2330.tw","otc_6488.tw"]
const r = await fetch(`/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ids.join("|"))}&json=1&delay=0&_=${Date.now()}`);
const j = await r.json();
const n = (s) => { const v = parseFloat(String(s ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
(j.msgArray ?? []).filter(m => m.c).map(m => {
  const prev = n(m.y); let p = n(m.z); if (p === null) p = n(String(m.b ?? "").split("_")[0]) ?? prev;
  return { id: `${m.ex}_${m.c}.tw`, code: m.c, name: m.n, market: m.ex, price: p, prev, change: p !== null && prev ? +(p - prev).toFixed(2) : null, changePct: p !== null && prev ? +((p / prev - 1) * 100).toFixed(2) : null, time: `${m.d} ${m.t}` };
});
```
判斷上市/上櫃：同一代號同時查 `tse_XXXX.tw` 和 `otc_XXXX.tw`，有回傳的就是。

觀察清單的日K與指標請用 `tools/browser_watchlist.js`。
