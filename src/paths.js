export const ROOT_COLLECTION = "sci_criteria_wall";
export const WALL_ID = "wall";

const FORBIDDEN = new Set([
  "dashboards",
  "eservice",
  "scores",
  "classes",
  "schemas",
  "deadline_fighter",
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function requireId(id, label = "id") {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new Error(`invalid ${label}`);
  }
  return id;
}

export function assertSafeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0 || segments[0] !== ROOT_COLLECTION) {
    throw new Error("path must stay under sci_criteria_wall");
  }
  for (const segment of segments) {
    if (typeof segment !== "string" || segment.length === 0 || segment.includes("/")) {
      throw new Error("invalid path segment");
    }
    if (FORBIDDEN.has(segment)) throw new Error(`forbidden collection: ${segment}`);
  }
  return segments;
}

export function assertStoragePath(path) {
  if (typeof path !== "string" || !path.startsWith(`${ROOT_COLLECTION}/`)) {
    throw new Error("storage path must stay under sci_criteria_wall/");
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") throw new Error("invalid storage path");
    if (FORBIDDEN.has(segment)) throw new Error("forbidden storage path");
  }
  return path;
}

export function wallSegments() {
  return assertSafeSegments([ROOT_COLLECTION, WALL_ID]);
}

export function questionsCollectionSegments() {
  return assertSafeSegments([ROOT_COLLECTION, WALL_ID, "questions"]);
}

export function questionSegments(questionId) {
  return assertSafeSegments([ROOT_COLLECTION, WALL_ID, "questions", requireId(questionId, "question")]);
}

export function partsCollectionSegments(questionId) {
  return assertSafeSegments([
    ROOT_COLLECTION,
    WALL_ID,
    "questions",
    requireId(questionId, "question"),
    "parts",
  ]);
}

export function partSegments(questionId, partId) {
  return assertSafeSegments([
    ...partsCollectionSegments(questionId),
    requireId(partId, "part"),
  ]);
}

export function childCollectionSegments(questionId, partId, childName) {
  if (!["criteria", "cases", "hints"].includes(childName)) {
    throw new Error("unknown child collection");
  }
  return assertSafeSegments([...partSegments(questionId, partId), childName]);
}

export function childDocSegments(questionId, partId, childName, childId) {
  return assertSafeSegments([
    ...childCollectionSegments(questionId, partId, childName),
    requireId(childId, childName),
  ]);
}
