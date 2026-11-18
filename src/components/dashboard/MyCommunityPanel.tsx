import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Lightbulb, Star, Send, Trash2, ThumbsUp } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import type {
  AcademySuggestion,
  CommunityComment,
  SuggestionCategory,
  SuggestionStatus,
  UserRole,
} from '../../types';
import { Card, PrimaryButton } from '../ui/CommonUI';

export function formatRoleLabel(role: UserRole, lang: 'ar' | 'en'): string {
  if (role === 'admin') return lang === 'ar' ? 'إدارة الأكاديمية' : 'Academy Director';
  if (role === 'teacher') return lang === 'ar' ? 'معلم' : 'Teacher';
  if (role === 'guardian') return lang === 'ar' ? 'ولي أمر' : 'Parent / Guardian';
  return lang === 'ar' ? 'طالب' : 'Student';
}

export function formatSuggestionCategory(cat: SuggestionCategory, lang: 'ar' | 'en'): string {
  if (cat === 'platform') return lang === 'ar' ? 'المنصة والموقع' : 'Platform & Website';
  if (cat === 'curriculum') return lang === 'ar' ? 'المناهج والدورات' : 'Curriculum & Courses';
  if (cat === 'experience') return lang === 'ar' ? 'تجربة التعلم والامتحانات' : 'Learning Experience';
  return lang === 'ar' ? 'مقترح عام' : 'General Idea';
}

export function formatSuggestionStatus(status: SuggestionStatus, lang: 'ar' | 'en'): string {
  if (status === 'reviewing') return lang === 'ar' ? 'قيد الدراسة' : 'Under Review';
  if (status === 'planned') return lang === 'ar' ? 'مخطط للتنفيذ' : 'Planned';
  if (status === 'implemented') return lang === 'ar' ? 'تم التنفيذ' : 'Implemented';
  if (status === 'declined') return lang === 'ar' ? 'مؤجل / غير مناسب' : 'Declined';
  return lang === 'ar' ? 'بانتظار المراجعة' : 'Pending Review';
}

export function suggestionStatusClass(status: SuggestionStatus): string {
  if (status === 'implemented') return 'text-[#0F766E] dark:text-[#2DD4BF] border-[#0F766E]/40 bg-[#0F766E]/10';
  if (status === 'planned') return 'text-[#C98A1E] border-[#C98A1E]/40 bg-[#C98A1E]/10';
  if (status === 'reviewing') return 'text-[#0F213E] dark:text-[#F8F5EC] border-[#D6CDB4] dark:border-[#294A7D] bg-[#F2EFE6] dark:bg-[#13284A]';
  if (status === 'declined') return 'text-red-700 dark:text-red-300 border-red-400/40 bg-red-500/10';
  return 'text-slate-600 dark:text-slate-300 border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529]';
}

export function MyCommunityPanel() {
  const { lang, user, toast } = useApp();
  const qc = useQueryClient();

  const [rating, setRating] = useState(5);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [sugCategory, setSugCategory] = useState<SuggestionCategory>('platform');
  const [sugTitle, setSugTitle] = useState('');
  const [sugDesc, setSugDesc] = useState('');
  const [submittingSug, setSubmittingSug] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.myCommunity(user?.id),
    queryFn: () => apiFetch<{ comments: CommunityComment[]; suggestions: AcademySuggestion[] }>('/api/my/community'),
    enabled: Boolean(user),
  });

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.myCommunity(user?.id) });
    void qc.invalidateQueries({ queryKey: queryKeys.publicComments });
    void qc.invalidateQueries({ queryKey: queryKeys.publicSuggestions });
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim().length < 5) {
      toast(lang === 'ar' ? 'يرجى كتابة تعليق لا يقل عن 5 أحرف.' : 'Comment must be at least 5 characters.', 'error');
      return;
    }
    setSubmittingComment(true);
    try {
      await apiFetch('/api/comments', {
        method: 'POST',
        body: JSON.stringify({ rating, content: commentText.trim() }),
      });
      setCommentText('');
      setRating(5);
      toast(lang === 'ar' ? 'تم نشر تعليقك بنجاح وظهوره في الصفحة الرئيسية' : 'Your review has been published!', 'success');
      invalidateAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to post review', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const submitReply = async (commentId: string) => {
    if (replyText.trim().length < 2) return;
    setSubmittingReply(true);
    try {
      await apiFetch(`/api/comments/${commentId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ content: replyText.trim() }),
      });
      setReplyText('');
      setReplyTargetId(null);
      toast(lang === 'ar' ? 'تمت إضافة ردك' : 'Reply added', 'success');
      invalidateAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reply failed', 'error');
    } finally {
      setSubmittingReply(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      toast(lang === 'ar' ? 'تم حذف التعليق' : 'Review deleted', 'info');
      invalidateAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const submitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sugTitle.trim().length < 4 || sugDesc.trim().length < 10) {
      toast(
        lang === 'ar' ? 'أدخل عنواناً واضحاً (4+ أحرف) وتفاصيل الاقتراح (10+ أحرف).' : 'Enter a clear title (4+ chars) and details (10+ chars).',
        'error'
      );
      return;
    }
    setSubmittingSug(true);
    try {
      await apiFetch('/api/suggestions', {
        method: 'POST',
        body: JSON.stringify({
          category: sugCategory,
          title: sugTitle.trim(),
          description: sugDesc.trim(),
        }),
      });
      setSugTitle('');
      setSugDesc('');
      toast(lang === 'ar' ? 'شكراً لك! تم إرسال اقتراحك لتطوير الأكاديمية' : 'Thank you! Suggestion submitted', 'success');
      invalidateAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to submit suggestion', 'error');
    } finally {
      setSubmittingSug(false);
    }
  };

  const deleteSuggestion = async (id: string) => {
    try {
      await apiFetch(`/api/suggestions/${id}`, { method: 'DELETE' });
      toast(lang === 'ar' ? 'تم حذف الاقتراح' : 'Suggestion deleted', 'info');
      invalidateAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const comments = data?.comments || [];
  const suggestions = data?.suggestions || [];

  return (
    <div className="space-y-6">
      {/* My Comments & Replies */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
            <h3 className="text-base font-extrabold">
              {lang === 'ar' ? 'تعليقاتي على الأكاديمية والردود عليها' : 'My Reviews & Replies'}
            </h3>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            {comments.length} {lang === 'ar' ? 'تعليق' : 'reviews'}
          </span>
        </div>

        <form onSubmit={submitComment} className="space-y-3 p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#091529] border border-[#E5DEC9] dark:border-[#233C63]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold">{lang === 'ar' ? 'أضف تعليقاً جديداً عن تجربتك:' : 'Share a new review:'}</span>
            <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={lang === 'ar' ? 'التقييم' : 'Rating'}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-1 cursor-pointer"
                  aria-label={`${n} stars`}
                >
                  <Star className={`w-4 h-4 ${n <= rating ? 'fill-[#C98A1E] text-[#C98A1E]' : 'text-slate-300 dark:text-slate-600'}`} />
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={2}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={800}
            placeholder={lang === 'ar' ? 'اكتب رأيك الصادق في الدراسة، المعلمين، أو نظام المتابعة...' : 'Share your honest experience...'}
            className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm"
          />
          <PrimaryButton type="submit" disabled={submittingComment} className="text-xs">
            <Send className="w-3.5 h-3.5" />
            <span>{submittingComment ? (lang === 'ar' ? 'جاري النشر...' : 'Publishing...') : (lang === 'ar' ? 'نشر التعليق' : 'Publish Review')}</span>
          </PrimaryButton>
        </form>

        {isLoading ? (
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'جاري تحميل تعليقاتك...' : 'Loading your reviews...'}</div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500">
            {lang === 'ar' ? 'لم تكتب أي تعليقات بعد. سيظهر تعليقك هنا مع أي ردود من الإدارة أو المجتمع.' : 'No reviews posted yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#E5DEC9] dark:border-[#233C63] p-4 space-y-3 bg-white dark:bg-[#0F213E]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-[#C98A1E] font-bold tabular-nums">
                      {Array.from({ length: c.rating }).map((_, idx) => (
                        <Star key={idx} className="w-3.5 h-3.5 fill-[#C98A1E]" />
                      ))}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono-tabular text-slate-500">{c.created_at.slice(0, 10)}</span>
                    {!c.is_visible && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-amber-700 dark:text-amber-300 font-bold">
                          {lang === 'ar' ? 'مخفي من الإدارة' : 'Hidden by Admin'}
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteComment(c.id)}
                    className="inline-flex items-center gap-1 text-red-600 hover:underline font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                  </button>
                </div>

                <p className="text-sm leading-relaxed">{c.content}</p>

                {c.replies.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#EFEAD8] dark:border-[#1D355B]">
                    <div className="text-[11px] font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                      {lang === 'ar' ? `الردود (${c.replies.length}):` : `Replies (${c.replies.length}):`}
                    </div>
                    {c.replies.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-lg bg-[#FAF8F3] dark:bg-[#13284A] text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold">
                            {r.author_name} · <span className="text-[#0F766E] dark:text-[#2DD4BF]">{formatRoleLabel(r.author_role, lang)}</span>
                          </span>
                          <span className="font-mono-tabular text-slate-400">{r.created_at.slice(0, 10)}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-200">{r.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {replyTargetId === c.id ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      maxLength={600}
                      placeholder={lang === 'ar' ? 'اكتب رداً...' : 'Write a reply...'}
                      className="flex-1 min-w-[180px] rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-1.5 text-xs"
                    />
                    <PrimaryButton type="button" disabled={submittingReply} onClick={() => void submitReply(c.id)} className="text-xs py-1.5">
                      {lang === 'ar' ? 'إرسال الرد' : 'Reply'}
                    </PrimaryButton>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTargetId(null);
                        setReplyText('');
                      }}
                      className="text-xs text-slate-500 px-2 cursor-pointer"
                    >
                      {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTargetId(c.id);
                      setReplyText('');
                    }}
                    className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                  >
                    {lang === 'ar' ? 'إضافة رد أو تعقيب' : 'Add a reply'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* My Academy & Website Development Suggestions */}
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-[#C98A1E]" />
            <h3 className="text-base font-extrabold">
              {lang === 'ar' ? 'مقترحاتي لتطوير الأكاديمية والموقع' : 'My Academy Development Suggestions'}
            </h3>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            {suggestions.length} {lang === 'ar' ? 'مقترح' : 'suggestions'}
          </span>
        </div>

        <form onSubmit={submitSuggestion} className="space-y-3 p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#091529] border border-[#E5DEC9] dark:border-[#233C63]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={sugCategory}
              onChange={(e) => setSugCategory(e.target.value as SuggestionCategory)}
              className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-xs font-semibold"
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
              placeholder={lang === 'ar' ? 'عنوان المقترح باختصار...' : 'Suggestion title...'}
              className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            value={sugDesc}
            onChange={(e) => setSugDesc(e.target.value)}
            maxLength={1200}
            placeholder={lang === 'ar' ? 'اشرح فكرتك لتطوير الموقع أو الدراسة أو الخدمات التعليمية...' : 'Describe how we can improve...'}
            className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm"
          />
          <PrimaryButton type="submit" disabled={submittingSug} className="text-xs">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>{submittingSug ? (lang === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : (lang === 'ar' ? 'إرسال المقترح للإدارة' : 'Submit Suggestion')}</span>
          </PrimaryButton>
        </form>

        {suggestions.length === 0 ? (
          <p className="text-xs text-slate-500">
            {lang === 'ar' ? 'لم ترسل مقترحات تطوير بعد. شاركنا أفكارك وستتابع حالة تنفيذها هنا.' : 'No development suggestions submitted yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-xl border border-[#E5DEC9] dark:border-[#233C63] p-4 space-y-2.5 bg-white dark:bg-[#0F213E]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${suggestionStatusClass(s.status)}`}>
                      {formatSuggestionStatus(s.status, lang)}
                    </span>
                    <span className="text-slate-500 font-semibold">{formatSuggestionCategory(s.category, lang)}</span>
                    <span className="text-slate-400">·</span>
                    <span className="inline-flex items-center gap-1 font-mono-tabular text-slate-600 dark:text-slate-300">
                      <ThumbsUp className="w-3 h-3" /> {s.votes_count}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteSuggestion(s.id)}
                    className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                  </button>
                </div>
                <div className="font-bold text-sm">{s.title}</div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{s.description}</p>
                {s.admin_reply && (
                  <div className="p-3 rounded-lg bg-[#F2EFE6] dark:bg-[#13284A] text-xs space-y-1">
                    <div className="font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                      {lang === 'ar' ? `رد الإدارة (${s.replied_by_name || 'الإدارة'}):` : `Admin Response (${s.replied_by_name || 'Admin'}):`}
                    </div>
                    <p>{s.admin_reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
