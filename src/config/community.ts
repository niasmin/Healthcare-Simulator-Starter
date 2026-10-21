/**
 * Community and support settings for the public site, read from the build environment
 * (.env.production). Each is optional: the game only shows the links that are set.
 *
 * VITE_SUPPORT_KOFI        e.g. https://ko-fi.com/yourname
 * VITE_SUPPORT_BMC         e.g. https://buymeacoffee.com/yourname
 * VITE_SUPPORT_PATREON     e.g. https://patreon.com/yourname
 * VITE_SUPPORT_PROMPTPAY   a PromptPay phone number or national/tax ID (shown as a QR code)
 * VITE_SUPPORT_PROMPTPAY_PAYLOAD  or: the exact text of an existing Thai QR (e.g. decoded from a bank app's
 *                          receive-money QR); used as is when its checksum is valid
 * VITE_SUPPORT_PROMPTPAY_NAME  the account name shown under the QR code
 * VITE_COMMUNITY_URL       a LINE OpenChat, Discord or Facebook group link
 * VITE_CONTACT_EMAIL       where players can write (privacy requests, contact)
 * VITE_GAME_URL            the address shared by the Share button
 */
const env = import.meta.env as Record<string, string | undefined>;
const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const SUPPORT = {
  kofi: clean(env.VITE_SUPPORT_KOFI),
  bmc: clean(env.VITE_SUPPORT_BMC),
  patreon: clean(env.VITE_SUPPORT_PATREON),
  promptpay: clean(env.VITE_SUPPORT_PROMPTPAY),
  promptpayPayload: clean(env.VITE_SUPPORT_PROMPTPAY_PAYLOAD),
  promptpayName: clean(env.VITE_SUPPORT_PROMPTPAY_NAME),
};
export const COMMUNITY_URL = clean(env.VITE_COMMUNITY_URL);
export const CONTACT_EMAIL = clean(env.VITE_CONTACT_EMAIL);
export const GAME_URL = clean(env.VITE_GAME_URL) ?? 'https://healthcare-empire.pages.dev';
