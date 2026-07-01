export const SignalPostType = {
  TEXT: "text",
  PHOTO: "photo",
  VIDEO: "video",
  HELP_REQUEST: "help_request",
} as const;

export type SignalPostType =
  (typeof SignalPostType)[keyof typeof SignalPostType];

export const HelpRequestStatus = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
} as const;

export type HelpRequestStatus =
  (typeof HelpRequestStatus)[keyof typeof HelpRequestStatus];

export const HelpRequestCategory = {
  MECHANICAL: "mechanical",
  ELECTRICAL: "electrical",
  FLUID: "fluid",
  DIAGNOSTIC: "diagnostic",
  BODYWORK: "bodywork",
  OTHER: "other",
} as const;

export type HelpRequestCategory =
  (typeof HelpRequestCategory)[keyof typeof HelpRequestCategory];

export interface SignalPostAuthor {
  id: number;
  name: string;
  avatar_url: string | null;
  role: string;
}

export interface SignalComment {
  id: number;
  post_id: number;
  author: SignalPostAuthor;
  body: string;
  created_at: string;
}

export interface SignalPost {
  id: number;
  type: SignalPostType;
  author: SignalPostAuthor;
  body: string;
  media_urls: string[];
  tags: string[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  help_request?: HelpRequestDetail;
  created_at: string;
  updated_at: string;
}

export interface HelpRequestDetail {
  category: HelpRequestCategory;
  status: HelpRequestStatus;
  resolved_at: string | null;
  resolved_by: SignalPostAuthor | null;
}

export interface CreatePostRequest {
  type: SignalPostType;
  body: string;
  media_urls?: string[];
  tags?: string[];
  help_category?: HelpRequestCategory;
}

export interface CreateCommentRequest {
  body: string;
}

export interface SignalFeedParams {
  cursor?: number;
  limit?: number;
  type?: SignalPostType;
  tag?: string;
  search?: string;
}

export interface SignalFeedResponse {
  posts: SignalPost[];
  next_cursor: number | null;
  total_count: number;
}
