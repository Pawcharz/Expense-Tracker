import { supabase } from './supabase';

export async function fetchCategoryData() {
  const { data: groups } = await supabase
    .from('category_groups')
    .select('*')
    .order('name');

  const { data: cats } = await supabase
    .from('categories')
    .select('*, category_groups(name, color)')
    .order('name');

  if (!groups || !cats) return { groups: [], categoriesByGroup: {}, categoryMap: {} };

  const categoriesByGroup = {};
  const categoryMap = {};

  cats.forEach(c => {
    const gName = c.category_groups.name;
    if (!categoriesByGroup[gName]) categoriesByGroup[gName] = [];
    categoriesByGroup[gName].push({ id: c.id, name: c.name });
    categoryMap[c.name] = { id: c.id, groupName: gName, color: c.category_groups.color };
  });

  return { groups, categoriesByGroup, categoryMap };
}
