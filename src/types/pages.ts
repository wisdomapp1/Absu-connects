/**
 * ABSU Connect — Pages & Applications Types
 */

export type PageCategory = 'business' | 'creator' | 'community' | 'organization' | 'other';

export interface Page {
  id: string;
  slug: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  avatar_url?: string;
  createdBy?: string;
  created_by?: string;
  isActive: boolean;
  is_active?: boolean;
  createdAt: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  category?: PageCategory;
  avatar_path?: string;
  cover_path?: string;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
  followersCount: number;
  postsCount?: number;
  isFollowing?: boolean;
}

export interface PageApplication {
  id: string;
  applicant_id: string;
  name: string;
  category: PageCategory;
  description: string;
  why_create: string;
  contact_email?: string;
  contact_phone?: string;
  location?: string;
  avatar_path?: string;
  cover_path?: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string | null;
  page_id?: string | null;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  updated_at?: string;
  applicant?: {
    id: string;
    name: string;
    avatar_url?: string;
    department?: string;
  };
}

export interface AnonymousSubmission {
  id: string;
  page_id: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  published_post_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PageManager {
  page_id: string;
  user_id: string;
  role: 'owner' | 'manager';
  created_at: string;
}
