export const SCHOOL_DOMAIN = "tswgps.edu.hk";
export const ADMIN_EMAIL = "thomasthlch@gmail.com";

export const SEED_QUESTION_TITLES = {
  q1: "第 1 題：雞蛋模擬地球",
  q2: "第 2 題：食鹽溶解速率實驗",
  q3: "第 3 題：葉片澱粉測試煮軟目的",
};

const KEYWORD_DICTIONARY = [
  "卵形",
  "橢圓",
  "球體",
  "圓形",
  "形狀",
  "蛋白",
  "液體",
  "岩漿",
  "液態",
  "流質",
  "厚度",
  "薄",
  "比例",
  "外核",
  "板塊",
  "水溫",
  "溫度相同",
  "準確",
  "誤差",
  "葉綠素",
  "脫色",
  "殺死",
];

export function isSchoolEmail(email, verified = true) {
  if (!verified) return false;
  if (typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const suffix = `@${SCHOOL_DOMAIN}`;
  return normalized.length > suffix.length && normalized.endsWith(suffix);
}

export function isAllowedAccount(email, verified = true) {
  if (!verified || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  return normalized === ADMIN_EMAIL || isSchoolEmail(normalized, true);
}

export function canDeleteQuestion(user, question) {
  if (!user?.uid || !question) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (email === ADMIN_EMAIL) return true;
  return question.createdBy?.uid === user.uid;
}

export function isSeedCriterion(data) {
  return data?.source === "seed";
}

export function isSeedCase(data) {
  return String(data?.author?.uid || "") === "seed";
}

export function isSeedHintId(id) {
  return /^h_q[123]_[0-9]+_[0-9]+$/.test(String(id || ""));
}

export function isSeedPartId(id) {
  return /^sp_q[123]_[0-9]+$/.test(String(id || ""));
}

export function isEmptySeedQuestion(question, parts, remainingChildCount) {
  const expected = SEED_QUESTION_TITLES[question?.id];
  if (!expected || question?.title !== expected) return false;
  if (remainingChildCount > 0) return false;
  return (parts || []).every((part) => isSeedPartId(part.id));
}

export function profileOf(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  const fallback = email.includes("@") ? email.split("@")[0] : "老師";
  const displayName = String(user?.displayName || fallback || "老師").trim().slice(0, 80);
  return {
    uid: String(user?.uid || ""),
    displayName: displayName || "老師",
    email,
  };
}

export function clampMaxScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 2;
  return Math.min(4, Math.max(1, n));
}

export function clampDeduction(value, maxScore) {
  const max = Math.max(0, Math.round(Number(maxScore) || 0));
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

export function questionTotalScore(parts) {
  return (parts || []).reduce((sum, part) => sum + (Number(part.maxScore) || 0), 0);
}

export function tallyVotes(votes) {
  const tally = new Map();
  const counted = [];
  for (const [uid, vote] of Object.entries(votes || {})) {
    if (!vote || !Number.isFinite(Number(vote.deduction))) continue;
    if (!isAllowedAccount(vote.email, true)) continue;
    if (!uid || uid.startsWith("seed")) continue;
    const deduction = Number(vote.deduction);
    tally.set(deduction, (tally.get(deduction) || 0) + 1);
    counted.push({
      uid,
      deduction,
      displayName: vote.displayName || "老師",
      email: String(vote.email || "").toLowerCase(),
    });
  }
  let decidedDeduction = null;
  for (const [deduction, count] of tally) {
    if (count >= 2) {
      decidedDeduction = deduction;
      break;
    }
  }
  return { tally, counted, decidedDeduction };
}

export function voteStatus(votes) {
  const result = tallyVotes(votes);
  const leading = result.tally.size ? Math.max(...result.tally.values()) : 0;
  return {
    ...result,
    leading,
    label: `${leading} / 2 票同意同一扣分就定案`,
    percent: Math.min(100, Math.round((leading / 2) * 100)),
    detail: result.counted.length
      ? result.counted.map((vote) => `${vote.displayName}已投：-${vote.deduction} 分`).join(" ｜ ")
      : "暫未有已登入老師投票",
  };
}

export function votersFor(votes, deduction) {
  return tallyVotes(votes).counted.filter((vote) => vote.deduction === deduction);
}

export function extractAutoKeywords(text) {
  const value = String(text || "");
  return KEYWORD_DICTIONARY.filter((word) => value.includes(word));
}

export const SIMILAR_CRITERIA_THRESHOLD = 0.42;
export const SIMILAR_CRITERIA_LIMIT = 3;

export function normalizeCriterionText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function textBigrams(value) {
  if (value.length < 2) return value ? [value] : [];
  const grams = [];
  for (let index = 0; index < value.length - 1; index += 1) grams.push(value.slice(index, index + 2));
  return grams;
}

function bigramSimilarity(left, right) {
  const a = textBigrams(left);
  const b = textBigrams(right);
  if (!a.length || !b.length) return 0;
  const counts = new Map();
  a.forEach((gram) => counts.set(gram, (counts.get(gram) || 0) + 1));
  let overlap = 0;
  b.forEach((gram) => {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  });
  let score = (2 * overlap) / (a.length + b.length);
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4) {
    const pool = new Map();
    longer.forEach((gram) => pool.set(gram, (pool.get(gram) || 0) + 1));
    let covered = 0;
    shorter.forEach((gram) => {
      const count = pool.get(gram) || 0;
      if (count > 0) {
        covered += 1;
        pool.set(gram, count - 1);
      }
    });
    const cover = covered / shorter.length;
    if (cover >= 0.72) score = Math.max(score, cover);
  }
  return score;
}

export function similarCriteria(text, criteria, { threshold = SIMILAR_CRITERIA_THRESHOLD, limit = SIMILAR_CRITERIA_LIMIT } = {}) {
  const normalized = normalizeCriterionText(text);
  if (normalized.length < 4) return [];
  return (criteria || [])
    .map((item) => ({
      item,
      score: bigramSimilarity(normalized, normalizeCriterionText(item?.text)),
    }))
    .filter((row) => row.score >= threshold && row.item?.id)
    .sort((left, right) => right.score - left.score || String(left.item.id).localeCompare(String(right.item.id)))
    .slice(0, limit);
}

export function findSimilarCase(text, hints, cases) {
  const value = String(text || "").trim();
  if (!value) return null;
  for (const rule of hints || []) {
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const excluded = Array.isArray(rule.excludeKeywords) ? rule.excludeKeywords : [];
    const hasKeyword = keywords.some((keyword) => keyword && value.includes(keyword));
    const hasExcluded = excluded.some((keyword) => keyword && value.includes(keyword));
    if (hasKeyword && !hasExcluded) return { kind: "hint", item: rule };
  }
  for (const item of cases || []) {
    const keys = extractAutoKeywords(item.text || "");
    if (keys.length > 0 && keys.some((keyword) => value.includes(keyword))) {
      return { kind: "pending", item };
    }
  }
  return null;
}

export function getDeductionBadgeInfo(deduction, maxScore) {
  const actualScore = Math.max(0, maxScore - deduction);
  if (deduction === 0) {
    return {
      shortLabel: "-0 分",
      fullLabel: `🟢 -0 分 (全對，得 ${actualScore}/${maxScore})`,
      colTitle: `🟢 -0 分 · 照畀滿分 (${actualScore}/${maxScore})`,
      colSubtitle: "完全接受的標準寫法與判例",
      headerBg: "bg-emerald-100/95 border-emerald-300 text-emerald-950",
      badgeBg: "bg-emerald-600 text-white",
      cardBorder: "bg-emerald-50/55 border-emerald-200",
      btnActive: "bg-emerald-600 text-white border-emerald-800 shadow-xs",
      btnVote: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-800",
    };
  }
  if (deduction >= maxScore) {
    return {
      shortLabel: `-${deduction} 分`,
      fullLabel: `🔴 -${deduction} 分 (全扣，得 0/${maxScore})`,
      colTitle: `🔴 -${deduction} 分 · 全扣 (實得 0/${maxScore})`,
      colSubtitle: "科學概念錯誤／過於表面／紅線區",
      headerBg: "bg-rose-100/95 border-rose-300 text-rose-950",
      badgeBg: "bg-rose-600 text-white",
      cardBorder: "bg-rose-50/60 border-rose-200",
      btnActive: "bg-rose-600 text-white border-rose-800 shadow-xs",
      btnVote: "bg-rose-600 hover:bg-rose-700 text-white border-rose-800",
    };
  }
  return {
    shortLabel: `-${deduction} 分`,
    fullLabel: `🟡 -${deduction} 分 (扣 ${deduction} 分，得 ${actualScore}/${maxScore})`,
    colTitle: `🟡 -${deduction} 分 · 扣 ${deduction} 分 (實得 ${actualScore}/${maxScore})`,
    colSubtitle: "方向正確但欠完整／單邊比較／用字未精準",
    headerBg: "bg-amber-100/95 border-amber-300 text-amber-950",
    badgeBg: "bg-amber-500 text-slate-950",
    cardBorder: "bg-amber-50/60 border-amber-200",
    btnActive: "bg-amber-500 text-slate-950 border-amber-700 shadow-xs",
    btnVote: "bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-700",
  };
}

export const FOLD_STORAGE_KEY = "sci_criteria_wall_folded";

export function readFolded(stored) {
  return stored !== "0";
}

export function partChipLabel(part, index) {
  const score = Number(part?.maxScore) || 0;
  const fallback = `第 ${index + 1} 部分`;
  const name = String(part?.name || "").trim();
  if (!name || name === fallback) return `${fallback} · ${score}分`;
  return `${fallback}：${name} · ${score}分`;
}

export function showPartPicker(partCount) {
  return Number(partCount) > 1;
}

export function showPendingPanel({ folded, pendingCount }) {
  if (Number(pendingCount) > 0) return true;
  return !folded;
}

export function defaultDeductAmounts(maxScore) {
  const max = Math.max(0, Math.round(Number(maxScore) || 0));
  const half = Math.round(max / 2);
  return [...new Set([0, half, max])].sort((left, right) => left - right);
}

export function visibleDeductAmounts(maxScore, criteria) {
  const max = Math.max(0, Math.round(Number(maxScore) || 0));
  const amounts = new Set(defaultDeductAmounts(max));
  for (const item of criteria || []) {
    const deduction = Number(item?.deduction);
    if (!Number.isInteger(deduction) || deduction < 0 || deduction > max) continue;
    amounts.add(deduction);
  }
  return [...amounts].sort((left, right) => left - right);
}

export function ladderGridClass(visibleCount, tight = false) {
  const count = Math.max(1, Number(visibleCount) || 1);
  if (!tight) {
    if (count <= 1) return "grid grid-cols-1 gap-3 items-start";
    if (count === 2) return "grid grid-cols-1 lg:grid-cols-2 gap-3 items-start";
    return "grid grid-cols-1 lg:grid-cols-3 gap-3 items-start";
  }
  if (count <= 2) return "grid grid-cols-1 md:grid-cols-2 gap-2 items-start";
  if (count === 3) return "grid grid-cols-1 md:grid-cols-3 gap-2 items-start";
  if (count === 4) return "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 items-start";
  if (count === 5) return "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 items-start";
  return "grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2 items-start";
}

export function pushChange(log, entry, cap = 6) {
  const next = Array.isArray(log) ? log.filter(Boolean) : [];
  return [entry, ...next].slice(0, cap);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    return new Date(n).toLocaleString("zh-HK", { hour12: false });
  } catch {
    return "";
  }
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function byOrder(a, b) {
  const order = (a.order ?? 0) - (b.order ?? 0);
  if (order !== 0) return order;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

export function byNewest(a, b) {
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

export function resolveQuestionId(questions, activeQuestionId) {
  if ((questions || []).some((question) => question.id === activeQuestionId)) return activeQuestionId;
  return questions?.[0]?.id || "";
}

export function resolvePartId(parts, activeSubPartId) {
  const ordered = [...(parts || [])].sort(byOrder);
  if (ordered.some((part) => part.id === activeSubPartId)) return activeSubPartId;
  return ordered[0]?.id || "";
}

export function consensusBannerText(deduction, maxScore) {
  const info = getDeductionBadgeInfo(deduction, maxScore);
  return `🤝 已有 2 票同意同一個扣分，個案已歸入【${info.shortLabel}】欄（2 票同意就定案）`;
}

export function friendlyAuthError(code) {
  switch (code) {
    case "auth/popup-blocked":
      return "瀏覽器擋咗彈出視窗，正在改用重新導向登入。";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "登入視窗已關閉。";
    case "auth/unauthorized-domain":
      return "這個網址未加入 Firebase「授權網域」。請加入 localhost 同 thomasthlch.github.io。";
    case "auth/network-request-failed":
      return "網絡連線失敗，請稍後再試。";
    default:
      return "Google 登入未完成，請再試一次。";
  }
}

export function explainDataError(error) {
  const code = error?.code || "";
  if (code === "permission-denied") {
    return "讀寫被拒絕。請用已驗證的 @tswgps.edu.hk 學校帳戶或管理員帳戶。如果你剛剛發佈了規則，請重新整理頁面，再登入一次。";
  }
  if (code === "unavailable") return "暫時連唔上 Firestore，請檢查網絡後再試。";
  return "讀取或儲存資料時發生問題，請稍後再試。";
}

export async function openWallAfterCleanup(cleanup, sync, warn) {
  try {
    await cleanup();
  } catch (error) {
    warn(error);
  }
  return sync();
}
