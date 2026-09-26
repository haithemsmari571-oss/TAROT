/* One source for the client's favourite reader ids. The list is read once
   from GET /profile/me/favorites and shared by every heart, shelf and screen
   through one query key. A press changes the list at once, then tells the
   server; if the server refuses, that one press is undone and nothing else,
   so two quick presses on two readers never undo each other. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks";
import { favouritesApi } from "./favouritesApi";

const favouritesKey = (userId: number | undefined) => ["favourites", userId] as const;
const pressKey = (userId: number | undefined) => ["favourites-press", userId] as const;

interface Press { psychicId: number; on: boolean }

const without = (ids: number[] | undefined, psychicId: number) => (ids ?? []).filter(id => id !== psychicId);

export function useFavourites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = favouritesKey(user?.id);

  const list = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: ({ signal }) => favouritesApi.list(signal),
    staleTime: 30_000,
  });

  const press = useMutation({
    mutationKey: pressKey(user?.id),
    mutationFn: ({ psychicId, on }: Press) => (on ? favouritesApi.add(psychicId) : favouritesApi.remove(psychicId)),
    onMutate: async ({ psychicId, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<number[]>(key) ?? [];
      // Newest first, as the server lists them (profile.py:216).
      queryClient.setQueryData<number[]>(key, on ? [psychicId, ...without(before, psychicId)] : without(before, psychicId));
      return { at: Math.max(0, before.indexOf(psychicId)) };
    },
    onError: (_error, { psychicId, on }, context) => {
      // Undo this press alone: another press may have landed meanwhile.
      queryClient.setQueryData<number[]>(key, ids => {
        const rest = without(ids, psychicId);
        if (on) return rest;
        const at = Math.min(context?.at ?? 0, rest.length);
        return [...rest.slice(0, at), psychicId, ...rest.slice(at)];
      });
    },
    onSettled: () => {
      // The server's own list, once the last press in flight has been answered.
      if (queryClient.isMutating({ mutationKey: pressKey(user?.id) }) === 1) void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const ids = list.data ?? [];
  return {
    ids,
    /** true once the list has been read; the shelf and the screen wait for it */
    ready: list.isSuccess,
    failed: list.isError,
    retry: () => list.refetch(),
    isFavourite: (psychicId: number) => ids.includes(psychicId),
    /** Adds or removes. Resolves true when the server agreed, false when the press was undone. */
    set: (psychicId: number, on: boolean) => press.mutateAsync({ psychicId, on }).then(() => true, () => false),
  };
}
