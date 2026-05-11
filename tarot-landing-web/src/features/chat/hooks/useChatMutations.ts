import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestChat, updateChatStatus, pauseChat, resumeChat, ChatStartRequest, ChatStatusUpdate } from "../api/chatApi";

/**
 * Hook for requesting a new chat with a psychic
 * Automatically invalidates the chats query on success
 */
export const useRequestChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChatStartRequest) => requestChat(data),
    onSuccess: () => {
      // Invalidate chats query to trigger automatic refetch
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};

/**
 * Hook for updating chat status (accept/end/cancel chat)
 * Automatically invalidates the chats query on success
 */
export const useUpdateChatStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, status }: { chatId: number; status: ChatStatusUpdate }) => 
      updateChatStatus(chatId, status),
    onSuccess: () => {
      // Invalidate chats query to trigger automatic refetch
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};

/**
 * Hook for pausing a chat session (for top-up)
 * Automatically invalidates the chats query on success
 */
export const usePauseChat = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (chatId: number) => pauseChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};

/**
 * Hook for resuming a paused chat session
 * Automatically invalidates the chats query on success
 */
export const useResumeChat = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (chatId: number) => resumeChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
};
