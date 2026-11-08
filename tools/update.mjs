// 網站資料更新工具
//   node tools/update.mjs quotes <檔案>             儲存即時報價到 data/quotes.json
//   node tools/update.mjs watchlist <wl.json>       由瀏覽器算好的指標產生觀察清單（備註讀 data/notes.json）
//   node tools/update.mjs publish <日期> <premarket|close|evening> <報告.md>
//   node tools/update.mjs show <加密檔>              解密印出（例如 data/notes.json.enc）
//   node tools/update.mjs notes-set <notes.json>     更新觀察備註
// 所有指令都需要環境變數 SITE_PASSWORD（網站密碼），data/ 下的內容一律加密後才存進 repo
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + "\n"); };
const num = (s) => { const v = parseFloat(String(s ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
const rocToIso = (s) => { const [y, m, d] = String(s).trim().split("/"); return `${+y + 1911}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };
const taipeiNow = () => new Date(Date.now() + 8 * 3600e3).toISOString().replace("T", " ").slice(0, 16);
const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

import crypto from "node:crypto";

// ---- 加密（AES-256-GCM，金鑰由密碼 + salt 以 PBKDF2 產生）----
// 密碼從環境變數 SITE_PASSWORD 讀取，絕對不要寫進 repo
const ITER = 200000;
let _key = null;
function key() {
  if (_key) return _key;
  const pw = process.env.SITE_PASSWORD;
  if (!pw) throw new Error("缺少環境變數 SITE_PASSWORD");
  let saltInfo = readJSON(P("data/salt.json"));
  if (!saltInfo) { saltInfo = { salt: crypto.randomBytes(16).toString("base64"), iter: ITER }; writeJSON(P("data/salt.json"), saltInfo); }
  _key = crypto.pbkdf2Sync(pw, Buffer.from(saltInfo.salt, "base64"), saltInfo.iter, 32, "sha256");
  return _key;
}
function encText(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}
function decText(b64) {
  const buf = Buffer.from(b64.trim(), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
const readEnc = (rel, d = null) => { try { return decText(fs.readFileSync(P(rel), "utf8")); } catch (e) { if (e.code === "ENOENT") return d; throw e; } };
const readEncJSON = (rel, d = null) => { const t = readEnc(rel, null); return t === null ? d : JSON.parse(t); };
const writeEnc = (rel, v) => { fs.mkdirSync(path.dirname(P(rel)), { recursive: true }); fs.writeFileSync(P(rel), encText(typeof v === "string" ? v : JSON.stringify(v)) + "\n"); };

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "quotes") {
  const raw = JSON.parse(fs.readFileSync(args[0], "utf8"));
  const list = typeof raw === "string" ? JSON.parse(raw) : raw;
  const q = readEncJSON("data/quotes.json.enc", {});
  for (const x of list) q[x.id] = x;
  writeEnc("data/quotes.json.enc", q);
  console.log(`已存 ${list.length} 筆報價`);
}

else if (cmd === "watchlist") {
  // 用法：node tools/update.mjs watchlist /tmp/wl.json（瀏覽器 browser_watchlist.js 算好的結果）
  const raw = JSON.parse(fs.readFileSync(args[0], "utf8"));
  const sums = typeof raw === "string" ? JSON.parse(raw) : raw;
  const cfg = readJSON(P("data/config.json"));
  const quotes = readEncJSON("data/quotes.json.enc", {});
  const notes = readEncJSON("data/notes.json.enc", {});
  const items = [];
  let asOf = "";
  for (const code of cfg.watchlist) {
    const s = sums[code];
    if (!s || s.error) { console.warn(`${code} 無資料，略過`); continue; }
    const iso = /^\d{3}\//.test(s.date) ? rocToIso(s.date) : s.date;
    if (iso > asOf) asOf = iso;
    const name = Object.values(quotes).find((q) => q.code === code)?.name ?? code;
    let trend = "盤整";
    if (s.ma20 && s.ma60 && s.close > s.ma20 && s.ma20 > s.ma60) trend = "多頭";
    else if (s.ma20 && s.ma60 && s.close < s.ma20 && s.ma20 < s.ma60) trend = "空頭";
    else if (s.ma60 && s.close < s.ma60) trend = "偏弱";
    else if (s.ma60 && s.close > s.ma60) trend = "偏強";
    items.push({
      code, name, close: s.close, changePct: s.changePct, ma20: s.ma20, ma60: s.ma60,
      rsi: s.rsi, k: s.k, d: s.d,
      support: s.support ?? s.low20, resistance: s.resistance ?? s.high60,
      chg20: s.chg20, trend, note: notes[code] ?? "",
    });
  }
  // ---- 技術面篩選（純規則，由程式判斷）----
  const screen = [];
  for (const code of cfg.watchlist) {
    const s = sums[code];
    if (!s || s.error || s.prevClose === undefined) continue;
    const sig = [];
    if (s.ma5 && s.ma5Prev && s.close > s.ma5 && s.prevClose <= s.ma5Prev) sig.push("站回 5 日線");
    if (s.ma20 && s.ma20Prev && s.close > s.ma20 && s.prevClose <= s.ma20Prev) sig.push("站回月線");
    if (s.rsiMin5 !== null && s.rsiMin5 < 30 && s.rsiPrev !== null && s.rsi - s.rsiPrev >= 2) sig.push("RSI 超賣區回升");
    if (s.kPrev !== null && s.dPrev !== null && s.kPrev <= s.dPrev && s.k > s.d && s.k < 40) sig.push("KD 低檔黃金交叉");
    if (s.vol && s.vol20 && s.close > s.open && s.changePct > 0 && s.vol >= 1.5 * s.vol20) sig.push("帶量紅K");
    if (!sig.length) continue;
    const confirm = s.close < s.ma5 ? s.ma5 : s.close < s.ma20 ? s.ma20 : (s.resistance ?? s.high60);
    const confirmLabel = s.close < s.ma5 ? "5 日線" : s.close < s.ma20 ? "月線" : "前波高點";
    screen.push({
      code, name: items.find((i) => i.code === code)?.name ?? code, close: s.close, changePct: s.changePct,
      signals: sig, confirm, confirmLabel, invalid: s.low3,
    });
  }
  screen.sort((a, b) => b.signals.length - a.signals.length);
  const wl = { asOf, generated: taipeiNow(), items, screen };
  writeEnc("data/watchlist.json.enc", wl);
  if (asOf) writeEnc(`data/history/watchlist-${asOf}.json.enc`, wl); // 每天另存一份，網站可回看
  console.log(`觀察清單 ${items.length} 檔，資料日期 ${asOf}；篩選符合 ${screen.length} 檔：${screen.map((x) => x.code + "(" + x.signals.join("/") + ")").join("、") || "無"}`);
}

else if (cmd === "publish") {
  const [date, slot, mdFile] = args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["premarket", "close", "evening"].includes(slot)) throw new Error("參數錯誤");
  const rel = `data/reports/${date}-${slot}.md.enc`;
  writeEnc(rel, fs.readFileSync(mdFile, "utf8"));
  const idx = readEncJSON("data/index.json.enc", { reports: [] });
  const order = { premarket: 0, close: 1, evening: 2 };
  idx.reports = idx.reports.filter((r) => !(r.date === date && r.slot === slot));
  idx.reports.push({ date, slot, file: rel, generated: taipeiNow() });
  idx.reports.sort((a, b) => b.date.localeCompare(a.date) || order[b.slot] - order[a.slot]);
  const cfg = readJSON(P("data/config.json"));
  const quotes = readEncJSON("data/quotes.json.enc", {});
  idx.snapshot = {
    items: cfg.snapshot.map((s) => {
      const q = quotes[s.id];
      return q ? { name: s.name, value: q.price, change: q.change, changePct: q.changePct, time: q.time } : null;
    }).filter(Boolean),
  };
  idx.updated = taipeiNow();
  const ent = idx.reports.find((r) => r.date === date && r.slot === slot);
  if (ent) ent.snapshot = idx.snapshot; // 每份報告記下當時的指數方塊，網站可回看
  writeEnc("data/index.json.enc", idx);
  console.log(`已發布 ${rel}`);
}

else if (cmd === "show") {
  // 解密印出：node tools/update.mjs show data/notes.json.enc
  process.stdout.write(readEnc(args[0], "(不存在)") + "\n");
}

else if (cmd === "notes-set") {
  // 用明文 JSON 檔覆蓋觀察備註：node tools/update.mjs notes-set /tmp/notes.json
  writeEnc("data/notes.json.enc", JSON.parse(fs.readFileSync(args[0], "utf8")));
  console.log("已更新觀察備註");
}

else if (cmd === "history-init") {
  // 一次性：把現有的觀察清單與指數方塊存成歷史
  const w = readEncJSON("data/watchlist.json.enc");
  if (w?.asOf) { writeEnc(`data/history/watchlist-${w.asOf}.json.enc`, w); console.log("已存觀察清單", w.asOf); }
  const idx = readEncJSON("data/index.json.enc");
  if (idx?.reports?.length && idx.snapshot && !idx.reports[0].snapshot) { idx.reports[0].snapshot = idx.snapshot; writeEnc("data/index.json.enc", idx); console.log("已存指數方塊", idx.reports[0].date); }
}

else if (cmd === "migrate") {
  // 把舊的明文檔加密並刪除明文
  for (const f of ["index.json", "watchlist.json", "quotes.json", "notes.json"]) {
    const p = P("data", f);
    if (fs.existsSync(p)) { writeEnc(`data/${f}.enc`, fs.readFileSync(p, "utf8")); fs.unlinkSync(p); console.log("加密", f); }
  }
  const idx = readEncJSON("data/index.json.enc");
  if (idx) {
    for (const r of idx.reports) {
      if (r.file.endsWith(".md")) {
        const p = P(r.file);
        if (fs.existsSync(p)) { writeEnc(`${r.file}.enc`, fs.readFileSync(p, "utf8")); fs.unlinkSync(p); }
        r.file = `${r.file}.enc`;
      }
    }
    writeEnc("data/index.json.enc", idx);
  }
  console.log("完成");
}

else {
  console.log("用法見檔案開頭說明");
}
