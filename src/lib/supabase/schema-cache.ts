const missing_at = new Map<string, number>();
const TTL_MS = 15_000;

export function table_is_missing(name: string) {
  const at = missing_at.get(name);
  if (at == null) return false;
  if (Date.now() - at > TTL_MS) {
    missing_at.delete(name);
    return false;
  }
  return true;
}

export function note_table_error(name: string, message: string | undefined) {
  if (/does not exist|schema cache|could not find the table/i.test(message || '')) {
    missing_at.set(name, Date.now());
    return true;
  }
  return false;
}

export function mark_table_present(name: string) {
  missing_at.delete(name);
}
