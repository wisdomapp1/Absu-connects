export type StoryMediaType = 'text' | 'image' | 'video';

export interface StoryViewerProfile {
  id: string;
  name: string;
  avatar_url?: string;
  department?: string;
  level?: string;
}

export interface StoryViewItem {
  id: string;
  story_id: string;
  viewer_id: string;
  created_at: string;
  viewer?: StoryViewerProfile;
}

export interface StoryReactionItem {
  id: string;
  story_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  user?: StoryViewerProfile;
}

export interface Story {
  id: string;
  user_id: string;
  media_type: StoryMediaType;
  storage_path?: string | null;
  text_content?: string | null;
  caption?: string | null;
  background_color?: string | null;
  font_style?: string | null;
  created_at: string;
  expires_at: string;
  user?: {
    id: string;
    name: string;
    avatar_url?: string;
    department?: string;
  };
  views_count?: number;
  reactions_count?: number;
  has_viewed?: boolean;
  has_reacted?: boolean;
  views?: StoryViewItem[];
  reactions?: StoryReactionItem[];
}

export interface UserStoryGroup {
  user_id: string;
  user_name: string;
  user_avatar?: string;
  has_unviewed: boolean;
  latest_timestamp: string;
  stories: Story[];
}
