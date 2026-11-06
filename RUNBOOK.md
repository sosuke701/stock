# 排程執行手冊（給 Claude 看的）

每次排程啟動時，依時段照下面步驟做。網站是 GitHub Pages 靜態網站，資料都在 `data/`。

## 共通規則

- **推送權限**：只有「盤前、盤後、晚間報告」的例行更新（data/ 下的加密資料與報告）可以直接 commit、push，不用詢問。
  其他任何變更（index.html、tools/、RUNBOOK.md、data/config.json、改觀察清單、改密碼等）都**不可**自行推送，要先問使用者。

- **網站內容全部加密**。網站密碼由排程指令提供，執行 `tools/update.mjs` 時一律加上環境變數，例如 `SITE_PASSWORD=<密碼> node tools/update.mjs ...`。
  **絕對不要**把密碼寫進 repo 的任何檔案、commit 訊息或報告；也不要 commit 任何明文報告（明文只放在 /tmp）。
- 讀舊資料用 `node tools/update.mjs show data/notes.json.enc`（或 index.json.enc、reports/xxx.md.enc）。

- 用使用者電腦上的**內建瀏覽器**抓資料（Yahoo 股市、證交所、櫃買中心已允許），新聞用 WebSearch。
- 報告用繁體中文、台灣用語，手機兩三個畫面內看完。所有數字要有來源，查不到就寫「查無資料」。
- 內容寫成「市場觀察」，**不寫「買進／賣出某檔」的建議**，價位只寫觀察點。
- 不要大段引用新聞原文，用自己的話整理；文末列資料來源媒體名稱。
- 證交所請求之間要間隔 1 秒以上，避免被封鎖。
- 電腦連不上（瀏覽器工具失敗）：改用 WebSearch 寫精簡版報告，並在開頭註明「今日資料改由新聞整理，數字可能較不完整」。
- 週末、國定休市日：盤前／盤後不發布；晚間只在有重大消息時發布。

## 步驟

1. `git pull`
2. **報價**：瀏覽器開 `https://mis.twse.com.tw/stock/index.jsp`，執行 `tools/fetch_snippets.md` 的 A 段，ids 用 `data/config.json` 的 snapshot ids ＋ watchlist（`tse_代號.tw`）。存成 `/tmp/q.json` → `node tools/update.mjs quotes /tmp/q.json`
   - 盤後與晚間：指數收盤以 Yahoo `https://tw.stock.yahoo.com/quote/%5ETWII`、`%5ETWOII` 頁面的收盤數字為準（MIS 指數可能停在 13:2x）。
3. **觀察清單**（盤後、晚間才做；盤前沿用前一天）：瀏覽器開 `https://www.twse.com.tw/zh/index.html`，把 `tools/browser_watchlist.js` 的 `__CODES__` 換成 watchlist 陣列後執行，每 30 秒查一次進度，完成後存 `/tmp/wl.json` → 用 `show data/notes.json.enc` 取出舊備註，改寫成每檔一句觀察（引用指標數字）存 `/tmp/notes.json` → `notes-set /tmp/notes.json` → `watchlist /tmp/wl.json`
4. **蒐集資訊並寫報告** `/tmp/report.md`：
   - 三份報告都可以引用網站上的「技術面篩選」結果（`show data/watchlist.json.enc` 的 screen 欄位），但要寫成「符合技術條件、觀察價位」，**不可**寫成「建議買進」。
   - **盤前（premarket）**：隔夜美股四大指數、費半、台積電 ADR（Yahoo `quote/TSM`、`quote/%5ESOX`）與換算溢價、台指期夜盤、匯率、今日重要事件與財經行事曆、觀察族群、今日盤勢劇本（偏多／震盪／偏空的條件與點位）、今日風險。
   - **盤後（close）**：加權與櫃買收盤、成交值、權值股表現、強弱族群、漲跌家數、盤勢解讀、明日觀察點。（法人買賣超 15:00 後才公布，盤後版可先寫「待晚間更新」）
   - **晚間（evening）**：三大法人與外資期貨淨部位、融資券變化、盤後重大新聞與公告、今晚美股開盤狀況、明日／下週觀察重點與劇本。
5. `node tools/update.mjs publish <YYYY-MM-DD> <premarket|close|evening> /tmp/report.md`
6. 確認 `git status` 裡沒有明文檔（只應有 .enc、salt.json、config.json、程式檔）後，`git add -A && git commit -m "<日期> <時段>報告" && git push`
7. 最後用一兩句話回報發布結果與今日重點。
