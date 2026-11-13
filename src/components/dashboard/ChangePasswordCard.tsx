import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { Card, PrimaryButton } from '../ui/CommonUI';

export function ChangePasswordCard() {
  const { lang, toast } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={lang === 'ar' ? 'كلمة المرور الحالية' : 'Current password'}
          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={lang === 'ar' ? 'كلمة المرور الجديدة (8+ أحرف)' : 'New password (8+ chars)'}
          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={lang === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'}
          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2 text-sm"
        />
        <div className="sm:col-span-3">
          <PrimaryButton type="submit" disabled={saving} className="text-xs">
            {saving ? (lang === 'ar' ? 'جاري التحديث...' : 'Updating...') : lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Update Password'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
