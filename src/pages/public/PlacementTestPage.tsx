import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { tField } from '../../i18n/translations';
import type { Level, PlacementTestPublicConfig } from '../../types';
import { Card, LoadingState, PrimaryButton, SecondaryButton } from '../../components/ui/CommonUI';

export function PlacementTestPage({
  onSelectLevelForAdmission,
}: {
  onSelectLevelForAdmission: (levelId: number) => void;
}) {
  const { lang, toast } = useApp();
  const [childName, setChildName] = useState('');
  const [age, setAge] = useState('8');
  const [parentEmail, setParentEmail] = useState('');
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    correctCount: number;
    total: number;
    recommendedLevel: Level;
  } | null>(null);

  const { data: testConfig, isLoading } = useQuery({
    queryKey: queryKeys.publicPlacementTest,
    queryFn: () => apiFetch<PlacementTestPublicConfig>('/api/public/placement-test'),
  });

  const questions = testConfig?.questions || [];

  useEffect(() => {
    if (questions.length > 0 && answers.length !== questions.length) {
      setAnswers(Array(questions.length).fill(-1));
    }
  }, [questions.length, answers.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childName.trim() || answers.length !== questions.length || answers.some((a) => a === -1)) {
      toast(
        lang === 'ar'
          ? `يرجى إدخال اسم الطفل والإجابة على جميع الأسئلة (${questions.length}).`
          : `Please enter child name and answer all ${questions.length} questions.`,
        'error'
      );
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<{
        score: number;
        correctCount: number;
        total: number;
        recommendedLevel: Level;
      }>('/api/public/placement-test', {
        method: 'POST',
        body: JSON.stringify({
          child_name: childName.trim(),
          age: Number(age),
          parent_email: parentEmail.trim(),
          answers,
        }),
      });
      setResult(data);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <LoadingState label={lang === 'ar' ? 'جاري تحميل اختبار تحديد المستوى...' : 'Loading placement test...'} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
          <Compass className="w-4 h-4" />
          <span>{lang === 'ar' ? 'تقييم مجاني فوري' : 'Instant Free Assessment'}</span>
        </div>
        <h1 className="text-3xl font-extrabold">
          {lang === 'ar' ? 'اختبار تحديد المستوى' : 'Child Placement Test'}
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? testConfig?.intro_ar || 'أجب مع طفلك عن الأسئلة القصيرة التالية لنرشح لك المستوى والحلقة الأنسب له.'
            : testConfig?.intro_en || 'Complete these short questions with your child to receive an instant level recommendation.'}
        </p>
      </div>

      {result ? (
        <Card className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 text-[#0F766E] dark:text-[#2DD4BF]">
            <CheckCircle2 className="w-7 h-7" />
            <h2 className="text-2xl font-extrabold tabular-nums">
              {lang === 'ar'
                ? `النتيجة: ${result.score}% (${result.correctCount} من ${result.total})`
                : `Score: ${result.score}% (${result.correctCount} / ${result.total})`}
            </h2>
          </div>

          <div className="rounded-2xl bg-[#F2EFE6] dark:bg-[#13284A] p-5 space-y-2 border border-[#E5DEC9] dark:border-[#233C63]">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'المستوى المرشح لطفلك:' : 'Recommended Level:'}
            </div>
            <div className="text-xl font-bold text-[#0F213E] dark:text-[#F8F5EC]">
              {tField(result.recommendedLevel as unknown as Record<string, unknown>, 'name', lang)}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tField(result.recommendedLevel as unknown as Record<string, unknown>, 'description', lang)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={() => onSelectLevelForAdmission(result.recommendedLevel.id)}>
              <span>{lang === 'ar' ? 'قدّم الآن في هذا المستوى' : 'Apply for This Level'}</span>
              <ArrowLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setResult(null);
                setAnswers(Array(questions.length).fill(-1));
              }}
            >
              {lang === 'ar' ? 'إعادة الاختبار' : 'Retake Test'}
            </SecondaryButton>
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'اسم الطفل *' : 'Child Name *'}</label>
              <input
                type="text"
                required
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                placeholder={lang === 'ar' ? 'مثال: عمر خالد' : 'e.g. Omar Khaled'}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'العمر (بالسنوات) *' : 'Age (years) *'}</label>
              <input
                type="number"
                min={3}
                max={22}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'بريد ولي الأمر (اختياري)' : 'Parent Email (Optional)'}</label>
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                placeholder="parent@example.com"
              />
            </div>
          </Card>

          {questions.map((q, qIdx) => (
            <Card key={q.id || qIdx} className="p-6 space-y-3">
              <h3 className="font-bold text-sm sm:text-base">{lang === 'ar' ? q.q_ar : q.q_en || q.q_ar}</h3>
              <div className="grid grid-cols-1 gap-2.5">
                {(lang === 'ar' ? q.opts_ar : q.opts_en?.length ? q.opts_en : q.opts_ar).map((opt, oIdx) => {
                  const chosen = answers[qIdx] === oIdx;
                  return (
                    <button
                      key={oIdx}
                      type="button"
                      onClick={() => {
                        const next = [...answers];
                        next[qIdx] = oIdx;
                        setAnswers(next);
                      }}
                      className={`text-start px-4 py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                        chosen
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-[#FAF8F3] dark:bg-[#13284A] border-[#E5DEC9] dark:border-[#233C63] hover:border-[#C98A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}

          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? (lang === 'ar' ? 'جاري التحليل...' : 'Evaluating...') : lang === 'ar' ? 'عرض التوصية والمستوى' : 'Get Recommended Level'}
          </PrimaryButton>
        </form>
      )}
    </div>
  );
}
