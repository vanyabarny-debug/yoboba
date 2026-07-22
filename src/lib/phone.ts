/** нормализация российского номера в +7XXXXXXXXXX */
export function normalize_phone(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.includes('*')) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return raw.trim().startsWith('+') ? raw.trim() : `+${digits}`;
}

export function format_phone_display(phone: string | null | undefined) {
  if (!phone) return 'не указан';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) {
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  return phone;
}

/** маска ввода: только цифры после +7, макс 10 */
export function format_phone_input(raw: string) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('7') ? digits.slice(1) : digits.startsWith('8') ? digits.slice(1) : digits;
  const d = local.slice(0, 10);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export function phone_input_to_e164(draft: string) {
  const digits = draft.replace(/\D/g, '');
  const local = digits.startsWith('7') ? digits.slice(1) : digits.startsWith('8') ? digits.slice(1) : digits;
  if (local.length !== 10) return null;
  return `+7${local}`;
}
