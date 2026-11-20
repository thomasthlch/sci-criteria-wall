import { deleteStoredPhoto, uploadCasePhoto } from "./images.js";
import {
  byNewest,
  byOrder,
  canDeleteQuestion,
  clampDeduction,
  FOLD_STORAGE_KEY,
  clampMaxScore,
  consensusBannerText,
  escapeHtml,
  explainDataError,
  findSimilarCase,
  getDeductionBadgeInfo,
  safeHttpsUrl,
  similarCriteria,
} from "./logic.js";
import {
  deductionChoicesHtml,
  fillBoard,
  showToast,
  uploadPillsHtml,
} from "./render.js";
import {
  addCase,
  addCriterion,
  castVote,
  createQuestion,
  deleteCase,
  deleteCriterion,
  deleteQuestion,
  saveQuestionEdits,
  updateCase,
  updateCriterion,
} from "./store.js";

let state = null;
let sync = null;

const ui = {
  busy: false,
  trackA: 0,
  trackB: 1,
  directDeduction: 0,
  photoFile: null,
  photoUrl: "",
  edit: null,
  confirm: null,
  qMode: "create",
  qParts: [],
};

export function initActions(appState, syncApi) {
  state = appState;
  sync = syncApi;
}

function activePart() {
  return state.parts.find((part) => part.id === state.activeSubPartId) || null;
}

function persistSelection() {
  localStorage.setItem("sci_criteria_wall_selection", JSON.stringify({
    activeQuestionId: state.activeQuestionId,
    activeSubPartId: state.activeSubPartId,
  }));
}

function refreshBoard() {
  fillBoard(state);
  syncOpenModals();
}

export function syncOpenModals() {
  const upload = document.getElementById("upload-modal");
  if (upload && !upload.classList.contains("hidden")) renderUploadChoices();
  const direct = document.getElementById("direct-text-modal");
  if (direct && !direct.classList.contains("hidden")) renderDirectChoices();
}

function renderUploadChoices() {
  const part = activePart();
  const pills = document.getElementById("upload-subpart-pills");
  if (pills) pills.innerHTML = uploadPillsHtml(state);
  if (!part) return;
  ui.trackA = clampDeduction(ui.trackA, part.maxScore);
  ui.trackB = clampDeduction(ui.trackB, part.maxScore);
  const trackA = document.getElementById("track-a-deduction-buttons");
  const trackB = document.getElementById("track-b-init-deductions");
  if (trackA) trackA.innerHTML = deductionChoicesHtml(part.maxScore, ui.trackA, "select-track-a");
  if (trackB) trackB.innerHTML = deductionChoicesHtml(part.maxScore, ui.trackB, "select-track-b");
  checkDuplicate();
}

function renderDirectChoices() {
  const part = activePart();
  const question = state.questions.find((item) => item.id === state.activeQuestionId);
  if (!part || !question) return;
  const index = [...state.parts].sort(byOrder).findIndex((item) => item.id === part.id);
  const banner = document.getElementById("direct-text-subpart-banner");
  if (banner) banner.textContent = `📌 新增至：第 ${index + 1} 部分「${part.name}（佔 ${part.maxScore} 分）」`;
  ui.directDeduction = clampDeduction(ui.directDeduction, part.maxScore);
  const box = document.getElementById("direct-text-deduction-buttons");
  if (box) box.innerHTML = deductionChoicesHtml(part.maxScore, ui.directDeduction, "select-direct-deduction");
}

function clearPhoto() {
  if (ui.photoUrl) URL.revokeObjectURL(ui.photoUrl);
  ui.photoFile = null;
  ui.photoUrl = "";
  const preview = document.getElementById("modal-photo-preview");
  if (preview) preview.innerHTML = `<div class="text-slate-500 font-bold p-6 text-center">未上載相片。可以只填文字。</div>`;
}

export function openUpload() {
  if (!activePart()) {
    showToast("請先等分部載入，或先新增題目。", "warning");
    return;
  }
  const modal = document.getElementById("upload-modal");
  const opening = modal.classList.contains("hidden");
  if (opening) {
    ui.trackA = 0;
    ui.trackB = Math.min(1, Number(activePart().maxScore) || 0);
    clearPhoto();
    document.getElementById("real-photo-input").value = "";
    document.getElementById("converted-textarea").value = "";
    document.getElementById("optional-note-input").value = "";
    document.getElementById("track-a-reason-input").value = "";
    document.getElementById("vote-question-input").value = "";
    document.getElementById("duplicate-alert-box").classList.add("hidden");
    clearSimilarBox("upload-similar");
  }
  modal.classList.remove("hidden");
  renderUploadChoices();
}

function closeUpload() {
  document.getElementById("upload-modal").classList.add("hidden");
  clearPhoto();
}

export async function usePhoto(file) {
  if (!file) return;
  if (!String(file.type || "").startsWith("image/")) {
    showToast("請上載圖片檔案。", "warning");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast("相片太大，請用 12MB 以下的圖片。", "warning");
    return;
  }
  try {
    const blob = file;
    if (ui.photoUrl) URL.revokeObjectURL(ui.photoUrl);
    ui.photoFile = blob;
    ui.photoUrl = URL.createObjectURL(blob);
    const preview = document.getElementById("modal-photo-preview");
    preview.innerHTML = `<img src="${escapeHtml(ui.photoUrl)}" alt="學生答案相片預覽" class="w-full max-h-[220px] object-contain" />`;
    showToast("已載入相片。請自行輸入或修改答案文字。", "info");
  } catch (error) {
    showToast(error.message || "未能讀取相片。", "warning");
  }
}

function checkDuplicate() {
  const box = document.getElementById("duplicate-alert-box");
  const text = document.getElementById("converted-textarea")?.value || "";
  const part = activePart();
  if (!box || !part) return;
  const match = findSimilarCase(
    text,
    [...state.hints].sort(byNewest),
    [...state.cases].sort(byNewest),
  );
  if (!match) {
    box.classList.add("hidden");
    return;
  }
  const heading = document.getElementById("duplicate-alert-heading");
  const content = document.getElementById("duplicate-alert-content");
  const accept = document.getElementById("duplicate-accept-btn");
  if (match.kind === "hint") {
    const info = getDeductionBadgeInfo(Number(match.item.deduction) || 0, Number(part.maxScore) || 0);
    heading.textContent = `💡 等陣！之前已經有類似答案定案（歸類為 ${info.shortLabel}）`;
    content.innerHTML = `<div>已有先例：${escapeHtml(match.item.matchedText || "")}</div><div class="text-rose-700 mt-1">→ ${escapeHtml(match.item.reason || "")}</div>`;
    accept.textContent = `👍 明白，跟返 ${info.shortLabel} 標準`;
  } else {
    const author = match.item.author?.displayName || "有老師";
    heading.textContent = "💡 等陣！呢個答案已經放咗上去「待投票擬問」";
    content.innerHTML = `<div>${escapeHtml(author)}已經發起投票：「${escapeHtml(match.item.text || "")}」</div><div class="text-amber-900 mt-1">→ 你可以關閉視窗，去待投票區幫手投票。</div>`;
    accept.textContent = "👍 明白，去投票區幫手投票";
  }
  box.classList.remove("hidden");
}

let similarTimer = 0;

function clearSimilarBox(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.classList.add("hidden");
  box.innerHTML = "";
}

function paintSimilarCriteria(boxId, text) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const matches = similarCriteria(text, state.criteria);
  if (!matches.length) {
    clearSimilarBox(boxId);
    return;
  }
  const part = activePart();
  const maxScore = Number(part?.maxScore) || 0;
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="text-sm font-black text-amber-950">已有相近標準（仍可新增）</div>
    ${matches.map(({ item }) => {
      const info = getDeductionBadgeInfo(Number(item.deduction) || 0, maxScore);
      return `<button type="button" data-action="focus-criterion" data-id="${escapeHtml(item.id)}" class="w-full text-left bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3 py-2 cursor-pointer">
        <div class="text-sm font-bold text-slate-900 leading-snug">${escapeHtml(item.text || "")}</div>
        <div class="text-xs font-bold text-amber-900 mt-0.5">${info.shortLabel} · 去睇呢條</div>
      </button>`;
    }).join("")}
  `;
}

function scheduleSimilarCriteria(boxId, text) {
  window.clearTimeout(similarTimer);
  similarTimer = window.setTimeout(() => paintSimilarCriteria(boxId, text), 250);
}

function focusCriterion(id) {
  closeDirect();
  closeUpload();
  window.setTimeout(() => {
    const card = document.getElementById(`criterion-${id}`);
    if (!card) {
      showToast("搵唔到呢條標準。", "warning");
      return;
    }
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("ring-4", "ring-blue-400");
    card.focus({ preventScroll: true });
    window.setTimeout(() => card.classList.remove("ring-4", "ring-blue-400"), 1800);
  }, 0);
}

function openDirect(deduction) {
  const part = activePart();
  if (!part) {
    showToast("請先等分部載入。", "warning");
    return;
  }
  ui.directDeduction = clampDeduction(deduction ?? 0, part.maxScore);
  document.getElementById("direct-text-content").value = "";
  document.getElementById("direct-text-reason").value = "";
  clearSimilarBox("direct-similar");
  document.getElementById("direct-text-modal").classList.remove("hidden");
  renderDirectChoices();
}

function closeDirect() {
  document.getElementById("direct-text-modal").classList.add("hidden");
}

function renderQuestionForm() {
  const total = ui.qParts.reduce((sum, part) => sum + clampMaxScore(part.maxScore), 0);
  document.getElementById("q-form-total-badge").textContent = `自動加總：共 ${total} 分`;
  document.getElementById("q-form-subparts-list").innerHTML = ui.qParts.map((part, index) => `
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-white border-2 border-slate-300 p-3.5 rounded-2xl">
      <span class="bg-blue-100 text-blue-950 font-black text-base px-3 py-2 rounded-xl shrink-0 text-center">第 ${index + 1} 部分</span>
      <input data-input="part-name" data-index="${index}" type="text" value="${escapeHtml(part.name)}" placeholder="部分名稱（例如：相同點）" class="flex-1 bg-slate-50 border-2 border-slate-300 focus:border-blue-500 text-base sm:text-lg font-bold px-3.5 py-2 rounded-xl focus:outline-none" />
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-base font-bold text-slate-600">佔分：</span>
        <select data-change="part-score" data-index="${index}" class="bg-blue-50 border-2 border-blue-400 text-blue-950 font-black text-base px-3 py-2 rounded-xl cursor-pointer">
          ${[1, 2, 3, 4].map((score) => `<option value="${score}" ${Number(part.maxScore) === score ? "selected" : ""}>${score} 分</option>`).join("")}
        </select>
        ${ui.qParts.length > 1 ? `<button type="button" data-action="remove-part-row" data-index="${index}" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-base px-3 py-2 rounded-xl cursor-pointer">🗑️</button>` : ""}
      </div>
    </div>
  `).join("");
}

function openQuestion(mode) {
  ui.qMode = mode;
  const heading = document.getElementById("q-modal-heading");
  if (mode === "create") {
    heading.textContent = "➕ 新增題目與設定分部";
    document.getElementById("q-form-title").value = `第 ${state.questions.length + 1} 題：`;
    document.getElementById("q-form-content").value = "";
    ui.qParts = [
      { id: `sp_${crypto.randomUUID()}`, name: "第 1 部分", maxScore: 2 },
      { id: `sp_${crypto.randomUUID()}`, name: "第 2 部分", maxScore: 2 },
    ];
  } else {
    const question = state.questions.find((item) => item.id === state.activeQuestionId);
    if (!question || !state.parts.length) {
      showToast("請先選好要修改嘅題目。", "warning");
      return;
    }
    heading.textContent = `✏️ 修改題目與分部（${question.title}）`;
    document.getElementById("q-form-title").value = question.title || "";
    document.getElementById("q-form-content").value = question.content || "";
    ui.qParts = [...state.parts].sort(byOrder).map((part) => ({
      id: part.id,
      name: part.name,
      maxScore: part.maxScore,
    }));
  }
  renderQuestionForm();
  document.getElementById("question-modal").classList.remove("hidden");
}

function closeQuestion() {
  document.getElementById("question-modal").classList.add("hidden");
}

function openEdit(type, id) {
  const part = activePart();
  if (!part) return;
  const list = type === "pending" ? state.cases : state.criteria;
  const item = list.find((entry) => entry.id === id);
  if (!item) return;
  ui.edit = { type, id, deduction: Number(item.deduction) || 0 };
  const deductionWrap = document.getElementById("edit-entry-deduction-wrapper");
  const reasonWrap = document.getElementById("edit-entry-reason-wrapper");
  const questionWrap = document.getElementById("edit-entry-question-wrapper");
  if (type === "pending") {
    document.getElementById("edit-entry-title").textContent = "✏️ 修改待投票擬問內容";
    deductionWrap.classList.add("hidden");
    reasonWrap.classList.add("hidden");
    questionWrap.classList.remove("hidden");
    document.getElementById("edit-entry-question").value = item.question || "";
  } else {
    document.getElementById("edit-entry-title").textContent = "✏️ 修改內容／調整扣分等級";
    deductionWrap.classList.remove("hidden");
    reasonWrap.classList.remove("hidden");
    questionWrap.classList.add("hidden");
    document.getElementById("edit-entry-reason").value = item.reason || "";
    document.getElementById("edit-entry-deduction-buttons").innerHTML = deductionChoicesHtml(
      part.maxScore,
      ui.edit.deduction,
      "select-edit-deduction",
    );
  }
  document.getElementById("edit-entry-text").value = item.text || "";
  document.getElementById("edit-entry-note").value = item.note || "";
  document.getElementById("edit-entry-modal").classList.remove("hidden");
}

function closeEdit() {
  document.getElementById("edit-entry-modal").classList.add("hidden");
  ui.edit = null;
}

function openPhoto(type, id) {
  const list = type === "pending" ? state.cases : state.criteria;
  const item = list.find((entry) => entry.id === id);
  const url = safeHttpsUrl(item?.photo?.downloadURL);
  if (!url) return;
  document.getElementById("viewer-photo-container").innerHTML = `<img src="${escapeHtml(url)}" alt="學生答案相片" class="w-full max-h-[460px] object-contain" />`;
  document.getElementById("viewer-caption").textContent = item.text || "";
  document.getElementById("photo-viewer-modal").classList.remove("hidden");
}

function closePhoto() {
  document.getElementById("photo-viewer-modal").classList.add("hidden");
}

function openConfirm(title, description, onConfirm) {
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-desc").textContent = description;
  ui.confirm = onConfirm;
  document.getElementById("custom-confirm-modal").classList.remove("hidden");
}

function closeConfirm() {
  document.getElementById("custom-confirm-modal").classList.add("hidden");
  ui.confirm = null;
}

async function withBusy(work) {
  if (ui.busy) return;
  ui.busy = true;
  try {
    await work();
  } catch (error) {
    console.error(error);
    const coded = error?.code === "permission-denied" || error?.code === "unavailable" || error?.code === "unauthenticated";
    showToast(coded ? explainDataError(error) : (error?.message || explainDataError(error)), "warning");
  } finally {
    ui.busy = false;
  }
}

async function uploadCurrentPhoto() {
  if (!ui.photoFile) return null;
  return uploadCasePhoto(state.user.uid, ui.photoFile);
}

function switchQuestion(id) {
  if (!id || id === state.activeQuestionId) return;
  state.activeQuestionId = id;
  state.activeSubPartId = "";
  state.banner = "";
  persistSelection();
  sync.watchParts(id);
  refreshBoard();
}

function activatePart(id) {
  if (!id || id === state.activeSubPartId) return;
  state.activeSubPartId = id;
  const board = state.boards?.[id];
  if (board) {
    state.criteria = board.criteria || [];
    state.cases = board.cases || [];
    state.hints = board.hints || [];
    state.childrenReady = !!board.ready;
  }
  persistSelection();
}

function switchPart(id) {
  if (!id || id === state.activeSubPartId) return;
  state.banner = "";
  activatePart(id);
  refreshBoard();
}

export function onInput(element) {
  if (element.dataset.input === "part-name") {
    const index = Number(element.dataset.index);
    if (ui.qParts[index]) ui.qParts[index].name = element.value;
  }
  if (element.dataset.input === "answer-text") {
    checkDuplicate();
    scheduleSimilarCriteria("upload-similar", element.value);
  }
  if (element.dataset.input === "criterion-text") scheduleSimilarCriteria("direct-similar", element.value);
}

export function onChange(element) {
  if (element.dataset.change === "part-score") {
    const index = Number(element.dataset.index);
    if (ui.qParts[index]) ui.qParts[index].maxScore = clampMaxScore(element.value);
    renderQuestionForm();
  }
}

export function onClick(element, event) {
  if (element.dataset.backdrop === "true" && event.target !== element) return;
  if (element.dataset.partId) activatePart(element.dataset.partId);
  const action = element.dataset.action;
  if (action === "switch-question") switchQuestion(element.dataset.id);
  if (action === "switch-part") switchPart(element.dataset.id);
  if (action === "hide-banner") {
    state.banner = "";
    refreshBoard();
  }
  if (action === "focus-criterion") focusCriterion(element.dataset.id);
  if (action === "toggle-fold") {
    state.folded = !state.folded;
    localStorage.setItem(FOLD_STORAGE_KEY, state.folded ? "1" : "0");
    refreshBoard();
  }
  if (action === "pick-photo") document.getElementById("real-photo-input").click();
  if (action === "open-upload" || action === "close-upload") {
    if (action === "open-upload") openUpload();
    else closeUpload();
  }
  if (action === "open-direct") openDirect(Number(element.dataset.deduction || 0));
  if (action === "close-direct") closeDirect();
  if (action === "open-question") openQuestion(element.dataset.mode || "create");
  if (action === "close-question") closeQuestion();
  if (action === "select-track-a") {
    ui.trackA = Number(element.dataset.deduction);
    renderUploadChoices();
  }
  if (action === "select-track-b") {
    ui.trackB = Number(element.dataset.deduction);
    renderUploadChoices();
  }
  if (action === "select-direct-deduction") {
    ui.directDeduction = Number(element.dataset.deduction);
    renderDirectChoices();
  }
  if (action === "select-edit-deduction" && ui.edit) {
    ui.edit.deduction = Number(element.dataset.deduction);
    const part = activePart();
    document.getElementById("edit-entry-deduction-buttons").innerHTML = deductionChoicesHtml(
      part?.maxScore || 0,
      ui.edit.deduction,
      "select-edit-deduction",
    );
  }
  if (action === "save-upload-direct") void saveUploadDirect();
  if (action === "submit-vote") void saveUploadVote();
  if (action === "save-direct-text") void saveDirect();
  if (action === "save-question") void saveQuestion();
  if (action === "add-part-row") {
    ui.qParts.push({ id: `sp_${crypto.randomUUID()}`, name: `第 ${ui.qParts.length + 1} 部分`, maxScore: 2 });
    renderQuestionForm();
  }
  if (action === "remove-part-row" && ui.qParts.length > 1) {
    ui.qParts.splice(Number(element.dataset.index), 1);
    renderQuestionForm();
  }
  if (action === "open-edit") openEdit(element.dataset.type, element.dataset.id);
  if (action === "close-edit") closeEdit();
  if (action === "save-edit") void saveEdit();
  if (action === "ask-delete") {
    const type = element.dataset.type;
    const id = element.dataset.id;
    openConfirm("確定要刪除呢一項？", "刪除後會即時從協作板上移除。", () => removeEntry(type, id));
  }
  if (action === "ask-delete-question") {
    const question = state.questions.find((item) => item.id === element.dataset.id);
    if (!canDeleteQuestion(state.user, question)) {
      showToast("只有建立呢條題目的老師，或管理員，先可以刪除。", "warning");
      return;
    }
    openConfirm(
      "確定刪除呢條題目？",
      "題目、所有分部、扣分標準、待投票個案同相片都會移除。",
      () => removeQuestion(question.id),
    );
  }
  if (action === "close-confirm") closeConfirm();
  if (action === "confirm-ok") {
    const callback = ui.confirm;
    closeConfirm();
    if (callback) void callback();
  }
  if (action === "open-photo") openPhoto(element.dataset.type, element.dataset.id);
  if (action === "close-photo") closePhoto();
  if (action === "cast-vote") void vote(element.dataset.id, Number(element.dataset.deduction));
}

async function saveUploadDirect() {
  const part = activePart();
  const text = document.getElementById("converted-textarea").value;
  if (!part) return;
  if (!text.trim()) {
    showToast("請先輸入學生答案文字。", "warning");
    return;
  }
  await withBusy(async () => {
    let photo = null;
    try {
      photo = await uploadCurrentPhoto();
      await addCriterion(state.user, state.activeQuestionId, part.id, {
        deduction: ui.trackA,
        text,
        note: document.getElementById("optional-note-input").value,
        reason: document.getElementById("track-a-reason-input").value,
        photo,
      }, { recordHint: true });
    } catch (error) {
      if (photo?.storagePath) await deleteStoredPhoto(photo.storagePath);
      throw error;
    }
    closeUpload();
    const info = getDeductionBadgeInfo(clampDeduction(ui.trackA, part.maxScore), part.maxScore);
    showToast(`✓ 已直接加入「${part.name}」的【${info.shortLabel}】欄位。`, "success");
  });
}

async function saveUploadVote() {
  const part = activePart();
  const text = document.getElementById("converted-textarea").value;
  if (!part) return;
  if (!text.trim()) {
    showToast("請先輸入學生答案文字。", "warning");
    return;
  }
  await withBusy(async () => {
    let photo = null;
    try {
      photo = await uploadCurrentPhoto();
      await addCase(state.user, state.activeQuestionId, part.id, {
        deduction: ui.trackB,
        text,
        note: document.getElementById("optional-note-input").value,
        question: document.getElementById("vote-question-input").value,
        photo,
      });
    } catch (error) {
      if (photo?.storagePath) await deleteStoredPhoto(photo.storagePath);
      throw error;
    }
    closeUpload();
    showToast(`已放上「${part.name}」的待投票擬問。另一位老師投同一個扣分就會定案。`, "info");
  });
}

async function saveDirect() {
  const part = activePart();
  const text = document.getElementById("direct-text-content").value;
  if (!part) return;
  if (!text.trim()) {
    showToast("請輸入標準或判例文字。", "warning");
    return;
  }
  await withBusy(async () => {
    const saved = await addCriterion(state.user, state.activeQuestionId, part.id, {
      deduction: ui.directDeduction,
      text,
      reason: document.getElementById("direct-text-reason").value,
      note: "",
      photo: null,
    });
    closeDirect();
    const info = getDeductionBadgeInfo(saved.deduction, part.maxScore);
    showToast(`✓ 已加入「${part.name}」的【${info.shortLabel}】欄位。`, "success");
  });
}

async function saveQuestion() {
  const title = document.getElementById("q-form-title").value.trim();
  const content = document.getElementById("q-form-content").value.trim();
  if (!title || !content) {
    showToast("請填寫題目標題及題目內容。", "warning");
    return;
  }
  if (!ui.qParts.length) return;
  await withBusy(async () => {
    const parts = ui.qParts.map((part, index) => ({
      id: part.id,
      name: part.name,
      maxScore: part.maxScore,
      order: index,
    }));
    const saved = ui.qMode === "create"
      ? await createQuestion(state.user, { title, content, parts })
      : await saveQuestionEdits(state.user, state.activeQuestionId, { title, content, parts });
    state.activeQuestionId = saved.id;
    state.activeSubPartId = saved.partId;
    state.holdSelectionUntil = Date.now() + 8000;
    persistSelection();
    sync.watchParts(saved.id);
    closeQuestion();
    showToast(ui.qMode === "create" ? `✓ 已建立「${title}」` : "✓ 已更新題目與分部設定", "success");
    refreshBoard();
  });
}

async function saveEdit() {
  if (!ui.edit) return;
  const part = activePart();
  const text = document.getElementById("edit-entry-text").value;
  if (!part) return;
  if (!text.trim()) {
    showToast("內容文字唔可以留空。", "warning");
    return;
  }
  const editing = { ...ui.edit };
  await withBusy(async () => {
    if (editing.type === "pending") {
      await updateCase(state.user, state.activeQuestionId, part.id, editing.id, {
        text,
        note: document.getElementById("edit-entry-note").value,
        question: document.getElementById("edit-entry-question").value,
      });
      showToast("✓ 已儲存擬問修改。", "success");
    } else {
      const result = await updateCriterion(state.user, state.activeQuestionId, part.id, editing.id, {
        text,
        note: document.getElementById("edit-entry-note").value,
        reason: document.getElementById("edit-entry-reason").value,
        deduction: editing.deduction,
      });
      if (result?.missing) {
        showToast("呢一項已經唔存在。", "warning");
      } else if (result?.moved) {
        const info = getDeductionBadgeInfo(editing.deduction, part.maxScore);
        showToast(`✓ 已調整為【${info.shortLabel}】，卡片會移去對應欄。`, "success");
      } else {
        showToast("✓ 已儲存修改。", "success");
      }
    }
    closeEdit();
  });
}

async function removeQuestion(questionId) {
  await withBusy(async () => {
    await deleteQuestion(state.user, questionId);
    if (state.activeQuestionId === questionId) {
      state.activeQuestionId = "";
      state.activeSubPartId = "";
      persistSelection();
    }
    showToast("已刪除呢條題目。", "info");
  });
}

async function removeEntry(type, id) {
  const part = activePart();
  if (!part) return;
  await withBusy(async () => {
    if (type === "pending") await deleteCase(state.activeQuestionId, part.id, id);
    else await deleteCriterion(state.activeQuestionId, part.id, id);
    showToast("已刪除該項目。", "info");
  });
}

async function vote(caseId, deduction) {
  const part = activePart();
  if (!part) return;
  await withBusy(async () => {
    const result = await castVote(state.user, state.activeQuestionId, part.id, caseId, deduction);
    if (result?.missing) {
      showToast("呢項擬問已經處理咗。", "info");
      return;
    }
    if (result?.unchanged) {
      showToast("你已經投咗呢個分數。", "info");
      return;
    }
    if (result?.locked) {
      state.banner = consensusBannerText(result.deduction, result.maxScore || part.maxScore);
      showToast(state.banner, "success");
      refreshBoard();
      return;
    }
    showToast("已記錄你嘅投票，等另一位老師投同一個扣分就定案。", "info");
  });
}

export function closeTopModal() {
  const confirm = document.getElementById("custom-confirm-modal");
  if (confirm && !confirm.classList.contains("hidden")) {
    closeConfirm();
    return;
  }
  const photo = document.getElementById("photo-viewer-modal");
  if (photo && !photo.classList.contains("hidden")) {
    closePhoto();
    return;
  }
  const edit = document.getElementById("edit-entry-modal");
  if (edit && !edit.classList.contains("hidden")) {
    closeEdit();
    return;
  }
  const question = document.getElementById("question-modal");
  if (question && !question.classList.contains("hidden")) {
    closeQuestion();
    return;
  }
  const direct = document.getElementById("direct-text-modal");
  if (direct && !direct.classList.contains("hidden")) {
    closeDirect();
    return;
  }
  const upload = document.getElementById("upload-modal");
  if (upload && !upload.classList.contains("hidden")) closeUpload();
}
