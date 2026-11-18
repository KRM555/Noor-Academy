export const PRESET_COURSE_COVERS = [
  { url: '/assets/courses/course_arabic_foundations.jpg', label_ar: 'التأسيس واللغة العربية', label_en: 'Arabic Foundations' },
  { url: '/assets/courses/course_quran.jpg', label_ar: 'القرآن والعلوم الإسلامية', label_en: 'Quran & Islamic Studies' },
  { url: '/assets/courses/course_languages.jpg', label_ar: 'تعليم اللغات', label_en: 'World Languages' },
  { url: '/assets/courses/course_international.jpg', label_ar: 'المناهج الدولية', label_en: 'International Curricula' },
  { url: '/assets/courses/course_all_subjects.jpg', label_ar: 'جميع المواد الدراسية', label_en: 'All School Subjects' },
  { url: '/assets/courses/course_mental_math.jpg', label_ar: 'الحساب الذهني', label_en: 'Mental Math' },
  { url: '/assets/courses/course_speech_skills.jpg', label_ar: 'تنمية النطق والمهارات', label_en: 'Speech & Skills' },
  { url: '/assets/courses/course_academic_support.jpg', label_ar: 'الدعم والمتابعة', label_en: 'Academic Support' },
] as const;

export function getCourseImageUrl(titleAr: string, customCoverUrl?: string | null): string {
  const custom = (customCoverUrl || '').trim();
  if (custom) {
    return custom;
  }
  const title = titleAr || '';
  if (title.includes('نور البيان') || title.includes('القراءة') || title.includes('القصة') || title.includes('التأسيس')) {
    return '/assets/courses/course_arabic_foundations.jpg';
  }
  if (title.includes('القرآن') || title.includes('النور') || title.includes('التجويد') || title.includes('جزء')) {
    return '/assets/courses/course_quran.jpg';
  }
  if (title.includes('اللغات') || title.includes('الإنجليزية') || title.includes('الفرنسية')) {
    return '/assets/courses/course_languages.jpg';
  }
  if (title.includes('الدولية') || title.includes('البريطانية') || title.includes('الأمريكية')) {
    return '/assets/courses/course_international.jpg';
  }
  if (title.includes('جميع المواد') || title.includes('رياضيات وعلوم')) {
    return '/assets/courses/course_all_subjects.jpg';
  }
  if (title.includes('الحساب الذهني') || title.includes('العقلية')) {
    return '/assets/courses/course_mental_math.jpg';
  }
  if (title.includes('النطق') || title.includes('التواصل')) {
    return '/assets/courses/course_speech_skills.jpg';
  }
  if (title.includes('الدعم') || title.includes('المتابعة')) {
    return '/assets/courses/course_academic_support.jpg';
  }
  return '/assets/courses/course_arabic_foundations.jpg';
}
