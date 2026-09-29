// Receipt kinds. Kept in sync with the check constraint in
// supabase/expense_kind_migration.sql.
export const KINDS = ['normal', 'unusual', 'mandatory'];

export const KIND_COLORS = {
  normal: '#8b5cf6',    // accent
  unusual: '#f59e0b',   // amber
  mandatory: '#64748b', // slate
};

export function normalizeKind(k) {
  return KINDS.includes(k) ? k : 'normal';
}
