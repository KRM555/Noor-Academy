import React from 'react';
import { OFFICIAL_CONTACT_EMAIL, OFFICIAL_SITE_URL } from '../../lib/siteConfig';

export const ACADEMY_CONTACTS = {
  whatsappDisplay: '+20 10 80937383',
  whatsappUrl: 'https://wa.me/201080937383',
  email: OFFICIAL_CONTACT_EMAIL,
  mailtoUrl: `mailto:${OFFICIAL_CONTACT_EMAIL}`,
  websiteUrl: OFFICIAL_SITE_URL,
  facebookUrl: 'https://www.facebook.com/profile.php?id=61595040401874',
  youtubeUrl: 'https://youtube.com/@noorbayanacademy?si=wj_VlS4i4iOzZ97T',
} as const;

export function WhatsAppBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#25D366" />
      <path
        fill="#FFFFFF"
        d="M16.03 6.2c-5.41 0-9.8 4.38-9.8 9.78 0 1.88.53 3.71 1.54 5.29L6.5 25.8l4.66-1.22a9.77 9.77 0 0 0 4.87 1.3c5.41 0 9.8-4.38 9.8-9.78 0-5.46-4.39-9.9-9.8-9.9Zm5.72 13.85c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.13-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.96-4.4-.15-.19-1.18-1.57-1.18-2.99 0-1.43.75-2.13 1.01-2.42.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2.01.89 2.15.07.15.12.32.02.51-.1.19-.15.32-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.17-.19.73-.85.92-1.14.19-.29.39-.24.65-.15.27.1 1.69.8 1.98.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z"
      />
    </svg>
  );
}

export function GmailBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FFFFFF" stroke="#E5DEC9" strokeWidth="1.5" />
      <path fill="#4285F4" d="M6.5 23.5h3.8v-8.4L5 11.1v10.9c0 .83.67 1.5 1.5 1.5Z" />
      <path fill="#34A853" d="M21.7 23.5h3.8c.83 0 1.5-.67 1.5-1.5V11.1l-5.3 4v8.4Z" />
      <path fill="#FBBC04" d="M21.7 9.6v5.5L27 11.1V9.9c0-1.85-2.12-2.91-3.6-1.8l-1.7 1.5Z" />
      <path fill="#EA4335" d="M10.3 15.1V9.6l5.7 4.28 5.7-4.28v5.5L16 19.38l-5.7-4.28Z" />
      <path fill="#C5221F" d="M5 9.9v1.2l5.3 4V9.6L8.6 8.1C7.12 6.99 5 8.05 5 9.9Z" />
    </svg>
  );
}

export function FacebookBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M21.2 20.4l.7-4.5h-4.3v-2.9c0-1.23.6-2.43 2.54-2.43h1.96V6.73s-1.78-.3-3.48-.3c-3.55 0-5.87 2.15-5.87 6.05v3.42H8.8v4.5h3.95V31.2a15.7 15.7 0 0 0 4.85 0V20.4h3.6Z"
      />
    </svg>
  );
}

export function YouTubeBrandIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FF0000" />
      <path
        fill="#FFFFFF"
        d="M25.6 11.6a2.6 2.6 0 0 0-1.83-1.84C22.15 9.32 16 9.32 16 9.32s-6.15 0-7.77.44a2.6 2.6 0 0 0-1.83 1.84C6 13.23 6 16.62 6 16.62s0 3.39.4 5.02a2.6 2.6 0 0 0 1.83 1.84c1.62.44 7.77.44 7.77.44s6.15 0 7.77-.44a2.6 2.6 0 0 0 1.83-1.84c.4-1.63.4-5.02.4-5.02s0-3.39-.4-5.02ZM13.95 19.7v-6.16l5.28 3.08-5.28 3.08Z"
      />
    </svg>
  );
}
