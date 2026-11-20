export type Lang = 'ar' | 'en';
export type Theme = 'day' | 'night';
export type UserRole = 'student' | 'teacher' | 'admin' | 'guardian';

export interface AuthUser {
  id: string | number;
  email: string;
  full_name: string;
  role: UserRole;
  preferred_lang: Lang;
  guardian_id?: number;
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
  teacher_id: number | null;
  teacher_name_ar?: string | null;
  teacher_name_en?: string | null;
  teacher_avatar?: string | null;
  schedule_ar: string;
  schedule_en: string;
  price_monthly: number;
  price_monthly_sar?: number | null;
  capacity: number;
  is_featured: number | boolean;
  cover_url?: string | null;
  co_teacher_ids?: number[];
  co_teacher_names_ar?: string[];
  co_teacher_names_en?: string[];
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

export interface CommunityReply {
  id: string;
  author_name: string;
  author_role: UserRole;
  content: string;
  created_at: string;
  is_mine?: boolean;
}

export interface CommunityComment {
  id: string;
  author_name: string;
  author_role: UserRole;
  rating: number;
  content: string;
  is_visible: boolean;
  is_mine?: boolean;
  replies: CommunityReply[];
  created_at: string;
  updated_at: string;
}

export type SuggestionCategory = 'platform' | 'curriculum' | 'experience' | 'other';
export type SuggestionStatus = 'pending' | 'reviewing' | 'planned' | 'implemented' | 'declined';

export interface AcademySuggestion {
  id: string;
  author_name: string;
  author_role: UserRole;
  category: SuggestionCategory;
  title: string;
  description: string;
  status: SuggestionStatus;
  admin_reply: string;
  replied_by_name: string | null;
  replied_at: string | null;
  votes_count: number;
  has_voted: boolean;
  is_mine?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlacementQuestionPublic {
  id: string;
  q_ar: string;
  q_en: string;
  opts_ar: string[];
  opts_en: string[];
}

export interface PlacementQuestionAdmin extends PlacementQuestionPublic {
  correct_index: number;
}

export interface PlacementTestPublicConfig {
  intro_ar: string;
  intro_en: string;
  questions: PlacementQuestionPublic[];
  updated_at: string;
}

export interface PlacementTestAdminConfig {
  intro_ar: string;
  intro_en: string;
  questions: PlacementQuestionAdmin[];
  thresholds: {
    intermediate_min_score: number;
    advanced_min_score: number;
    advanced_min_age: number;
  };
  updated_at: string;
}

