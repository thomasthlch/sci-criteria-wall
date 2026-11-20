import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { closeTopModal, initActions, onChange, onClick, onInput, openUpload, syncOpenModals, usePhoto } from "./actions.js";
import { auth } from "./firebase.js";
import { explainDataError, friendlyAuthError, isSchoolEmail, profileOf, resolvePartId, resolveQuestionId } from "./logic.js";
import { fillBoard } from "./render.js";
import { ensureSeed, listenChildren, listenParts, listenQuestions } from "./store.js";

const provider = new GoogleAuthProvider();
provider.addScope("email");
provider.setCustomParameters({ hd: "tswgps.edu.hk", prompt: "select_account" });
auth.languageCode = "zh-TW";

const saved = loadSelection();
const state = {
  user: null,
  questions: [],
  parts: [],
  criteria: [],
  cases: [],
  hints: [],
  activeQuestionId: saved.activeQuestionId,
  activeSubPartId: saved.activeSubPartId,
  questionsReady: false,
  partsReady: false,
  childrenReady: false,
  error: "",
  banner: "",
  holdSelectionUntil: 0,
};

let questionsUnsub = null;
let partsUnsub = null;
let childrenUnsub = null;
let partsFor = "";
let childrenFor = "";
let rejectReason = "";
let authNotice = "";
let enteredUid = "";

const sync = {
  watchParts,
  watchChildren,
  start: startSync,
  stop: stopSync,
};

initActions(state, sync);

function loadSelection() {
  try {
    const raw = JSON.parse(localStorage.getItem("sci_criteria_wall_selection") || "{}");
    return {
      activeQuestionId: typeof raw.activeQuestionId === "string" ? raw.activeQuestionId : "q1",
      activeSubPartId: typeof raw.activeSubPartId === "string" ? raw.activeSubPartId : "sp_q1_1",
    };
  } catch {
    return { activeQuestionId: "q1", activeSubPartId: "sp_q1_1" };
  }
}

function showGate(message, pending = false) {
  document.getElementById("gate").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
  const box = document.getElementById("gate-message");
  box.textContent = message || "";
  box.className = pending
    ? "bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold rounded-2xl px-4 py-3"
    : "bg-rose-50 border-2 border-rose-300 text-rose-950 font-bold rounded-2xl px-4 py-3";
  box.classList.toggle("hidden", !message);
  document.getElementById("gate-signin").disabled = pending;
}

function showApp(user) {
  const profile = profileOf(user);
  state.user = profile;
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-name").textContent = profile.displayName;
  document.getElementById("user-email").textContent = profile.email;
  fillBoard(state);
}

function onError(error) {
  console.error(error);
  state.error = explainDataError(error);
  fillBoard(state);
}

function stopSync() {
  questionsUnsub?.();
  partsUnsub?.();
  childrenUnsub?.();
  questionsUnsub = null;
  partsUnsub = null;
  childrenUnsub = null;
  partsFor = "";
  childrenFor = "";
}

function watchChildren(questionId, partId) {
  if (!questionId || !partId) return;
  const key = `${questionId}/${partId}`;
  if (childrenFor === key) return;
  childrenUnsub?.();
  childrenFor = key;
  state.childrenReady = false;
  state.criteria = [];
  state.cases = [];
  state.hints = [];
  childrenUnsub = listenChildren(questionId, partId, (name, items) => {
    if (childrenFor !== key) return;
    if (name === "criteria") state.criteria = items;
    if (name === "cases") state.cases = items;
    if (name === "hints") state.hints = items;
    state.childrenReady = true;
    state.error = "";
    fillBoard(state);
    syncOpenModals();
  }, onError);
}

function watchParts(questionId) {
  if (!questionId) return;
  if (partsFor === questionId) return;
  partsUnsub?.();
  childrenUnsub?.();
  partsFor = questionId;
  childrenFor = "";
  state.partsReady = false;
  state.childrenReady = false;
  state.parts = [];
  state.criteria = [];
  state.cases = [];
  state.hints = [];
  partsUnsub = listenParts(questionId, (parts) => {
    if (partsFor !== questionId) return;
    state.parts = parts;
    state.partsReady = true;
    const held = state.activeSubPartId
      && !parts.some((part) => part.id === state.activeSubPartId)
      && Date.now() < state.holdSelectionUntil;
    if (!held) {
      const nextPart = resolvePartId(parts, state.activeSubPartId);
      const changed = `${questionId}/${nextPart}` !== childrenFor;
      state.activeSubPartId = nextPart;
      if (changed) watchChildren(questionId, nextPart);
    }
    state.error = "";
    fillBoard(state);
    syncOpenModals();
  }, onError);
  fillBoard(state);
}

function startSync() {
  stopSync();
  state.questionsReady = false;
  state.error = "";
  fillBoard(state);
  questionsUnsub = listenQuestions((questions) => {
    state.questions = questions;
    state.questionsReady = true;
    const held = state.activeQuestionId
      && !questions.some((question) => question.id === state.activeQuestionId)
      && Date.now() < state.holdSelectionUntil;
    if (!held) {
      const nextQuestion = resolveQuestionId(questions, state.activeQuestionId);
      const changed = nextQuestion !== partsFor;
      state.activeQuestionId = nextQuestion;
      if (nextQuestion && changed) watchParts(nextQuestion);
      if (!nextQuestion) {
        partsUnsub?.();
        childrenUnsub?.();
        partsFor = "";
        childrenFor = "";
        state.parts = [];
        state.partsReady = false;
      }
    }
    state.error = "";
    fillBoard(state);
    syncOpenModals();
  }, onError);
}

async function signIn() {
  document.getElementById("gate-signin").disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
      showGate("瀏覽器擋咗彈出視窗，改用重新導向登入…", true);
      await signInWithRedirect(auth, provider);
      return;
    }
    if (error?.code === "auth/popup-closed-by-user") {
      showGate("");
      return;
    }
    showGate(friendlyAuthError(error?.code));
  }
}

async function enterApp(user) {
  const email = user.email || "";
  if (!isSchoolEmail(email, user.emailVerified)) {
    rejectReason = `只限已驗證嘅 @tswgps.edu.hk Google 帳戶使用。${email ? `（${email}）` : ""}系統已幫你登出。`;
    await signOut(auth);
    return;
  }
  showApp(user);
  if (enteredUid === user.uid && questionsUnsub) return;
  enteredUid = user.uid;
  try {
    await ensureSeed(user);
    startSync();
  } catch (error) {
    onError(error);
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    enteredUid = "";
    stopSync();
    state.user = null;
    state.questionsReady = false;
    showGate(rejectReason || authNotice);
    rejectReason = "";
    return;
  }
  authNotice = "";
  void enterApp(user);
});

getRedirectResult(auth).catch((error) => {
  if (!error || error.code === "auth/popup-closed-by-user") return;
  authNotice = friendlyAuthError(error.code);
  if (!auth.currentUser) showGate(authNotice);
});

document.body.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  if (element.dataset.action === "sign-in") {
    void signIn();
    return;
  }
  if (element.dataset.action === "sign-out") {
    void signOut(auth);
    return;
  }
  if (document.getElementById("app").classList.contains("hidden")) return;
  onClick(element, event);
});

document.body.addEventListener("input", (event) => {
  const element = event.target.closest("[data-input]");
  if (element) onInput(element);
});

document.body.addEventListener("change", (event) => {
  const element = event.target.closest("[data-change]");
  if (!element) return;
  if (element.id === "real-photo-input") {
    const file = element.files && element.files[0];
    if (file) void usePhoto(file);
    return;
  }
  onChange(element);
});

window.addEventListener("paste", (event) => {
  if (document.getElementById("app").classList.contains("hidden")) return;
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      const modal = document.getElementById("upload-modal");
      if (modal.classList.contains("hidden")) openUpload();
      void usePhoto(file);
      event.preventDefault();
      break;
    }
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTopModal();
});
