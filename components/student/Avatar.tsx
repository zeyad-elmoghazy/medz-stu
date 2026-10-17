/**
 * Initials avatar. The solid accent fill with near-white text is the same
 * chip StudentNavbar and the leaderboard draw by hand; this is the
 * shared version for new surfaces.
 */
function initialsOf(name: string, fallback = 'ME'): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return initials || fallback;
}

export function Avatar({ name, size = 60 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent-text)',
        // White stays literal: the chip's fill is the solid accent in
        // both themes.
        color: '#F7F9FA',
        display: 'grid',
        placeItems: 'center',
        fontSize: Math.round(size * 0.37),
        fontWeight: 800,
        flex: 'none',
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
