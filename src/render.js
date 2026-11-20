import {
  byNewest,
  byOrder,
  canDeleteQuestion,
  escapeHtml,
  formatTime,
  getDeductionBadgeInfo,
  ladderGridClass,
  questionTotalScore,
  safeHttpsUrl,
  voteStatus,
} from "./logic.js";

function pendingCountForQuestion(question, state) {
  if (question.id === state.activeQuestionId && state.partsReady) {
    return state.parts.reduce((sum, part) => {
      if (part.id === state.activeSubPartId && state.childrenReady) return sum + state.cases.length;
      return sum + Number(part.pendingCount || 0);
    }, 0);
  }
  return Number(question.pendingCount || 0);
}

function pendingCountForPart(part, state) {
  if (part.id === state.activeSubPartId && state.childrenReady) return state.cases.length;
  return Number(part.pendingCount || 0);
}

export function renderQuestionTabsHtml(state) {
  return [...state.questions].sort(byOrder).map((question) => {
    const active = question.id === state.activeQuestionId;
    const total = question.id === state.activeQuestionId && state.partsReady
      ? questionTotalScore(state.parts)
      : Number(question.totalScore || 0);
    const scoreLabel = `共 ${total} 分`;
    const pending = pendingCountForQuestion(question, state);
    return `
      <button type="button" data-action="switch-question" data-id="${escapeHtml(question.id)}" class="shrink-0 max-w-[16rem] sm:max-w-[20rem] overflow-hidden px-3 py-2 rounded-xl text-sm sm:text-base font-black transition flex items-center gap-2 cursor-pointer ${
        active
          ? "bg-blue-700 text-white shadow-md ring-2 ring-blue-300"
          : "bg-white hover:bg-blue-50 text-slate-800 border-2 border-slate-300"
      }">
        <span class="truncate min-w-0">${escapeHtml(question.title)}</span>
        <span class="text-sm px-2.5 py-0.5 rounded-lg font-black whitespace-nowrap ${active ? "bg-blue-900/60 text-blue-100" : "bg-slate-100 text-slate-700"}">${scoreLabel}</span>
        ${pending > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full font-black whitespace-nowrap bg-amber-400 text-slate-950">${pending} 待投</span>` : ""}
      </button>
    `;
  }).join("");
}

export function renderSubpartTabsHtml(state) {
  return [...state.parts].sort(byOrder).map((part, index) => {
    const active = part.id === state.activeSubPartId;
    const pending = pendingCountForPart(part, state);
    return `
      <button type="button" data-action="switch-part" data-id="${escapeHtml(part.id)}" class="px-3.5 py-2.5 rounded-2xl text-base sm:text-lg font-black transition flex items-center gap-2 cursor-pointer ${
        active
          ? "bg-slate-900 text-white shadow-md ring-4 ring-blue-300"
          : "bg-slate-100 hover:bg-blue-50 text-slate-800 border-2 border-slate-300"
      }">
        <span>📌 第 ${index + 1} 部分：${escapeHtml(part.name)}（佔 ${part.maxScore} 分）</span>
        ${pending > 0 ? `<span class="bg-amber-400 text-slate-950 text-sm font-black px-2.5 py-0.5 rounded-full">${pending} 待投</span>` : ""}
      </button>
    `;
  }).join("");
}

function photoHtml(photo, type, id) {
  const url = safeHttpsUrl(photo?.downloadURL);
  if (!url) return "";
  return `
    <div data-action="open-photo" data-type="${type}" data-id="${escapeHtml(id)}" class="rounded-xl overflow-hidden border-2 border-slate-300 bg-white cursor-pointer" title="點擊放大手寫原圖">
      <img src="${escapeHtml(url)}" alt="學生答案相片" class="w-full max-h-[150px] object-contain bg-white" />
      <div class="bg-slate-900/80 text-white text-xs font-bold px-3 py-1 text-right">🔍 點擊放大相片</div>
    </div>
  `;
}

function changelogHtml(log) {
  if (!Array.isArray(log) || log.length === 0) return "";
  const items = log.slice(0, 6).map((entry) => {
    const when = formatTime(entry.at);
    return `<li>${escapeHtml(entry.displayName || "老師")}：${escapeHtml(entry.summary || "已修改")}${when ? ` · ${escapeHtml(when)}` : ""}</li>`;
  }).join("");
  return `<details class="text-sm text-slate-600"><summary class="cursor-pointer font-bold">修改紀錄</summary><ul class="mt-1 space-y-1 list-disc pl-5">${items}</ul></details>`;
}

function voteButtonsHtml(item, maxScore) {
  let html = "";
  for (let deduction = 0; deduction <= maxScore; deduction += 1) {
    const info = getDeductionBadgeInfo(deduction, maxScore);
    html += `
      <button type="button" data-action="cast-vote" data-id="${escapeHtml(item.id)}" data-deduction="${deduction}" class="w-full py-3 px-4 rounded-xl font-black text-base sm:text-lg border-b-4 transition text-left flex items-center justify-between cursor-pointer ${info.btnVote}">
        <span>${info.fullLabel}</span>
        <span class="text-sm opacity-90">撳此投票 →</span>
      </button>
    `;
  }
  return html;
}

export function renderPendingHtml(state) {
  const part = state.parts.find((item) => item.id === state.activeSubPartId);
  const question = state.questions.find((item) => item.id === state.activeQuestionId);
  if (!part || !question) return "";
  const partIndex = [...state.parts].sort(byOrder).findIndex((item) => item.id === part.id);
  const cases = [...state.cases].sort(byNewest);
  const label = `第 ${partIndex + 1} 部分：${part.name}（佔 ${part.maxScore} 分）`;
  if (!state.childrenReady) {
    return { label, countText: "載入中", empty: false, html: `<div class="text-slate-600 font-bold">正在載入待投票擬問…</div>` };
  }
  if (cases.length === 0) {
    return {
      label,
      countText: "0 題待投票",
      empty: true,
      html: `
        <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-4 px-5">
          <div class="text-base sm:text-lg font-bold text-slate-600">🎉「${escapeHtml(part.name)}」暫時冇待投票擬問。遇到唔肯定扣幾分嘅作答，可以上載答案放上嚟投票。</div>
        </div>
      `,
    };
  }
  const html = `
    <div class="${cases.length > 1 ? "grid grid-cols-1 xl:grid-cols-2 gap-4" : "grid grid-cols-1 gap-4"}">
      ${cases.map((item) => {
        const status = voteStatus(item.votes);
        const mine = item.votes?.[state.user?.uid];
        const authorName = item.author?.uid === "seed" ? "示範擬問" : (item.author?.displayName || "老師");
        return `
          <article class="animate-card bg-amber-50/75 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs flex flex-col justify-between">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="bg-amber-200 text-amber-950 font-black text-sm sm:text-base px-3 py-1 rounded-xl">🙋‍♂️ ${escapeHtml(authorName)} 發起</span>
                  ${item.note ? `<span class="bg-white border border-amber-300 text-slate-700 font-bold text-sm px-2.5 py-1 rounded-xl">🏷️ ${escapeHtml(item.note)}</span>` : ""}
                </div>
                <div class="flex items-center gap-1.5">
                  <button type="button" data-action="open-edit" data-type="pending" data-id="${escapeHtml(item.id)}" class="bg-white hover:bg-amber-100 text-slate-800 border border-amber-300 font-bold text-sm px-2.5 py-1.5 rounded-xl cursor-pointer">✏️ 修改</button>
                  <button type="button" data-action="ask-delete" data-type="pending" data-id="${escapeHtml(item.id)}" class="bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm px-2.5 py-1.5 rounded-xl cursor-pointer" title="刪除此項目">🗑️</button>
                </div>
              </div>
              ${photoHtml(item.photo, "pending", item.id)}
              <div class="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2">
                <div class="text-[18px] font-black text-slate-900 leading-snug">「${escapeHtml(item.text)}」</div>
                ${item.question ? `<div class="text-sm sm:text-base font-bold text-amber-950 bg-amber-100/80 px-3 py-2 rounded-xl">💬 ${escapeHtml(item.question)}</div>` : ""}
                ${item.demoLean ? `<div class="text-sm font-bold text-slate-600">例子入面，${escapeHtml(item.demoLean.displayName)} 傾向 -${Number(item.demoLean.deduction)} 分（示範，不計入定案票數）。</div>` : ""}
              </div>
            </div>
            <div class="space-y-3 pt-1">
              <div class="space-y-1.5 bg-white/95 border border-amber-200 rounded-xl p-3">
                <div class="flex items-center justify-between text-sm font-black text-slate-700 gap-3">
                  <span>${escapeHtml(status.label)}</span>
                  <span class="text-amber-900">${status.counted.length} 票</span>
                </div>
                <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-amber-500 rounded-full" style="width: ${status.percent}%"></div>
                </div>
                <div class="text-sm font-bold text-slate-700">${escapeHtml(status.detail)}</div>
              </div>
              ${mine ? `<div class="text-base font-black text-blue-950">✓ 你已投「-${mine.deduction} 分」。可以改投；另一位已登入老師投同一個扣分就會定案。</div>` : `<div class="text-sm font-black text-slate-800">請投票決定扣幾多分（2 票同意同一個數就定案）：</div>`}
              <div class="flex flex-col gap-2">${voteButtonsHtml(item, Number(part.maxScore) || 0)}</div>
              ${changelogHtml(item.changelog)}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
  return { label, countText: `${cases.length} 題待投票`, empty: false, html };
}

export function renderLadderHtml(state) {
  const part = state.parts.find((item) => item.id === state.activeSubPartId);
  if (!part) return { heading: "📊 扣分階梯對照板", html: "" };
  const orderedParts = [...state.parts].sort(byOrder);
  const partIndex = orderedParts.findIndex((item) => item.id === part.id);
  const maxScore = Number(part.maxScore) || 0;
  const heading = `📊 第 ${partIndex + 1} 部分「${part.name}（佔 ${maxScore} 分）」扣分階梯對照板`;
  if (!state.childrenReady) {
    return { heading, gridClass: ladderGridClass(maxScore), html: `<div class="text-slate-600 font-bold">正在載入扣分階梯…</div>` };
  }
  const criteria = [...state.criteria].sort(byNewest);
  let html = "";
  for (let deduction = 0; deduction <= maxScore; deduction += 1) {
    const info = getDeductionBadgeInfo(deduction, maxScore);
    const rules = criteria.filter((item) => Number(item.deduction) === deduction);
    const cards = rules.length
      ? rules.map((rule) => `
          <article class="animate-card ${info.cardBorder} border-2 rounded-2xl p-4 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="inline-block bg-white text-slate-900 border border-slate-300 font-black text-xs sm:text-sm px-2.5 py-0.5 rounded-lg">${escapeHtml(rule.sourceLabel || "標準")}</span>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" data-action="open-edit" data-type="rule" data-id="${escapeHtml(rule.id)}" class="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-sm px-2.5 py-1 rounded-xl cursor-pointer">✏️ 修改／調整扣分</button>
                <button type="button" data-action="ask-delete" data-type="rule" data-id="${escapeHtml(rule.id)}" class="bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm px-2.5 py-1 rounded-xl cursor-pointer" title="刪除此判例">🗑️</button>
              </div>
            </div>
            <div class="text-[17px] sm:text-[18px] font-bold text-slate-900 leading-snug break-words">${escapeHtml(rule.text)}</div>
            ${rule.reason ? `<div class="text-sm sm:text-base font-bold text-slate-700 bg-white/90 px-3 py-2 rounded-xl border border-slate-200/80">💡 ${escapeHtml(rule.reason)}</div>` : ""}
            ${rule.note ? `<div class="inline-block bg-white text-slate-600 border border-slate-200 font-bold text-xs sm:text-sm px-2.5 py-0.5 rounded-lg">🏷️ 備註：${escapeHtml(rule.note)}</div>` : ""}
            ${rule.createdBy && rule.source !== "seed" ? `<div class="text-xs font-bold text-slate-500">${escapeHtml(rule.createdBy.displayName || "")}${rule.createdAt ? ` · ${escapeHtml(formatTime(rule.createdAt))}` : ""}</div>` : ""}
            ${photoHtml(rule.photo, "rule", rule.id)}
            ${changelogHtml(rule.changelog)}
          </article>
        `).join("")
      : `
        <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-1.5">
          <div class="text-base font-bold text-slate-500">暫未有「${info.shortLabel}」標準或判例</div>
          <p class="text-sm text-slate-400">可直接新增，或透過上載學生答案歸類。</p>
        </div>
      `;
    html += `
      <div class="bg-white border-2 border-slate-200 rounded-3xl overflow-hidden flex flex-col">
        <div class="${info.headerBg} border-b-2 px-5 py-4 flex items-start justify-between gap-2">
          <div>
            <h4 class="text-lg sm:text-xl font-black leading-snug">${info.colTitle}</h4>
            <p class="text-sm font-bold opacity-85 mt-0.5">${info.colSubtitle}</p>
          </div>
          <span class="${info.badgeBg} font-black text-sm px-3 py-1 rounded-full shrink-0">${rules.length} 項</span>
        </div>
        <div class="p-4 sm:p-5 space-y-3.5">
          ${cards}
          <button type="button" data-action="open-direct" data-deduction="${deduction}" class="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/60 text-slate-600 hover:text-blue-900 font-black text-base cursor-pointer">➕ 在【${info.shortLabel}】新增標準</button>
        </div>
      </div>
    `;
  }
  return { heading, gridClass: ladderGridClass(maxScore), html };
}

export function deductionChoicesHtml(maxScore, selected, action) {
  let html = "";
  for (let deduction = 0; deduction <= maxScore; deduction += 1) {
    const info = getDeductionBadgeInfo(deduction, maxScore);
    const isSelected = Number(selected) === deduction;
    const buttonClass = action === "select-track-b"
      ? (isSelected ? "bg-amber-600 text-white border-amber-800 shadow-sm" : "bg-white hover:bg-amber-100 text-slate-800 border-slate-300")
      : (isSelected ? info.btnActive : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300");
    html += `<button type="button" data-action="${action}" data-deduction="${deduction}" class="w-full px-3.5 py-2.5 rounded-xl font-black text-base border-2 transition text-left cursor-pointer ${buttonClass}">${info.fullLabel}</button>`;
  }
  return html;
}

export function uploadPillsHtml(state) {
  return [...state.parts].sort(byOrder).map((part, index) => {
    const selected = part.id === state.activeSubPartId;
    return `<button type="button" data-action="switch-part" data-id="${escapeHtml(part.id)}" class="px-4 py-2 rounded-xl font-black text-base border-2 cursor-pointer ${
      selected ? "bg-blue-700 text-white border-blue-800" : "bg-white hover:bg-blue-100 text-slate-800 border-blue-200"
    }">第 ${index + 1} 部分：${escapeHtml(part.name)}（佔 ${part.maxScore} 分）</button>`;
  }).join("");
}

export function showToast(message, type = "info") {
  const area = document.getElementById("toast-area");
  if (!area) return;
  const toast = document.createElement("div");
  const colors = {
    success: "bg-emerald-900 text-white border-emerald-400",
    warning: "bg-amber-900 text-amber-50 border-amber-400",
    info: "bg-slate-900 text-white border-blue-400",
  };
  toast.className = `pointer-events-auto border-2 rounded-2xl px-5 py-3.5 shadow-2xl text-base sm:text-lg font-black text-center ${colors[type] || colors.info}`;
  toast.textContent = message;
  area.appendChild(toast);
  setTimeout(() => toast.remove(), 3400);
}

export function fillBoard(state) {
  const tabs = document.getElementById("question-tabs-container");
  const subTabs = document.getElementById("subpart-tabs-container");
  const title = document.getElementById("banner-q-title");
  const total = document.getElementById("banner-q-totalscore");
  const summary = document.getElementById("banner-q-subparts-summary");
  const content = document.getElementById("banner-q-content");
  const status = document.getElementById("board-status");
  const syncLabel = document.getElementById("sync-label");
  if (!tabs || !title) return;

  const question = state.questions.find((item) => item.id === state.activeQuestionId) || null;
  const parts = [...state.parts].sort(byOrder);
  tabs.innerHTML = state.questionsReady ? renderQuestionTabsHtml(state) : "";
  if (syncLabel) syncLabel.textContent = state.questionsReady && !state.error ? "即時同步中" : "連線中";

  const empty = document.getElementById("empty-wall");
  const bannerSection = document.getElementById("question-banner");
  const pendingSection = document.getElementById("pending-votes-section");
  const ladderSection = document.getElementById("ladder-section");
  const showEmpty = state.questionsReady && !state.error && state.questions.length === 0;
  if (empty) empty.hidden = !showEmpty;
  [bannerSection, pendingSection, ladderSection].forEach((section) => {
    if (section) section.hidden = showEmpty;
  });
  if (status) {
    if (state.error) {
      status.hidden = false;
      status.textContent = state.error;
      status.className = "bg-rose-50 border-2 border-rose-300 text-rose-950 rounded-2xl px-4 py-3 font-bold";
    } else if (!state.questionsReady) {
      status.hidden = false;
      status.textContent = "正在載入準則牆…";
      status.className = "bg-white border-2 border-slate-200 text-slate-700 rounded-2xl px-4 py-3 font-bold";
    } else {
      status.hidden = true;
      status.textContent = "";
    }
  }

  if (!question) {
    title.textContent = "未有題目";
    total.textContent = "";
    summary.textContent = "";
    content.textContent = "";
    if (subTabs) subTabs.innerHTML = "";
  } else {
    title.textContent = question.title || "";
    total.textContent = state.partsReady ? `共 ${questionTotalScore(parts)} 分` : "載入中";
    summary.textContent = state.partsReady
      ? parts.map((part, index) => `第 ${index + 1} 部分：${part.name} (${part.maxScore}分)`).join(" ＋ ")
      : "正在載入分部…";
    content.textContent = question.content || "";
    if (subTabs) subTabs.innerHTML = state.partsReady ? renderSubpartTabsHtml(state) : "";
  }
  const deleteSlot = document.getElementById("question-delete-slot");
  if (deleteSlot) {
    deleteSlot.innerHTML = question && canDeleteQuestion(state.user, question)
      ? `<button type="button" data-action="ask-delete-question" data-id="${escapeHtml(question.id)}" class="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-sm px-3 py-1.5 rounded-xl cursor-pointer">🗑️ 刪除呢條題目</button>`
      : "";
  }

  const pending = renderPendingHtml(state);
  const pendingLabel = document.getElementById("pending-subpart-label");
  const pendingCount = document.getElementById("pending-count-badge");
  const pendingBox = document.getElementById("pending-votes-container");
  if (pendingLabel) pendingLabel.textContent = pending.label || "";
  if (pendingCount) {
    pendingCount.textContent = pending.countText || "";
    pendingCount.className = pending.empty
      ? "bg-slate-200 text-slate-700 font-black text-base px-3.5 py-1 rounded-full"
      : "bg-amber-400 text-slate-950 font-black text-base px-3.5 py-1 rounded-full";
  }
  if (pendingBox) pendingBox.innerHTML = pending.html || "";

  const ladder = renderLadderHtml(state);
  const ladderHeading = document.getElementById("ladder-section-heading");
  const ladderBox = document.getElementById("deduction-columns-container");
  if (ladderHeading) ladderHeading.textContent = ladder.heading || "";
  if (ladderBox) {
    ladderBox.className = ladder.gridClass || "grid grid-cols-1 lg:grid-cols-3 gap-6 items-start";
    ladderBox.innerHTML = ladder.html || "";
  }

  const banner = document.getElementById("consensus-banner");
  const bannerText = document.getElementById("consensus-banner-text");
  if (banner && bannerText) {
    if (state.banner) {
      banner.classList.remove("hidden");
      bannerText.textContent = state.banner;
    } else {
      banner.classList.add("hidden");
    }
  }
}
