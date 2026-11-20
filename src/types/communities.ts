export type CommunityPrivacy = 'public' | 'private';

export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';

export type CommunityMembershipStatus = 'active' | 'approved' | 'pending' | 'rejected' | 'banned';

export type CommunityCategory =
  | 'Academic & Faculty'
  | 'Departmental'
  | 'Tech & Developers'
  | 'Business & Entrepreneurship'
  | 'Campus Life & Gist'
  | 'Sports & Games'
  | 'Creative & Arts'
  | 'Faith & Fellowship'
  | 'Hostel & Lodges'
  | 'General';

export const COMMUNITY_CATEGORIES: CommunityCategory[] = [
  'Academic & Faculty',
  'Departmental',
  'Tech & Developers',
  'Business & Entrepreneurship',
  'Campus Life & Gist',
  'Sports & Games',
  'Creative & Arts',
  'Faith & Fellowship',
  'Hostel & Lodges',
  'General',
];

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: CommunityCategory;
  imageUrl?: string;
  coverUrl?: string;
  location?: string;
  privacy: CommunityPrivacy;
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  rules?: string;
  rulesList?: string[];
  membersCount: number;
  pendingMembersCount?: number;
  status: 'active' | 'archived' | 'suspended';
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  // Current user's relationship to community
  isMember?: boolean;
  userRole?: CommunityRole;
  membershipStatus?: CommunityMembershipStatus;
}

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  name: string;
  avatar: string;
  handle: string;
  department: string;
  level: string;
  campus: string;
  role: CommunityRole;
  membershipStatus: CommunityMembershipStatus;
  joinedAt: string;
}

export interface CreateCommunityInput {
  name: string;
  description: string;
  category: CommunityCategory;
  imageUrl?: string;
  coverUrl?: string;
  location?: string;
  privacy: CommunityPrivacy;
  rules?: string;
  rulesList?: string[];
}

export interface UpdateCommunityInput {
  name?: string;
  description?: string;
  category?: CommunityCategory;
  imageUrl?: string;
  coverUrl?: string;
  location?: string;
  privacy?: CommunityPrivacy;
  rules?: string;
  rulesList?: string[];
}
