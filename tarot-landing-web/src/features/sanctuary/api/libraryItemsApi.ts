import axiosClient from "@/lib/axiosClient";

export interface LibraryItem {
  key: string;
  type: string;
  title: string;
  description: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number | null;
  published_at: string;
}

interface PublicArticle {
  slug: string;
  title: string;
  excerpt: string;
  cover_image?: string | null;
  published_at: string;
}

interface PublicArticlePage {
  items: PublicArticle[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface SanctuaryBrowseItem {
  key: string;
  type: string;
  title: string;
  description: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string;
  interaction: "listen" | "read";
  source: "library" | "article";
}

const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Keep absolute R2 URLs untouched while still tolerating a future relative media path. */
export const resolveLibraryMediaUrl = (value?: string | null): string | null => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const base = API_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return value;

  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    return value;
  }
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  const response = await axiosClient.get<LibraryItem[]>("/library-items");
  return response.data;
};

const getPublicArticles = async (): Promise<PublicArticle[]> => {
  const articles: PublicArticle[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await axiosClient.get<PublicArticlePage>("/articles", {
      params: { page, page_size: 30 },
    });
    const articlePage = response.data;
    articles.push(...articlePage.items);
    hasMore = articlePage.has_more && articlePage.items.length > 0;
    page += 1;
  }

  return articles;
};

/**
 * The Sanctuary is one browse surface. Audio lives in library_items; existing
 * public articles are adapted here, without asking either backend route to know
 * about the other.
 */
export const getSanctuaryBrowseItems = async (): Promise<SanctuaryBrowseItem[]> => {
  const [libraryResult, articlesResult] = await Promise.allSettled([
    getLibraryItems(),
    getPublicArticles(),
  ]);

  if (libraryResult.status === "rejected" && articlesResult.status === "rejected") {
    throw libraryResult.reason;
  }

  const libraryItems = libraryResult.status === "fulfilled" ? libraryResult.value : [];
  const articles = articlesResult.status === "fulfilled" ? articlesResult.value : [];

  return [
    ...libraryItems.map((item): SanctuaryBrowseItem => ({
      key: item.key,
      type: item.type,
      title: item.title,
      description: item.description,
      audioUrl: resolveLibraryMediaUrl(item.audio_url),
      coverUrl: resolveLibraryMediaUrl(item.cover_url),
      durationSeconds: item.duration_seconds,
      publishedAt: item.published_at,
      interaction: "listen",
      source: "library",
    })),
    ...articles.map((article): SanctuaryBrowseItem => ({
      key: `article:${article.slug}`,
      type: "article",
      title: article.title,
      description: article.excerpt,
      audioUrl: null,
      coverUrl: resolveLibraryMediaUrl(article.cover_image),
      durationSeconds: null,
      publishedAt: article.published_at,
      interaction: "read",
      source: "article",
    })),
  ];
};
