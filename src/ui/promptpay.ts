/**
 * PromptPay QR payloads (Thai national QR standard on EMVCo), so players can tip the game's
 * creator from any Thai banking app. Pure: the QR image itself is drawn by the qrcode library.
 */

const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC-16/CCITT-FALSE over the payload, as four upper-case hex digits. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** The proxy target: a mobile number (as 0066…), a 13-digit national/tax ID, or a 15-digit e-wallet. */
export function promptpayTarget(id: string): { tag: '01' | '02' | '03'; value: string } | null {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return { tag: '01', value: `0066${digits.slice(1)}` };
  if (digits.length === 13) return { tag: '02', value: digits };
  if (digits.length === 15) return { tag: '03', value: digits };
  return null;
}

/** The payload text for a PromptPay QR (static, any amount unless one is given), or null if the id is not valid. */
export function promptpayPayload(id: string, amountBaht?: number): string | null {
  const target = promptpayTarget(id);
  if (!target) return null;
  const merchant = field('00', 'A000000677010111') + field(target.tag, target.value);
  let body = field('00', '01') + field('01', amountBaht ? '12' : '11') + field('29', merchant) + field('58', 'TH') + field('53', '764');
  if (amountBaht) body += field('54', amountBaht.toFixed(2));
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

/** Whether a Thai QR payload text is well formed: EMVCo header and a matching CRC at the end. */
export function validPayload(payload: string): boolean {
  return /^000201/.test(payload) && payload.slice(-8, -4) === '6304' && crc16(payload.slice(0, -4)) === payload.slice(-4).toUpperCase();
}
