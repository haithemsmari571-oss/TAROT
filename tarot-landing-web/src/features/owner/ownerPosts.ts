import { useQuery, type QueryClient } from "@tanstack/react-query";
import { resolveLibraryMediaUrl, type SanctuaryBrowseItem } from "@/features/sanctuary/api/libraryItemsApi";
import { listLibraryItems, type OwnerLibraryItem } from "./ownerLibraryApi";

/* "Your posts" (ROUND51): every library item with a video or a recording,
   newest first, as on a profile. Articles live elsewhere and are not here. */

export const OWNER_POSTS_QUERY_KEY = ["owner-posts"] as const;

const postedAt = (item: OwnerLibraryItem) => Date.parse(item.published_at ?? item.created_at);
const newestFirst = (a: OwnerLibraryItem, b: OwnerLibraryItem) => postedAt(b) - postedAt(a) || b.id - a.id;

export function useOwnerPosts() {
  return useQuery({
    queryKey: OWNER_POSTS_QUERY_KEY,
    queryFn: async () => (await listLibraryItems()).filter((item) => item.video_url || item.audio_url).sort(newestFirst),
  });
}

/* A post the server has just changed, put in the list in place. */
export function replacePost(queryClient: QueryClient, updated: OwnerLibraryItem) {
  queryClient.setQueryData<OwnerLibraryItem[]>(OWNER_POSTS_QUERY_KEY, (posts) =>
    posts?.map((post) => (post.id === updated.id ? { ...post, ...updated } : post)));
}

export const coverUrlOf = (item: OwnerLibraryItem) => resolveLibraryMediaUrl(item.cover_url);
export const videoUrlOf = (item: OwnerLibraryItem) => resolveLibraryMediaUrl(item.video_url);
export const audioUrlOf = (item: OwnerLibraryItem) => resolveLibraryMediaUrl(item.audio_url);

/* A stored video's opening frame for a picture: the address with a start
   time, which phones need before they draw a frame they have not played. */
export const firstFrameUrl = (url: string) => `${url}#t=0.1`;

/* The post in the Sanctuary's own shape, for its cover art (cover.tsx). */
export function browseItemOf(item: OwnerLibraryItem): SanctuaryBrowseItem {
  return {
    key: item.key,
    type: item.type,
    title: item.title,
    description: item.description,
    audioUrl: audioUrlOf(item),
    coverUrl: coverUrlOf(item),
    durationSeconds: item.duration_seconds,
    publishedAt: item.published_at ?? item.created_at,
    interaction: "listen",
    source: "library",
  };
}
