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

瀏覽器打開 <http://localhost:5173>。用已驗證的 `@tswgps.edu.hk` Google 帳戶登入。其他電郵會被登出，並看到拒絕訊息。

```bash
npm test
npm run build
npm run preview
```

`npm test` 檢查 2 票定案、學校電郵、關鍵字提示、種子題和「規則只是片段」。`npm run build` 產出 `dist/`。Vite 的 `base` 是 `"./"`，所以 GitHub Pages 子路徑可以載入。

## 你要在 Firebase Console 做的事

專案沿用 `mrli-thlch`（與 <https://mrli-thlch.web.app> 的教師儀表板同一個專案）。客戶端設定寫在 `src/firebase-config.js`，那是公開的 Web 設定，不是密鑰。

1. **Authentication → Settings → Authorized domains** 加入：
   - `localhost`
   - `thomasthlch.github.io`
2. Google 登入供應商維持啟用。本應用只用 Google 彈出視窗；若瀏覽器擋住彈出視窗，會改走重新導向。
3. **把規則片段合併進現有規則。** 見下一節。未合併之前，登入成功也會讀寫失敗，畫面上會提示權限不足。

## 安全規則必須合併，不能單獨部署

**這些片段必須合併進 mrli-thlch 現有的 Firestore / Storage 規則，不可以當成整個專案的規則檔部署。單獨部署會清走儀表板和其他校內工具的權限。本 PR 也不做 Firebase Hosting 部署，倉庫裡故意沒有 `firebase.json`。**

Firestore 片段：`firebase/firestore.sci_criteria_wall.rules.fragment`

把下面兩段放進現有 `service cloud.firestore` / `match /databases/{database}/documents` 裡，與其他 `match` 並列：

```
function sciCriteriaWallTeacher() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email.matches('.+@[tT][sS][wW][gG][pP][sS]\\.[eE][dD][uU]\\.[hH][kK]$');
}

match /sci_criteria_wall/{document=**} {
  allow read, write: if sciCriteriaWallTeacher();
}
```

Storage 片段：`firebase/storage.sci_criteria_wall.rules.fragment`

放進現有 `service firebase.storage` / `match /b/{bucket}/o`：

```
function sciCriteriaWallTeacher() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email.matches('.+@[tT][sS][wW][gG][pP][sS]\\.[eE][dD][uU]\\.[hH][kK]$');
}

match /sci_criteria_wall/{allPaths=**} {
  allow read: if sciCriteriaWallTeacher();
  allow create, update: if sciCriteriaWallTeacher()
    && request.resource.size < 5 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
  allow delete: if sciCriteriaWallTeacher();
}
```

若現有規則已有同名函式，請改名後同步改 `allow` 條件，避免覆蓋其他工具的函式。

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

準則牆是空的時，第一個成功登入的老師會寫入一次示範題（雞蛋模擬地球、食鹽溶解、葉片澱粉）。沒有「重設示範資料」按鈕，一位老師不能清走大家的牆。示範擬問裡的老師名字只是例子，**不計入定案票數**。

投票以 Firebase uid 為準，同時儲存顯示名稱和電郵供畫面上顯示。兩位已登入、電郵已驗證的 `@tswgps.edu.hk` 老師對**同一個扣分數**投同意票，該個案就鎖進階梯。介面寫的是「2 票同意就定案」，不是「2/3 共識」。老師仍然可以直接新增標準，不用投票。

已鎖定或直接新增的判例可以改，修改紀錄最多留 6 筆（誰、何時、改了甚麼）。

## 刻意不做

- 不部署 Firebase Hosting，也不會 `firebase deploy`
- 不做班名冊、學生分數表、Excel 匯出
- 不做 OCR。上載或貼上相片後，答案文字由老師自己打
- 沒有假登入、沒有「模擬同事跟投達成共識」
- 沒有真實學生相片
