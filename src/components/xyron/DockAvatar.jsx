// Small, dependency-free helpers for rendering a neutral avatar when the
// authenticated user has no profile_pic_url — never a stock/fake photo.

const AVATAR_COLORS = [
  "bg-orange-500", "bg-violet-500", "bg-emerald-500", "bg-sky-500",
  "bg-rose-500", "bg-amber-500", "bg-fuchsia-500", "bg-teal-500",
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// Initials from a real display name ("Dave Adeyemi" -> "DA", "Dave" -> "DA"),
// falling back to the email's first two characters, never a placeholder person.
export function initialsFor(name, email) {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  if (email) return email.trim().slice(0, 2).toUpperCase();
  return "?";
}

// Deterministic (not random) so the same account always gets the same color.
export function avatarColorFor(seed) {
  if (!seed) return AVATAR_COLORS[0];
  return AVATAR_COLORS[hashString(seed) % AVATAR_COLORS.length];
}

export default function DockAvatar({ url, initials = "?", colorClass = AVATAR_COLORS[0], size = 34, className = "" }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`shrink-0 rounded-xl object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-xl font-semibold text-white ${colorClass} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
