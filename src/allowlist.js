// Single source of truth for who may use the criteria wall.
// firebase/firestore.rules function sciCriteriaWallTeacher and
// firebase/storage.sci_criteria_wall.rules.fragment must list the same emails.

export const ADMIN_EMAIL = "thomasthlch@gmail.com";

export const WALL_TEACHER_EMAILS = [
  "laipuiyee@tswgps.edu.hk",
  "wongwingyan@tswgps.edu.hk",
  "chanpuishan@tswgps.edu.hk",
  "wongpikkei@tswgps.edu.hk",
  "aukamling@tswgps.edu.hk",
  "leekaying@tswgps.edu.hk",
  "chankailok@tswgps.edu.hk",
  "chauhangfung@tswgps.edu.hk",
  "chanshuion@tswgps.edu.hk",
  "liyuenman@tswgps.edu.hk",
  "lichihong@tswgps.edu.hk",
  "cheunghin@tswgps.edu.hk",
  "tsehiuhung@tswgps.edu.hk",
];

export const WALL_ALLOWED_EMAILS = [ADMIN_EMAIL, ...WALL_TEACHER_EMAILS];

const ALLOWED = new Set(WALL_ALLOWED_EMAILS);

export function isAllowedAccount(email, verified = true) {
  if (!verified || typeof email !== "string") return false;
  return ALLOWED.has(email.trim().toLowerCase());
}
