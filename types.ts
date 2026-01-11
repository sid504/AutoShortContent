export enum AgentStatus {
  IDLE = 'IDLE',
  RESEARCHING = 'RESEARCHING',
  SCRIPTING = 'SCRIPTING',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  REVIEW = 'REVIEW',
  CONNECTING_YOUTUBE = 'CONNECTING_YOUTUBE',
  RENDERING = 'RENDERING',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED'
}

export interface TrendTopic {
  id: string;
  headline: string;
  category: string;
  viralityScore: number;
  description: string;
  sources: string[];
}

export interface ScriptData {
  title: string;
  thumbnailText: string; // Short, catchy text for the thumbnail image
  description: string;
  tags: string[];
  fullScriptContent: string;
  fullScriptOutline: string[];
  hook: string;
}

export interface GeneratedAssets {
  thumbnailUrl: string | null;
  thumbnailVariants: string[];
  videoUrl: string | null;
  audioUrl: string | null;
  storyboardUrls: string[];
}

export interface AgentLog {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'thinking';
}

export interface YouTubeUser {
  name: string;
  thumbnail: string;
  channelId: string;
}

export interface InstagramUser {
  username: string; // We might not fetch this, but good to have a placeholder
  accountId: string;
}