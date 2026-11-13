export type Lang = 'ar' | 'en';
export type Theme = 'day' | 'night';
export type UserRole = 'student' | 'teacher' | 'admin' | 'guardian';

export interface AuthUser {
  id: string | number;
  email: string;
  full_name: string;
  role: UserRole;
  preferred_lang: Lang;
}

export interface Course {
  id: number;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  level_id: number;
  level_name_ar?: string;
  level_name_en?: string;
  level_code?: string;
  teacher_id: number;
  teacher_name_ar?: string;
  teacher_name_en?: string;
  teacher_avatar?: string;
  schedule_ar: string;
  schedule_en: string;
  price_monthly: number;
  capacity: number;
  is_featured: number | boolean;
}

export interface Teacher {
  id: number;
  profile_id?: string | number | null;
  name_ar: string;
  name_en: string;
  bio_ar: string;
  bio_en: string;
  qualifications_ar: string;
  qualifications_en: string;
  specialty_ar: string;
  specialty_en: string;
  avatar_url: string;
  hourly_rate?: number;
}

export interface Level {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  age_range: string;
  order_index: number;
  criteria_ar: string;
  criteria_en: string;
}

export interface GameItem {
  id: number;
  slug: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  category: 'letters' | 'numbers' | 'memorization' | '3d_explorer';
  is_public_sample: number | boolean;
  is_active: number | boolean;
  score?: number;
  stars?: number;
  completed_levels?: number;
}

export interface Testimonial {
  id: number;
  guardian_name_ar: string;
  guardian_name_en: string;
  relation_ar: string;
  relation_en: string;
  quote_ar: string;
  quote_en: string;
  student_outcome_ar: string;
  student_outcome_en: string;
  is_approved: number | boolean;
}

export interface LegalDocument {
  id?: number;
  doc_type: 'terms' | 'privacy' | 'refund';
  version: string;
  title_ar: string;
  title_en: string;
  content_ar: string;
  content_en: string;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  profile_id: string | number;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  is_read: number | boolean;
  created_at: string;
}

export interface PublicOverview {
  stats: {
    students: number;
    teachers: number;
    courses: number;
    lessons: number;
  };
  courses: Course[];
  teachers: Teacher[];
  levels: Level[];
  games: GameItem[];
  testimonials: Testimonial[];
  legal: LegalDocument[];
}
