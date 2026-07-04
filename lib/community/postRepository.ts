import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CommunityComment,
  CommunityPost,
  FeedSortMode,
  PostCategoryTag,
  UserRole,
} from '@/lib/community/types';
import { getSupabase } from '@/lib/supabase/client';

const LOCAL_POSTS_KEY = '@pitstop/community-posts/v1';
const LOCAL_COMMENTS_KEY = '@pitstop/community-comments/v1';
const LOCAL_POST_LIKES_KEY = '@pitstop/community-post-likes/v1';
const LOCAL_COMMENT_LIKES_KEY = '@pitstop/community-comment-likes/v1';

type UserProfileJoin = {
  full_name?: string | null;
  role?: string | null;
};

type PostRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_url?: string | null;
  category_tag: string;
  created_at: string;
  users?: UserProfileJoin | UserProfileJoin[] | null;
  post_votes?: { vote_type: 'up' | 'down'; user_id: string }[] | null;
  comments?: { id: string }[] | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  image_url?: string | null;
  created_at: string;
  users?: UserProfileJoin | UserProfileJoin[] | null;
  comment_likes?: { user_id: string }[] | null;
};

type LocalLike = { userId: string; targetId: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCategoryTag(value: string | undefined): PostCategoryTag {
  if (value === 'questions' || value === 'reviews' || value === 'tips' || value === 'general') {
    return value;
  }
  return 'general';
}

function normalizeRole(value: string | undefined | null): UserRole {
  if (value === 'owner' || value === 'branch_manager' || value === 'admin' || value === 'customer') {
    return value;
  }
  return 'customer';
}

function pickUserProfile(
  users: UserProfileJoin | UserProfileJoin[] | null | undefined,
): UserProfileJoin | null {
  if (!users) return null;
  return Array.isArray(users) ? users[0] ?? null : users;
}

function authorFromUserJoin(
  users: UserProfileJoin | UserProfileJoin[] | null | undefined,
  fallback?: Partial<Pick<CommunityPost, 'authorName' | 'authorRole'>>,
): Pick<CommunityPost, 'authorName' | 'authorRole'> {
  const profile = pickUserProfile(users);
  const name = profile?.full_name?.trim();
  return {
    authorName: name || fallback?.authorName || 'Driver',
    authorRole: normalizeRole(profile?.role ?? fallback?.authorRole),
  };
}

function likeCountFromPostVotes(votes: { vote_type: 'up' | 'down'; user_id: string }[] | undefined | null): number {
  if (!votes?.length) return 0;
  return votes.filter((vote) => vote.vote_type === 'up').length;
}

function userLikedPostVotes(
  votes: { vote_type: 'up' | 'down'; user_id: string }[] | undefined | null,
  viewerUserId?: string,
): boolean {
  if (!viewerUserId || !votes?.length) return false;
  return votes.some((vote) => vote.user_id === viewerUserId && vote.vote_type === 'up');
}

function normalizeStoredPost(raw: CommunityPost & { score?: number; userVote?: 'up' | 'down' | null }): CommunityPost {
  return {
    ...raw,
    likeCount: raw.likeCount ?? Math.max(0, raw.score ?? 0),
    userLiked: raw.userLiked ?? raw.userVote === 'up',
  };
}

function normalizeStoredComment(
  raw: CommunityComment & { score?: number; userVote?: 'up' | 'down' | null },
): CommunityComment {
  return {
    ...raw,
    likeCount: raw.likeCount ?? 0,
    userLiked: raw.userLiked ?? false,
  };
}

function mapPostRow(
  row: PostRow,
  viewerUserId?: string,
  overrides?: Partial<Pick<CommunityPost, 'authorName' | 'authorRole'>>,
): CommunityPost {
  const votes = row.post_votes ?? [];
  const author = authorFromUserJoin(row.users, overrides);
  return {
    id: row.id,
    userId: row.user_id,
    authorName: author.authorName,
    authorRole: author.authorRole,
    title: row.title,
    content: row.content,
    imageUrl: row.image_url?.trim() || undefined,
    categoryTag: normalizeCategoryTag(row.category_tag),
    createdAt: row.created_at,
    likeCount: likeCountFromPostVotes(votes),
    commentCount: row.comments?.length ?? 0,
    userLiked: userLikedPostVotes(votes, viewerUserId),
  };
}

function mapCommentRow(
  row: CommentRow,
  viewerUserId?: string,
  overrides?: Partial<Pick<CommunityComment, 'authorName' | 'authorRole'>>,
): CommunityComment {
  const likes = row.comment_likes ?? [];
  const author = authorFromUserJoin(row.users, overrides);
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    authorName: author.authorName,
    authorRole: author.authorRole,
    parentId: row.parent_id ?? undefined,
    content: row.content,
    imageUrl: row.image_url?.trim() || undefined,
    createdAt: row.created_at,
    likeCount: likes.length,
    userLiked: viewerUserId ? likes.some((like) => like.user_id === viewerUserId) : false,
  };
}

function sortPosts(rows: CommunityPost[], mode: FeedSortMode): CommunityPost[] {
  const copy = rows.slice();
  if (mode === 'latest') {
    return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return copy.sort((a, b) => {
    if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
    if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function mergePosts(remote: CommunityPost[], local: CommunityPost[]): CommunityPost[] {
  const byId = new Map<string, CommunityPost>();
  for (const row of remote) byId.set(row.id, row);
  for (const row of local) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, {
      ...existing,
      authorName:
        existing.authorName !== 'Driver' ? existing.authorName : row.authorName || existing.authorName,
      authorRole: existing.authorRole ?? row.authorRole,
      title: existing.title || row.title,
      content: existing.content || row.content,
      imageUrl: existing.imageUrl ?? row.imageUrl,
      categoryTag: existing.categoryTag ?? row.categoryTag,
      likeCount: Math.max(existing.likeCount, row.likeCount),
      commentCount: Math.max(existing.commentCount, row.commentCount),
      userLiked: existing.userLiked || row.userLiked,
    });
  }
  return [...byId.values()];
}

async function readLocalPosts(): Promise<CommunityPost[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_POSTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CommunityPost[]) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredPost) : [];
  } catch {
    return [];
  }
}

async function writeLocalPosts(rows: CommunityPost[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(rows));
}

async function upsertLocalPost(post: CommunityPost): Promise<void> {
  const rows = await readLocalPosts();
  const idx = rows.findIndex((row) => row.id === post.id);
  if (idx >= 0) rows[idx] = post;
  else rows.unshift(post);
  await writeLocalPosts(rows.slice(0, 200));
}

async function readLocalComments(): Promise<CommunityComment[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_COMMENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as CommunityComment[]) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredComment) : [];
  } catch {
    return [];
  }
}

async function writeLocalComments(rows: CommunityComment[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(rows));
}

async function readLocalPostLikes(): Promise<LocalLike[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_POST_LIKES_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalLike[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const legacy = await AsyncStorage.getItem('@pitstop/community-votes/v1');
    if (!legacy) return [];
    const votes = JSON.parse(legacy) as { userId: string; postId: string; voteType: 'up' | 'down' }[];
    return votes
      .filter((vote) => vote.voteType === 'up')
      .map((vote) => ({ userId: vote.userId, targetId: vote.postId }));
  }
}

async function writeLocalPostLikes(rows: LocalLike[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_POST_LIKES_KEY, JSON.stringify(rows));
}

async function readLocalCommentLikes(): Promise<LocalLike[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_COMMENT_LIKES_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalLike[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalCommentLikes(rows: LocalLike[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_COMMENT_LIKES_KEY, JSON.stringify(rows));
}

async function setLocalPostLike(postId: string, userId: string, liked: boolean): Promise<void> {
  const likes = await readLocalPostLikes();
  const idx = likes.findIndex((like) => like.targetId === postId && like.userId === userId);
  if (liked) {
    if (idx < 0) likes.push({ targetId: postId, userId });
  } else if (idx >= 0) {
    likes.splice(idx, 1);
  }
  await writeLocalPostLikes(likes);
}

async function setLocalCommentLike(commentId: string, userId: string, liked: boolean): Promise<void> {
  const likes = await readLocalCommentLikes();
  const idx = likes.findIndex((like) => like.targetId === commentId && like.userId === userId);
  if (liked) {
    if (idx < 0) likes.push({ targetId: commentId, userId });
  } else if (idx >= 0) {
    likes.splice(idx, 1);
  }
  await writeLocalCommentLikes(likes);
}

function applyLocalPostLikes(posts: CommunityPost[], likes: LocalLike[], viewerUserId?: string): CommunityPost[] {
  return posts.map((post) => {
    const postLikes = likes.filter((like) => like.targetId === post.id);
    return {
      ...post,
      likeCount: Math.max(post.likeCount, postLikes.length),
      userLiked: viewerUserId ? postLikes.some((like) => like.userId === viewerUserId) : post.userLiked,
    };
  });
}

function applyLocalCommentLikes(
  comments: CommunityComment[],
  likes: LocalLike[],
  viewerUserId?: string,
): CommunityComment[] {
  return comments.map((comment) => {
    const commentLikes = likes.filter((like) => like.targetId === comment.id);
    return {
      ...comment,
      likeCount: Math.max(comment.likeCount, commentLikes.length),
      userLiked: viewerUserId ? commentLikes.some((like) => like.userId === viewerUserId) : comment.userLiked,
    };
  });
}

async function hydrateLocalPosts(viewerUserId?: string): Promise<CommunityPost[]> {
  const [posts, comments, likes] = await Promise.all([
    readLocalPosts(),
    readLocalComments(),
    readLocalPostLikes(),
  ]);
  const withLikes = applyLocalPostLikes(posts, likes, viewerUserId);
  return withLikes.map((post) => ({
    ...post,
    commentCount: Math.max(
      post.commentCount,
      comments.filter((comment) => comment.postId === post.id).length,
    ),
  }));
}

async function fetchPostsRemote(viewerUserId?: string): Promise<CommunityPost[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('posts')
    .select('*, users(full_name, role), post_votes(vote_type, user_id), comments(id)')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as PostRow[]).map((row) => mapPostRow(row, viewerUserId));
}

async function fetchCommentsRemote(postId: string, viewerUserId?: string): Promise<CommunityComment[]> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(postId)) return [];

  const { data, error } = await supabase
    .from('comments')
    .select('*, users(full_name, role), comment_likes(user_id)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return (data as CommentRow[]).map((row) => mapCommentRow(row, viewerUserId));
}

export async function listCommunityPosts(
  mode: FeedSortMode,
  viewerUserId?: string,
): Promise<CommunityPost[]> {
  const [remote, local] = await Promise.all([
    fetchPostsRemote(viewerUserId),
    hydrateLocalPosts(viewerUserId),
  ]);
  return sortPosts(mergePosts(remote, local), mode);
}

export async function getCommunityPost(
  postId: string,
  viewerUserId?: string,
): Promise<CommunityPost | undefined> {
  const rows = await listCommunityPosts('latest', viewerUserId);
  return rows.find((row) => row.id === postId);
}

export async function createCommunityPost(input: {
  userId: string;
  authorName: string;
  authorRole?: UserRole;
  title: string;
  content: string;
  imageUrl?: string;
  categoryTag: PostCategoryTag;
}): Promise<CommunityPost> {
  const title = input.title.trim();
  const content = input.content.trim();
  const authorName = input.authorName.trim();
  const authorRole = input.authorRole ?? 'customer';
  const imageUrl = input.imageUrl?.trim() || undefined;

  const buildLocal = (postId: string, createdAt: string): CommunityPost => ({
    id: postId,
    userId: input.userId,
    authorName,
    authorRole,
    title,
    content,
    imageUrl,
    categoryTag: input.categoryTag,
    createdAt,
    likeCount: 0,
    commentCount: 0,
    userLiked: false,
  });

  const supabase = getSupabase();
  if (supabase && isUuid(input.userId)) {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: input.userId,
        title,
        content,
        image_url: imageUrl || null,
        category_tag: input.categoryTag,
      })
      .select('*, users(full_name, role), post_votes(vote_type, user_id), comments(id)')
      .single();

    if (!error && data) {
      const row = mapPostRow(data as PostRow, input.userId, { authorName, authorRole });
      await upsertLocalPost(row);
      return row;
    }
  }

  const row = buildLocal(id('post'), new Date().toISOString());
  await upsertLocalPost(row);
  return row;
}

export async function toggleCommunityPostLike(input: {
  postId: string;
  userId: string;
}): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isUuid(input.postId) && isUuid(input.userId)) {
    const { data: existing, error: readError } = await supabase
      .from('post_votes')
      .select('vote_type')
      .eq('post_id', input.postId)
      .eq('user_id', input.userId)
      .maybeSingle();

    if (!readError) {
      if (existing?.vote_type === 'up') {
        const { error: deleteError } = await supabase
          .from('post_votes')
          .delete()
          .eq('post_id', input.postId)
          .eq('user_id', input.userId);
        if (!deleteError) {
          await setLocalPostLike(input.postId, input.userId, false);
          return;
        }
      } else {
        const { error } = await supabase.from('post_votes').upsert(
          {
            post_id: input.postId,
            user_id: input.userId,
            vote_type: 'up',
          },
          { onConflict: 'user_id,post_id' },
        );
        if (!error) {
          await setLocalPostLike(input.postId, input.userId, true);
          return;
        }
      }
    }
  }

  const likes = await readLocalPostLikes();
  const idx = likes.findIndex((like) => like.targetId === input.postId && like.userId === input.userId);
  if (idx >= 0) likes.splice(idx, 1);
  else likes.push({ targetId: input.postId, userId: input.userId });
  await writeLocalPostLikes(likes);
}

export async function listCommunityComments(
  postId: string,
  viewerUserId?: string,
): Promise<CommunityComment[]> {
  const [remote, local, likes] = await Promise.all([
    fetchCommentsRemote(postId, viewerUserId),
    readLocalComments(),
    readLocalCommentLikes(),
  ]);
  const localForPost = local.filter((row) => row.postId === postId);
  const byId = new Map<string, CommunityComment>();
  for (const row of remote) byId.set(row.id, row);
  for (const row of localForPost) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, {
      ...existing,
      authorName:
        existing.authorName !== 'Driver' ? existing.authorName : row.authorName || existing.authorName,
      authorRole: existing.authorRole ?? row.authorRole,
      content: existing.content || row.content,
      imageUrl: existing.imageUrl ?? row.imageUrl,
    });
  }
  return applyLocalCommentLikes([...byId.values()], likes, viewerUserId).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export async function toggleCommunityCommentLike(input: {
  commentId: string;
  userId: string;
}): Promise<void> {
  const supabase = getSupabase();

  if (supabase && isUuid(input.commentId) && isUuid(input.userId)) {
    const { data: existing, error: readError } = await supabase
      .from('comment_likes')
      .select('user_id')
      .eq('comment_id', input.commentId)
      .eq('user_id', input.userId)
      .maybeSingle();

    if (!readError) {
      if (existing) {
        const { error: deleteError } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', input.commentId)
          .eq('user_id', input.userId);
        if (!deleteError) {
          await setLocalCommentLike(input.commentId, input.userId, false);
          return;
        }
      } else {
        const { error } = await supabase.from('comment_likes').insert({
          comment_id: input.commentId,
          user_id: input.userId,
        });
        if (!error) {
          await setLocalCommentLike(input.commentId, input.userId, true);
          return;
        }
      }
    }
  }

  const likes = await readLocalCommentLikes();
  const idx = likes.findIndex(
    (like) => like.targetId === input.commentId && like.userId === input.userId,
  );
  if (idx >= 0) likes.splice(idx, 1);
  else likes.push({ targetId: input.commentId, userId: input.userId });
  await writeLocalCommentLikes(likes);
}

export async function addCommunityComment(input: {
  postId: string;
  userId: string;
  authorName: string;
  authorRole?: UserRole;
  content: string;
  imageUrl?: string;
  parentId?: string;
}): Promise<CommunityComment> {
  const content = input.content.trim();
  const imageUrl = input.imageUrl?.trim() || undefined;
  if (!content && !imageUrl) throw new Error('Comment cannot be empty');

  const authorName = input.authorName.trim();
  const authorRole = input.authorRole ?? 'customer';

  const supabase = getSupabase();
  if (supabase && isUuid(input.postId) && isUuid(input.userId)) {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: input.postId,
        user_id: input.userId,
        parent_id: input.parentId && isUuid(input.parentId) ? input.parentId : null,
        content,
        image_url: imageUrl || null,
      })
      .select('*, users(full_name, role), comment_likes(user_id)')
      .single();

    if (!error && data) {
      const row = mapCommentRow(data as CommentRow, input.userId, { authorName, authorRole });
      const comments = await readLocalComments();
      await writeLocalComments([...comments, row]);
      return row;
    }
  }

  const row: CommunityComment = {
    id: id('comment'),
    postId: input.postId,
    userId: input.userId,
    authorName,
    authorRole,
    parentId: input.parentId,
    content,
    imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    userLiked: false,
  };
  const comments = await readLocalComments();
  await writeLocalComments([...comments, row]);
  return row;
}

export function categoryFlairLabel(tag: PostCategoryTag, locale: 'en' | 'ar'): string {
  const map: Record<PostCategoryTag, { en: string; ar: string }> = {
    questions: { en: '#Questions', ar: '#أسئلة' },
    reviews: { en: '#Reviews', ar: '#تقييمات' },
    tips: { en: '#Tips', ar: '#نصائح' },
    general: { en: '#General', ar: '#عام' },
  };
  return locale === 'ar' ? map[tag].ar : map[tag].en;
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export async function reportCommunityPost(postId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase && isUuid(postId)) {
    const { error } = await supabase.from('posts').update({ reported: true }).eq('id', postId);
    if (!error) return;
  }

  const posts = await readLocalPosts();
  const next = posts.map((row) => (row.id === postId ? { ...row, reported: true } : row));
  await writeLocalPosts(next);
}

export async function reportCommunityComment(commentId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase && isUuid(commentId)) {
    const { error } = await supabase.from('comments').update({ reported: true }).eq('id', commentId);
    if (!error) return;
  }

  const comments = await readLocalComments();
  const next = comments.map((row) => (row.id === commentId ? { ...row, reported: true } : row));
  await writeLocalComments(next);
}
