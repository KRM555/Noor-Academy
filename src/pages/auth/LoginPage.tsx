import React, { useEffect, useState } from 'react';
import {
  LogIn,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  Heart,
  KeyRound,
  UserPlus,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import {
  buildGoogleOAuthPopupRequest,
  getBrowserSupabase,
  isBrowserSupabaseConfigured,
  waitForGoogleOAuthToken,
} from '../../lib/supabase';
import { PhoneInputWithCode } from '../../components/ui/PhoneInputWithCode';
import type { AuthUser } from '../../types';
import { Card, PrimaryButton, SecondaryButton, AcademyLogo } from '../../components/ui/CommonUI';

type PortalChoice = 'student' | 'teacher' | 'guardian' | 'admin';

function GoogleMark() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1c.95-2.84 3.6-4.95 6.72-4.95Z" />
    </svg>
  );
}

export function LoginPage({
  onSuccess,
  onNavigateAdmission,
}: {
  onSuccess: () => void;
  onNavigateAdmission?: (role?: 'student' | 'teacher') => void;
}) {
  const { lang, loginWithCredentials, setAuthSession, toast } = useApp();
  const [selectedPortal, setSelectedPortal] = useState<PortalChoice>('student');
  const [guardianMode, setGuardianMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showGuardianPassword, setShowGuardianPassword] = useState(false);
  const [showGuardianConfirm, setShowGuardianConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guardianGoogleLoading, setGuardianGoogleLoading] = useState(false);
  const [guardianGoogleToken, setGuardianGoogleToken] = useState<string | null>(null);
  const [guardianPendingInfo, setGuardianPendingInfo] = useState<{ student_code: string; email: string } | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(() => isBrowserSupabaseConfigured());
  const [blockedOAuthUrl, setBlockedOAuthUrl] = useState<string | null>(null);
  const [unregisteredGoogle, setUnregisteredGoogle] = useState<{ email: string; full_name: string } | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);

  const [guardianForm, setGuardianForm] = useState({
    full_name: '',
    student_code: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  // Recovery Link Completion State (when returning from Forgot Password email)
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNew, setShowResetNew] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetDoneMessage, setResetDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { googleOAuthEnabled?: boolean }) => {
        if (d.googleOAuthEnabled !== undefined) {
          setGoogleEnabled(Boolean(d.googleOAuthEnabled) && isBrowserSupabaseConfigured());
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    async function inspectRecoveryUrl() {
      try {
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
        const searchParams = new URLSearchParams(window.location.search || '');
        const hashToken = hashParams.get('access_token');
        const hashType = hashParams.get('type');
        const queryMode = searchParams.get('mode');
        const pkceCode = searchParams.get('code');

        if (hashToken && (hashType === 'recovery' || queryMode === 'reset-password')) {
          if (active) setRecoveryToken(hashToken);
          window.history.replaceState({}, '', '/login?mode=reset-password');
          return;
        }

        if (pkceCode && (queryMode === 'reset-password' || searchParams.get('type') === 'recovery')) {
          const sb = getBrowserSupabase();
          if (sb) {
            const { data } = await sb.auth.exchangeCodeForSession(pkceCode);
            if (active && data?.session?.access_token) {
              setRecoveryToken(data.session.access_token);
              window.history.replaceState({}, '', '/login?mode=reset-password');
            }
          }
        }
      } catch {
        // ignore URL parse issues
      }
    }
    void inspectRecoveryUrl();

    const sb = getBrowserSupabase();
    const subscription = sb?.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.access_token && active) {
        setRecoveryToken(session.access_token);
      }
    });

    return () => {
      active = false;
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  const formatAuthError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : 'Login failed';
    const lower = raw.toLowerCase();
    if (lower.includes('pending administrator approval')) {
      setPendingNotice(true);
      return lang === 'ar'
        ? 'طلبك ما زال قيد المراجعة من إدارة الأكاديمية. ستتمكن من الدخول فور الموافقة وتفعيل الحساب.'
        : raw;
    }
    if (raw.includes('PORTAL_ROLE_MISMATCH')) {
      return lang === 'ar'
        ? 'هذا الحساب لا ينتمي إلى البوابة المختارة. تأكد من اختيار الصفة الصحيحة (طالب · معلم · ولي أمر · إدارة).'
        : 'This account belongs to a different portal. Please select the matching role tab.';
    }
    if (raw.includes('GUARDIAN_PASSWORD_REQUIRED') || lower.includes('guardian portal requires')) {
      return lang === 'ar'
        ? 'للدخول إلى بوابة ولي الأمر يرجى تفعيل حساب ولي الأمر أولاً عبر تبويب «تفعيل بكود الطالب» وتعيين كلمة مرور خاصة بولي الأمر.'
        : 'Please activate Guardian access first via "Activate with Code" and set a dedicated Guardian password.';
    }
    if (lower.includes('google sign-in without an email password') || raw.includes('GOOGLE_ONLY_ACCOUNT')) {
      return lang === 'ar'
        ? 'هذا البريد مسجّل عبر Google بدون كلمة مرور مستقلة بعد. اضغط «الدخول بحساب Google» أو استخدم «هل نسيت كلمة المرور؟» لتعيين كلمة مرور.'
        : raw;
    }
    if (lower === 'invalid credentials') {
      return lang === 'ar'
        ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تأكد من البوابة المختارة ومن لغة لوحة المفاتيح أو اضغط «هل نسيت كلمة المرور؟».'
        : 'Invalid email or password for the selected portal. Check spelling or use Forgot Password.';
    }
    return raw;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPendingNotice(false);
    try {
      await loginWithCredentials(email, password, selectedPortal);
      toast(lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully', 'success');
      onSuccess();
    } catch (err: unknown) {
      toast(formatAuthError(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardianRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardianForm.password.length < 8) {
      toast(lang === 'ar' ? 'كلمة مرور ولي الأمر يجب أن تكون 8 أحرف على الأقل' : 'Guardian password must be at least 8 characters', 'error');
      return;
    }
    if (guardianForm.password !== guardianForm.confirmPassword) {
      toast(lang === 'ar' ? 'كلمتا مرور ولي الأمر غير متطابقتين' : 'Guardian passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ status: string; request_id: number; student_code: string; email: string }>(
        '/api/auth/register-guardian',
        {
          method: 'POST',
          body: JSON.stringify({
            full_name: guardianForm.full_name,
            student_code: guardianForm.student_code,
            email: guardianForm.email,
            phone: guardianForm.phone,
            password: guardianForm.password,
            ...(guardianGoogleToken ? { google_access_token: guardianGoogleToken } : {}),
          }),
        }
      );
      setGuardianPendingInfo({ student_code: res.student_code, email: res.email });
      setGuardianForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setGuardianGoogleToken(null);
      toast(
        lang === 'ar'
          ? `تم إرسال طلب تفعيل ولي الأمر للطالب (${res.student_code}) وهو الآن بانتظار موافقة الإدارة`
          : `Guardian activation request submitted for ${res.student_code} and awaiting admin approval`,
        'success'
      );
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardianGooglePrefill = async () => {
    setGuardianGoogleLoading(true);
    setBlockedOAuthUrl(null);
    const popup = window.open('about:blank', 'nb_google_oauth', 'width=520,height=680');
    try {
      const { state, url } = await buildGoogleOAuthPopupRequest();
      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        setBlockedOAuthUrl(url);
      }
      const accessToken = await waitForGoogleOAuthToken(state, popup);
      setBlockedOAuthUrl(null);
      setGuardianGoogleToken(accessToken);
      const res = await apiFetch<{ status: string; googleProfile: { email: string; full_name: string } }>(
        '/api/auth/google',
        {
          method: 'POST',
          body: JSON.stringify({ access_token: accessToken, intent: 'prefill' }),
        }
      );
      if (res.googleProfile?.email) {
        setGuardianForm((prev) => ({
          ...prev,
          email: res.googleProfile.email,
          full_name: prev.full_name || res.googleProfile.full_name || prev.full_name,
        }));
      }
      toast(lang === 'ar' ? 'تم التحقق من البريد عبر Google' : 'Email verified with Google', 'success');
    } catch (err: unknown) {
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          // ignore
        }
      }
      toast(err instanceof Error ? err.message : 'Unable to verify Google account', 'error');
    } finally {
      setGuardianGoogleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setBlockedOAuthUrl(null);
    setUnregisteredGoogle(null);
    setPendingNotice(false);

    const popup = window.open('about:blank', 'nb_google_oauth', 'width=520,height=680');
    try {
      const { state, url } = await buildGoogleOAuthPopupRequest();
      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        setBlockedOAuthUrl(url);
      }

      const accessToken = await waitForGoogleOAuthToken(state, popup);
      setBlockedOAuthUrl(null);

      const res = await apiFetch<
        | { status: 'authenticated'; token: string; user: AuthUser }
        | { status: 'needs_registration'; googleProfile: { email: string; full_name: string } }
      >('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ access_token: accessToken, intent: 'login', portalRole: selectedPortal }),
      });

      if (res.status === 'authenticated') {
        setAuthSession(res.token, res.user);
        toast(lang === 'ar' ? 'تم تسجيل الدخول بحساب Google بنجاح' : 'Signed in with Google', 'success');
        onSuccess();
      } else {
        setUnregisteredGoogle(res.googleProfile);
      }
    } catch (err: unknown) {
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          // ignore
        }
      }
      toast(formatAuthError(err), 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      const res = await apiFetch<{ ok: boolean; emailSentViaSupabase: boolean; mode: string; reason?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotMessage(
        res.mode === 'supabase_email'
          ? lang === 'ar'
            ? 'تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني. افتح الرابط من البريد لإدخال كلمة مرور جديدة.'
            : 'A password reset link has been sent to your email. Open the link to choose a new password.'
          : lang === 'ar'
          ? 'تعذر إرسال البريد التلقائي حالياً (قد يكون بسبب حد الإرسال المؤقت). يمكنك المحاولة بعد دقيقة أو التواصل مع إدارة الأكاديمية.'
          : 'Automated email delivery is temporarily unavailable. Please retry in a minute or contact Academy administration.'
      );
      toast(lang === 'ar' ? 'تم إرسال طلب استعادة كلمة المرور' : 'Password reset request processed', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Request failed', 'error');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryToken) return;
    if (resetNewPassword.length < 8) {
      toast(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters', 'error');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match', 'error');
      return;
    }
    setResetSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; email?: string }>('/api/auth/complete-password-reset', {
        method: 'POST',
        body: JSON.stringify({ access_token: recoveryToken, newPassword: resetNewPassword }),
      });
      if (res.email) setEmail(res.email);
      setRecoveryToken(null);
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetDoneMessage(
        lang === 'ar'
          ? 'تم تحديث كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
          : 'Your password has been updated! You can now sign in with your new password.'
      );
      window.history.replaceState({}, '', '/login');
      toast(lang === 'ar' ? 'تم تعيين كلمة المرور الجديدة بنجاح' : 'Password reset completed', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setResetSaving(false);
    }
  };

  const portalOptions: Array<{
    id: 'student' | 'teacher' | 'guardian';
    title_ar: string;
    title_en: string;
    desc_ar: string;
    desc_en: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'student',
      title_ar: 'طالب',
      title_en: 'Student',
      desc_ar: 'الحصص والاختبارات والشهادات',
      desc_en: 'Classes, exams & progress',
      icon: GraduationCap,
    },
    {
      id: 'teacher',
      title_ar: 'معلم',
      title_en: 'Teacher',
      desc_ar: 'إدارة الحلقات ورصد الدرجات',
      desc_en: 'Circles, grading & attendance',
      icon: UserCheck,
    },
    {
      id: 'guardian',
      title_ar: 'ولي أمر',
      title_en: 'Guardian',
      desc_ar: 'دخول أو تفعيل بكود الطالب',
      desc_en: 'Sign in or link Student Code',
      icon: Heart,
    },
  ];

  const isGuardianRegisterView = selectedPortal === 'guardian' && guardianMode === 'register';
  const NavArrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  if (recoveryToken) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-14">
        <Card className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <AcademyLogo className="w-11 h-11 mx-auto" />
            <h1 className="text-2xl font-extrabold">
              {lang === 'ar' ? 'تعيين كلمة مرور جديدة' : 'Set a New Password'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              {lang === 'ar'
                ? 'تم التحقق من رابط الاستعادة. أدخل كلمة المرور الجديدة لحسابك.'
                : 'Your recovery link is verified. Enter your new password below.'}
            </p>
          </div>
          <form onSubmit={handleCompleteRecovery} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'كلمة المرور الجديدة (8 أحرف فأكثر)' : 'New Password (8+ chars)'}</label>
              <div className="relative">
                <input
                  type={showResetNew ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowResetNew((v) => !v)}
                  aria-label={showResetNew ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                >
                  {showResetNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}</label>
              <div className="relative">
                <input
                  type={showResetConfirm ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirm((v) => !v)}
                  aria-label={showResetConfirm ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                >
                  {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <PrimaryButton type="submit" disabled={resetSaving} className="w-full">
              <KeyRound className="w-4 h-4" />
              <span>{resetSaving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Save New Password'}</span>
            </PrimaryButton>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 space-y-5">
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <AcademyLogo className="w-11 h-11 mx-auto" />
          <h1 className="text-2xl font-extrabold">
            {selectedPortal === 'admin'
              ? lang === 'ar' ? 'بوابة إدارة الأكاديمية' : 'Academy Administration Portal'
              : isGuardianRegisterView
              ? lang === 'ar' ? 'تفعيل حساب ولي الأمر (بكود الطالب)' : 'Guardian Registration (Student Code)'
              : lang === 'ar' ? 'تسجيل الدخول للأكاديمية' : 'Academy Portal Sign In'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {selectedPortal === 'admin'
              ? lang === 'ar' ? 'الدخول بالبريد المعتمد وكلمة المرور لإدارة الأكاديمية.' : 'Sign in with your director email and password.'
              : lang === 'ar' ? 'اختر صفتك في الأكاديمية للمتابعة:' : 'Choose your academy role to continue:'}
          </p>
        </div>

        {/* 3 Role Cards (Student · Teacher · Guardian) — crisp rectangles, zero pills */}
        {selectedPortal !== 'admin' && (
          <div className="grid grid-cols-3 gap-2.5">
            {portalOptions.map((opt) => {
              const Icon = opt.icon;
              const active = selectedPortal === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSelectedPortal(opt.id);
                    setUnregisteredGoogle(null);
                    setPendingNotice(false);
                    setGuardianPendingInfo(null);
                  }}
                  className={`p-3 rounded-xl border text-start transition-colors cursor-pointer space-y-1.5 ${
                    active
                      ? 'border-[#0F766E] dark:border-[#2DD4BF] bg-[#0F766E]/8 dark:bg-[#0F766E]/20'
                      : 'border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] hover:border-[#C98A1E]'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      active ? 'text-[#0F766E] dark:text-[#2DD4BF]' : 'text-[#C98A1E]'
                    }`}
                  />
                  <div className="font-extrabold text-xs sm:text-sm text-[#0F213E] dark:text-[#F8F5EC]">
                    {lang === 'ar' ? opt.title_ar : opt.title_en}
                  </div>
                  <div className="text-[11px] leading-snug text-slate-600 dark:text-slate-300 hidden sm:block">
                    {lang === 'ar' ? opt.desc_ar : opt.desc_en}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Guardian Login vs Activate Code Sub-Tabs */}
        {selectedPortal === 'guardian' && (
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F2EFE6] dark:bg-[#13284A]">
            <button
              type="button"
              onClick={() => {
                setGuardianMode('login');
                setGuardianPendingInfo(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                guardianMode === 'login' ? 'bg-white dark:bg-[#0F213E] shadow-sm text-[#0F213E] dark:text-[#F8F5EC]' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'لدي حساب ولي أمر' : 'Existing Guardian'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGuardianMode('register');
                setGuardianPendingInfo(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                guardianMode === 'register'
                  ? 'bg-white dark:bg-[#0F213E] shadow-sm text-[#0F766E] dark:text-[#2DD4BF]'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تفعيل بكود الطالب' : 'Activate with Code'}</span>
            </button>
          </div>
        )}

        {resetDoneMessage && (
          <div className="p-3.5 rounded-xl border border-[#0F766E]/40 bg-[#0F766E]/10 text-xs text-[#0F766E] dark:text-[#2DD4BF] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{resetDoneMessage}</span>
          </div>
        )}

        {pendingNotice && (
          <div className="p-3.5 rounded-xl border border-[#C98A1E]/50 bg-[#C98A1E]/10 text-xs text-[#0F213E] dark:text-[#F8F5EC] leading-relaxed">
            {lang === 'ar'
              ? 'حسابك مسجّل وطلبك قيد المراجعة الآن من إدارة الأكاديمية. بمجرد الموافقة ستتمكن من الدخول مباشرة بنفس البريد وكلمة المرور.'
              : 'Your application is pending director approval. Once approved, you can sign in immediately with these credentials.'}
          </div>
        )}

        {!isGuardianRegisterView ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}</label>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
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
                    {lang === 'ar' ? 'هل نسيت كلمة المرور؟' : 'Forgot password?'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <PrimaryButton type="submit" disabled={loading} className="w-full">
                <LogIn className="w-4 h-4" />
                <span>
                  {loading
                    ? lang === 'ar' ? 'جاري التحقق...' : 'Signing in...'
                    : selectedPortal === 'student'
                    ? lang === 'ar' ? 'دخول بوابة الطالب' : 'Sign In as Student'
                    : selectedPortal === 'teacher'
                    ? lang === 'ar' ? 'دخول بوابة المعلم' : 'Sign In as Teacher'
                    : selectedPortal === 'guardian'
                    ? lang === 'ar' ? 'دخول بوابة ولي الأمر' : 'Sign In as Guardian'
                    : lang === 'ar' ? 'دخول الإدارة' : 'Director Sign In'}
                </span>
              </PrimaryButton>
            </form>

            {forgotOpen && (
              <form onSubmit={handleForgotSubmit} className="p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63] space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <KeyRound className="w-4 h-4 text-[#C98A1E]" />
                  <span>{lang === 'ar' ? 'استعادة كلمة المرور عبر البريد الإلكتروني' : 'Reset Password via Email'}</span>
                </div>
                <input
                  type="email"
                  dir="ltr"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder={lang === 'ar' ? 'أدخل بريدك الإلكتروني المسجّل' : 'Enter your registered email'}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                />
                <div className="flex items-center gap-2">
                  <SecondaryButton type="submit" disabled={forgotLoading} className="text-xs">
                    {forgotLoading ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : lang === 'ar' ? 'إرسال رابط الاستعادة' : 'Send Reset Link'}
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

            {/* New Applicant Callout for Student or Teacher */}
            {selectedPortal === 'student' && onNavigateAdmission && (
              <div className="p-3.5 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {lang === 'ar' ? 'طالب جديد ولم تقدّم طلباً بعد؟' : 'New student without an account yet?'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateAdmission('student')}
                  className="inline-flex items-center gap-1 font-extrabold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'قدّم طلب طالب واختر كلمة مرورك' : 'Apply as Student'}</span>
                  <NavArrow className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {selectedPortal === 'teacher' && onNavigateAdmission && (
              <div className="p-3.5 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  {lang === 'ar' ? 'معلم جديد وترغب بالانضمام لهيئة التدريس؟' : 'New teacher interested in joining?'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateAdmission('teacher')}
                  className="inline-flex items-center gap-1 font-extrabold text-[#C98A1E] hover:underline cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'قدّم طلب معلم جديد' : 'Apply as Teacher'}</span>
                  <NavArrow className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {googleEnabled && (
              <div className="space-y-3 pt-1">
                <div className="relative flex items-center justify-center">
                  <div className="border-t border-[#EFEAD8] dark:border-[#1D355B] w-full" />
                  <span className="px-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-[#0F213E] shrink-0">
                    {lang === 'ar' ? 'أو' : 'OR'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={googleLoading || loading}
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] hover:bg-[#F2EFE6] dark:bg-[#091529] dark:hover:bg-[#13284A] px-4 py-2.5 text-sm font-bold text-[#0F213E] dark:text-[#F8F5EC] transition-colors cursor-pointer disabled:opacity-60"
                >
                  <GoogleMark />
                  <span>
                    {googleLoading
                      ? lang === 'ar' ? 'بانتظار إتمام الدخول عبر Google...' : 'Waiting for Google...'
                      : lang === 'ar' ? 'الدخول بحساب Google' : 'Continue with Google'}
                  </span>
                </button>

                {blockedOAuthUrl && (
                  <div className="p-3 rounded-xl border border-[#C98A1E]/40 bg-[#FAF8F3] dark:bg-[#13284A] text-xs space-y-2">
                    <div className="font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                      {lang === 'ar'
                        ? 'حظر المتصفح النافذة المنبثقة — اضغط الرابط التالي لإكمال الدخول:'
                        : 'Popup was blocked — open Google Sign-In in a new tab:'}
                    </div>
                    <a
                      href={blockedOAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'فتح نافذة Google للمصادقة' : 'Open Google Sign-In'}</span>
                    </a>
                  </div>
                )}

                {unregisteredGoogle && (
                  <div className="p-4 rounded-xl border border-[#C98A1E]/50 bg-[#FAF8F3] dark:bg-[#13284A] space-y-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#C98A1E] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-extrabold text-[#0F213E] dark:text-[#F8F5EC]">
                          {lang === 'ar'
                            ? 'تم التحقق من بريد Google ولكن لا يوجد حساب مرتبط به بعد'
                            : 'Google email verified, but no Academy account is linked yet'}
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          {lang === 'ar'
                            ? `البريد (${unregisteredGoogle.email}) غير مسجّل كحساب نشط. يمكنك اختيار إحدى الخطوات التالية:`
                            : `${unregisteredGoogle.email} is not linked to an active profile yet. Choose how to proceed:`}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setGuardianForm((prev) => ({
                            ...prev,
                            full_name: prev.full_name || unregisteredGoogle.full_name,
                            email: unregisteredGoogle.email,
                          }));
                          setSelectedPortal('guardian');
                          setGuardianMode('register');
                          setUnregisteredGoogle(null);
                        }}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تفعيل ولي أمر بكود الطالب' : 'Activate Guardian with Code'}</span>
                      </SecondaryButton>
                      <PrimaryButton
                        type="button"
                        onClick={() => {
                          const targetRole = selectedPortal === 'teacher' ? 'teacher' : 'student';
                          try {
                            sessionStorage.setItem(
                              'nb_google_prefill',
                              JSON.stringify({ ...unregisteredGoogle, role: targetRole })
                            );
                          } catch {
                            // ignore
                          }
                          if (onNavigateAdmission) {
                            onNavigateAdmission(targetRole);
                          }
                        }}
                      >
                        <span>
                          {selectedPortal === 'teacher'
                            ? lang === 'ar' ? 'تقديم طلب معلم جديد' : 'Apply as Teacher'
                            : lang === 'ar' ? 'تقديم طلب التحاق طالب' : 'Apply as Student'}
                        </span>
                      </PrimaryButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : guardianPendingInfo ? (
          <div className="p-5 rounded-xl border border-[#0F766E]/40 bg-[#0F766E]/8 space-y-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-[#0F766E] dark:text-[#2DD4BF] mx-auto" />
            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-[#0F213E] dark:text-[#F8F5EC]">
                {lang === 'ar' ? 'تم استلام طلب تفعيل حساب ولي الأمر' : 'Guardian Activation Request Received'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {lang === 'ar'
                  ? `تم تسجيل بياناتك وربطها مؤقتاً بالطالب (${guardianPendingInfo.student_code}) بالبريد (${guardianPendingInfo.email}). يلزم الآن موافقة إدارة الأكاديمية على الطلب قبل التمكن من تسجيل الدخول.`
                  : `Your activation request for student (${guardianPendingInfo.student_code}) with email (${guardianPendingInfo.email}) has been recorded. Academy administration approval is required before signing in.`}
              </p>
            </div>
            <SecondaryButton
              type="button"
              onClick={() => {
                setEmail(guardianPendingInfo.email);
                setGuardianPendingInfo(null);
                setGuardianMode('login');
              }}
              className="mx-auto"
            >
              <LogIn className="w-4 h-4" />
              <span>{lang === 'ar' ? 'العودة لصفحة تسجيل الدخول' : 'Back to Sign In'}</span>
            </SecondaryButton>
          </div>
        ) : (
          <form onSubmit={handleGuardianRegister} className="space-y-3.5">
            <div className="rounded-xl p-3 bg-[#F2EFE6] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63] text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
              <p>
                {lang === 'ar'
                  ? 'أدخل البريد الإلكتروني المسجّل للطالب / ولي الأمر مع كود الطالب، وعيّن كلمة مرور جديدة خاصة بولي الأمر لأول مرة. بعد موافقة الإدارة، يمكنك الدخول من بوابة «ولي أمر» بنفس البريد وكلمة مرور ولي الأمر دون التأثير على حساب الطالب.'
                  : 'Enter the registered Student / Guardian email and Student Code, then set a dedicated Guardian password for first-time activation. After approval, sign in under Guardian using that email and your dedicated Guardian password.'}
              </p>
              {googleEnabled && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#E5DEC9] dark:border-[#233C63]">
                  <span>
                    {lang === 'ar' ? 'تريد ربط بريد Google والتحقق منه مباشرة؟' : 'Want to verify via Google first?'}
                  </span>
                  <button
                    type="button"
                    disabled={guardianGoogleLoading}
                    onClick={handleGuardianGooglePrefill}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-2.5 py-1 text-[11px] font-bold hover:bg-[#FAF8F3] cursor-pointer disabled:opacity-60"
                  >
                    <GoogleMark />
                    <span>
                      {guardianGoogleLoading
                        ? lang === 'ar' ? 'بانتظار Google...' : 'Waiting...'
                        : guardianGoogleToken
                        ? lang === 'ar' ? 'تم التحقق عبر Google' : 'Verified via Google'
                        : lang === 'ar' ? 'التحقق من البريد عبر Google' : 'Verify Email with Google'}
                    </span>
                  </button>
                </div>
              )}
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
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold">{lang === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}</label>
                <PhoneInputWithCode
                  value={guardianForm.phone}
                  onChange={(nextPhone) => setGuardianForm({ ...guardianForm, phone: nextPhone })}
                  placeholder="1012345678"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني المسجّل للطالب / ولي الأمر *' : 'Registered Student / Guardian Email *'}</label>
              <input
                type="email"
                dir="ltr"
                required
                value={guardianForm.email}
                onChange={(e) => setGuardianForm({ ...guardianForm, email: e.target.value })}
                placeholder="email@example.com"
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'كلمة مرور ولي الأمر الجديدة (8+ أحرف) *' : 'Guardian Password (min 8 chars) *'}</label>
                <div className="relative">
                  <input
                    type={showGuardianPassword ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={guardianForm.password}
                    onChange={(e) => setGuardianForm({ ...guardianForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGuardianPassword((v) => !v)}
                    aria-label={showGuardianPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                  >
                    {showGuardianPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'تأكيد كلمة مرور ولي الأمر *' : 'Confirm Guardian Password *'}</label>
                <div className="relative">
                  <input
                    type={showGuardianConfirm ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={guardianForm.confirmPassword}
                    onChange={(e) => setGuardianForm({ ...guardianForm, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGuardianConfirm((v) => !v)}
                    aria-label={showGuardianConfirm ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                  >
                    {showGuardianConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
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

        <div className="pt-3 border-t border-[#EFEAD8] dark:border-[#1D355B] text-center">
          {selectedPortal !== 'admin' ? (
            <button
              type="button"
              onClick={() => {
                setSelectedPortal('admin');
                setUnregisteredGoogle(null);
                setPendingNotice(false);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'دخول مدير الأكاديمية / الإدارة' : 'Academy Director / Admin Sign In'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedPortal('student');
                setPendingNotice(false);
              }}
              className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'العودة لاختيار (طالب · معلم · ولي أمر)' : 'Back to Student · Teacher · Guardian'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

export function GoogleOAuthCallbackPage() {
  const { lang } = useApp();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorDetail, setErrorDetail] = useState<string>('');

  useEffect(() => {
    const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search || '');
    const state = queryParams.get('oauth_state') || '';
    const accessToken = hashParams.get('access_token') || '';
    const errMsg =
      queryParams.get('error_description') ||
      queryParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error') ||
      '';

    const payload = {
      type: 'NB_GOOGLE_OAUTH',
      state,
      access_token: accessToken,
      error: errMsg || (!accessToken ? 'Missing access token from Google OAuth callback.' : ''),
    };

    if (errMsg) {
      setStatus('error');
      setErrorDetail(errMsg);
    } else if (accessToken) {
      setStatus('success');
    } else {
      setStatus('error');
      setErrorDetail('Missing access token from Google OAuth callback.');
    }

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch {
      // ignore cross-window restriction
    }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('nb_google_oauth');
        ch.postMessage(payload);
        ch.close();
      }
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(
        'nb_google_oauth_result',
        JSON.stringify({ state, access_token: accessToken, error: payload.error, ts: Date.now() })
      );
      window.setTimeout(() => {
        try {
          localStorage.removeItem('nb_google_oauth_result');
        } catch {
          // ignore
        }
      }, 5000);
    } catch {
      // ignore
    }

    if (state && /^[a-zA-Z0-9_-]{16,96}$/.test(state)) {
      void apiFetch('/api/auth/oauth-handoff', {
        method: 'POST',
        body: JSON.stringify({
          state,
          ...(accessToken ? { access_token: accessToken } : {}),
          ...(payload.error ? { error: payload.error } : {}),
        }),
      })
        .catch(() => {})
        .finally(() => {
          window.setTimeout(() => {
            try {
              window.close();
            } catch {
              // ignore
            }
          }, 350);
        });
    } else {
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // ignore
        }
      }, 350);
    }
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <Card className="p-6 text-center space-y-4">
        <AcademyLogo className="w-11 h-11 mx-auto" />
        <h1 className="text-lg font-extrabold">
          {status === 'success'
            ? lang === 'ar'
              ? 'تم التحقق من حساب Google بنجاح'
              : 'Google Account Verified'
            : status === 'error'
            ? lang === 'ar'
              ? 'تعذر إتمام تسجيل الدخول عبر Google'
              : 'Google Sign-In Failed'
            : lang === 'ar'
            ? 'جاري إتمام التحقق من حساب Google...'
            : 'Completing Google Sign-In...'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {status === 'error'
            ? errorDetail || (lang === 'ar' ? 'يرجى إغلاق النافذة والمحاولة مرة أخرى.' : 'Please close this window and try again.')
            : lang === 'ar'
            ? 'يمكنك العودة إلى نافذة المنصة أو إغلاق هذه النافذة.'
            : 'You will be returned to the Academy portal automatically.'}
        </p>
        <PrimaryButton
          type="button"
          onClick={() => {
            try {
              window.close();
            } catch {
              // ignore
            }
          }}
          className="mx-auto"
        >
          <span>{lang === 'ar' ? 'إغلاق النافذة' : 'Close Window'}</span>
        </PrimaryButton>
      </Card>
    </div>
  );
}

