import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface CertificatePDFData {
  verification_code: string;
  student_name_en: string;
  student_name_ar: string;
  course_title_en: string;
  course_title_ar?: string;
  title_en: string;
  title_ar?: string;
  grade_label: string;
  issued_at: string;
}

async function waitForFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 600)),
    ]);
  } catch {
    // Fallback safely to system Arabic fonts
  }
}

function renderTextStripToPng(options: {
  text: string;
  widthPt: number;
  heightPt: number;
  fontSizePx: number;
  fontWeight?: '400' | '600' | '700' | '800';
  color?: string;
  direction?: 'rtl' | 'ltr';
}): string | null {
  if (typeof document === 'undefined' || !options.text.trim()) return null;
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(options.widthPt * scale);
  canvas.height = Math.round(options.heightPt * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, options.widthPt, options.heightPt);
  ctx.direction = options.direction || 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.color || '#0F213E';
  const weight = options.fontWeight || '700';
  const fontFamily =
    options.direction === 'ltr'
      ? "'Plus Jakarta Sans', 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Cairo', 'Amiri', 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.font = `${weight} ${options.fontSizePx}px ${fontFamily}`;
  ctx.fillText(options.text, options.widthPt / 2, options.heightPt / 2, options.widthPt - 24);
  return canvas.toDataURL('image/png');
}

export async function generateCertificatePDF(cert: CertificatePDFData): Promise<void> {
  await waitForFontsReady();

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Warm parchment background
  doc.setFillColor(250, 248, 243);
  doc.rect(0, 0, w, h, 'F');

  // Deep navy outer border
  doc.setDrawColor(15, 33, 62);
  doc.setLineWidth(6);
  doc.rect(24, 24, w - 48, h - 48);

  // Warm gold inner border & corner accents
  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(2);
  doc.rect(36, 36, w - 72, h - 72);

  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(1);
  doc.rect(42, 42, w - 84, h - 84);

  // Bilingual Header
  const arAcademyStrip = renderTextStripToPng({
    text: 'أكاديمية نور وبيان لتحفيظ القرآن الكريم واللغة العربية',
    widthPt: 580,
    heightPt: 26,
    fontSizePx: 14,
    fontWeight: '800',
    color: '#0F213E',
  });
  if (arAcademyStrip) {
    doc.addImage(arAcademyStrip, 'PNG', w / 2 - 290, 56, 580, 26);
  }

  doc.setTextColor(15, 33, 62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('NOOR & BAYAN ACADEMY', w / 2, 95, { align: 'center' });

  // Main Arabic + English Title
  const arTitleStrip = renderTextStripToPng({
    text: 'شهادة إتمام وتفوّق',
    widthPt: 480,
    heightPt: 40,
    fontSizePx: 26,
    fontWeight: '800',
    color: '#C98A1E',
  });
  if (arTitleStrip) {
    doc.addImage(arTitleStrip, 'PNG', w / 2 - 240, 108, 480, 40);
  }

  doc.setTextColor(201, 138, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('CERTIFICATE OF ACHIEVEMENT', w / 2, 166, { align: 'center' });

  // Intro line
  const arAwardStrip = renderTextStripToPng({
    text: 'تشهد إدارة الأكاديمية بكل فخر بأن الطالب / الطالبة',
    widthPt: 540,
    heightPt: 24,
    fontSizePx: 13,
    fontWeight: '600',
    color: '#475569',
  });
  if (arAwardStrip) {
    doc.addImage(arAwardStrip, 'PNG', w / 2 - 270, 182, 540, 24);
  }

  // Student Name (Arabic primary + English subtitle)
  const studentAr = cert.student_name_ar || cert.student_name_en;
  const arStudentStrip = renderTextStripToPng({
    text: studentAr,
    widthPt: 620,
    heightPt: 42,
    fontSizePx: 26,
    fontWeight: '800',
    color: '#0F213E',
  });
  if (arStudentStrip) {
    doc.addImage(arStudentStrip, 'PNG', w / 2 - 310, 208, 620, 42);
  }

  if (cert.student_name_en && cert.student_name_en !== cert.student_name_ar) {
    const enStudentStrip = renderTextStripToPng({
      text: cert.student_name_en,
      widthPt: 580,
      heightPt: 24,
      fontSizePx: 14,
      fontWeight: '700',
      color: '#475569',
      direction: 'ltr',
    });
    if (enStudentStrip) {
      doc.addImage(enStudentStrip, 'PNG', w / 2 - 290, 249, 580, 24);
    }
  }

  // Gold Divider
  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(1.5);
  doc.line(w / 2 - 170, 276, w / 2 + 170, 276);

  // Achievement details (Arabic + English, rendered cleanly with max-width fitting)
  const arCertTitle = cert.title_ar || cert.title_en;
  const arAchievementStrip = renderTextStripToPng({
    text: `قد أتمّ بنجاح: ${arCertTitle}`,
    widthPt: 640,
    heightPt: 32,
    fontSizePx: 17,
    fontWeight: '700',
    color: '#0F766E',
  });
  if (arAchievementStrip) {
    doc.addImage(arAchievementStrip, 'PNG', w / 2 - 320, 286, 640, 32);
  }

  const enTitleStrip = renderTextStripToPng({
    text: cert.title_en,
    widthPt: 620,
    heightPt: 24,
    fontSizePx: 13,
    fontWeight: '700',
    color: '#0F766E',
    direction: 'ltr',
  });
  if (enTitleStrip) {
    doc.addImage(enTitleStrip, 'PNG', w / 2 - 310, 318, 620, 24);
  }

  const arProgramText = cert.course_title_ar
    ? `البرنامج: ${cert.course_title_ar}   ·   التقدير: ${cert.grade_label}`
    : `التقدير: ${cert.grade_label}`;
  const arProgramStrip = renderTextStripToPng({
    text: arProgramText,
    widthPt: 660,
    heightPt: 26,
    fontSizePx: 13,
    fontWeight: '600',
    color: '#334155',
  });
  if (arProgramStrip) {
    doc.addImage(arProgramStrip, 'PNG', w / 2 - 330, 344, 660, 26);
  }

  const enProgramStrip = renderTextStripToPng({
    text: `Program: ${cert.course_title_en}  ·  Standing: ${cert.grade_label}`,
    widthPt: 660,
    heightPt: 24,
    fontSizePx: 11.5,
    fontWeight: '600',
    color: '#475569',
    direction: 'ltr',
  });
  if (enProgramStrip) {
    doc.addImage(enProgramStrip, 'PNG', w / 2 - 330, 372, 660, 24);
  }

  // QR Code for instant verification
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://noorbayan.academy';
  const verifyUrl = `${origin}/verify?code=${encodeURIComponent(cert.verification_code)}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F213E',
        light: '#FAF8F3',
      },
    });
    const qrSize = 74;
    const qrX = w - 64 - qrSize;
    const qrY = h - 64 - qrSize - 12;
    doc.setDrawColor(201, 138, 30);
    doc.setLineWidth(1);
    doc.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 13, { align: 'center' });
  } catch {
    // Non-fatal fallback if QR canvas fails
  }

  // Footer metadata
  const issuedDate = String(cert.issued_at).slice(0, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issued Date: ${issuedDate}`, 64, h - 86);
  doc.text(`Verification ID: ${cert.verification_code}`, 64, h - 68);

  const arFooterStrip = renderTextStripToPng({
    text: 'شهادة موثّقة إلكترونياً — تحقّق عبر رمز الاستجابة السريعة أو صفحة التحقق',
    widthPt: 420,
    heightPt: 22,
    fontSizePx: 10.5,
    fontWeight: '600',
    color: '#64748B',
  });
  if (arFooterStrip) {
    doc.addImage(arFooterStrip, 'PNG', w / 2 - 210, h - 82, 420, 22);
  }

  doc.save(`${cert.verification_code}.pdf`);
}
