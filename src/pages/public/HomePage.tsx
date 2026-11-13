import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  ArrowLeft,
  ChevronDown,
  BookOpen,
  Gamepad2,
  Award,
  Compass,
  CheckCircle2,
  Sun,
  Moon,
  Heart,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { dict, tField } from '../../i18n/translations';
import type { PublicOverview } from '../../types';
import { Card, PrimaryButton, SecondaryButton, ResilientImage } from '../../components/ui/CommonUI';
import { FadeUp, AnimatedCounter } from '../../components/ui/MotionPrimitives';

import { getCourseImageUrl } from '../../lib/courseImages';

const nightHeroImg = '/assets/images/hero_noor_night.webp';
const CLIENT_BANNER_IMG = '/assets/images/academy_banner.webp';
const CLIENT_CLASSROOM_IMG = '/assets/images/virtual_classroom.webp';
const CLIENT_LOGO_IMG = '/assets/images/academy_logo.webp';

const WHY_US_POINTS = [
  {
    ar: 'معلمون ومعلمات متخصصون في مختلف المجالات.',
    en: 'Specialized male and female educators across all subjects.',
  },
  {
    ar: 'تعليم أونلاين من أي مكان.',
    en: 'Flexible online learning from anywhere in the world.',
  },
  {
    ar: 'برامج تناسب جميع الأعمار والمراحل.',
    en: 'Programs tailored for all ages and academic stages.',
  },
  {
    ar: 'مناهج عربية ودولية متنوعة.',
    en: 'Diverse Arabic, Quranic, and international curricula.',
  },
  {
    ar: 'خطط تعليمية تناسب مستوى كل طالب.',
    en: 'Individualized learning plans matched to each student’s level.',
  },
  {
    ar: 'متابعة مستمرة وتقييم دوري.',
    en: 'Continuous follow-up and periodic progress evaluations.',
  },
  {
    ar: 'حصص تفاعلية تجمع بين المتعة والاستفادة.',
    en: 'Interactive live sessions combining enjoyment and real mastery.',
  },
];

const EDUCATIONAL_SERVICES = [
  {
    title_ar: 'التأسيس واللغة العربية',
    title_en: 'Foundations & Arabic Language',
    desc_ar: 'نور البيان، القراءة، الكتابة، النحو والإملاء.',
    desc_en: 'Noor Al-Bayan, reading fluency, writing, grammar, and spelling.',
    image: '/assets/courses/course_arabic_foundations.jpg',
    courseMatchKeyword: 'نور البيان',
  },
  {
    title_ar: 'تعليم اللغات',
    title_en: 'World Languages',
    desc_ar: 'الإنجليزية والعربية والفرنسية والألمانية وغيرها.',
    desc_en: 'English, Arabic, French, German, and conversational fluency.',
    image: '/assets/courses/course_languages.jpg',
    courseMatchKeyword: 'اللغات',
  },
  {
    title_ar: 'المناهج الدولية',
    title_en: 'International Curricula',
    desc_ar: 'المناهج البريطانية والأمريكية والدولية.',
    desc_en: 'British, American, and international school tracks.',
    image: '/assets/courses/course_international.jpg',
    courseMatchKeyword: 'المناهج الدولية',
  },
  {
    title_ar: 'جميع المواد الدراسية',
    title_en: 'All School Subjects',
    desc_ar: 'رياضيات وعلوم وعربي وإنجليزي وجميع المواد.',
    desc_en: 'Mathematics, Science, Arabic, English, and core subjects.',
    image: '/assets/courses/course_all_subjects.jpg',
    courseMatchKeyword: 'جميع المواد',
  },
  {
    title_ar: 'القرآن والعلوم الإسلامية',
    title_en: 'Quran & Islamic Studies',
    desc_ar: 'تحفيظ وتجويد وقيم إسلامية وسيرة نبوية.',
    desc_en: 'Quran memorization, Tajweed, Islamic values, and Prophetic biography.',
    image: '/assets/courses/course_quran.jpg',
    courseMatchKeyword: 'القرآن',
  },
  {
    title_ar: 'الحساب الذهني وتنمية المهارات',
    title_en: 'Mental Math & Brain Skills',
    desc_ar: 'تنمية التركيز والذكاء والقدرات العقلية.',
    desc_en: 'Developing concentration, intelligence, and cognitive speed.',
    image: '/assets/courses/course_mental_math.jpg',
    courseMatchKeyword: 'الحساب الذهني',
  },
  {
    title_ar: 'تنمية النطق والمهارات',
    title_en: 'Speech & Communication Skills',
    desc_ar: 'برامج متخصصة لتنمية التواصل والمهارات.',
    desc_en: 'Specialized programs for clear articulation and communication.',
    image: '/assets/courses/course_speech_skills.jpg',
    courseMatchKeyword: 'النطق',
  },
  {
    title_ar: 'الدعم والمتابعة التعليمية',
    title_en: 'Academic Support & Follow-up',
    desc_ar: 'متابعة مستوى الطالب وتطوير أدائه باستمرار.',
    desc_en: 'Ongoing student performance coaching and parent updates.',
    image: '/assets/courses/course_academic_support.jpg',
    courseMatchKeyword: 'الدعم',
  },
];

const FAQ_ITEMS = [
  {
    q_ar: 'ما هي الفئة العمرية المناسبة للالتحاق بأكاديمية نور وبيان؟',
    q_en: 'What age groups can join Noor & Bayan Academy?',
    a_ar: 'نستقبل الأطفال والناشئة بمختلف الأعمار والمراحل الدراسية، ويتم توزيعهم في برامج تناسب عمرهم ومستواهم.',
    a_en: 'We welcome students across all childhood and youth stages, grouped by age and learning level.',
  },
  {
    q_ar: 'كيف أعرف المستوى المناسب لطفلي قبل التسجيل؟',
    q_en: 'How do I know the right level for my child before enrolling?',
    a_ar: 'يمكنك إجراء اختبار تحديد المستوى القصير مجاناً من الموقع ليوصي بالمسار الأنسب، ثم يؤكد المعلم التقييم في الحصة الأولى.',
    a_en: 'Take our free 2-minute placement test on the website for an instant recommendation, refined by our teacher in week one.',
  },
  {
    q_ar: 'هل تشمل الأكاديمية المناهج العربية والدولية معاً؟',
    q_en: 'Do you cover both Arabic/Quran and international curricula?',
    a_ar: 'نعم، نوفر مسارات القرآن ونور البيان واللغة العربية إلى جانب المناهج البريطانية والأمريكية واللغات والحساب الذهني.',
    a_en: 'Yes! Alongside Quran, Noor Al-Bayan, and Arabic, we offer British/American curricula, languages, and mental math.',
  },
  {
    q_ar: 'كيف يتابع ولي الأمر والأمهات تقدم الأبناء؟',
    q_en: 'How do mothers and guardians track progress?',
    a_ar: 'يحصل الطالب على تقييم دوري في لوحة التحكم، كما نوفر قسماً خاصاً للأمهات لتبادل الخبرات والاستفادة من النصائح التربوية.',
    a_en: 'Periodic evaluations appear in the dashboard, supported by our dedicated Mothers Community for educational guidance.',
  },
];

export function HomePage({
  overview,
  onNavigate,
  onLaunchGame,
}: {
  overview: PublicOverview | null;
  onNavigate: (path: string) => void;
  onLaunchGame: (slug: string) => void;
}) {
  const { lang, theme, toggleTheme } = useApp();
  const t = dict[lang];
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const heroRef = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const scrollBlend = useTransform(scrollYProgress, [0, 0.7], [0, 0.45]);
  const parallaxY = useTransform(scrollYProgress, [0, 1], [0, 24]);

  const steps = [
    {
      num: '01',
      title_ar: 'اختبار تحديد المستوى',
      title_en: 'Placement Check',
      desc_ar: 'تقييم سريع في 5 أسئلة يحدد نقطة البداية المناسبة لعمر طفلك.',
      desc_en: 'A calm 5-question check identifying your child’s ideal starting circle.',
    },
    {
      num: '02',
      title_ar: 'تقديم الطلب والموافقة',
      title_en: 'Admission & Matching',
      desc_ar: 'يراجع المدير الطلب ويربط حساب الطالب بالمعلم والجدول المناسب.',
      desc_en: 'Our academic director reviews the application and assigns the best circle.',
    },
    {
      num: '03',
      title_ar: 'أول حصة مباشرة',
      title_en: 'First Live Session',
      desc_ar: 'رابط واضح للحصة داخل لوحة الطالب مع أوراق عمل تفاعلية.',
      desc_en: 'Direct class link inside the student dashboard with illustrated worksheets.',
    },
    {
      num: '04',
      title_ar: 'تسميع وألعاب وشهادات',
      title_en: 'Mastery & Certificates',
      desc_ar: 'تقييم أسبوعي، ألعاب ترسيخ هادئة، وشهادات موثقة PDF.',
      desc_en: 'Weekly evaluations, reinforcement games, and verifiable PDF certificates.',
    },
  ];

  const featuredCourses = overview?.courses.slice(0, 6) || [];
  const teachers = overview?.teachers || [];
  const testimonials = overview?.testimonials || [];

  return (
    <div>
      {/* 1. HERO SECTION */}
      <section ref={heroRef} className="relative overflow-hidden border-b border-[#E5DEC9] dark:border-[#233C63]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
              <span>{lang === 'ar' ? 'معاً.. نتعلم ونبني المستقبل' : 'Together.. We Learn & Build the Future'}</span>
              <span aria-hidden="true">·</span>
              <button
                onClick={toggleTheme}
                className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-[#C98A1E] cursor-pointer"
              >
                {theme === 'day' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                <span>{theme === 'day' ? t.themeNight : t.themeDay}</span>
              </button>
            </div>

            <h1 className="text-[clamp(2rem,3.6vw,3.3rem)] font-extrabold leading-[1.2] tracking-tight text-balance">
              {t.heroTitle}
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t.heroSubtitle}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <PrimaryButton onClick={() => onNavigate('/apply')}>
                <span>{t.ctaApply}</span>
                <ArrowLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
              </PrimaryButton>
              <SecondaryButton onClick={() => onNavigate('/placement')}>
                <Compass className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                <span>{t.ctaPlacement}</span>
              </SecondaryButton>
            </div>
          </div>

          {/* Visual Showcase: Interactive Virtual Classroom in Day mode, serene Night library in Night mode */}
          <div className="lg:col-span-6 relative min-h-[300px] sm:min-h-[380px] rounded-2xl overflow-hidden border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E]">
            <motion.div style={{ y: parallaxY }} className="absolute inset-0">
              <ResilientImage
                src={CLIENT_CLASSROOM_IMG}
                alt={lang === 'ar' ? 'فصل تعليمي تفاعلي أونلاين في أكاديمية نور وبيان' : 'Interactive Virtual Learning Classroom at Noor & Bayan'}
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                  theme === 'day' ? 'opacity-100' : 'opacity-0'
                }`}
                fallbackTitle="Noor & Bayan Academy"
              />
              <ResilientImage
                src={nightHeroImg}
                alt={lang === 'ar' ? 'مشهد ليلي هادئ لأكاديمية نور وبيان' : 'Nighttime library illustration'}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                  theme === 'night' ? 'opacity-100' : 'opacity-0'
                }`}
                fallbackTitle="Noor & Bayan Night"
              />
              {theme === 'day' && (
                <motion.img
                  src={nightHeroImg}
                  alt=""
                  aria-hidden="true"
                  style={{ opacity: scrollBlend }}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* 2. STATS STRIP */}
      <section className="border-b border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { val: overview?.stats.students ?? 3, label: t.statsStudents, suffix: '+' },
            { val: overview?.stats.teachers ?? 3, label: t.statsTeachers, suffix: '' },
            { val: overview?.stats.courses ?? 10, label: t.statsCourses, suffix: '' },
            { val: overview?.stats.lessons ?? 4, label: t.statsLessons, suffix: '+' },
          ].map((stat, i) => (
            <div key={i} className="text-center md:text-start space-y-1">
              <div className="text-3xl sm:text-4xl font-extrabold text-[#0F213E] dark:text-[#F8F5EC]">
                <AnimatedCounter value={stat.val} suffix={stat.suffix} />
              </div>
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. WHO ARE WE & WHY NOOR & BAYAN (من نحن؟ + المميزات السبعة + صورة الصف التفاعلي) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-6 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src={CLIENT_LOGO_IMG}
                alt={t.brandFull}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl bg-white p-1 object-contain border border-[#E5DEC9] dark:border-[#233C63]"
              />
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                {lang === 'ar' ? 'من نحن؟' : 'Who Are We?'}
              </h2>
            </div>

            <div className="space-y-3 text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
              <p>
                {lang === 'ar'
                  ? 'أكاديمية نور وبيان هي منصة تعليمية إلكترونية متكاملة، تهدف إلى تقديم تعليم متميز يجمع بين الأصالة والحداثة.'
                  : 'Noor & Bayan Academy is a comprehensive online educational platform dedicated to delivering distinguished education that blends authenticity with modern pedagogy.'}
              </p>
              <p>
                {lang === 'ar'
                  ? 'نؤمن بأن كل طالب يمتلك قدرات خاصة تستحق الرعاية والتطوير، لذلك نوفر برامج تعليمية متنوعة تناسب مختلف الأعمار والمراحل والمناهج الدراسية.'
                  : 'We believe every student possesses unique potential worthy of care and growth, which is why we provide diverse programs tailored to all ages, stages, and curricula.'}
              </p>
              <p className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                {lang === 'ar'
                  ? 'نسعى إلى بناء جيل واعٍ، مبدع، متقن للعلم واللغات، وقادر على تحقيق طموحاته.'
                  : 'We strive to raise a conscious, creative generation proficient in knowledge and languages, capable of achieving their aspirations.'}
              </p>
            </div>

            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WHY_US_POINTS.map((pt, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs sm:text-sm text-[#0F213E] dark:text-[#F8F5EC]">
                  <CheckCircle2 className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF] shrink-0 mt-0.5" />
                  <span>{lang === 'ar' ? pt.ar : pt.en}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-2xl overflow-hidden border border-[#E5DEC9] dark:border-[#233C63] aspect-[3/2] bg-[#FAF8F3] dark:bg-[#0F213E]">
              <ResilientImage
                src={CLIENT_BANNER_IMG}
                alt={lang === 'ar' ? 'أكاديمية نور وبيان — معاً نتعلم ونبني المستقبل' : 'Noor & Bayan Academy — Together We Learn & Build the Future'}
                className="w-full h-full object-cover"
                fallbackTitle="Noor & Bayan Academy"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>{lang === 'ar' ? 'معاً.. نتعلّم ونبني المستقبل بإشراف معلمين ومعلمات متخصصين' : 'Together we learn and build the future with specialized educators'}</span>
              <button onClick={() => onNavigate('/apply')} className="font-bold text-[#C98A1E] hover:underline cursor-pointer">
                {t.ctaApply}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. EDUCATIONAL SERVICES / ACADEMY TRACKS (قسم خدماتنا التعليمية - 8 مسارات) */}
      <section className="bg-[#F2EFE6] dark:bg-[#0D1C36] border-y border-[#E5DEC9] dark:border-[#233C63] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                {lang === 'ar' ? 'خدماتنا التعليمية وبرامج الأكاديمية' : 'Our Educational Services & Programs'}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                {lang === 'ar'
                  ? 'ثمانية مسارات تعليمية متكاملة تجمع بين القرآن الكريم واللغة العربية واللغات والمناهج الدولية وتنمية المهارات.'
                  : 'Eight comprehensive tracks spanning Quran, Arabic, world languages, international curricula, mental math, and skill building.'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('/courses')}
              className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'ar' ? 'استعراض كافة الدورات والأسعار ←' : 'Browse All Courses & Fees →'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {EDUCATIONAL_SERVICES.map((svc, idx) => {
              const matchedCourse = overview?.courses.find((c) => c.title_ar.includes(svc.courseMatchKeyword));
              return (
                <FadeUp key={idx} delay={idx * 0.04}>
                  <Card className="overflow-hidden h-full flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200">
                    <div>
                      <div className="aspect-[16/10] bg-[#FAF8F3] dark:bg-[#13284A] overflow-hidden">
                        <ResilientImage
                          src={svc.image}
                          alt={lang === 'ar' ? svc.title_ar : svc.title_en}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-4 space-y-1.5">
                        <h3 className="text-base font-bold">
                          {lang === 'ar' ? svc.title_ar : svc.title_en}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {lang === 'ar' ? svc.desc_ar : svc.desc_en}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-2 text-xs">
                      {matchedCourse ? (
                        <button
                          onClick={() => onNavigate(`/courses/${matchedCourse.id}`)}
                          className="font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                        >
                          {lang === 'ar' ? 'تفاصيل المسار ←' : 'View Track →'}
                        </button>
                      ) : (
                        <button
                          onClick={() => onNavigate('/courses')}
                          className="font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                        >
                          {lang === 'ar' ? 'التفاصيل ←' : 'Details →'}
                        </button>
                      )}
                      <button
                        onClick={() => onNavigate('/apply')}
                        className="font-bold text-[#C98A1E] hover:underline cursor-pointer"
                      >
                        {t.navApply}
                      </button>
                    </div>
                  </Card>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. LIVE ENROLLABLE COURSES */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">{t.coursesTitle}</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">{t.coursesSubtitle}</p>
          </div>
          <button
            onClick={() => onNavigate('/courses')}
            className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {lang === 'ar' ? 'عرض كل الدورات ←' : 'View All Courses →'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {featuredCourses.map((course, idx) => (
            <FadeUp key={course.id} delay={idx * 0.05}>
              <Card className="overflow-hidden h-full flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200">
                <div>
                  <div className="aspect-[16/10] bg-[#FAF8F3] dark:bg-[#13284A] overflow-hidden">
                    <ResilientImage
                      src={getCourseImageUrl(course.title_ar)}
                      alt={tField(course as unknown as Record<string, unknown>, 'title', lang)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 pb-2 space-y-2.5">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {tField(course as unknown as Record<string, unknown>, 'level_name', lang)}
                      {' · '}
                      {tField(course as unknown as Record<string, unknown>, 'teacher_name', lang)}
                    </div>
                    <h3 className="text-base font-bold leading-snug">
                      {tField(course as unknown as Record<string, unknown>, 'title', lang)}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                      {tField(course as unknown as Record<string, unknown>, 'description', lang)}
                    </p>
                  </div>
                </div>

                <div className="p-5 pt-4 mt-2 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{tField(course as unknown as Record<string, unknown>, 'schedule', lang)}</span>
                    <span className="font-bold text-sm text-[#0F213E] dark:text-[#F8F5EC] tabular-nums">
                      {course.price_monthly} {t.monthlyCurrency}
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate(`/courses/${course.id}`)}
                    className="w-full rounded-xl py-2 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] transition-colors cursor-pointer"
                  >
                    {lang === 'ar' ? 'تفاصيل الحلقة' : 'Course Details'}
                  </button>
                </div>
              </Card>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* 6. HOW WE WORK */}
      <section className="bg-[#F2EFE6] dark:bg-[#0D1C36] border-y border-[#E5DEC9] dark:border-[#233C63] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">{t.howTitle}</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">{t.howSubtitle}</p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-4 gap-6">
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: lang === 'ar' ? 'right' : 'left' }}
              className="hidden md:block absolute top-6 inset-x-10 h-0.5 bg-[#C98A1E]/40"
            />
            {steps.map((s, idx) => (
              <FadeUp key={s.num} delay={idx * 0.08}>
                <div className="relative space-y-3 bg-white dark:bg-[#0F213E] rounded-2xl p-5 border border-[#E5DEC9] dark:border-[#233C63]">
                  <div className="w-10 h-10 rounded-xl bg-[#0F213E] dark:bg-[#C98A1E] text-white font-mono-tabular font-bold text-sm flex items-center justify-center">
                    {s.num}
                  </div>
                  <h3 className="text-base font-bold">{lang === 'ar' ? s.title_ar : s.title_en}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {lang === 'ar' ? s.desc_ar : s.desc_en}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* 7. MOTHERS & GUARDIANS SECTION (قسم خاص بالأمهات) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <Card className="p-6 sm:p-10 bg-white dark:bg-[#0F213E] grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#C98A1E]">
              <Heart className="w-4 h-4" />
              <span>{lang === 'ar' ? 'قسم خاص بالأمهات وأولياء الأمور' : 'Dedicated Mothers & Parents Community'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              {lang === 'ar' ? 'أنتِ شريكة في رحلة نجاح طفلك' : 'You Are a Partner in Your Child’s Success'}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'مجتمع يجمع الأمهات لتبادل الخبرات، والاستفادة من النصائح التربوية والتعليمية، ومناقشة كل ما يساعد في تربية أطفالنا وتنمية مهاراتهم.'
                : 'A supportive community bringing mothers together to share experiences, benefit from educational and parenting tips, and nurture children’s skills.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton onClick={() => onNavigate('/parents')}>
                {lang === 'ar' ? 'استكشفي ركن الأمهات' : 'Explore Mothers Corner'}
              </PrimaryButton>
              <SecondaryButton onClick={() => onNavigate('/placement')}>
                {t.ctaPlacement}
              </SecondaryButton>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 gap-3">
            {[
              {
                title_ar: 'نصائح تربوية يومية',
                title_en: 'Daily Parenting Guidance',
                desc_ar: 'خطوات عملية لترسيخ حب القرآن والمذاكرة الهادئة بدون توتر.',
                desc_en: 'Practical routines for calm study habits and love for Quran.',
              },
              {
                title_ar: 'تبادل الخبرات بين الأمهات',
                title_en: 'Shared Mothers Experience',
                desc_ar: 'حوارات موجهة مع المشرفات التربويات حول تنمية مهارات الأبناء.',
                desc_en: 'Guided discussions with academic mentors on child growth.',
              },
              {
                title_ar: 'تقارير متابعة واضحة',
                title_en: 'Clear Progress Updates',
                desc_ar: 'رؤية أسبوعية لمستوى الحفظ، النطق، والمشاركة في الحصة.',
                desc_en: 'Weekly visibility into memorization, speech, and participation.',
              },
            ].map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63]">
                <div className="font-bold text-sm">{lang === 'ar' ? item.title_ar : item.title_en}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{lang === 'ar' ? item.desc_ar : item.desc_en}</div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 8. TEACHERS SHOWCASE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">{t.teachersTitle}</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">{t.teachersSubtitle}</p>
          </div>
          <button
            onClick={() => onNavigate('/teachers')}
            className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {lang === 'ar' ? 'صفحة المعلمين ←' : 'Meet All Teachers →'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {teachers.map((teacher, idx) => (
            <FadeUp key={teacher.id} delay={idx * 0.08}>
              <Card className="overflow-hidden flex flex-col h-full">
                <div className="aspect-[4/3] bg-[#F2EFE6] dark:bg-[#13284A] overflow-hidden">
                  <ResilientImage
                    src={teacher.avatar_url}
                    alt={tField(teacher as unknown as Record<string, unknown>, 'name', lang)}
                    className="w-full h-full object-cover object-top"
                    fallbackTitle={tField(teacher as unknown as Record<string, unknown>, 'name', lang)}
                  />
                </div>
                <div className="p-5 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                      {tField(teacher as unknown as Record<string, unknown>, 'specialty', lang)}
                    </div>
                    <h3 className="text-lg font-bold">
                      {tField(teacher as unknown as Record<string, unknown>, 'name', lang)}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tField(teacher as unknown as Record<string, unknown>, 'qualifications', lang)}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                      {tField(teacher as unknown as Record<string, unknown>, 'bio', lang)}
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate(`/teachers/${teacher.id}`)}
                    className="mt-3 text-xs font-bold text-[#C98A1E] hover:underline text-start cursor-pointer"
                  >
                    {lang === 'ar' ? 'عرض السيرة والدورات ←' : 'View Profile & Courses →'}
                  </button>
                </div>
              </Card>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* 9. INTERACTIVE GAMES PREVIEW */}
      <section className="bg-[#0F213E] text-[#F8F5EC] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-extrabold">{t.gamesTitle}</h2>
              <p className="text-sm sm:text-base text-slate-300">{t.gamesSubtitle}</p>
            </div>
            <button
              onClick={() => onNavigate('/games')}
              className="text-sm font-bold text-amber-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'ar' ? 'مركز الألعاب الكامل ←' : 'Open Games Hub →'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(overview?.games || []).map((game) => (
              <div
                key={game.id}
                className="rounded-2xl bg-[#162C4E] border border-[#294A7D] p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-teal-300 font-semibold">
                    <Gamepad2 className="w-4 h-4" />
                    <span>
                      {game.category === '3d_explorer'
                        ? lang === 'ar' ? 'تجربة ثلاثية الأبعاد' : '3D Explorer'
                        : lang === 'ar' ? 'لعبة تعليمية 2D' : '2D Learning Game'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold">
                    {tField(game as unknown as Record<string, unknown>, 'title', lang)}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {tField(game as unknown as Record<string, unknown>, 'description', lang)}
                  </p>
                </div>
                <button
                  onClick={() => onLaunchGame(game.slug)}
                  className="w-full rounded-xl py-2.5 text-sm font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white transition-colors cursor-pointer"
                >
                  {lang === 'ar' ? 'جرّب الآن' : 'Play Sample Now'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. TESTIMONIALS */}
      {testimonials.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8 overflow-hidden">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">{t.testimonialsTitle}</h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">{t.testimonialsSubtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((item) => (
              <Card key={item.id} className="p-6 flex flex-col justify-between space-y-4">
                <p className="text-sm sm:text-base leading-relaxed text-[#0F213E] dark:text-[#F8F5EC]">
                  “{tField(item as unknown as Record<string, unknown>, 'quote', lang)}”
                </p>
                <div className="pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-1">
                  <div className="font-bold text-sm">
                    {tField(item as unknown as Record<string, unknown>, 'guardian_name', lang)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {tField(item as unknown as Record<string, unknown>, 'relation', lang)}
                    {' · '}
                    <span className="text-[#0F766E] dark:text-[#2DD4BF] font-semibold">
                      {tField(item as unknown as Record<string, unknown>, 'student_outcome', lang)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 11. FAQ ACCORDION */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center">{t.faqTitle}</h2>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <Card key={idx} className="overflow-hidden">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-start font-bold text-sm sm:text-base cursor-pointer"
                >
                  <span>{lang === 'ar' ? item.q_ar : item.q_en}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-[#EFEAD8] dark:border-[#1D355B] pt-3">
                    {lang === 'ar' ? item.a_ar : item.a_en}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* 12. CLOSING STATEMENT & FINAL CTA (العبارة الختامية للموقع) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Card className="p-8 sm:p-10 bg-[#0F213E] text-[#F8F5EC] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-300">
              <Sparkles className="w-4 h-4" />
              <span>{t.brandFull}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-300">
              {lang === 'ar' ? 'نور وبيان — لأن مستقبل أبنائنا يستحق الأفضل' : 'Noor & Bayan — Because Our Children’s Future Deserves the Best'}
            </h2>
            <p className="text-sm sm:text-base text-slate-200">
              {lang === 'ar'
                ? 'نعلّم بشغف.. نطوّر بتميز.. ونبني مستقبلاً مشرقاً.'
                : 'We teach with passion.. We nurture with excellence.. And we build a bright future.'}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-teal-300 font-semibold">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'ar' ? 'ضمان استرداد 14 يوماً' : '14-Day Refund Guarantee'}</span>
              <span className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" /> {lang === 'ar' ? 'شهادات موثقة برقم تحقق' : 'Verified Certificates'}</span>
              <span className="inline-flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {lang === 'ar' ? 'تقارير أسبوعية للأهل' : 'Weekly Parent Reports'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <PrimaryButton onClick={() => onNavigate('/apply')}>{t.ctaApply}</PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('/verify')}>{t.verifyCert}</SecondaryButton>
          </div>
        </Card>
      </section>
    </div>
  );
}
