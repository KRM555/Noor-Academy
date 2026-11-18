import React, { useMemo } from 'react';
import { useApp } from '../../contexts/AppContext';

export interface CountryDialCode {
  code: string;
  iso: string;
  flag: string;
  name_ar: string;
  name_en: string;
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: '+20', iso: 'EG', flag: '🇪🇬', name_ar: 'مصر', name_en: 'Egypt' },
  { code: '+966', iso: 'SA', flag: '🇸🇦', name_ar: 'السعودية', name_en: 'Saudi Arabia' },
  { code: '+971', iso: 'AE', flag: '🇦🇪', name_ar: 'الإمارات', name_en: 'UAE' },
  { code: '+965', iso: 'KW', flag: '🇰🇼', name_ar: 'الكويت', name_en: 'Kuwait' },
  { code: '+974', iso: 'QA', flag: '🇶🇦', name_ar: 'قطر', name_en: 'Qatar' },
  { code: '+973', iso: 'BH', flag: '🇧🇭', name_ar: 'البحرين', name_en: 'Bahrain' },
  { code: '+968', iso: 'OM', flag: '🇴🇲', name_ar: 'عُمان', name_en: 'Oman' },
  { code: '+962', iso: 'JO', flag: '🇯🇴', name_ar: 'الأردن', name_en: 'Jordan' },
  { code: '+970', iso: 'PS', flag: '🇵🇸', name_ar: 'فلسطين', name_en: 'Palestine' },
  { code: '+961', iso: 'LB', flag: '🇱🇧', name_ar: 'لبنان', name_en: 'Lebanon' },
  { code: '+963', iso: 'SY', flag: '🇸🇾', name_ar: 'سوريا', name_en: 'Syria' },
  { code: '+964', iso: 'IQ', flag: '🇮🇶', name_ar: 'العراق', name_en: 'Iraq' },
  { code: '+967', iso: 'YE', flag: '🇾🇪', name_ar: 'اليمن', name_en: 'Yemen' },
  { code: '+212', iso: 'MA', flag: '🇲🇦', name_ar: 'المغرب', name_en: 'Morocco' },
  { code: '+213', iso: 'DZ', flag: '🇩🇿', name_ar: 'الجزائر', name_en: 'Algeria' },
  { code: '+216', iso: 'TN', flag: '🇹🇳', name_ar: 'تونس', name_en: 'Tunisia' },
  { code: '+218', iso: 'LY', flag: '🇱🇾', name_ar: 'ليبيا', name_en: 'Libya' },
  { code: '+249', iso: 'SD', flag: '🇸🇩', name_ar: 'السودان', name_en: 'Sudan' },
  { code: '+222', iso: 'MR', flag: '🇲🇷', name_ar: 'موريتانيا', name_en: 'Mauritania' },
  { code: '+90', iso: 'TR', flag: '🇹🇷', name_ar: 'تركيا', name_en: 'Turkey' },
  { code: '+44', iso: 'GB', flag: '🇬🇧', name_ar: 'بريطانيا', name_en: 'UK' },
  { code: '+1', iso: 'US', flag: '🇺🇸', name_ar: 'أمريكا / كندا', name_en: 'US / Canada' },
  { code: '+49', iso: 'DE', flag: '🇩🇪', name_ar: 'ألمانيا', name_en: 'Germany' },
  { code: '+33', iso: 'FR', flag: '🇫🇷', name_ar: 'فرنسا', name_en: 'France' },
  { code: '+60', iso: 'MY', flag: '🇲🇾', name_ar: 'ماليزيا', name_en: 'Malaysia' },
  { code: '+62', iso: 'ID', flag: '🇮🇩', name_ar: 'إندونيسيا', name_en: 'Indonesia' },
];

const SORTED_BY_LENGTH = [...COUNTRY_DIAL_CODES].sort((a, b) => b.code.length - a.code.length);

export function splitPhoneWithDialCode(rawValue?: string | null): { dialCode: string; localNumber: string } {
  const cleaned = String(rawValue || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) {
    return { dialCode: '+20', localNumber: '' };
  }
  const normalized = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
  if (normalized.startsWith('+')) {
    const matched = SORTED_BY_LENGTH.find((c) => normalized.startsWith(c.code));
    if (matched) {
      return {
        dialCode: matched.code,
        localNumber: normalized.slice(matched.code.length),
      };
    }
  }
  return {
    dialCode: '+20',
    localNumber: normalized.replace(/^\+/, ''),
  };
}

export function PhoneInputWithCode({
  value,
  onChange,
  onBlur,
  name,
  placeholder = '10XXXXXXXX',
  required = false,
  className = '',
  inputClassName = '',
}: {
  value?: string;
  onChange: (nextFullPhone: string) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const { lang } = useApp();
  const [selectedDial, setSelectedDial] = React.useState<string>(() => splitPhoneWithDialCode(value).dialCode);

  React.useEffect(() => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const parsed = splitPhoneWithDialCode(trimmed);
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      setSelectedDial(parsed.dialCode);
    }
  }, [value]);

  const localNumber = useMemo(() => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const parsed = splitPhoneWithDialCode(trimmed);
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      return parsed.localNumber;
    }
    return trimmed.replace(/[^\d]/g, '');
  }, [value]);

  const handleDialChange = (nextDial: string) => {
    setSelectedDial(nextDial);
    const digits = localNumber.replace(/[^\d]/g, '');
    onChange(digits ? `${nextDial} ${digits}` : '');
  };

  const handleLocalChange = (rawLocal: string) => {
    // Allow pasting full international number directly
    if (rawLocal.trim().startsWith('+')) {
      const parsed = splitPhoneWithDialCode(rawLocal);
      setSelectedDial(parsed.dialCode);
      const digits = parsed.localNumber.replace(/[^\d]/g, '');
      onChange(digits ? `${parsed.dialCode} ${digits}` : '');
      return;
    }
    const digits = rawLocal.replace(/[^\d]/g, '').slice(0, 15);
    onChange(digits ? `${selectedDial} ${digits}` : '');
  };

  return (
    <div dir="ltr" className={`flex items-stretch gap-1.5 ${className}`}>
      <select
        aria-label={lang === 'ar' ? 'كود الدولة' : 'Country Dial Code'}
        value={selectedDial}
        onChange={(e) => handleDialChange(e.target.value)}
        className="w-[116px] shrink-0 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-2 py-2.5 text-xs font-bold font-mono-tabular text-[#0F213E] dark:text-[#F8F5EC] cursor-pointer"
      >
        {COUNTRY_DIAL_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code} {lang === 'ar' ? c.name_ar : c.iso}
          </option>
        ))}
      </select>
      <input
        type="tel"
        name={name}
        dir="ltr"
        required={required}
        value={localNumber}
        onChange={(e) => handleLocalChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`flex-1 min-w-0 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2.5 text-sm font-mono-tabular ${inputClassName}`}
      />
    </div>
  );
}
