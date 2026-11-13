import { jsPDF } from 'jspdf';

export interface CertificatePDFData {
  verification_code: string;
  student_name_en: string;
  student_name_ar: string;
  course_title_en: string;
  title_en: string;
  grade_label: string;
  issued_at: string;
}

export function generateCertificatePDF(cert: CertificatePDFData) {
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

  // Warm gold inner border
  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(2);
  doc.rect(36, 36, w - 72, h - 72);

  // Header
  doc.setTextColor(15, 33, 62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('NOOR & BAYAN ACADEMY', w / 2, 84, { align: 'center' });

  doc.setTextColor(201, 138, 30);
  doc.setFontSize(30);
  doc.text('CERTIFICATE OF ACHIEVEMENT', w / 2, 135, { align: 'center' });

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.text('This certificate is proudly awarded to', w / 2, 185, { align: 'center' });

  // Student Name
  doc.setTextColor(15, 33, 62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text(cert.student_name_en || cert.student_name_ar, w / 2, 232, { align: 'center' });

  // Divider
  doc.setDrawColor(201, 138, 30);
  doc.setLineWidth(1.5);
  doc.line(w / 2 - 150, 250, w / 2 + 150, 250);

  // Achievement details
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('For successfully completing', w / 2, 286, { align: 'center' });

  doc.setTextColor(15, 118, 110);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(cert.title_en, w / 2, 318, { align: 'center' });

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.text(`Program: ${cert.course_title_en}`, w / 2, 348, { align: 'center' });

  // Grade & Verification box
  doc.setTextColor(15, 33, 62);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Standing: ${cert.grade_label}`, w / 2, 386, { align: 'center' });

  // Footer
  const issuedDate = String(cert.issued_at).slice(0, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Issued Date: ${issuedDate}`, 72, h - 75);
  doc.text(`Verification ID: ${cert.verification_code}`, w - 72, h - 75, { align: 'right' });
  doc.text('Verify authenticity at /verify', w / 2, h - 75, { align: 'center' });

  doc.save(`${cert.verification_code}.pdf`);
}
