export type PostCategoryTag = 'questions' | 'reviews' | 'tips' | 'general';

export type UserRole = 'customer' | 'owner' | 'branch_manager' | 'admin';

export type FeedSortMode = 'latest' | 'popular';

export type CommunityPost = {
  id: string;
  userId: string;
  authorName: string;
  authorRole: UserRole;
  title: string;
  content: string;
  imageUrl?: string;
  categoryTag: PostCategoryTag;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  userLiked: boolean;
};

export type CommunityComment = {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorRole: UserRole;
  parentId?: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  likeCount: number;
  userLiked: boolean;
};
