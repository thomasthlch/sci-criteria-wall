# 科學科準則牆

各位老師用同一塊牆對齊長題目的扣分階梯：題目、分部、判例、待投票個案，登入後即時同步。

這是評分準則牆，不是班名冊、不是學生分數表，也不會匯出 Excel。

預期公開網址：<https://thomasthlch.github.io/sci-criteria-wall/>

## 本機開發

需要 Node.js 18 或以上。

```bash
npm install
npm run dev
```

瀏覽器打開 <http://localhost:5173>。已驗證的 `@tswgps.edu.hk` 學校帳戶可以登入。管理員 `thomasthlch@gmail.com` 也可以登入，票數同樣計入定案。其他電郵會被登出，並看到拒絕訊息。

```bash
npm test
npm run build
npm run preview
```

`npm test` 檢查 2 票定案、學校與管理員電郵、刪題權限，以及完整 Firestore 規則仍包含儀表板和其他工具。`npm run build` 產出 `dist/`。Vite 的 `base` 是 `"./"`，所以 GitHub Pages 子路徑可以載入。

## 你要在 Firebase Console 做的事

專案沿用 `mrli-thlch`（與 <https://mrli-thlch.web.app> 的教師儀表板同一個專案）。客戶端設定寫在 `src/firebase-config.js`，那是公開的 Web 設定，不是密鑰。

1. **Authentication → Settings → Authorized domains** 加入：
   - `localhost`
   - `thomasthlch.github.io`
2. Google 登入供應商維持啟用。本應用只用 Google 彈出視窗；若瀏覽器擋住彈出視窗，會改走重新導向。
3. **合併之後，把完整 Firestore 規則 `firebase/firestore.rules` 重新發佈到專案 `mrli-thlch`，並把 Storage 片段合併進現有 Storage 規則。** 見下一節。規則未更新之前，管理員 Gmail 登入後讀寫會失敗，刪除題目也會被拒絕。這個倉庫不會替你執行部署。

## Firestore 規則

**`firebase/firestore.rules` 是要發佈到 Firebase 專案 `mrli-thlch` 的完整規則。`firebase deploy --only firestore:rules` 會取代整個專案的 Firestore 規則。這次可以這樣做，只因為這份檔案已經包含 dashboard、inventory、science_hub、deadline_fighter、p6science，以及準則牆。本 PR 不會部署 Firebase，倉庫裡也沒有 `firebase.json`。**

準則牆允許已驗證的 `@tswgps.edu.hk` 帳戶，以及已驗證的管理員 `thomasthlch@gmail.com`。刪除題目文件只限該管理員，或 `createdBy.uid` 是當前登入者的老師。其他老師仍可刪個別標準或待投票個案。

`firebase/firestore.sci_criteria_wall.rules.fragment` 只留下準則牆那一段，方便對照。它不是完整規則檔，不要單獨發佈。

Storage 仍然只有片段。`firebase/storage.sci_criteria_wall.rules.fragment` 必須合併進現有 Storage 規則，不可以單獨部署。片段同樣允許學校帳戶和管理員 Gmail 讀寫 `sci_criteria_wall/`。若現有 Storage 規則已有同名函式，合併時請改名。

客戶端只會讀寫 `sci_criteria_wall` 這個 Firestore 根，以及 Storage 的 `sci_criteria_wall/`。不會接觸 `dashboards`、`eservice`、`scores`、`classes`、`schemas`、`deadline_fighter`。

## GitHub Pages

Workflow：`.github/workflows/pages.yml`。推上 `main` 後會 `npm ci`、`npm run build`，再用 `upload-pages-artifact` 與 `deploy-pages` 發布。

**倉庫的 Pages → Source 要設成 GitHub Actions。** 這個 PR 沒有改 Pages 設定。Source 未改之前，workflow 即使成功也不會變成上面的網址。

## 資料怎樣放

```
sci_criteria_wall/wall
sci_criteria_wall/wall/questions/{題目}
sci_criteria_wall/wall/questions/{題目}/parts/{分部}
  /criteria/{判例}
  /cases/{待投票}
  /hints/{關鍵字提示}
```

題目、分部、判例、投票、提示各是自己的文件，用 `onSnapshot` 分開聽，避免整塊狀態互相覆蓋。相片先縮小再上傳到 Storage，Firestore 只存路徑和下載網址。

準則牆不再附帶示範題。若資料庫裡還有舊的示範標準（`source` 為 `seed`）、示範擬問（作者 uid 為 `seed`）或原本那三條未改過的空示範題，登入時會清走這些紀錄。不會用 `createdBy` 單獨判斷，所以老師自己建立的題目會留下。牆是空的時，畫面會請老師新增第一條題目。

刪除整條題目的按鈕只會出現在建立該題的老師，以及管理員帳戶。刪除時會一併移除分部、標準、待投票個案和已上載的相片。

投票以 Firebase uid 為準，同時儲存顯示名稱和電郵供畫面上顯示。兩位已允許的帳戶（學校老師或管理員）對**同一個扣分數**投同意票，該個案就鎖進階梯。介面寫的是「2 票同意就定案」。老師仍然可以直接新增標準，不用投票。

已鎖定或直接新增的判例可以改，修改紀錄最多留 6 筆（誰、何時、改了甚麼）。

## 刻意不做

- 不部署 Firebase Hosting，也不會 `firebase deploy`
- 不做班名冊、學生分數表、Excel 匯出
- 不做 OCR。上載或貼上相片後，答案文字由老師自己打
- 沒有假登入、沒有「模擬同事跟投達成共識」
- 沒有真實學生相片
