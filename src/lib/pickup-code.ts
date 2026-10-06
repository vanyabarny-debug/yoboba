export const PICKUP_CODE_TTL_MINUTES = 30;
export const PICKUP_CODE_PAYLOAD_PREFIX = 'YOBOBA:';

export function parse_pickup_code_input(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const from_payload = upper.startsWith(PICKUP_CODE_PAYLOAD_PREFIX)
    ? upper.slice(PICKUP_CODE_PAYLOAD_PREFIX.length)
    : upper;
  const digits = from_payload.replace(/\D/g, '');
  if (digits.length === 6) return digits;
  // иногда сканер отдаёт лишний мусор — берём последние 6 цифр
  if (digits.length > 6) return digits.slice(-6);
  return null;
}

export function pickup_qr_payload(code: string): string {
  return `${PICKUP_CODE_PAYLOAD_PREFIX}${code}`;
}

export function format_pickup_code_display(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}
