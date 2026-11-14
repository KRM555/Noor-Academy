import React, { useEffect, useState } from 'react';
import { LogIn, ShieldCheck, UserCheck, GraduationCap, Heart, KeyRound, UserPlus } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import type { AuthUser } from '../../types';
import { Card, PrimaryButton, SecondaryButton, AcademyLogo } from '../../components/ui/CommonUI';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { lang, loginWithCredentials, loginDemoRole, setAuthSession, toast } = useApp();
  const [authMode, setAuthMode] = useState<'login' | 'register_guardian'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);

  const [guardianForm, setGuardianForm] = useState({
    full_name: '',
    student_code: '',
    email: '',
    phone: '',
    password: '',
  });

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : { demoEnabled: false }))
      .then((d: { demoEnabled?: boolean }) => setDemoEnabled(Boolean(d.demoEnabled)))
      .catch(() => setDemoEnabled(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginWithCredentials(email, password);
      toast(lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully', 'success');
      onSuccess();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardianRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: AuthUser; student_code: string }>('/api/auth/register-guardian', {
        method: 'POST',
        body: JSON.stringify(guardianForm),
      });
      setAuthSession(res.token, res.user);
      toast(
        lang === 'ar'
          ? `تم تفعيل حساب ولي الأمر وربطه بالطالب (${res.student_code}) بنجاح`
          : `Guardian account linked to student ${res.student_code}`,
        'success'
      );
      onSuccess();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (role: 'admin' | 'teacher1' | 'teacher2' | 'student' | 'guardian') => {
    setLoading(true);
    try {
      await loginDemoRole(role);
      toast(lang === 'ar' ? 'تم الدخول بحساب التجربة' : 'Signed in with demo account', 'success');
      onSuccess();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const res = await apiFetch<{ ok: boolean; emailSentViaSupabase: boolean; mode: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotMessage(
        res.mode === 'supabase_email'
          ? lang === 'ar'
            ? 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.'
            : 'A password reset link has been sent to your email.'
          : lang === 'ar'
          ? 'تم تسجيل طلب الاستعادة. في حال لم يُفعّل البريد التلقائي بعد، تواصل مع إدارة الأكاديمية لإصدار كلمة مرور مؤقتة.'
          : 'Reset request logged. Please contact Academy administration if automated reset email is not active yet.'
      );
      toast(lang === 'ar' ? 'تم استلام طلب استعادة كلمة المرور' : 'Password reset request processed', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Request failed', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-14 space-y-6">
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <AcademyLogo className="w-11 h-11 mx-auto" />
          <h1 className="text-2xl font-extrabold">
            {authMode === 'login'
              ? lang === 'ar'
                ? 'تسجيل الدخول الموحد'
                : 'Unified Academy Sign In'
              : lang === 'ar'
              ? 'تفعيل حساب ولي الأمر (بكود الطالب)'
              : 'Guardian Registration (Student Code)'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {authMode === 'login'
              ? lang === 'ar'
                ? 'بوابة واحدة للطالب وولي الأمر والمعلم والمدير بصلاحيات محمية.'
                : 'One portal for Students, Guardians, Teachers, and Academy Directors.'
              : lang === 'ar'
              ? 'لضمان الخصوصية التامة، يتطلب التسجيل مطابقة كود الطالب الأكاديمي مع البريد الإلكتروني المسجل لولي الأمر.'
              : 'For family privacy, linking requires matching both your child Student Code and registered guardian email.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F2EFE6] dark:bg-[#13284A]">
          <button
            type="button"
            onClick={() => setAuthMode('login')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              authMode === 'login' ? 'bg-white dark:bg-[#0F213E] shadow-sm text-[#0F213E] dark:text-[#F8F5EC]' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</span>
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('register_guardian')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              authMode === 'register_guardian'
                ? 'bg-white dark:bg-[#0F213E] shadow-sm text-[#0F766E] dark:text-[#2DD4BF]'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'حساب ولي أمر جديد' : 'Guardian Sign Up'}</span>
          </button>
        </div>

        {authMode === 'login' ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@noorbayan.academy"
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotOpen((v) => !v);
                      if (!forgotEmail && email) setForgotEmail(email);
                    }}
                    className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                  >
                    {lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                />
              </div>
              <PrimaryButton type="submit" disabled={loading} className="w-full">
                <LogIn className="w-4 h-4" />
                <span>{loading ? (lang === 'ar' ? 'جاري التحقق...' : 'Signing in...') : lang === 'ar' ? 'دخول' : 'Sign In'}</span>
              </PrimaryButton>
            </form>

            {forgotOpen && (
              <form onSubmit={handleForgotSubmit} className="p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <KeyRound className="w-4 h-4 text-[#C98A1E]" />
                  <span>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset Your Password'}</span>
                </div>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder={lang === 'ar' ? 'أدخل بريدك الإلكتروني المسجّل' : 'Enter your registered email'}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                />
                <div className="flex items-center gap-2">
                  <SecondaryButton type="submit" disabled={forgotLoading} className="text-xs">
                    {forgotLoading ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : lang === 'ar' ? 'إرسال طلب الاستعادة' : 'Send Reset Request'}
                  </SecondaryButton>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="text-xs text-slate-500 hover:underline cursor-pointer"
                  >
                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
                {forgotMessage && (
                  <p className="text-xs text-[#0F766E] dark:text-[#2DD4BF] leading-relaxed">{forgotMessage}</p>
                )}
              </form>
            )}
          </>
        ) : (
          <form onSubmit={handleGuardianRegister} className="space-y-3.5">
            <div className="rounded-xl p-3 bg-[#F2EFE6] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63] text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'أدخل كود الطالب الخاص بابنك (يظهر داخل ملف الطالب) مع البريد الإلكتروني المسجل لولي الأمر في ملف القبول. يتيح ذلك ربط ولي الأمر بأبنائه فقط دون أي وصول لبقية الطلاب.'
                : 'Enter your child Student Code alongside the Guardian Email registered with the Academy. Only verified matches are linked.'}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'اسم ولي الأمر الكامل *' : 'Guardian Full Name *'}</label>
              <input
                type="text"
                required
                value={guardianForm.full_name}
                onChange={(e) => setGuardianForm({ ...guardianForm, full_name: e.target.value })}
                placeholder={lang === 'ar' ? 'مثال: أ. خالد عبد الرحمن' : 'e.g., Khaled Abdulrahman'}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'كود الطالب *' : 'Student Code *'}</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={guardianForm.student_code}
                  onChange={(e) => setGuardianForm({ ...guardianForm, student_code: e.target.value.toUpperCase() })}
                  placeholder="NB-2026-XXXXXX"
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm font-mono-tabular uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={guardianForm.phone}
                  onChange={(e) => setGuardianForm({ ...guardianForm, phone: e.target.value })}
                  placeholder="+20 10..."
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني المسجل لولي الأمر *' : 'Registered Guardian Email *'}</label>
              <input
                type="email"
                required
                value={guardianForm.email}
                onChange={(e) => setGuardianForm({ ...guardianForm, email: e.target.value })}
                placeholder="parent@example.com"
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'كلمة المرور الجديدة (8 أحرف فأكثر) *' : 'Create Password (min 8 chars) *'}</label>
              <input
                type="password"
                required
                minLength={8}
                value={guardianForm.password}
                onChange={(e) => setGuardianForm({ ...guardianForm, password: e.target.value })}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
            </div>
            <PrimaryButton type="submit" disabled={loading} className="w-full">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {loading
                  ? lang === 'ar' ? 'جاري التحقق والربط...' : 'Verifying & Linking...'
                  : lang === 'ar' ? 'تفعيل الحساب وربطه بالطالب' : 'Verify & Activate Account'}
              </span>
            </PrimaryButton>
          </form>
        )}

        {/* Quick RBAC Verification Access — only active in development preview when ALLOW_DEMO_LOGIN is enabled */}
        {demoEnabled && (
          <div className="pt-5 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-3">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'دخول سريع للمعاينة والتجربة (بيئة التطوير فقط):' : 'Quick Preview Access (Development Only):'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemo('admin')}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#C98A1E]" />
                <span>{lang === 'ar' ? 'المدير (د. سارة)' : 'Admin (Dr. Sara)'}</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemo('guardian')}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
              >
                <Heart className="w-4 h-4 text-[#C98A1E]" />
                <span>{lang === 'ar' ? 'ولي الأمر (خالد)' : 'Guardian (Khaled)'}</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemo('student')}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                <span>{lang === 'ar' ? 'طالب (عمر خالد)' : 'Student (Omar)'}</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemo('teacher1')}
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                <span>{lang === 'ar' ? 'معلم أ (أ. فاطمة)' : 'Teacher A (Fatima)'}</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemo('teacher2')}
                className="sm:col-span-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F2EFE6] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                <span>{lang === 'ar' ? 'معلم ب (أ. يوسف)' : 'Teacher B (Yusuf)'}</span>
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
