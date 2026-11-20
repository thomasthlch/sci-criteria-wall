import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { deleteStoredPhoto } from "./images.js";
import { db } from "./firebase.js";
import {
  clampDeduction,
  clampMaxScore,
  extractAutoKeywords,
  profileOf,
  pushChange,
  tallyVotes,
  votersFor,
} from "./logic.js";
import {
  childCollectionSegments,
  childDocSegments,
  partSegments,
  partsCollectionSegments,
  questionSegments,
  questionsCollectionSegments,
  wallSegments,
} from "./paths.js";
import { buildSeedContent } from "./seed-data.js";

const SEED_BASE_TIME = 1_700_000_000_000;

function docRef(segments) {
  return doc(db, ...segments);
}

function colRef(segments) {
  return collection(db, ...segments);
}

function wallRef() {
  return docRef(wallSegments());
}

function questionRef(questionId) {
  return docRef(questionSegments(questionId));
}

function partRef(questionId, partId) {
  return docRef(partSegments(questionId, partId));
}

function childRef(questionId, partId, childName, childId) {
  return docRef(childDocSegments(questionId, partId, childName, childId));
}

function childCol(questionId, partId, childName) {
  return colRef(childCollectionSegments(questionId, partId, childName));
}

function toItem(snapshot) {
  const data = { ...snapshot.data() };
  for (const key of ["createdAt", "updatedAt", "seededAt"]) {
    if (data[key] && typeof data[key].toMillis === "function") data[key] = data[key].toMillis();
  }
  return { id: snapshot.id, ...data };
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function authorStamp(user, now = Date.now()) {
  const profile = profileOf(user);
  return {
    createdAt: now,
    createdBy: profile,
    updatedAt: now,
    updatedBy: profile,
  };
}

export function listenQuestions(onData, onError) {
  const questions = query(colRef(questionsCollectionSegments()), orderBy("order"));
  return onSnapshot(questions, (snap) => onData(snap.docs.map(toItem)), onError);
}

export function listenParts(questionId, onData, onError) {
  const parts = query(colRef(partsCollectionSegments(questionId)), orderBy("order"));
  return onSnapshot(parts, (snap) => onData(snap.docs.map(toItem)), onError);
}

export function listenChildren(questionId, partId, onData, onError) {
  const names = ["criteria", "cases", "hints"];
  const unsubs = names.map((name) =>
    onSnapshot(
      childCol(questionId, partId, name),
      (snap) => onData(name, snap.docs.map(toItem)),
      onError,
    ),
  );
  return () => unsubs.forEach((stop) => stop());
}

export async function ensureSeed(user) {
  const profile = profileOf(user);
  const content = buildSeedContent();
  await runTransaction(db, async (tx) => {
    const wallSnap = await tx.get(wallRef());
    if (wallSnap.exists() && wallSnap.data().seeded) return;
    const now = Date.now();
    tx.set(wallRef(), {
      kind: "wall",
      app: "sci-criteria-wall",
      seeded: true,
      seedVersion: 1,
      seededAt: now,
      seededBy: profile,
    });
    content.forEach((question, questionIndex) => {
      const pendingCount = question.parts.reduce((sum, part) => sum + part.cases.length, 0);
      tx.set(questionRef(question.id), {
        title: question.title,
        content: question.content,
        order: questionIndex + 1,
        pendingCount,
        totalScore: question.parts.reduce((sum, part) => sum + Number(part.maxScore || 0), 0),
        createdAt: SEED_BASE_TIME + questionIndex,
        createdBy: profile,
        updatedAt: SEED_BASE_TIME + questionIndex,
        updatedBy: profile,
      });
      question.parts.forEach((part, partIndex) => {
        tx.set(partRef(question.id, part.id), {
          name: part.name,
          maxScore: part.maxScore,
          order: partIndex,
          pendingCount: part.cases.length,
          createdAt: SEED_BASE_TIME + partIndex,
          createdBy: profile,
          updatedAt: SEED_BASE_TIME + partIndex,
          updatedBy: profile,
        });
        part.criteria.forEach((item, index) => {
          const at = SEED_BASE_TIME - index * 1000 - partIndex * 100;
          tx.set(childRef(question.id, part.id, "criteria", item.id), {
            deduction: item.deduction,
            text: item.text,
            reason: item.reason,
            note: item.note || "",
            source: item.source,
            sourceLabel: item.sourceLabel,
            photo: null,
            changelog: [],
            createdAt: at,
            createdBy: profile,
            updatedAt: at,
            updatedBy: profile,
          });
        });
        part.cases.forEach((item, index) => {
          const at = SEED_BASE_TIME - index * 1000;
          tx.set(childRef(question.id, part.id, "cases", item.id), {
            text: item.text,
            note: item.note || "",
            question: item.question || "",
            photo: null,
            votes: {},
            demoLean: item.demoLean || null,
            author: { uid: "seed", displayName: "示範擬問", email: "" },
            changelog: [],
            createdAt: at,
            updatedAt: at,
          });
        });
        part.hints.forEach((item, index) => {
          tx.set(childRef(question.id, part.id, "hints", item.id), {
            keywords: item.keywords,
            excludeKeywords: item.excludeKeywords || [],
            matchedText: item.matchedText,
            deduction: item.deduction,
            reason: item.reason,
            createdAt: SEED_BASE_TIME - index * 1000,
            createdBy: profile,
          });
        });
      });
    });
  });
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

export async function createQuestion(user, { title, content, parts }) {
  const profile = profileOf(user);
  const now = Date.now();
  const questionId = newId("q");
  const batch = writeBatch(db);
  const savedParts = parts.map((part, index) => ({
    id: newId("sp"),
    name: cleanText(part.name, 40) || `第 ${index + 1} 部分`,
    maxScore: clampMaxScore(part.maxScore),
    order: index,
  }));
  batch.set(questionRef(questionId), {
    title: cleanText(title, 120),
    content: cleanText(content, 2000),
    order: now,
    pendingCount: 0,
    totalScore: savedParts.reduce((sum, part) => sum + part.maxScore, 0),
    ...authorStamp(user, now),
  });
  savedParts.forEach((part) => {
    batch.set(partRef(questionId, part.id), {
      name: part.name,
      maxScore: part.maxScore,
      order: part.order,
      pendingCount: 0,
      ...authorStamp(user, now),
    });
  });
  await batch.commit();
  return { id: questionId, partId: savedParts[0]?.id || "" };
}

async function deleteChildDocs(questionId, partId, childName) {
  const snap = await getDocs(childCol(questionId, partId, childName));
  for (let index = 0; index < snap.docs.length; index += 400) {
    const batch = writeBatch(db);
    const slice = snap.docs.slice(index, index + 400);
    for (const item of slice) {
      const photo = item.data().photo;
      if (photo?.storagePath) await deleteStoredPhoto(photo.storagePath);
      batch.delete(item.ref);
    }
    if (slice.length) await batch.commit();
  }
}

async function deletePartTree(questionId, partId) {
  await deleteChildDocs(questionId, partId, "criteria");
  await deleteChildDocs(questionId, partId, "cases");
  await deleteChildDocs(questionId, partId, "hints");
}

async function clampPartScores(user, questionId, partId, maxScore) {
  const criteria = await getDocs(childCol(questionId, partId, "criteria"));
  for (const item of criteria.docs) {
    const data = item.data();
    if (Number(data.deduction) > maxScore) {
      const profile = profileOf(user);
      await runTransaction(db, async (tx) => {
        const fresh = await tx.get(item.ref);
        if (!fresh.exists() || Number(fresh.data().deduction) <= maxScore) return;
        tx.update(item.ref, {
          deduction: maxScore,
          updatedAt: Date.now(),
          updatedBy: profile,
          changelog: pushChange(fresh.data().changelog, {
            at: Date.now(),
            uid: profile.uid,
            displayName: profile.displayName,
            summary: `滿分調低，扣分由 -${fresh.data().deduction} 鉗制為 -${maxScore}`,
          }),
        });
      });
    }
  }
  const cases = await getDocs(childCol(questionId, partId, "cases"));
  for (const item of cases.docs) {
    const votes = item.data().votes || {};
    if (Object.values(votes).some((vote) => Number(vote?.deduction) > maxScore)) {
      await clampCaseVotes(user, questionId, partId, item.id, maxScore);
    }
  }
}

async function clampCaseVotes(user, questionId, partId, caseId, maxScore) {
  const profile = profileOf(user);
  await runTransaction(db, async (tx) => {
    const caseSnap = await tx.get(childRef(questionId, partId, "cases", caseId));
    const partSnap = await tx.get(partRef(questionId, partId));
    const questionSnap = await tx.get(questionRef(questionId));
    if (!caseSnap.exists() || !partSnap.exists()) return;
    const votes = { ...(caseSnap.data().votes || {}) };
    for (const uid of Object.keys(votes)) {
      if (Number(votes[uid]?.deduction) > maxScore) {
        votes[uid] = { ...votes[uid], deduction: maxScore };
      }
    }
    await writeVoteResult(tx, {
      user,
      profile,
      questionId,
      partId,
      caseSnap,
      partSnap,
      questionSnap,
      votes,
      maxScore: Number(partSnap.data().maxScore) || maxScore,
    });
  });
}

function writeVoteResult(tx, context) {
  const { profile, questionId, partId, caseSnap, partSnap, questionSnap, votes, maxScore } = context;
  const result = tallyVotes(votes);
  if (result.decidedDeduction === null) {
    tx.update(caseSnap.ref, { votes, updatedAt: Date.now(), updatedBy: profile });
    return { locked: false };
  }
  const deduction = result.decidedDeduction;
  const data = caseSnap.data();
  const names = votersFor(votes, deduction).map((vote) => vote.displayName).join("、");
  const ruleId = newId("rule");
  const reason = data.question
    ? `兩位已登入老師同意扣 ${deduction} 分，已定案。（原疑問：${data.question}）`
    : `兩位已登入老師同意扣 ${deduction} 分，已定案。`;
  tx.set(childRef(questionId, partId, "criteria", ruleId), {
    deduction,
    text: data.text || "",
    reason,
    note: data.note || "",
    source: "vote",
    sourceLabel: "投票定案（2 票同意）",
    photo: data.photo || null,
    changelog: [
      {
        at: Date.now(),
        uid: profile.uid,
        displayName: profile.displayName,
        summary: `${names || "兩位老師"} 同意 -${deduction} 分，已定案`,
      },
    ],
    ...authorStamp(context.user),
  });
  const keywords = extractAutoKeywords(data.text || "");
  if (keywords.length) {
    tx.set(childRef(questionId, partId, "hints", newId("hint")), {
      keywords,
      excludeKeywords: [],
      matchedText: `寫「${data.text}」`,
      deduction,
      reason: `兩位已登入老師同意，已定案為【-${deduction} 分】（實得 ${Math.max(0, maxScore - deduction)}/${maxScore}）。`,
      createdAt: Date.now(),
      createdBy: profile,
    });
  }
  tx.delete(caseSnap.ref);
  tx.update(partSnap.ref, {
    pendingCount: Math.max(0, Number(partSnap.data().pendingCount || 1) - 1),
    updatedAt: Date.now(),
  });
  tx.update(questionSnap.ref, {
    pendingCount: Math.max(0, Number(questionSnap.data().pendingCount || 1) - 1),
    updatedAt: Date.now(),
  });
  return { locked: true, deduction, maxScore, partName: partSnap.data().name || "" };
}

export async function saveQuestionEdits(user, questionId, { title, content, parts }) {
  const profile = profileOf(user);
  const now = Date.now();
  const existing = await getDocs(colRef(partsCollectionSegments(questionId)));
  const existingIds = new Set(existing.docs.map((item) => item.id));
  const normalized = parts.map((part, index) => ({
    id: existingIds.has(part.id) ? part.id : newId("sp"),
    name: cleanText(part.name, 40) || `第 ${index + 1} 部分`,
    maxScore: clampMaxScore(part.maxScore),
    order: index,
    isNew: !existingIds.has(part.id),
  }));
  const kept = new Set(normalized.filter((part) => !part.isNew).map((part) => part.id));
  const removed = existing.docs.filter((item) => !kept.has(item.id));
  const batch = writeBatch(db);
  batch.update(questionRef(questionId), {
    title: cleanText(title, 120),
    content: cleanText(content, 2000),
    totalScore: normalized.reduce((sum, part) => sum + part.maxScore, 0),
    updatedAt: now,
    updatedBy: profile,
  });
  normalized.forEach((part) => {
    if (part.isNew) {
      batch.set(partRef(questionId, part.id), {
        name: part.name,
        maxScore: part.maxScore,
        order: part.order,
        pendingCount: 0,
        ...authorStamp(user, now),
      });
    } else {
      batch.update(partRef(questionId, part.id), {
        name: part.name,
        maxScore: part.maxScore,
        order: part.order,
        updatedAt: now,
        updatedBy: profile,
      });
    }
  });
  await batch.commit();

  let droppedPending = 0;
  for (const item of removed) {
    droppedPending += Number(item.data().pendingCount || 0);
    await deletePartTree(questionId, item.id);
  }
  if (removed.length) {
    await runTransaction(db, async (tx) => {
      const questionSnap = await tx.get(questionRef(questionId));
      if (!questionSnap.exists()) return;
      const nextCount = Math.max(0, Number(questionSnap.data().pendingCount || 0) - droppedPending);
      tx.update(questionSnap.ref, { pendingCount: nextCount, updatedAt: Date.now(), updatedBy: profile });
      removed.forEach((item) => tx.delete(partRef(questionId, item.id)));
    });
  }
  for (const part of normalized) {
    if (!part.isNew) await clampPartScores(user, questionId, part.id, part.maxScore);
  }
  return { id: questionId, partId: normalized[0]?.id || "" };
}

async function maybeAddHint(questionId, partId, text, deduction, reason, user) {
  const keywords = extractAutoKeywords(text);
  if (!keywords.length) return;
  const profile = profileOf(user);
  await runTransaction(db, async (tx) => {
    const partSnap = await tx.get(partRef(questionId, partId));
    if (!partSnap.exists()) return;
    tx.set(childRef(questionId, partId, "hints", newId("hint")), {
      keywords,
      excludeKeywords: [],
      matchedText: `寫「${text}」`,
      deduction,
      reason: reason || `${profile.displayName}已直接新增為【-${deduction} 分】標準。`,
      createdAt: Date.now(),
      createdBy: profile,
    });
  });
}

export async function addCriterion(user, questionId, partId, fields, { recordHint = false } = {}) {
  const partSnapData = await runTransaction(db, async (tx) => {
    const partSnap = await tx.get(partRef(questionId, partId));
    if (!partSnap.exists()) throw new Error("找不到這個評分部分。");
    const maxScore = Number(partSnap.data().maxScore || 0);
    const deduction = clampDeduction(fields.deduction, maxScore);
    const text = cleanText(fields.text, 2000);
    if (!text) throw new Error("請輸入標準或答案文字。");
    tx.set(childRef(questionId, partId, "criteria", newId("rule")), {
      deduction,
      text,
      reason: cleanText(fields.reason, 500),
      note: cleanText(fields.note, 120),
      source: "direct",
      sourceLabel: `${profileOf(user).displayName} 直接新增`,
      photo: fields.photo || null,
      changelog: [],
      ...authorStamp(user),
    });
    return { deduction, text, maxScore };
  });
  if (recordHint) {
    await maybeAddHint(
      questionId,
      partId,
      partSnapData.text,
      partSnapData.deduction,
      cleanText(fields.reason, 500),
      user,
    );
  }
  return partSnapData;
}

export async function updateCriterion(user, questionId, partId, criterionId, fields) {
  const profile = profileOf(user);
  return runTransaction(db, async (tx) => {
    const ref = childRef(questionId, partId, "criteria", criterionId);
    const partSnap = await tx.get(partRef(questionId, partId));
    const snap = await tx.get(ref);
    if (!snap.exists() || !partSnap.exists()) return { missing: true };
    const prev = snap.data();
    const maxScore = Number(partSnap.data().maxScore || 0);
    const deduction = clampDeduction(fields.deduction, maxScore);
    const text = cleanText(fields.text, 2000);
    const reason = cleanText(fields.reason, 500);
    const note = cleanText(fields.note, 120);
    if (!text) throw new Error("內容文字唔可以留空。");
    const changes = [];
    if (Number(prev.deduction) !== deduction) changes.push(`扣分 -${prev.deduction} → -${deduction}`);
    if ((prev.text || "") !== text) changes.push("修改內容");
    if ((prev.reason || "") !== reason) changes.push("修改說明");
    if ((prev.note || "") !== note) changes.push("修改備註");
    tx.update(ref, {
      deduction,
      text,
      reason,
      note,
      updatedAt: Date.now(),
      updatedBy: profile,
      changelog: pushChange(prev.changelog, {
        at: Date.now(),
        uid: profile.uid,
        displayName: profile.displayName,
        summary: changes.join("、") || "儲存",
      }),
    });
    return { deduction, moved: Number(prev.deduction) !== deduction };
  });
}

export async function deleteCriterion(questionId, partId, criterionId) {
  const ref = childRef(questionId, partId, "criteria", criterionId);
  let photo = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    photo = snap.data().photo || null;
    tx.delete(ref);
  });
  if (photo?.storagePath) await deleteStoredPhoto(photo.storagePath);
}

export async function addCase(user, questionId, partId, fields) {
  const profile = profileOf(user);
  const text = cleanText(fields.text, 2000);
  if (!text) throw new Error("請先輸入學生答案文字。");
  await runTransaction(db, async (tx) => {
    const partSnap = await tx.get(partRef(questionId, partId));
    const questionSnap = await tx.get(questionRef(questionId));
    if (!partSnap.exists() || !questionSnap.exists()) throw new Error("找不到這個評分部分。");
    const maxScore = Number(partSnap.data().maxScore || 0);
    const deduction = clampDeduction(fields.deduction, maxScore);
    tx.set(childRef(questionId, partId, "cases", newId("pv")), {
      text,
      note: cleanText(fields.note, 120),
      question: cleanText(fields.question, 500) || "大家覺得呢份答案應該扣幾多分？",
      photo: fields.photo || null,
      votes: {
        [profile.uid]: {
          deduction,
          displayName: profile.displayName,
          email: profile.email,
          at: Date.now(),
        },
      },
      demoLean: null,
      author: profile,
      changelog: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: profile,
    });
    tx.update(partSnap.ref, {
      pendingCount: Number(partSnap.data().pendingCount || 0) + 1,
      updatedAt: Date.now(),
    });
    tx.update(questionSnap.ref, {
      pendingCount: Number(questionSnap.data().pendingCount || 0) + 1,
      updatedAt: Date.now(),
    });
  });
}

export async function updateCase(user, questionId, partId, caseId, fields) {
  const profile = profileOf(user);
  const text = cleanText(fields.text, 2000);
  if (!text) throw new Error("內容文字唔可以留空。");
  await runTransaction(db, async (tx) => {
    const ref = childRef(questionId, partId, "cases", caseId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return { missing: true };
    const prev = snap.data();
    const note = cleanText(fields.note, 120);
    const question = cleanText(fields.question, 500);
    const changes = [];
    if ((prev.text || "") !== text) changes.push("修改答案文字");
    if ((prev.note || "") !== note) changes.push("修改備註");
    if ((prev.question || "") !== question) changes.push("修改疑問");
    tx.update(ref, {
      text,
      note,
      question,
      updatedAt: Date.now(),
      updatedBy: profile,
      changelog: pushChange(prev.changelog, {
        at: Date.now(),
        uid: profile.uid,
        displayName: profile.displayName,
        summary: changes.join("、") || "儲存",
      }),
    });
    return { missing: false };
  });
}

export async function deleteCase(questionId, partId, caseId) {
  let photo = null;
  await runTransaction(db, async (tx) => {
    const caseSnap = await tx.get(childRef(questionId, partId, "cases", caseId));
    const partSnap = await tx.get(partRef(questionId, partId));
    const questionSnap = await tx.get(questionRef(questionId));
    if (!caseSnap.exists()) return;
    photo = caseSnap.data().photo || null;
    tx.delete(caseSnap.ref);
    if (partSnap.exists()) {
      tx.update(partSnap.ref, {
        pendingCount: Math.max(0, Number(partSnap.data().pendingCount || 1) - 1),
        updatedAt: Date.now(),
      });
    }
    if (questionSnap.exists()) {
      tx.update(questionSnap.ref, {
        pendingCount: Math.max(0, Number(questionSnap.data().pendingCount || 1) - 1),
        updatedAt: Date.now(),
      });
    }
  });
  if (photo?.storagePath) await deleteStoredPhoto(photo.storagePath);
}

export async function castVote(user, questionId, partId, caseId, deduction) {
  const profile = profileOf(user);
  return runTransaction(db, async (tx) => {
    const caseSnap = await tx.get(childRef(questionId, partId, "cases", caseId));
    const partSnap = await tx.get(partRef(questionId, partId));
    const questionSnap = await tx.get(questionRef(questionId));
    if (!caseSnap.exists() || !partSnap.exists() || !questionSnap.exists()) return { missing: true };
    const maxScore = Number(partSnap.data().maxScore || 0);
    const votes = { ...(caseSnap.data().votes || {}) };
    const nextDeduction = clampDeduction(deduction, maxScore);
    if (Number(votes[profile.uid]?.deduction) === nextDeduction) return { unchanged: true };
    votes[profile.uid] = {
      deduction: nextDeduction,
      displayName: profile.displayName,
      email: profile.email,
      at: Date.now(),
    };
    return writeVoteResult(tx, {
      user,
      profile,
      questionId,
      partId,
      caseSnap,
      partSnap,
      questionSnap,
      votes,
      maxScore,
    });
  });
}
