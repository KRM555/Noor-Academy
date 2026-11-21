import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  MessageSquare,
  Lightbulb,
  Star,
  ThumbsUp,
  Send,
  Trash2,
  LogIn,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { dict, tField } from '../../i18n/translations';
import type {
  AcademySuggestion,
  CommunityComment,
  PublicOverview,
  SuggestionCategory,
} from '../../types';
import { Card, PrimaryButton, SecondaryButton, ResilientImage } from '../../components/ui/CommonUI';
import { FadeUp, AnimatedCounter } from '../../components/ui/MotionPrimitives';
import {
  formatRoleLabel,
  formatSuggestionCategory,
  formatSuggestionStatus,
  suggestionStatusClass,
} from '../../components/dashboard/MyCommunityPanel';

import { getCourseImageUrl } from '../../lib/courseImages';
import { formatCoursePriceSummary, type DisplayCurrency } from '../../lib/currency';

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
    q_ar: 'كيف يتابع ولي الأمر تقدم الأبناء؟',
    q_en: 'How do parents and guardians track progress?',
    a_ar: 'يحصل الطالب على تقييم دوري في لوحة التحكم، كما نوفر قسماً خاصاً بأولياء الأمور لتبادل الخبرات والاستفادة من النصائح التربوية.',
    a_en: 'Periodic evaluations appear in the dashboard, supported by our dedicated Parents Corner for educational guidance.',
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
  const { lang, theme, toggleTheme, currency, setCurrency, user, toast } = useApp();
  const qc = useQueryClient();
  const t = dict[lang];
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const heroRef = useRef<HTMLElement | null>(null);

  // Real Community Reviews State
  const [commentRating, setCommentRating] = useState(5);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);

  // Academy Development Suggestions State
  const [sugCategory, setSugCategory] = useState<SuggestionCategory>('platform');
  const [sugTitle, setSugTitle] = useState('');
  const [sugDesc, setSugDesc] = useState('');
  const [postingSug, setPostingSug] = useState(false);

  const { data: commentsData } = useQuery({
    queryKey: queryKeys.publicComments,
    queryFn: () => apiFetch<{ comments: CommunityComment[] }>('/api/public/comments'),
  });
  const { data: suggestionsData } = useQuery({
    queryKey: queryKeys.publicSuggestions,
    queryFn: () => apiFetch<{ suggestions: AcademySuggestion[] }>('/api/public/suggestions'),
  });

  const refreshCommunity = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.publicComments });
    void qc.invalidateQueries({ queryKey: queryKeys.publicSuggestions });
    if (user) {
      void qc.invalidateQueries({ queryKey: queryKeys.myCommunity(user.id) });
    }
  };

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (commentBody.trim().length < 5) {
      toast(lang === 'ar' ? 'يرجى كتابة تعليق لا يقل عن 5 أحرف.' : 'Comment must be at least 5 characters.', 'error');
      return;
    }
    setPostingComment(true);
    try {
      await apiFetch('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ rating: commentRating, content: commentBody.trim() }),
      });
      setCommentBody('');
      setCommentRating(5);
      toast(lang === 'ar' ? 'تم نشر تعليقك بنجاح وحفظه في ملفك الشخصي' : 'Review posted & saved to your profile!', 'success');
      refreshCommunity();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to post review', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  const handleReplyComment = async (commentId: string) => {
    if (replyBody.trim().length < 2) return;
    setPostingReply(true);
    try {
      await apiFetch(`/api/comments/${commentId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ content: replyBody.trim() }),
      });
      setReplyTargetId(null);
      setReplyBody('');
      toast(lang === 'ar' ? 'تمت إضافة الرد' : 'Reply added', 'success');
      refreshCommunity();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to reply', 'error');
    } finally {
      setPostingReply(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      toast(lang === 'ar' ? 'تم حذف التعليق' : 'Review removed', 'info');
      refreshCommunity();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleCreateSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sugTitle.trim().length < 4 || sugDesc.trim().length < 10) {
      toast(
        lang === 'ar' ? 'أدخل عنواناً واضحاً (4+ أحرف) وتفاصيل الاقتراح (10+ أحرف).' : 'Enter title (4+ chars) and details (10+ chars).',
        'error'
      );
      return;
    }
    setPostingSug(true);
    try {
      await apiFetch('/api/suggestions', {
        method: 'POST',
        body: JSON.stringify({ category: sugCategory, title: sugTitle.trim(), description: sugDesc.trim() }),
      });
      setSugTitle('');
      setSugDesc('');
      toast(lang === 'ar' ? 'تم تسجيل مقترحك لتطوير الأكاديمية بنجاح' : 'Suggestion submitted successfully!', 'success');
      refreshCommunity();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to submit suggestion', 'error');
    } finally {
      setPostingSug(false);
    }
  };

  const handleToggleVote = async (suggestionId: string) => {
    if (!user) {
      toast(lang === 'ar' ? 'يرجى تسجيل الدخول أولاً للتصويت على المقترحات.' : 'Sign in first to upvote suggestions.', 'info');
      onNavigate('/login');
      return;
    }
    try {
      await apiFetch(`/api/suggestions/${suggestionId}/vote`, { method: 'POST' });
      refreshCommunity();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Vote failed', 'error');
    }
  };

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

  const featuredCourses = overview?.courses || [];
  const teachers = overview?.teachers || [];
  const communityComments = commentsData?.comments || [];
  const suggestions = suggestionsData?.suggestions || [];

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
                priority={theme === 'day'}
                className={`w-full h-full object-cover transition-opacity duration-500 ${
                  theme === 'day' ? 'opacity-100' : 'opacity-0'
                }`}
                fallbackTitle="Noor & Bayan Academy"
              />
              <ResilientImage
                src={nightHeroImg}
                alt={lang === 'ar' ? 'مشهد ليلي هادئ لأكاديمية نور وبيان' : 'Nighttime library illustration'}
                priority={theme === 'night'}
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
                  loading="lazy"
                  decoding="async"
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
            { val: overview?.stats.students ?? 0, label: t.statsStudents, suffix: (overview?.stats.students ?? 0) > 0 ? '+' : '' },
            { val: overview?.stats.teachers ?? 0, label: t.statsTeachers, suffix: '' },
            { val: overview?.stats.courses ?? 0, label: t.statsCourses, suffix: '' },
            { val: overview?.stats.lessons ?? 0, label: t.statsLessons, suffix: (overview?.stats.lessons ?? 0) > 0 ? '+' : '' },
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
                loading="lazy"
                decoding="async"
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

      {/* 4. LIVE ENROLLABLE COURSES (تظهر الدورات المضافة فعلياً فقط) */}
      <section className="bg-[#F2EFE6] dark:bg-[#0D1C36] border-y border-[#E5DEC9] dark:border-[#233C63] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-extrabold">{t.coursesTitle}</h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">{t.coursesSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="inline-flex rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] p-1 text-xs font-bold">
                {(
                  [
                    { id: 'BOTH', ar: 'ج.م + ر.س', en: 'EGP + SAR' },
                    { id: 'EGP', ar: 'ج.م', en: 'EGP' },
                    { id: 'SAR', ar: 'ر.س', en: 'SAR' },
                  ] as Array<{ id: DisplayCurrency; ar: string; en: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCurrency(opt.id)}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      currency === opt.id
                        ? 'bg-[#0F213E] text-white dark:bg-[#C98A1E]'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#0F213E]'
                    }`}
                  >
                    {lang === 'ar' ? opt.ar : opt.en}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onNavigate('/courses')}
                className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {lang === 'ar' ? 'عرض كل الدورات ←' : 'View All Courses →'}
              </button>
            </div>
          </div>

          {featuredCourses.length === 0 ? (
            <Card className="p-8 sm:p-10 text-center space-y-3 bg-white dark:bg-[#0F213E]">
              <BookOpen className="w-8 h-8 text-[#C98A1E] mx-auto" />
              <h3 className="text-lg font-bold">
                {lang === 'ar' ? 'لا توجد دورات منشورة حالياً' : 'No Published Courses Yet'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                {lang === 'ar'
                  ? 'ستظهر الدورات هنا تلقائياً فور إضافتها من لوحة تحكم الإدارة.'
                  : 'Courses added from the Academy Admin Dashboard will automatically appear here.'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuredCourses.map((course, idx) => (
                <FadeUp key={course.id} delay={idx * 0.05}>
                  <Card className="overflow-hidden h-full flex flex-col justify-between hover:-translate-y-1 transition-transform duration-200 bg-white dark:bg-[#0F213E]">
                    <div>
                      <div className="aspect-[16/10] bg-[#FAF8F3] dark:bg-[#13284A] overflow-hidden">
                        <ResilientImage
                          src={getCourseImageUrl(course.title_ar, course.cover_url)}
                          alt={tField(course as unknown as Record<string, unknown>, 'title', lang)}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 pb-2 space-y-2.5">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {[
                            tField(course as unknown as Record<string, unknown>, 'level_name', lang),
                            tField(course as unknown as Record<string, unknown>, 'teacher_name', lang),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
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
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{tField(course as unknown as Record<string, unknown>, 'schedule', lang)}</span>
                        <span className="font-bold text-sm text-[#0F213E] dark:text-[#F8F5EC] tabular-nums">
                          {formatCoursePriceSummary(course, lang, currency)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onNavigate(`/courses/${course.id}`)}
                          className="flex-1 rounded-xl py-2 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] transition-colors cursor-pointer"
                        >
                          {lang === 'ar' ? 'تفاصيل الدورة' : 'Course Details'}
                        </button>
                        <button
                          onClick={() => onNavigate('/apply')}
                          className="flex-1 rounded-xl py-2 text-xs font-bold bg-[#0F766E] hover:bg-[#0D625B] text-white transition-colors cursor-pointer"
                        >
                          {t.navApply}
                        </button>
                      </div>
                    </div>
                  </Card>
                </FadeUp>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. HOW WE WORK */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-10">
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
      </section>

      {/* 6. PARENTS & GUARDIANS SECTION (قسم أولياء الأمور) */}
      <section className="bg-[#F2EFE6] dark:bg-[#0D1C36] border-y border-[#E5DEC9] dark:border-[#233C63] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Card className="p-6 sm:p-10 bg-white dark:bg-[#0F213E] grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#C98A1E]">
              <Heart className="w-4 h-4" />
              <span>{lang === 'ar' ? 'قسم خاص بأولياء الأمور' : 'Dedicated Parents & Guardians Corner'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              {lang === 'ar' ? 'ولي الأمر شريك في رحلة نجاح طفلك' : 'Parents Are True Partners in Your Child’s Success'}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'مساحة تجمع أولياء الأمور لتبادل الخبرات، والاستفادة من النصائح التربوية والتعليمية، ومتابعة كل ما يساعد في تربية أبنائنا وتنمية مهاراتهم.'
                : 'A supportive space bringing parents and guardians together to share experiences, benefit from educational and parenting tips, and nurture children’s skills.'}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <PrimaryButton onClick={() => onNavigate('/parents')}>
                {lang === 'ar' ? 'استكشف قسم أولياء الأمور' : 'Explore Parents Corner'}
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
                title_ar: 'تبادل الخبرات بين أولياء الأمور',
                title_en: 'Shared Parent Experiences',
                desc_ar: 'حوارات موجهة مع المشرفين التربويين حول تنمية مهارات الأبناء.',
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
        </div>
      </section>

      {/* 7. TEACHERS SHOWCASE */}
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

        {teachers.length === 0 ? (
          <Card className="p-8 text-center space-y-2 bg-white dark:bg-[#0F213E]">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {lang === 'ar'
                ? 'سيتم عرض المعلمين المعتمدين هنا فور إضافتهم من لوحة الإدارة.'
                : 'Approved teachers will appear here once added from the admin dashboard.'}
            </p>
          </Card>
        ) : (
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
        )}
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

      {/* 10. REAL AUTHENTICATED COMMUNITY REVIEWS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
              <MessageSquare className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تجارب موثقة من أعضاء الأكاديمية' : 'Verified Member Reviews'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              {lang === 'ar' ? 'آراء وتعليقات طلابنا وأولياء الأمور' : 'Community Reviews & Reflections'}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
              {lang === 'ar'
                ? 'تعليقات حقيقية من الأعضاء المسجلين فقط في الأكاديمية، وتُحفظ تلقائياً في الملف الشخصي مع الردود.'
                : 'Authentic reviews published exclusively by registered academy members, synced with their profile and replies.'}
            </p>
          </div>
          {!user && (
            <SecondaryButton onClick={() => onNavigate('/login')} className="text-xs shrink-0">
              <LogIn className="w-4 h-4" />
              <span>{lang === 'ar' ? 'سجّل الدخول لإضافة تعليقك' : 'Sign In to Review'}</span>
            </SecondaryButton>
          )}
        </div>

        {user && (
          <Card className="p-5 sm:p-6 space-y-3 bg-white dark:bg-[#0F213E]">
            <form onSubmit={handleCreateComment} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold">
                  {lang === 'ar' ? `اكتب تعليقك باسم ${user.full_name} (${formatRoleLabel(user.role, lang)}):` : `Posting as ${user.full_name} (${formatRoleLabel(user.role, lang)}):`}
                </div>
                <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={lang === 'ar' ? 'التقييم' : 'Rating'}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCommentRating(n)}
                      className="p-1 cursor-pointer"
                      aria-label={`${n} stars`}
                    >
                      <Star className={`w-4 h-4 ${n <= commentRating ? 'fill-[#C98A1E] text-[#C98A1E]' : 'text-slate-300 dark:text-slate-600'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={2}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                maxLength={800}
                placeholder={lang === 'ar' ? 'شارك تجربتك مع الحلقات والمعلمين والمتابعة...' : 'Share your honest reflection on classes & teachers...'}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  {lang === 'ar' ? 'سيظهر تعليقك والردود عليه داخل ملفك الشخصي في لوحة التحكم.' : 'Your review & replies also appear in your dashboard profile.'}
                </span>
                <PrimaryButton type="submit" disabled={postingComment} className="text-xs">
                  <Send className="w-3.5 h-3.5" />
                  <span>{postingComment ? (lang === 'ar' ? 'جاري النشر...' : 'Publishing...') : (lang === 'ar' ? 'نشر التعليق' : 'Post Review')}</span>
                </PrimaryButton>
              </div>
            </form>
          </Card>
        )}

        {communityComments.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <MessageSquare className="w-8 h-8 text-[#C98A1E] mx-auto" />
            <div className="font-bold text-base">
              {lang === 'ar' ? 'لا توجد تعليقات منشورة بعد — كن أول من يشارك رأيه!' : 'No member reviews published yet — be the first!'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {lang === 'ar'
                ? 'لضمان المصداقية، تُتاح التعليقات للأعضاء المسجلين في الأكاديمية (الطلاب، أولياء الأمور، والمعلمين) فقط.'
                : 'To guarantee authenticity, only registered students, guardians, and teachers can post reviews.'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communityComments.map((item) => (
              <Card key={item.id} className="p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-0.5 text-[#C98A1E]" aria-label={`${item.rating}/5`}>
                      {Array.from({ length: item.rating }).map((_, idx) => (
                        <Star key={idx} className="w-3.5 h-3.5 fill-[#C98A1E]" />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono-tabular text-slate-400">{item.created_at.slice(0, 10)}</span>
                  </div>

                  <p className="text-sm sm:text-base leading-relaxed text-[#0F213E] dark:text-[#F8F5EC]">
                    “{item.content}”
                  </p>

                  {item.replies.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[#EFEAD8] dark:border-[#1D355B]">
                      {item.replies.map((r) => (
                        <div key={r.id} className="p-2.5 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] text-xs space-y-1">
                          <div className="font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                            {r.author_name} · {formatRoleLabel(r.author_role, lang)}
                          </div>
                          <p className="text-slate-700 dark:text-slate-200">{r.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm">{item.author_name}</div>
                      <div className="text-xs text-[#0F766E] dark:text-[#2DD4BF] font-semibold">
                        {formatRoleLabel(item.author_role, lang)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {user && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTargetId(replyTargetId === item.id ? null : item.id);
                            setReplyBody('');
                          }}
                          className="font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                        >
                          {lang === 'ar' ? 'رد' : 'Reply'}
                        </button>
                      )}
                      {(item.is_mine || user?.role === 'admin') && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(item.id)}
                          className="text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          title={lang === 'ar' ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {user && replyTargetId === item.id && (
                    <div className="flex gap-2 pt-1">
                      <input
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        maxLength={600}
                        placeholder={lang === 'ar' ? 'اكتب رداً...' : 'Write a reply...'}
                        className="flex-1 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-1.5 text-xs"
                      />
                      <PrimaryButton
                        type="button"
                        disabled={postingReply}
                        onClick={() => void handleReplyComment(item.id)}
                        className="text-xs py-1.5"
                      >
                        {lang === 'ar' ? 'إرسال' : 'Send'}
                      </PrimaryButton>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 10B. ACADEMY & WEBSITE DEVELOPMENT SUGGESTIONS */}
      <section className="bg-[#F2EFE6] dark:bg-[#0C1A32] border-y border-[#E5DEC9] dark:border-[#233C63]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#C98A1E]">
                <Lightbulb className="w-4 h-4" />
                <span>{lang === 'ar' ? 'صوتك يصنع التطوير' : 'Co-Build the Academy'}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                {lang === 'ar' ? 'اقتراحات تطوير الأكاديمية والموقع' : 'Academy & Platform Development Suggestions'}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
                {lang === 'ar'
                  ? 'هل لديك فكرة لميزة جديدة في الموقع أو دورة مطلوبة أو تحسين في تجربة التعلم؟ شاركنا مقترحك وتابع حالة تنفيذه.'
                  : 'Have an idea for a new course, website feature, or learning improvement? Share it and vote on community ideas.'}
              </p>
            </div>
            {!user && (
              <SecondaryButton onClick={() => onNavigate('/login')} className="text-xs shrink-0">
                <LogIn className="w-4 h-4" />
                <span>{lang === 'ar' ? 'سجّل الدخول لإرسال مقترح' : 'Sign In to Suggest'}</span>
              </SecondaryButton>
            )}
          </div>

          {user && (
            <Card className="p-5 sm:p-6 bg-white dark:bg-[#0F213E]">
              <form onSubmit={handleCreateSuggestion} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
                    value={sugCategory}
                    onChange={(e) => setSugCategory(e.target.value as SuggestionCategory)}
                    className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-xs font-semibold"
                  >
                    <option value="platform">{formatSuggestionCategory('platform', lang)}</option>
                    <option value="curriculum">{formatSuggestionCategory('curriculum', lang)}</option>
                    <option value="experience">{formatSuggestionCategory('experience', lang)}</option>
                    <option value="other">{formatSuggestionCategory('other', lang)}</option>
                  </select>
                  <input
                    value={sugTitle}
                    onChange={(e) => setSugTitle(e.target.value)}
                    maxLength={120}
                    placeholder={lang === 'ar' ? 'عنوان المقترح (مثال: إضافة مسار تجويد مكثف للكبار)' : 'Suggestion title...'}
                    className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2 text-sm"
                  />
                </div>
                <textarea
                  rows={2}
                  value={sugDesc}
                  onChange={(e) => setSugDesc(e.target.value)}
                  maxLength={1200}
                  placeholder={lang === 'ar' ? 'اشرح المقترح والفائدة المرجوة منه...' : 'Describe your suggestion and how it helps...'}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2 text-sm"
                />
                <PrimaryButton type="submit" disabled={postingSug} className="text-xs">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>{postingSug ? (lang === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : (lang === 'ar' ? 'إرسال المقترح' : 'Submit Suggestion')}</span>
                </PrimaryButton>
              </form>
            </Card>
          )}

          {suggestions.length === 0 ? (
            <Card className="p-8 text-center space-y-2 bg-white dark:bg-[#0F213E]">
              <Lightbulb className="w-8 h-8 text-[#C98A1E] mx-auto" />
              <div className="font-bold text-base">
                {lang === 'ar' ? 'نرحب بأول مقترح تطويري من طلابنا وأولياء الأمور!' : 'We welcome your first development idea!'}
              </div>
              <p className="text-xs text-slate-500">
                {lang === 'ar'
                  ? 'كل مقترح يُراجع مباشرة من إدارة الأكاديمية مع إظهار حالة التنفيذ.'
                  : 'Every suggestion is reviewed by academy management with transparent status tracking.'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {suggestions.slice(0, 6).map((s) => (
                <Card key={s.id} className="p-5 flex flex-col justify-between space-y-4 bg-white dark:bg-[#0F213E]">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${suggestionStatusClass(s.status)}`}>
                        {formatSuggestionStatus(s.status, lang)}
                      </span>
                      <span className="text-slate-500 font-semibold">{formatSuggestionCategory(s.category, lang)}</span>
                    </div>
                    <h3 className="font-extrabold text-base">{s.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{s.description}</p>
                    {s.admin_reply && (
                      <div className="p-3 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] text-xs space-y-1 border border-[#E5DEC9] dark:border-[#233C63]">
                        <div className="font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                          {lang === 'ar' ? 'رد الإدارة:' : 'Director Note:'}
                        </div>
                        <p>{s.admin_reply}</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#EFEAD8] dark:border-[#1D355B] flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">
                      <span className="font-bold text-[#0F213E] dark:text-[#F8F5EC]">{s.author_name}</span>
                      {' · '}
                      <span>{formatRoleLabel(s.author_role, lang)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleVote(s.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                        s.has_voted
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-[#FAF8F3] dark:bg-[#13284A] border-[#D6CDB4] dark:border-[#294A7D] hover:border-[#C98A1E]'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{s.votes_count}</span>
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

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
