export function getCourseImageUrl(titleAr: string): string {
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
