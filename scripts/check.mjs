import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_EMAIL,
  SEED_QUESTION_TITLES,
  canDeleteQuestion,
  consensusBannerText,
  explainDataError,
  findSimilarCase,
  isAllowedAccount,
  isEmptySeedQuestion,
  isSchoolEmail,
  isSeedCase,
  isSeedCriterion,
  openWallAfterCleanup,
  partChipLabel,
  readFolded,
  showPartPicker,
  showPendingPanel,
  similarCriteria,
  SIMILAR_CRITERIA_LIMIT,
  tallyVotes,
  voteStatus,
} from "../src/logic.js";
import { assertSafeSegments, assertStoragePath } from "../src/paths.js";
import { renderLadderHtml, renderPendingHtml } from "../src/render.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function teacher(name, email) {
  return { deduction: 1, displayName: name, email };
}

const agreed = tallyVotes({
  aaa: teacher("黃老師", "wong@tswgps.edu.hk"),
  bbb: { deduction: 1, displayName: "陳老師", email: "chan@tswgps.edu.hk" },
});
if (agreed.decidedDeduction !== 1) fail("兩位老師同扣 1 分應定案");
if (agreed.counted.length !== 2) fail("應計算兩張學校帳戶的票");

const split = tallyVotes({
  aaa: teacher("黃老師", "wong@tswgps.edu.hk"),
  bbb: { deduction: 2, displayName: "陳老師", email: "chan@tswgps.edu.hk" },
});
if (split.decidedDeduction !== null) fail("兩張不同扣分的票不應定案");

const outsider = tallyVotes({
  aaa: teacher("黃老師", "wong@tswgps.edu.hk"),
  bbb: { deduction: 1, displayName: "外人", email: "person@gmail.com" },
});
if (outsider.decidedDeduction !== null || outsider.counted.length !== 1) {
  fail("非學校電郵不應計票");
}

const seeded = tallyVotes({
  seed: { deduction: 0, displayName: "示範", email: "seed@tswgps.edu.hk" },
  aaa: { deduction: 0, displayName: "黃老師", email: "wong@tswgps.edu.hk" },
});
if (seeded.decidedDeduction !== null) fail("示範票不應令一位真老師就定案");

const adminLock = tallyVotes({
  aaa: teacher("黃老師", "wong@tswgps.edu.hk"),
  admin: { deduction: 1, displayName: "管理員", email: "ThomasTHLCH@gmail.com" },
});
if (adminLock.decidedDeduction !== 1 || adminLock.counted.length !== 2) {
  fail("管理員 Gmail 的票應計入定案");
}

if (voteStatus({}).label.includes("2/3")) fail("投票進度不應寫 2/3");
if (!voteStatus({}).label.includes("2 票同意同一扣分就定案")) fail("應寫明 2 票同意就定案");
if (consensusBannerText(1, 2).includes("2/3")) fail("定案橫額不應寫 2/3");

if (!isSchoolEmail("wong@tswgps.edu.hk", true)) fail("學校電郵應通過");
if (isSchoolEmail("wong@tswgps.edu.hk", false)) fail("未驗證電郵應拒絕");
if (isSchoolEmail("wong@gmail.com", true)) fail("其他網域應拒絕");
if (isSchoolEmail("wong@tswgps.edu.hk.bad.com", true)) fail("假網域應拒絕");
if (isSchoolEmail("@tswgps.edu.hk", true)) fail("空白帳號應拒絕");
if (!isAllowedAccount(ADMIN_EMAIL, true)) fail("管理員 Gmail 應可登入");
if (isAllowedAccount(ADMIN_EMAIL, false)) fail("未驗證的管理員應拒絕");
if (isAllowedAccount("person@gmail.com", true)) fail("其他 Gmail 應拒絕");
if (!isAllowedAccount("Wong@TSWGPS.EDU.HK", true)) fail("學校電郵大小寫應可通過");

const author = { uid: "teacher-1", email: "a@tswgps.edu.hk" };
const other = { uid: "teacher-2", email: "b@tswgps.edu.hk" };
const admin = { uid: "admin", email: ADMIN_EMAIL };
const owned = { id: "q_real", createdBy: { uid: "teacher-1" } };
if (!canDeleteQuestion(author, owned)) fail("建立者應可刪題");
if (canDeleteQuestion(other, owned)) fail("其他老師不應可刪題");
if (!canDeleteQuestion(admin, owned)) fail("管理員應可刪題");
if (canDeleteQuestion(other, { id: "q_real" })) fail("沒有建立者時不應靠空白資料刪題");

const seedShell = { id: "q1", title: SEED_QUESTION_TITLES.q1, createdBy: { uid: "teacher-1" } };
if (!isEmptySeedQuestion(seedShell, [{ id: "sp_q1_1" }], 0)) fail("空的示範題殼應可清走");
if (isEmptySeedQuestion({ ...seedShell, title: "老師改過的題" }, [{ id: "sp_q1_1" }], 0)) {
  fail("改過標題的題目不應當成示範題");
}
if (isEmptySeedQuestion(seedShell, [{ id: "sp_teacher" }], 0)) fail("有老師新增分部時不應刪整題");
if (isEmptySeedQuestion(seedShell, [{ id: "sp_q1_1" }], 1)) fail("仲有內容時不應刪整題");
if (!isSeedCriterion({ source: "seed", createdBy: { uid: "teacher-1" } })) fail("source 為 seed 先是示範標準");
if (isSeedCriterion({ source: "direct", createdBy: { uid: "seed" } })) fail("唔可以用 createdBy 單獨判斷示範標準");
if (!isSeedCase({ author: { uid: "seed" } })) fail("seed uid 的擬問應可清走");
if (isSeedCase({ author: { uid: "teacher-1" }, createdBy: { uid: "seed" } })) fail("唔可以用 createdBy 判斷擬問");

const eggHints = [
  {
    keywords: ["蛋殼", "蛋白", "蛋黃", "三層"],
    excludeKeywords: ["地殼", "地幔", "地核"],
    matchedText: "只寫三層",
    deduction: 1,
    reason: "單邊比較",
  },
];
const oneSided = findSimilarCase("雞蛋有蛋殼、蛋白、蛋黃三層", eggHints, []);
if (!oneSided || oneSided.item.deduction !== 1) fail("單邊三層應提示 -1");
const contrasted = findSimilarCase("蛋殼對應地殼", eggHints, []);
if (contrasted) fail("已寫地殼對應時不應誤中單邊比較提示");
const pendingHit = findSimilarCase("液態外核會流動", [], [
  { text: "可以模擬地球液態外核", author: { displayName: "示範擬問" } },
]);
if (!pendingHit || pendingHit.kind !== "pending") fail("應提示已有待投票的類似答案");

const state = {
  user: { uid: "u1", displayName: "黃老師", email: "wong@tswgps.edu.hk" },
  questions: [{ id: "q1", title: "第 1 題：雞蛋模擬地球", totalScore: 4, pendingCount: 1 }],
  parts: [{ id: "sp1", name: "相同點", maxScore: 2, order: 0, pendingCount: 1 }],
  criteria: [{
    id: "r1",
    deduction: 1,
    text: "只寫三層 <script>",
    reason: "欠完整",
    note: "3A",
    source: "direct",
    sourceLabel: "黃老師 直接新增",
    createdBy: { displayName: "黃老師", email: "wong@tswgps.edu.hk" },
    createdAt: 1700000000000,
    changelog: [{ at: 1700000001000, displayName: "黃老師", summary: "修改內容" }],
  }],
  cases: [{
    id: "pv1",
    text: "答案 <b>",
    note: "",
    question: "扣幾多？",
    author: { uid: "u2", displayName: "李老師", email: "lee@tswgps.edu.hk" },
    votes: { u2: { deduction: 1, displayName: "李老師", email: "lee@tswgps.edu.hk" } },
  }],
  hints: [],
  activeQuestionId: "q1",
  activeSubPartId: "sp1",
  questionsReady: true,
  partsReady: true,
  childrenReady: true,
};
const pendingHtml = renderPendingHtml(state).html;
if (!pendingHtml.includes("2 票同意同一扣分就定案")) fail("待投票區應說明 2 票定案");
if (pendingHtml.includes("2/3") || pendingHtml.includes("模擬同事")) fail("待投票區殘留示範投票文案");
if (pendingHtml.includes("<b>")) fail("待投票文字未被跳脫");
if (!pendingHtml.includes("&lt;b&gt;")) fail("應跳脫答案裡的標籤");
const ladder = renderLadderHtml(state);
const directAdds = ladder.html.match(/open-direct/g) || [];
if (directAdds.length !== 3) fail(`2 分部分應有 3 個扣分欄，實際 ${directAdds.length}`);
if (!ladder.html.includes("黃老師 直接新增") || !ladder.html.includes("修改紀錄")) {
  fail("階梯應顯示作者與修改紀錄");
}
if (ladder.html.includes("<script>")) fail("階梯文字未被跳脫");

for (const bad of [
  ["dashboards"],
  ["sci_criteria_wall", "wall", "scores"],
  ["sci_criteria_wall", "deadline_fighter"],
]) {
  try {
    assertSafeSegments(bad);
    fail(`應拒絕路徑 ${bad.join("/")}`);
  } catch {
    // expected
  }
}
try {
  assertStoragePath("classes/secret.png");
  fail("應拒絕 Storage 路徑離開 sci_criteria_wall");
} catch {
  // expected
}
if (assertStoragePath("sci_criteria_wall/teacher/photo.jpg") !== "sci_criteria_wall/teacher/photo.jpg") {
  fail("合法 Storage 路徑應原樣通過");
}

const banned = ["模擬同事", "正在辨識", "陳老師 (已登入)", "2/3 共識", "askResetDemoData", "startSimulatedOCR"];
const forbiddenCollections = ["dashboards", "eservice", "scores", "classes", "schemas", "deadline_fighter"];
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|html|css|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}
for (const file of walk(path.join(root, "src")).concat(path.join(root, "index.html"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const phrase of banned) {
    if (text.includes(phrase)) fail(`${path.relative(root, file)} 含有「${phrase}」`);
  }
  if (path.basename(file) !== "paths.js") {
    for (const name of forbiddenCollections) {
      if (text.includes(name)) fail(`${path.relative(root, file)} 提及了禁用集合 ${name}`);
    }
  }
}
const rules = fs.readFileSync(path.join(root, "firebase/firestore.sci_criteria_wall.rules.fragment"), "utf8");
const storageRules = fs.readFileSync(path.join(root, "firebase/storage.sci_criteria_wall.rules.fragment"), "utf8");
if (rules.includes("rules_version") || storageRules.includes("rules_version")) {
  fail("規則片段不應是可單獨部署的完整規則檔");
}
if (!rules.includes("match /sci_criteria_wall/{path=**}")) fail("Firestore 片段缺少準則牆 match");
if (!rules.includes(ADMIN_EMAIL) || !storageRules.includes(ADMIN_EMAIL)) fail("規則片段應允許管理員 Gmail");
if (!rules.includes("createdBy.uid == request.auth.uid")) fail("題目刪除應限建立者");
if (!storageRules.includes("match /sci_criteria_wall/{allPaths=**}")) fail("Storage 片段缺少準則牆 match");
const fullRules = fs.readFileSync(path.join(root, "firebase/firestore.rules"), "utf8");
if (!fullRules.startsWith("rules_version = '2';")) fail("完整規則應以 rules_version 開頭");
for (const marker of [
  "match /dashboards/master_dashboard",
  "match /inventory/items",
  "match /deadline_fighter/{uid}",
  "match /science_hub/scoring/scores/{scoreId}",
  "match /p6science/{userId}",
  "function sciCriteriaWallAdmin()",
  "match /sci_criteria_wall/wall/questions/{questionId}",
  ADMIN_EMAIL,
]) {
  if (!fullRules.includes(marker)) fail(`完整 Firestore 規則缺少 ${marker}`);
}
const mainSource = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
if (mainSource.includes("hd:")) fail("Google 登入不應再用 hd 限制網域");
if (mainSource.includes("ensureSeed")) fail("不應再寫入示範題");
if (!mainSource.includes("openWallAfterCleanup")) fail("讀取準則牆不應被清走示範題擋住");
if (fullRules.includes("path.matches") || rules.includes("path.matches")) {
  fail("唔好對 Path 呼叫 matches，否則刪除會全部被拒");
}
const denied = explainDataError({ code: "permission-denied" });
if (denied.includes("片段") || denied.includes("firebase/")) fail("權限錯誤不應再叫人合併規則片段");
if (!denied.includes("讀寫被拒絕")) fail("應清楚講讀寫被拒絕");
if (!denied.includes("管理員")) fail("應提及管理員帳戶");
if (!denied.includes("重新整理")) fail("應提示剛發佈規則後重新整理再登入");
let synced = false;
let warned = false;
await openWallAfterCleanup(
  async () => {
    const error = new Error("denied");
    error.code = "permission-denied";
    throw error;
  },
  async () => {
    synced = true;
  },
  () => {
    warned = true;
  },
);
if (!synced || !warned) fail("清走示範題失敗時仍要開始同步");
if (!readFolded(null) || !readFolded("1") || readFolded("0")) fail("題幹預設收起，只有明確展開先記住");
if (showPendingPanel({ folded: true, pendingCount: 0 })) fail("收起時冇待投票不應佔位");
if (!showPendingPanel({ folded: true, pendingCount: 1 })) fail("有待投票時應保持顯示");
if (!showPendingPanel({ folded: false, pendingCount: 0 })) fail("展開時應顯示待投票區");
if (showPartPicker(1) || !showPartPicker(2)) fail("只有一個分部時不應再顯示分部按鈕");
if (partChipLabel({ name: "第 1 部分", maxScore: 2 }, 0) !== "第 1 部分 · 2分") {
  fail("分部名稱不應重複成「第 1 部分：第 1 部分」");
}
if (partChipLabel({ name: "相同點", maxScore: 2 }, 0) !== "第 1 部分：相同點 · 2分") {
  fail("有獨立名稱的分部應保留名稱");
}
const near = similarCriteria("北極熊是白色的像冰雪。", [
  { id: "far", text: "光合作用會產生氧氣。" },
  { id: "near", text: "北極熊是白色像冰雪" },
  { id: "mid", text: "北極熊需要保護色" },
]);
if (near[0]?.item.id !== "near") fail("最相近的標準應排第一");
if (near.some((row) => row.item.id === "far")) fail("無關標準不應出現");
if (near.length > SIMILAR_CRITERIA_LIMIT) fail("相近標準最多三條");
if (similarCriteria("白", [{ id: "near", text: "北極熊是白色像冰雪" }]).length) {
  fail("太短的輸入不應提示");
}
if (fs.existsSync(path.join(root, "src/seed-data.js"))) fail("不應再附帶示範題資料");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
if (!workflow.includes("upload-pages-artifact") || !workflow.includes("deploy-pages")) {
  fail("Pages workflow 應使用 upload-pages-artifact 與 deploy-pages");
}
const viteConfig = fs.readFileSync(path.join(root, "vite.config.js"), "utf8");
if (!viteConfig.includes('base: "./"')) fail("vite base 應為 ./");
if (fs.existsSync(path.join(root, "firebase.json"))) fail("不應提供可直接部署的 firebase.json");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("準則牆檢查通過：管理員可登入、刪題權限、沒有示範題、完整 Firestore 規則。");
