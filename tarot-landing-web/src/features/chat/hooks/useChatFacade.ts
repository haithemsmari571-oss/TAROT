/**
 * Hook to create and manage ChatFacade instance
 * Handles lifecycle and connection management
 */

import { useState, useEffect, useRef } from 'react';
import { ChatFacade } from '../core/ChatFacade';
import { ChatEventType } from '../core/ChatEventTypes';
import { getToken } from '@/features/auth/utils';

interface UseChatFacadeOptions {
  role: 'client' | 'psychic';
  chatId: number | null;
  autoConnect?: boolean;
  customToken?: string | null; // Allow passing a custom token (e.g., psychic_token for admins)
}

interface UseChatFacadeReturn {
  facade: ChatFacade | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useChatFacade = ({
  role,
  chatId,
  autoConnect = true,
  customToken = null,
}: UseChatFacadeOptions): UseChatFacadeReturn => {
  const [facade, setFacade] = useState<ChatFacade | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facadeRef = useRef<ChatFacade | null>(null);
  
  // Create facade when chatId changes
  useEffect(() => {
    if (!chatId) {
      // Clean up existing facade
      if (facadeRef.current) {
        facadeRef.current.disconnect();
        facadeRef.current = null;
        setFacade(null);
        setIsConnected(false);
        setIsConnecting(false);
      }
      return;
    }
    
    // Create new facade
    const newFacade = new ChatFacade(role, chatId);
    facadeRef.current = newFacade;
    setFacade(newFacade);
    
    // Subscribe to connection events
    const unsubscribeConnected = newFacade.on(ChatEventType.CONNECTED, () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    });
    
    const unsubscribeDisconnected = newFacade.on(ChatEventType.DISCONNECTED, () => {
      setIsConnected(false);
      setIsConnecting(false);
    });
    
    const unsubscribeError = newFacade.on(ChatEventType.ERROR, ({ error: err }) => {
      setError(err instanceof Error ? err.message : String(err));
      setIsConnecting(false);
    });
    
    // Auto-connect if enabled
    if (autoConnect) {
      const token = customToken || getToken();
      if (token) {
        setIsConnecting(true);
        newFacade.connect(token).catch(err => {
          console.error('[useChatFacade] Connection error:', err);
          setError(err instanceof Error ? err.message : String(err));
          setIsConnecting(false);
        });
      }
    }
    
    // Cleanup on unmount or chatId change
    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeError();
      newFacade.disconnect();
    };
  }, [chatId, role, autoConnect, customToken]);
  
  // Manual connect function
  const connect = async () => {
    if (!facadeRef.current) {
      throw new Error('No facade instance');
    }
    
    if (isConnected || isConnecting) {
      return;
    }
    
    const token = getToken();
    if (!token) {
      setError('No authentication token found');
      return;
    }
    
    setIsConnecting(true);
    setError(null);
    
    try {
      await facadeRef.current.connect(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsConnecting(false);
    }
  };
  
  // Manual disconnect function
  const disconnect = () => {
    if (facadeRef.current) {
      facadeRef.current.disconnect();
      setIsConnected(false);
      setIsConnecting(false);
    }
  };
  
  return {
    facade,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  };
};
