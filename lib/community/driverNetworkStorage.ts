import AsyncStorage from '@react-native-async-storage/async-storage';

const POSTS_KEY = '@pitstop/driver-network/v1';

export type DriverNetworkComment = {
  id: string;
  postId: string;
  parentCommentId?: string;
  authorId?: string;
  authorName: string;
  body: string;
  likes: number;
  likedBy: string[];
  imageUrl?: string;
  createdAt: string;
};

export type DriverNetworkPost = {
  id: string;
  authorId?: string;
  authorName: string;
  title: string;
  body: string;
  imageUrl?: string;
  likes: number;
  likedBy: string[];
  comments: DriverNetworkComment[];
  createdAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readPosts(): Promise<DriverNetworkPost[]> {
  try {
    const raw = await AsyncStorage.getItem(POSTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as DriverNetworkPost[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePosts(posts: DriverNetworkPost[]): Promise<void> {
  await AsyncStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

export async function listDriverNetworkPosts(query?: string): Promise<DriverNetworkPost[]> {
  const rows = await readPosts();
  const sorted = rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!query?.trim()) return sorted;
  const q = query.trim().toLowerCase();
  return sorted.filter(
    (post) =>
      post.title.toLowerCase().includes(q) ||
      post.body.toLowerCase().includes(q) ||
      post.authorName.toLowerCase().includes(q),
  );
}

export async function createDriverNetworkPost(input: {
  authorId?: string;
  authorName: string;
  title: string;
  body: string;
  imageUrl?: string;
}): Promise<DriverNetworkPost> {
  const posts = await readPosts();
  const row: DriverNetworkPost = {
    id: id('post'),
    authorId: input.authorId,
    authorName: input.authorName.trim(),
    title: input.title.trim(),
    body: input.body.trim(),
    imageUrl: input.imageUrl?.trim() || undefined,
    likes: 0,
    likedBy: [],
    comments: [],
    createdAt: nowIso(),
  };
  await writePosts([row, ...posts]);
  return row;
}

export async function toggleDriverPostLike(postId: string, customerId: string): Promise<void> {
  const posts = await readPosts();
  await writePosts(
    posts.map((post) => {
      if (post.id !== postId) return post;
      const liked = post.likedBy.includes(customerId);
      return {
        ...post,
        likedBy: liked ? post.likedBy.filter((x) => x !== customerId) : [...post.likedBy, customerId],
        likes: liked ? Math.max(0, post.likes - 1) : post.likes + 1,
      };
    }),
  );
}

export async function addDriverNetworkComment(input: {
  postId: string;
  parentCommentId?: string;
  authorId?: string;
  authorName: string;
  body: string;
  imageUrl?: string;
}): Promise<void> {
  const posts = await readPosts();
  await writePosts(
    posts.map((post) => {
      if (post.id !== input.postId) return post;
      const comment: DriverNetworkComment = {
        id: id('comment'),
        postId: input.postId,
        parentCommentId: input.parentCommentId,
        authorId: input.authorId,
        authorName: input.authorName.trim(),
        body: input.body.trim(),
        imageUrl: input.imageUrl?.trim() || undefined,
        likes: 0,
        likedBy: [],
        createdAt: nowIso(),
      };
      return { ...post, comments: [...post.comments, comment] };
    }),
  );
}

export async function toggleDriverCommentLike(postId: string, commentId: string, customerId: string): Promise<void> {
  const posts = await readPosts();
  await writePosts(
    posts.map((post) => {
      if (post.id !== postId) return post;
      return {
        ...post,
        comments: post.comments.map((comment) => {
          if (comment.id !== commentId) return comment;
          const liked = comment.likedBy.includes(customerId);
          return {
            ...comment,
            likedBy: liked ? comment.likedBy.filter((x) => x !== customerId) : [...comment.likedBy, customerId],
            likes: liked ? Math.max(0, comment.likes - 1) : comment.likes + 1,
          };
        }),
      };
    }),
  );
}
