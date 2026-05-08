export default function CategoryBadge({ name, color }) {
  if (!name) return null;

  const bg = color + '26'; // ~15% opacity in hex

  return (
    <span
      className="category-badge"
      style={{ backgroundColor: bg, color: color }}
    >
      {name}
    </span>
  );
}
