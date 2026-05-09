import { useLanguage } from '../hooks/useLanguage';

export default function CategoryBadge({ name, color }) {
  const { t } = useLanguage();
  if (!name) return null;

  const bg = color + '26'; // ~15% opacity in hex
  const displayName = t('categoryNames')[name] || t('categoryGroups')[name] || name;

  return (
    <span
      className="category-badge"
      style={{ backgroundColor: bg, color: color }}
    >
      {displayName}
    </span>
  );
}
