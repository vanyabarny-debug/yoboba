export const PICKUP_CODE_TTL_MINUTES = 10;
export const PICKUP_CODE_PAYLOAD_PREFIX = 'YOBOBA:';

export function parse_pickup_code_input(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const from_payload = trimmed.toUpperCase().startsWith(PICKUP_CODE_PAYLOAD_PREFIX)
    ? trimmed.slice(PICKUP_CODE_PAYLOAD_PREFIX.length)
    : trimmed;
  const digits = from_payload.replace(/\D/g, '');
  if (digits.length !== 6) return null;
  return digits;
}

export function pickup_qr_payload(code: string): string {
  return `${PICKUP_CODE_PAYLOAD_PREFIX}${code}`;
}

export function format_pickup_code_display(code: string): string {
  const digits = code.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}
