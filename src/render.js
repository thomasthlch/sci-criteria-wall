import {
  byNewest,
  byOrder,
  canDeleteQuestion,
  escapeHtml,
  formatTime,
  getDeductionBadgeInfo,
  defaultDeductAmounts,
  ladderGridClass,
  partChipLabel,
  questionTotalScore,
  showPartPicker,
  showPendingPanel,
  visibleDeductAmounts,
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
        <span>📌 ${escapeHtml(partChipLabel(part, index))}</span>
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
  return `<details class="text-xs text-slate-400"><summary class="cursor-pointer">修改紀錄</summary><ul class="mt-1 space-y-0.5 list-disc pl-4">${items}</ul></details>`;
}

function partAttr(state) {
  return escapeHtml(state.activeSubPartId || "");
}

function voteButtonsHtml(item, maxScore, state) {
  let html = "";
  for (let deduction = 0; deduction <= maxScore; deduction += 1) {
    const info = getDeductionBadgeInfo(deduction, maxScore);
    html += `
      <button type="button" data-action="cast-vote" data-part-id="${partAttr(state)}" data-id="${escapeHtml(item.id)}" data-deduction="${deduction}" class="w-full py-3 px-4 rounded-xl font-black text-base sm:text-lg border-b-4 transition text-left flex items-center justify-between cursor-pointer ${info.btnVote}">
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
  const label = state.parts.length > 1 ? partChipLabel(part, partIndex) : "";
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
          <div class="text-sm sm:text-base font-bold text-slate-600">🎉${label ? `「${escapeHtml(label)}」` : ""}暫時冇待投票擬問。遇到唔肯定扣幾分嘅作答，可以上載答案放上嚟投票。</div>
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
                  <button type="button" data-action="open-edit" data-part-id="${partAttr(state)}" data-type="pending" data-id="${escapeHtml(item.id)}" class="bg-white hover:bg-amber-100 text-slate-800 border border-amber-300 font-bold text-sm px-2.5 py-1.5 rounded-xl cursor-pointer">✏️ 修改</button>
                  <button type="button" data-action="ask-delete" data-part-id="${partAttr(state)}" data-type="pending" data-id="${escapeHtml(item.id)}" class="bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm px-2.5 py-1.5 rounded-xl cursor-pointer" title="刪除此項目">🗑️</button>
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
              <div class="flex flex-col gap-2">${voteButtonsHtml(item, Number(part.maxScore) || 0, state)}</div>
              ${changelogHtml(item.changelog)}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
  return { label, countText: `${cases.length} 題待投票`, empty: false, html };
}

function criterionMeta(rule) {
  const when = formatTime(rule.createdAt).replace(/:\d{2}$/, "");
  const label = rule.sourceLabel || rule.createdBy?.displayName || "";
  if (rule.source === "seed") return label;
  return [label, when].filter(Boolean).join(" · ");
}

export function renderLadderHtml(state) {
  const part = state.parts.find((item) => item.id === state.activeSubPartId);
  if (!part) return { heading: "", html: "" };
  const maxScore = Number(part.maxScore) || 0;
  if (!state.childrenReady) {
    return { heading: "", gridClass: ladderGridClass(1), html: `<div class="text-sm text-slate-500 font-bold">正在載入扣分欄…</div>` };
  }
  const criteria = [...state.criteria].sort(byNewest);
  const defaults = new Set(defaultDeductAmounts(maxScore));
  const amounts = visibleDeductAmounts(maxScore, criteria);
  const tight = amounts.length > defaults.size;
  let html = "";
  for (const deduction of amounts) {
    const info = getDeductionBadgeInfo(deduction, maxScore);
    const actual = Math.max(0, maxScore - deduction);
    const rules = criteria.filter((item) => Number(item.deduction) === deduction);
    const mark = deduction === 0 ? "🟢" : deduction >= maxScore ? "🔴" : "🟡";
    const cards = rules.length
      ? rules.map((rule) => `
          <article id="criterion-${escapeHtml(rule.id)}" tabindex="-1" class="animate-card ${info.cardBorder} border rounded-xl p-2.5 space-y-1 scroll-mt-24 outline-none">
            <div class="text-[15px] sm:text-base font-bold text-slate-900 leading-snug break-words">${escapeHtml(rule.text)}</div>
            ${rule.reason ? `<div class="text-xs sm:text-sm text-slate-600 leading-snug">💡 ${escapeHtml(rule.reason)}</div>` : ""}
            ${rule.note ? `<div class="text-xs text-slate-500">🏷️ ${escapeHtml(rule.note)}</div>` : ""}
            <div class="flex items-center justify-between gap-2 pt-0.5">
              <div class="min-w-0 text-[11px] leading-tight text-slate-400 truncate">${escapeHtml(criterionMeta(rule))}</div>
              <div class="flex items-center shrink-0">
                <button type="button" data-action="open-edit" data-part-id="${partAttr(state)}" data-type="rule" data-id="${escapeHtml(rule.id)}" class="text-slate-500 hover:text-slate-900 font-bold text-sm px-1.5 py-0.5 rounded-lg cursor-pointer" title="修改／調整扣分" aria-label="修改／調整扣分">✏️</button>
                <button type="button" data-action="ask-delete" data-part-id="${partAttr(state)}" data-type="rule" data-id="${escapeHtml(rule.id)}" class="text-rose-500 hover:text-rose-700 font-bold text-sm px-1.5 py-0.5 rounded-lg cursor-pointer" title="刪除此判例" aria-label="刪除此判例">🗑️</button>
              </div>
            </div>
            ${photoHtml(rule.photo, "rule", rule.id)}
            ${changelogHtml(rule.changelog)}
          </article>
        `).join("")
      : `<div class="border border-dashed border-slate-200 rounded-xl px-3 py-3 text-center text-sm text-slate-400">未有${info.shortLabel}</div>`;
    html += `
      <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
        <div class="${info.headerBg} border-b px-3 py-2 flex items-center justify-between gap-2">
          <h4 class="text-sm sm:text-base font-black leading-tight">${mark} ${info.shortLabel} · ${actual}/${maxScore}</h4>
          <span class="${info.badgeBg} font-black text-xs px-2 py-0.5 rounded-full shrink-0">${rules.length}</span>
        </div>
        <div class="p-2.5 space-y-2">
          ${cards}
          <button type="button" data-action="open-direct" data-part-id="${partAttr(state)}" data-deduction="${deduction}" class="w-full py-1.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/60 text-slate-500 hover:text-blue-900 font-bold text-sm cursor-pointer">＋ ${info.shortLabel}</button>
        </div>
      </div>
    `;
  }
  return { heading: "", gridClass: ladderGridClass(amounts.length, tight), html };
}

export function renderPartsStack(state) {
  const parts = [...(state.parts || [])].sort(byOrder);
  if (!parts.length) return "";
  return parts.map((part, index) => {
    const board = state.boards?.[part.id];
    const local = {
      ...state,
      activeSubPartId: part.id,
      criteria: board?.criteria || (part.id === state.activeSubPartId ? state.criteria : []),
      cases: board?.cases || (part.id === state.activeSubPartId ? state.cases : []),
      hints: board?.hints || (part.id === state.activeSubPartId ? state.hints : []),
      childrenReady: board ? !!board.ready : part.id === state.activeSubPartId && !!state.childrenReady,
    };
    const pendingCount = local.childrenReady ? local.cases.length : Number(part.pendingCount || 0);
    const pending = renderPendingHtml(local);
    const ladder = renderLadderHtml(local);
    const showPending = showPendingPanel({ folded: state.folded !== false, pendingCount });
    const heading = parts.length > 1
      ? `<h3 class="text-base sm:text-lg font-black text-slate-900">${escapeHtml(partChipLabel(part, index))}</h3>`
      : "";
    return `
      <section id="part-section-${escapeHtml(part.id)}" class="space-y-3">
        ${heading}
        ${showPending && pending && pending.html ? `
          <section class="bg-white border border-amber-300 rounded-3xl overflow-hidden">
            <div class="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-black text-amber-950">🟡 待投票擬問${pending.label ? ` · ${escapeHtml(pending.label)}` : ""}</h3>
              <span class="${pending.empty ? "bg-slate-200 text-slate-700" : "bg-amber-400 text-slate-950"} font-black text-sm px-3 py-1 rounded-full">${escapeHtml(pending.countText || "")}</span>
            </div>
            <div class="p-3 sm:p-4">${pending.html}</div>
          </section>
        ` : ""}
        <div class="${ladder.gridClass}">${ladder.html}</div>
      </section>
    `;
  }).join("");
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
  if (bannerSection) bannerSection.hidden = showEmpty;
  if (ladderSection) ladderSection.hidden = showEmpty;
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

  const folded = state.folded !== false;
  const foldBody = document.getElementById("banner-fold");
  const foldToggle = document.getElementById("fold-toggle");
  const partPicker = document.getElementById("part-picker");
  if (foldBody) foldBody.hidden = folded;
  if (foldToggle) {
    foldToggle.textContent = folded ? "展開題幹" : "收起題幹";
    foldToggle.setAttribute("aria-expanded", folded ? "false" : "true");
  }
  if (partPicker) partPicker.hidden = !showPartPicker(parts.length);
  if (!question) {
    title.textContent = "未有題目";
    total.textContent = "";
    summary.textContent = "";
    if (summary) summary.hidden = true;
    content.textContent = "";
    if (subTabs) subTabs.innerHTML = "";
  } else {
    title.textContent = question.title || "";
    total.textContent = state.partsReady ? `共 ${questionTotalScore(parts)} 分` : "載入中";
    const severalParts = showPartPicker(parts.length);
    if (summary) {
      summary.hidden = !severalParts;
      summary.textContent = severalParts
        ? parts.map((part, index) => partChipLabel(part, index)).join(" ＋ ")
        : "";
    }
    content.textContent = question.content || "";
    if (subTabs) subTabs.innerHTML = state.partsReady && severalParts ? renderSubpartTabsHtml(state) : "";
  }
  const deleteSlot = document.getElementById("question-delete-slot");
  if (deleteSlot) {
    deleteSlot.innerHTML = question && canDeleteQuestion(state.user, question)
      ? `<button type="button" data-action="ask-delete-question" data-id="${escapeHtml(question.id)}" class="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-sm px-3 py-1.5 rounded-xl cursor-pointer">🗑️ 刪除呢條題目</button>`
      : "";
  }

  const stack = document.getElementById("parts-stack");
  if (pendingSection) pendingSection.hidden = true;
  if (stack) {
    stack.hidden = showEmpty;
    stack.innerHTML = showEmpty ? "" : renderPartsStack(state);
  }

  const ladder = renderLadderHtml(state);
  const ladderHeading = document.getElementById("ladder-section-heading");
  const ladderBox = document.getElementById("deduction-columns-container");
  if (ladderHeading) {
    ladderHeading.textContent = ladder.heading || "";
    ladderHeading.classList.toggle("hidden", !ladder.heading);
  }
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
