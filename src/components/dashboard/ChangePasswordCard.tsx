import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { Card, PrimaryButton } from '../ui/CommonUI';

export function ChangePasswordCard() {
  const { lang, toast } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast(lang === 'ar' ? 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' : 'New password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast(lang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password updated securely', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-[#C98A1E]" />
        <h3 className="font-bold text-base">
          {lang === 'ar' ? 'تغيير كلمة المرور وأمان الحساب' : 'Change Password & Account Security'}
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            dir="ltr"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={lang === 'ar' ? 'كلمة المرور الحالية' : 'Current password'}
            className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            aria-label={showCurrent ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={lang === 'ar' ? 'كلمة المرور الجديدة (8+ أحرف)' : 'New password (8+ chars)'}
            className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            aria-label={showNew ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={lang === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'}
            className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
          >
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="sm:col-span-3">
          <PrimaryButton type="submit" disabled={saving} className="text-xs">
            {saving ? (lang === 'ar' ? 'جاري التحديث...' : 'Updating...') : lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Update Password'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
