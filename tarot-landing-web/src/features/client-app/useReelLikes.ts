/* One source for the reels the client has liked (ROUND71), the way
   useFavourites keeps her readers. The list is read once from
   GET /library-items/reels/liked and shared by every heart in the Shorts tab
   and the Reels on the Favourites screen through one query key. A press
   changes the list at once, then tells the server; if the server refuses,
   that one press is undone, nothing else, and the site's small error says so. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/Toast/useToast";
import { useAuth } from "@/features/auth/hooks";
import { getLikedReels, likeReel, unlikeReel, type ReelItem } from "@/features/sanctuary/api/libraryItemsApi";
import { FAVOURITE_COPY } from "./FavouriteHeart";

const likesKey = (userId: number | undefined) => ["reel-likes", userId] as const;
const pressKey = (userId: number | undefined) => ["reel-likes-press", userId] as const;

interface Press { reel: ReelItem; on: boolean }

const without = (reels: ReelItem[] | undefined, key: string) => (reels ?? []).filter(reel => reel.key !== key);

export function useReelLikes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = likesKey(user?.id);

  const list = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: ({ signal }) => getLikedReels(signal),
    staleTime: 30_000,
  });

  const press = useMutation({
    mutationKey: pressKey(user?.id),
    mutationFn: ({ reel, on }: Press) => (on ? likeReel(reel.key) : unlikeReel(reel.key)),
    onMutate: async ({ reel, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ReelItem[]>(key) ?? [];
      // Newest like first, as the server lists them.
      queryClient.setQueryData<ReelItem[]>(key, on ? [reel, ...without(before, reel.key)] : without(before, reel.key));
      return { at: Math.max(0, before.findIndex(item => item.key === reel.key)) };
    },
    onError: (_error, { reel, on }, context) => {
      // Undo this press alone: another press may have landed meanwhile.
      queryClient.setQueryData<ReelItem[]>(key, reels => {
        const rest = without(reels, reel.key);
        if (on) return rest;
        const at = Math.min(context?.at ?? 0, rest.length);
        return [...rest.slice(0, at), reel, ...rest.slice(at)];
      });
      toast.error(FAVOURITE_COPY.failed);
    },
    onSettled: () => {
      // The server's own list, once the last press in flight has been answered.
      if (queryClient.isMutating({ mutationKey: pressKey(user?.id) }) === 1) void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const reels = list.data ?? [];
  return {
    reels,
    /** true once the list has been read */
    ready: list.isSuccess,
    failed: list.isError,
    retry: () => list.refetch(),
    isLiked: (reelKey: string) => reels.some(reel => reel.key === reelKey),
    /** Likes or unlikes. Resolves true when the server agreed, false when the press was undone. */
    set: (reel: ReelItem, on: boolean) => press.mutateAsync({ reel, on }).then(() => true, () => false),
  };
}
