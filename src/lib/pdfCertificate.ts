import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { getCertificateVerifyUrl } from './siteConfig';

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

async function loadLogoAsPngDataUrl(src: string): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        // White seal backdrop + subtle gold circular/rounded border
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#C98A1E';
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
        ctx.clip();
        const pad = 22;
        ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
        ctx.restore();

        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
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

  // Official Academy Logo Emblem at Top Crown
  const logoPng = await loadLogoAsPngDataUrl('/assets/images/academy_logo.webp');
  const hasLogo = Boolean(logoPng);
  if (logoPng) {
    const logoSize = 48;
    doc.addImage(logoPng, 'PNG', w / 2 - logoSize / 2, 52, logoSize, logoSize);
  }

  const yOffset = hasLogo ? 40 : 0;

  // Bilingual Header (safely inside gold double frame)
  const arAcademyStrip = renderTextStripToPng({
    text: 'أكاديمية نور وبيان للقرآن واللغات والعلوم والمهارات',
    widthPt: 600,
    heightPt: 24,
    fontSizePx: 12.5,
    fontWeight: '800',
    color: '#0F213E',
  });
  if (arAcademyStrip) {
    doc.addImage(arAcademyStrip, 'PNG', w / 2 - 300, 62 + yOffset, 600, 24);
  }

  doc.setTextColor(15, 33, 62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('NOOR & BAYAN ACADEMY', w / 2, 97 + yOffset, { align: 'center' });

  // Main Arabic + English Title
  const arTitleStrip = renderTextStripToPng({
    text: 'شهادة إتمام وتفوّق',
    widthPt: 480,
    heightPt: 38,
    fontSizePx: 24,
    fontWeight: '800',
    color: '#C98A1E',
  });
  if (arTitleStrip) {
    doc.addImage(arTitleStrip, 'PNG', w / 2 - 240, 108 + yOffset, 480, 38);
  }

  doc.setTextColor(201, 138, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CERTIFICATE OF ACHIEVEMENT', w / 2, 160 + yOffset, { align: 'center' });

  // Intro line
  const arAwardStrip = renderTextStripToPng({
    text: 'تشهد إدارة الأكاديمية بكل فخر بأن الطالب / الطالبة',
    widthPt: 540,
    heightPt: 22,
    fontSizePx: 12.5,
    fontWeight: '600',
    color: '#475569',
  });
  if (arAwardStrip) {
    doc.addImage(arAwardStrip, 'PNG', w / 2 - 270, 174 + yOffset, 540, 22);
  }

  // Student Name (Arabic primary + English subtitle)
  const studentAr = cert.student_name_ar || cert.student_name_en;
  const arStudentStrip = renderTextStripToPng({
    text: studentAr,
    widthPt: 620,
    heightPt: 38,
    fontSizePx: 24,
    fontWeight: '800',
    color: '#0F213E',
  });
  if (arStudentStrip) {
    doc.addImage(arStudentStrip, 'PNG', w / 2 - 310, 198 + yOffset, 620, 38);
  }

  if (cert.student_name_en && cert.student_name_en !== cert.student_name_ar) {
    const enStudentStrip = renderTextStripToPng({
      text: cert.student_name_en,
      widthPt: 580,
      heightPt: 22,
      fontSizePx: 13.5,
      fontWeight: '700',
      color: '#475569',
      direction: 'ltr',
    });
    if (enStudentStrip) {
      doc.addImage(enStudentStrip, 'PNG', w / 2 - 290, 237 + yOffset, 580, 22);
    }
  }

  // Gold Divider
  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(1.5);
  doc.line(w / 2 - 170, 264 + yOffset, w / 2 + 170, 264 + yOffset);

  // Achievement details (Arabic + English title, Arabic program/standing only)
  const arCertTitle = cert.title_ar || cert.title_en;
  const arAchievementStrip = renderTextStripToPng({
    text: `قد أتمّ بنجاح: ${arCertTitle}`,
    widthPt: 640,
    heightPt: 30,
    fontSizePx: 16,
    fontWeight: '700',
    color: '#0F766E',
  });
  if (arAchievementStrip) {
    doc.addImage(arAchievementStrip, 'PNG', w / 2 - 320, 274 + yOffset, 640, 30);
  }

  const enTitleStrip = renderTextStripToPng({
    text: cert.title_en,
    widthPt: 620,
    heightPt: 22,
    fontSizePx: 12.5,
    fontWeight: '700',
    color: '#0F766E',
    direction: 'ltr',
  });
  if (enTitleStrip) {
    doc.addImage(enTitleStrip, 'PNG', w / 2 - 310, 306 + yOffset, 620, 22);
  }

  const arProgramText = cert.course_title_ar
    ? `البرنامج: ${cert.course_title_ar}   ·   التقدير: ${cert.grade_label}`
    : `التقدير: ${cert.grade_label}`;
  const arProgramStrip = renderTextStripToPng({
    text: arProgramText,
    widthPt: 660,
    heightPt: 26,
    fontSizePx: 13,
    fontWeight: '700',
    color: '#334155',
  });
  if (arProgramStrip) {
    doc.addImage(arProgramStrip, 'PNG', w / 2 - 330, 330 + yOffset, 660, 26);
  }

  if (cert.course_title_en && cert.course_title_en !== cert.course_title_ar) {
    const enCourseStrip = renderTextStripToPng({
      text: `Program: ${cert.course_title_en}`,
      widthPt: 620,
      heightPt: 20,
      fontSizePx: 11.5,
      fontWeight: '600',
      color: '#475569',
      direction: 'ltr',
    });
    if (enCourseStrip) {
      doc.addImage(enCourseStrip, 'PNG', w / 2 - 310, 356 + yOffset, 620, 20);
    }
  }

  // QR Code for instant verification (always resolves to official production domain)
  const verifyUrl = getCertificateVerifyUrl(cert.verification_code);
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
    const qrSize = 72;
    const qrX = w - 64 - qrSize;
    const qrY = h - 62 - qrSize - 12;
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

  // Footer metadata & Verification Notice (positioned cleanly without horizontal overlap)
  const arFooterStrip = renderTextStripToPng({
    text: 'شهادة موثّقة إلكترونياً — تحقّق عبر رمز الاستجابة السريعة أو صفحة التحقق',
    widthPt: 400,
    heightPt: 22,
    fontSizePx: 10,
    fontWeight: '600',
    color: '#64748B',
  });
  if (arFooterStrip) {
    doc.addImage(arFooterStrip, 'PNG', w / 2 - 200, h - 108, 400, 22);
  }

  const issuedDate = String(cert.issued_at).slice(0, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issued Date: ${issuedDate}`, 64, h - 84);
  doc.text(`Verification ID: ${cert.verification_code}`, 64, h - 66);

  doc.save(`${cert.verification_code}.pdf`);
}
