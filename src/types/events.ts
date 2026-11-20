export type EventCategory =
  | 'Academic'
  | 'SUG & Elections'
  | 'Faculty & Department Week'
  | 'Fellowship & Faith'
  | 'Sports & Games'
  | 'Tech & Workshops'
  | 'Concert & Social'
  | 'Career & Business';

export const EVENT_CATEGORIES: EventCategory[] = [
  'Academic',
  'SUG & Elections',
  'Faculty & Department Week',
  'Fellowship & Faith',
  'Sports & Games',
  'Tech & Workshops',
  'Concert & Social',
  'Career & Business',
];

export type EventResponse = 'interested' | 'going';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  organizerId: string;
  organizerName: string;
  organizerAvatar?: string;
  organizerHandle?: string;
  venue: string;
  campus: string;
  startTime: string; // ISO String
  endTime?: string;  // ISO String
  posterUrl?: string;
  status: EventStatus;
  visibility: 'public' | 'campus_only';
  registrationLink?: string;
  isOnline?: boolean;
  onlineUrl?: string;
  capacityLimit?: number;
  communityId?: string;
  communityName?: string;
  interestedCount: number;
  goingCount: number;
  viewsCount?: number;
  createdAt: string;
  updatedAt: string;
  // Current user's relationship
  userResponse?: EventResponse | null;
  isSaved?: boolean;
  isOrganizer?: boolean;
}

export interface CreateEventInput {
  title: string;
  description: string;
  category: EventCategory;
  venue: string;
  campus?: string;
  startTime: string;
  endTime?: string;
  posterUrl?: string;
  registrationLink?: string;
  isOnline?: boolean;
  onlineUrl?: string;
  capacityLimit?: number;
  communityId?: string;
  communityName?: string;
}

export interface EventParticipant {
  id: string;
  eventId: string;
  userId: string;
  name: string;
  avatar: string;
  department: string;
  level: string;
  response: EventResponse;
  createdAt: string;
}

export interface OrganizerProfile {
  id: string;
  userId: string;
  organizerName: string;
  description: string;
  contactInformation: string;
  isVerified: boolean;
  totalEventsOrganized: number;
}
