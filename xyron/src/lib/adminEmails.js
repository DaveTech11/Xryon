// Set VITE_ADMIN_EMAILS in .env (comma separated) to change who sees admin screens.
// Restart `npm run dev` / rebuild after changing it. This only controls what the
// screens show; the server decides real access from ADMIN_EMAILS in .env.
const DEFAULT_ADMIN_EMAILS = [
  "eze464761@gmail.com",
  "ezejessica876@gmail.com",
  "inspirationdave94@gmail.com",
  "loneradmin@gmail.com",
];
const FROM_ENV = String(import.meta.env?.VITE_ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const ADMIN_EMAILS = FROM_ENV.length ? FROM_ENV : DEFAULT_ADMIN_EMAILS;

export function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function isAdminUser(user) {
  if (!user) return false;
  return isAdminEmail(user.email);
}
