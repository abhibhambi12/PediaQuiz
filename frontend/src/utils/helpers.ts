export const normalizeId = (name: string): string => {
  if (typeof name !== 'string') {
    return 'unknown_id';
  }
  return name
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
};