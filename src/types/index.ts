export interface User {
  id: string;
  name: string;
  avatar: string;
  handle: string;
  department: string;
  faculty: string;
  level: string; // e.g. "300 Level"
  campus: string; // e.g. "Uturu (Main Campus)"
  bio: string;
  interests: string[];
  mutualFriendsCount?: number;
  isVerified?: boolean;
  avatarAssetId?: string;
  relationshipState: 'self' | 'none' | 'request_sent' | 'request_received' | 'friends';
}

export interface Comment {
  id: string;
  postId: string;
  parentId?: string | null;
  author: {
    id: string;
    name: string;
    avatar: string;
    department: string;
    level: string;
    isVerified?: boolean;
  };
  authorAsPage?: boolean;
  authorPageId?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  likesCount: number;
  isLiked?: boolean;
  replies?: Comment[];
}

export type PostCategory = 'General' | 'Campus Update' | 'Academic' | 'Hostel Life' | 'Event';
export type PostAudience = 'Public' | 'Friends Only' | 'Campus Only';

export interface VideoEditSettings {
  startTime: number;
  endTime: number;
  duration: number;
  isMuted: boolean;
  aspectRatio: '16:9' | '1:1' | '9:16' | 'original';
  caption?: string;
  posterDataUrl?: string;
}

export interface PostMediaItem {
  id?: string;
  secure_url: string;
  asset_id?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  kind: 'image' | 'video';
  provider?: string;
  position?: number;
  cloudinary_public_id?: string;
  cloudinary_resource_type?: 'image' | 'video' | 'raw' | 'auto';
  duration_seconds?: number;
  thumbnail_url?: string;
  trim_start?: number;
  trim_end?: number;
  is_muted?: boolean;
  aspect_ratio?: '16:9' | '1:1' | '9:16' | 'original';
}

export interface AttachedMediaItem {
  id: string;
  file?: File;
  buffer?: ArrayBuffer;
  previewUrl: string;
  type: 'image' | 'video';
  name: string;
  sizeLabel?: string;
  duration?: number;
  isPreset?: boolean;
  videoSettings?: VideoEditSettings;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  mediaItems?: PostMediaItem[];
  category: PostCategory;
  categoryHashtag?: '#Event' | '#CampusUpdates' | '#GeneralPost';
  audience: PostAudience;
  createdAt: string;
  pinnedAt?: string | null;
  likesCount: number;
  isLiked: boolean;
  isSaved: boolean;
  comments: Comment[];
  commentsCount?: number;
  isPinned?: boolean;
  pageId?: string;
  authorPageId?: string;
  authorAsPage?: boolean;
  isPagePost?: boolean;
  pageIsVerified?: boolean;
  pageSlug?: string;
  pageCategory?: string;
  pageStatus?: 'active' | 'disabled' | 'deleted';
  allowComments?: boolean;
  allowMessages?: boolean;
  communityId?: string;
  communityName?: string;
  communitySlug?: string;
  communityImageUrl?: string;
}

export interface FriendRequest {
  id: string;
  user: User;
  createdAt: string;
  mutualCount: number;
  type: 'received' | 'sent';
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  uploader_id: string;
  file_name: string;
  bytes: number;
  format?: string;
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'document';
  asset_id: string;
  story_id?: string | null;
  secure_url?: string;
  provider: string;
  thumbnail_url?: string;
  created_at: string;
  cloudinary_public_id?: string;
  cloudinary_resource_type?: 'image' | 'video' | 'raw' | 'auto';
  duration_seconds?: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderAsPage?: boolean;
  senderPageId?: string | null;
  senderName?: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
  isOutgoing: boolean;
  createdAtRaw?: string;
  isSeen?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'seen' | 'failed' | 'queued';
  attachments?: MessageAttachment[];
}

export interface Conversation {
  id: string;
  participant: User;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
  isPageChat?: boolean;
  pageId?: string;
  pageName?: string;
  pageAvatar?: string;
  pageIsVerified?: boolean;
  pageSlug?: string;
  allowMessages?: boolean;
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accept'
  | 'like'
  | 'comment'
  | 'mention'
  | 'message'
  | 'story_comment'
  | 'story_reaction'
  | 'story_view'
  | 'story_like'
  | 'campus_notice'
  | 'game_invitation'
  | 'community_invite'
  | 'community_approved'
  | 'community_rejected'
  | 'community_post'
  | 'event_reminder'
  | 'event_update'
  | 'welcome_discovery'
  | 'discovery_suggestion'
  | 'discovery_reminder'
  | 'page_follow'
  | 'page_post'
  | 'page_like'
  | 'page_comment'
  | 'page_admin_invite'
  | 'page_follow_invite'
  | 'page_message'
  | 'page_verified'
  | 'page_status';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  rawType?: string;
  title?: string;
  entityType?: string;
  entityId?: string;
  actor: {
    id: string;
    name: string;
    avatar: string;
  };
  content: string;
  timestamp: string;
  createdAt?: string;
  isRead: boolean;
  isArchived?: boolean;
  actionUrl?: string;
  targetPostId?: string;
  targetCommentId?: string;
  targetParentCommentId?: string;
  targetStoryId?: string;
  targetPageId?: string;
  recipientPageId?: string;
  targetInvitationId?: string;
  targetIsVideo?: boolean;
  conversationId?: string;
}

export type FeedFilter = 'for-you' | 'friends' | 'campus' | 'communities' | 'events';
export type FriendTab = 'discover' | 'requests' | 'sent' | 'friends';
export type MainNavTab = 'home' | 'reels' | 'friends' | 'messages' | 'alerts' | 'more';
export type ActiveView =
  | MainNavTab
  | 'profile'
  | 'user-profile'
  | 'conversation'
  | 'contact-info'
  | 'games'
  | 'search'
  | 'marketplace'
  | 'settings'
  | 'saved'
  | 'events'
  | 'event-detail'
  | 'organizer-centre'
  | 'communities'
  | 'community-detail'
  | 'activity'
  | 'safety'
  | 'help'
  | 'about'
  | 'mr-anonymous'
  | 'post-detail'
  | 'pages'
  | 'page-profile'
  | 'page-workspace'
  | 'create-page'
  | 'page-inbox'
  | 'page-notifications'
  | 'page-followers'
  | 'page-settings';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warning';
}
