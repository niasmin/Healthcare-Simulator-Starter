import { crc16, promptpayPayload, promptpayTarget } from '../ui/promptpay';

describe('PromptPay QR payload', () => {
  it('uses CRC-16/CCITT-FALSE', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('accepts a mobile number, a national ID or an e-wallet id, and refuses anything else', () => {
    expect(promptpayTarget('081-234-5678')).toEqual({ tag: '01', value: '0066812345678' });
    expect(promptpayTarget('1234567890123')).toEqual({ tag: '02', value: '1234567890123' });
    expect(promptpayTarget('123456789012345')).toEqual({ tag: '03', value: '123456789012345' });
    expect(promptpayTarget('12345')).toBeNull();
    expect(promptpayPayload('nope')).toBeNull();
  });

  it('builds the standard static payload for a phone number, ending in its own checksum', () => {
    const p = promptpayPayload('0812345678')!;
    expect(p.startsWith('000201010211')).toBe(true);
    expect(p).toContain('29370016A000000677010111011300668123456785802TH5303764');
    expect(p.slice(-8, -4)).toBe('6304');
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    // A fixed amount makes it a dynamic code.
    expect(promptpayPayload('0812345678', 50)).toContain('010212');
    expect(promptpayPayload('0812345678', 50)).toContain('540550.00');
  });
});
