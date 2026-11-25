export const OFFICIAL_SITE_URL = 'https://noorwbayan-academy.com';
export const OFFICIAL_CONTACT_EMAIL = 'care@noorwbayan-academy.com';

export function getCertificateVerifyUrl(verificationCode: string): string {
  return `${OFFICIAL_SITE_URL}/verify?code=${encodeURIComponent(verificationCode)}`;
}

export function normalizeAcademyText(value: string): string {
  if (!value) return value;
  return value
    .replace(/care@noorbayan\.academy/gi, OFFICIAL_CONTACT_EMAIL)
    .replace(/noorwbayan558@gmail\.com/gi, OFFICIAL_CONTACT_EMAIL)
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)?noorwbayan-academy\.up\.railway\.app/gi, OFFICIAL_SITE_URL)
    .replace(/https?:\/\/(?:www\.)?noorbayan\.academy/gi, OFFICIAL_SITE_URL)
    .replace(/\b(?:[a-z0-9-]+\.)?noorwbayan-academy\.up\.railway\.app\b/gi, 'noorwbayan-academy.com')
    .replace(/\b(?:www\.)?noorbayan\.academy\b/gi, 'noorwbayan-academy.com');
}
