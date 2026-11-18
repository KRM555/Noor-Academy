import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Compass, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import type { PlacementQuestionAdmin, PlacementTestAdminConfig } from '../../types';
import { Card, PrimaryButton, SecondaryButton, ResponsiveTable, LoadingState } from '../ui/CommonUI';

interface PlacementSubmissionRow {
  id: number;
  child_name: string;
  age: number;
  parent_email: string;
  score: number;
  level_name_ar: string;
  level_name_en: string;
  created_at: string;
}

export function PlacementTestEditor() {
  const { lang, toast } = useApp();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.adminPlacementTest,
    queryFn: () =>
      apiFetch<{ config: PlacementTestAdminConfig; submissions: PlacementSubmissionRow[] }>('/api/admin/placement-test'),
  });

  const [introAr, setIntroAr] = useState('');
  const [introEn, setIntroEn] = useState('');
  const [questions, setQuestions] = useState<PlacementQuestionAdmin[]>([]);
  const [intermediateMin, setIntermediateMin] = useState('50');
  const [advancedMin, setAdvancedMin] = useState('80');
  const [advancedMinAge, setAdvancedMinAge] = useState('9');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setIntroAr(data.config.intro_ar);
      setIntroEn(data.config.intro_en);
      setQuestions(data.config.questions);
      setIntermediateMin(String(data.config.thresholds.intermediate_min_score));
      setAdvancedMin(String(data.config.thresholds.advanced_min_score));
      setAdvancedMinAge(String(data.config.thresholds.advanced_min_age));
    }
  }, [data]);

  if (isLoading) {
    return <LoadingState label={lang === 'ar' ? 'جاري تحميل إعدادات اختبار تحديد المستوى...' : 'Loading placement test editor...'} />;
  }

  const addQuestion = () => {
    if (questions.length >= 20) {
      toast(lang === 'ar' ? 'الحد الأقصى 20 سؤالاً في اختبار تحديد المستوى.' : 'Max 20 questions allowed.', 'error');
      return;
    }
    const idx = questions.length + 1;
    setQuestions([
      ...questions,
      {
        id: `pt-new-${Date.now()}`,
        q_ar: `${idx}. سؤال جديد لتقييم مستوى الطالب`,
        q_en: `${idx}. New placement evaluation question`,
        opts_ar: ['مستوى مبتدئ', 'مستوى متوسط', 'مستوى متقدم'],
        opts_en: ['Beginner', 'Intermediate', 'Advanced'],
        correct_index: 2,
      },
    ]);
  };

  const updateQuestion = (index: number, patch: Partial<PlacementQuestionAdmin>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIndex: number, optIndex: number, field: 'opts_ar' | 'opts_en', value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const copy = [...q[field]];
        copy[optIndex] = value;
        return { ...q, [field]: copy };
      })
    );
  };

  const addOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.opts_ar.length >= 5) return q;
        return {
          ...q,
          opts_ar: [...q.opts_ar, `خيار ${q.opts_ar.length + 1}`],
          opts_en: [...(q.opts_en || q.opts_ar), `Option ${q.opts_ar.length + 1}`],
        };
      })
    );
  };

  const removeOption = (qIndex: number, optIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || q.opts_ar.length <= 2) return q;
        const nextAr = q.opts_ar.filter((_, idx) => idx !== optIndex);
        const nextEn = (q.opts_en || q.opts_ar).filter((_, idx) => idx !== optIndex);
        const nextCorrect = q.correct_index >= nextAr.length ? nextAr.length - 1 : q.correct_index === optIndex ? 0 : q.correct_index > optIndex ? q.correct_index - 1 : q.correct_index;
        return { ...q, opts_ar: nextAr, opts_en: nextEn, correct_index: nextCorrect };
      })
    );
  };

  const removeQuestion = (qIndex: number) => {
    if (questions.length <= 1) {
      toast(lang === 'ar' ? 'يجب الإبقاء على سؤال واحد على الأقل.' : 'At least 1 question is required.', 'error');
      return;
    }
    setQuestions((prev) => prev.filter((_, i) => i !== qIndex));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/placement-test', {
        method: 'PUT',
        body: JSON.stringify({
          intro_ar: introAr.trim(),
          intro_en: introEn.trim() || introAr.trim(),
          questions: questions.map((q) => ({
            ...q,
            q_ar: q.q_ar.trim(),
            q_en: (q.q_en || q.q_ar).trim(),
            opts_ar: q.opts_ar.map((o) => o.trim()),
            opts_en: (q.opts_en || q.opts_ar).map((o, idx) => o.trim() || q.opts_ar[idx].trim()),
          })),
          thresholds: {
            intermediate_min_score: Number(intermediateMin),
            advanced_min_score: Number(advancedMin),
            advanced_min_age: Number(advancedMinAge),
          },
        }),
      });
      toast(lang === 'ar' ? 'تم حفظ وتحديث اختبار تحديد المستوى العام بنجاح' : 'Placement test updated & published!', 'success');
      void qc.invalidateQueries({ queryKey: queryKeys.adminPlacementTest });
      void qc.invalidateQueries({ queryKey: queryKeys.publicPlacementTest });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
              <Compass className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تحرير اختبار الزوار العام' : 'Public Placement Test CMS'}</span>
            </div>
            <h2 className="text-lg font-extrabold">
              {lang === 'ar' ? 'تعديل أسئلة ومعايير اختبار تحديد المستوى' : 'Edit Placement Test Questions & Scoring'}
            </h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar'
                ? 'الإجابات الصحيحة تبقى مخفية ومحفوظة على السيرفر فقط، والتعديلات تنعكس فوراً في صفحة اختبار المستوى للزوار.'
                : 'Answer keys remain strictly server-side; changes publish live to the visitor placement page.'}
            </p>
          </div>
          <SecondaryButton type="button" onClick={addQuestion} className="text-xs">
            <Plus className="w-4 h-4" />
            <span>{lang === 'ar' ? 'إضافة سؤال جديد' : 'Add Question'}</span>
          </SecondaryButton>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'وصف الاختبار للزوار (عربي)' : 'Intro Text (AR)'}</label>
              <input
                value={introAr}
                onChange={(e) => setIntroAr(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'وصف الاختبار (إنجليزي)' : 'Intro Text (EN)'}</label>
              <input
                value={introEn}
                onChange={(e) => setIntroEn(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#091529] border border-[#E5DEC9] dark:border-[#233C63]">
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'نسبة ترشيح المستوى المتوسط (%)' : 'Intermediate Min Score (%)'}</label>
              <input
                type="number"
                min={1}
                max={99}
                value={intermediateMin}
                onChange={(e) => setIntermediateMin(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'نسبة ترشيح المستوى المتقدم (%)' : 'Advanced Min Score (%)'}</label>
              <input
                type="number"
                min={1}
                max={100}
                value={advancedMin}
                onChange={(e) => setAdvancedMin(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'الحد الأدنى للعمر للمستوى المتقدم' : 'Min Age for Advanced'}</label>
              <input
                type="number"
                min={3}
                max={22}
                value={advancedMinAge}
                onChange={(e) => setAdvancedMinAge(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <div key={q.id} className="rounded-xl border border-[#E5DEC9] dark:border-[#233C63] p-4 space-y-3 bg-white dark:bg-[#0F213E]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#C98A1E] tabular-nums">
                    {lang === 'ar' ? `السؤال #${qIdx + 1}` : `Question #${qIdx + 1}`}
                  </span>
                  <div className="flex items-center gap-3">
                    {q.opts_ar.length < 5 && (
                      <button
                        type="button"
                        onClick={() => addOption(qIdx)}
                        className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                      >
                        {lang === 'ar' ? '+ إضافة خيار' : '+ Add Option'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'حذف السؤال' : 'Remove'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <input
                    value={q.q_ar}
                    onChange={(e) => updateQuestion(qIdx, { q_ar: e.target.value })}
                    required
                    placeholder={lang === 'ar' ? 'نص السؤال بالعربية' : 'Question (AR)'}
                    className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
                  />
                  <input
                    value={q.q_en}
                    onChange={(e) => updateQuestion(qIdx, { q_en: e.target.value })}
                    placeholder={lang === 'ar' ? 'نص السؤال بالإنجليزية (اختياري)' : 'Question (EN)'}
                    className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-500">
                    {lang === 'ar' ? 'الخيارات (اختر الإجابة الصحيحة بالعلامة):' : 'Options (mark the correct answer):'}
                  </div>
                  {q.opts_ar.map((opt, oIdx) => {
                    const isCorrect = q.correct_index === oIdx;
                    return (
                      <div key={oIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <label className="sm:col-span-2 inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={isCorrect}
                            onChange={() => updateQuestion(qIdx, { correct_index: oIdx })}
                          />
                          <span className={isCorrect ? 'text-[#0F766E] dark:text-[#2DD4BF]' : 'text-slate-500'}>
                            {isCorrect ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'ar' ? 'الإجابة' : 'Correct'}
                              </span>
                            ) : (
                              lang === 'ar' ? `خيار ${oIdx + 1}` : `Opt ${oIdx + 1}`
                            )}
                          </span>
                        </label>
                        <input
                          value={opt}
                          onChange={(e) => updateOption(qIdx, oIdx, 'opts_ar', e.target.value)}
                          required
                          placeholder={lang === 'ar' ? 'نص الخيار بالعربية' : 'Arabic option'}
                          className="sm:col-span-5 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-1.5 text-xs"
                        />
                        <input
                          value={q.opts_en?.[oIdx] ?? ''}
                          onChange={(e) => updateOption(qIdx, oIdx, 'opts_en', e.target.value)}
                          placeholder={lang === 'ar' ? 'النص بالإنجليزية (اختياري)' : 'English option'}
                          className="sm:col-span-4 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-1.5 text-xs"
                        />
                        <div className="sm:col-span-1 text-end">
                          {q.opts_ar.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(qIdx, oIdx)}
                              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded cursor-pointer"
                              title={lang === 'ar' ? 'حذف الخيار' : 'Remove option'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" disabled={saving}>
              <Save className="w-4 h-4" />
              <span>{saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ ونشر اختبار تحديد المستوى' : 'Save Placement Test')}</span>
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="text-base font-extrabold">
          {lang === 'ar' ? 'أحدث نتائج اختبار تحديد المستوى للزوار' : 'Recent Visitor Placement Submissions'}
        </h3>
        <ResponsiveTable
          data={data?.submissions || []}
          emptyTitle={lang === 'ar' ? 'لا توجد اختبارات تحديد مستوى مسجلة بعد' : 'No placement attempts recorded yet'}
          columns={[
            { key: 'child', header: lang === 'ar' ? 'اسم الطفل' : 'Child Name', render: (r) => r.child_name },
            { key: 'age', header: lang === 'ar' ? 'العمر' : 'Age', align: 'end', render: (r) => <span className="tabular-nums">{r.age}</span> },
            { key: 'score', header: lang === 'ar' ? 'النتيجة' : 'Score', align: 'end', render: (r) => <span className="font-mono-tabular font-bold">{r.score}%</span> },
            { key: 'level', header: lang === 'ar' ? 'المستوى المرشح' : 'Recommended', render: (r) => lang === 'ar' ? r.level_name_ar : r.level_name_en },
            { key: 'email', header: lang === 'ar' ? 'بريد ولي الأمر' : 'Parent Email', render: (r) => <span className="font-mono-tabular text-xs">{r.parent_email || '—'}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
