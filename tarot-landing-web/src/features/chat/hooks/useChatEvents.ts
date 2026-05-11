/**
 * Hook to subscribe to chat events
 * Provides type-safe event subscription
 */

import { useEffect, useRef } from 'react';
import { ChatFacade } from '../core/ChatFacade';
import { ChatEventType, ChatEventPayload } from '../core/ChatEventTypes';

type EventHandlers = {
  [K in ChatEventType]?: (payload: ChatEventPayload[K]) => void;
};

interface UseChatEventsOptions {
  facade: ChatFacade | null;
  events: EventHandlers;
  enabled?: boolean;
}

/**
 * Subscribe to multiple chat events at once
 * IMPORTANT: Uses useRef to store handlers to avoid re-subscription issues
 */
export const useChatEvents = ({ 
  facade, 
  events, 
  enabled = true 
}: UseChatEventsOptions): void => {
  // Store the latest event handlers in a ref to avoid re-subscription
  const handlersRef = useRef<EventHandlers>(events);
  
  // Update ref on every render
  useEffect(() => {
    handlersRef.current = events;
  });
  
  useEffect(() => {
    if (!facade || !enabled) return;
    
    console.log('[useChatEvents] Subscribing to events:', Object.keys(events));
    
    // Subscribe to all events using stable wrapper functions
    const unsubscribers = Object.entries(events).map(([event, _]) => {
      const wrappedHandler = (payload: any) => {
        console.log(`[useChatEvents] Event received: ${event}`, payload);
        const currentHandler = handlersRef.current[event as ChatEventType];
        if (currentHandler) {
          currentHandler(payload);
        }
      };
      return facade.on(event as ChatEventType, wrappedHandler);
    });
    
    console.log('[useChatEvents] Subscribed to', unsubscribers.length, 'events');
    
    // Cleanup
    return () => {
      console.log('[useChatEvents] Unsubscribing from events');
      unsubscribers.forEach(unsub => unsub());
    };
  }, [facade, enabled]); // Only re-subscribe if facade or enabled changes
};

/**
 * Subscribe to a single chat event
 * IMPORTANT: Uses useRef to store handler to avoid re-subscription issues
 */
export const useChatEvent = <T extends ChatEventType>(
  facade: ChatFacade | null,
  event: T,
  handler: (payload: ChatEventPayload[T]) => void,
  enabled: boolean = true
): void => {
  // Store the latest handler in a ref to avoid re-subscription
  const handlerRef = useRef(handler);
  
  // Update ref on every render
  useEffect(() => {
    handlerRef.current = handler;
  });
  
  useEffect(() => {
    if (!facade || !enabled) return;
    
    console.log(`[useChatEvent] Subscribing to event: ${event}`);
    
    // Use a stable wrapper function that calls the ref
    const wrappedHandler = (payload: ChatEventPayload[T]) => {
      console.log(`[useChatEvent] Event received: ${event}`, payload);
      handlerRef.current(payload);
    };
    
    const unsubscribe = facade.on(event, wrappedHandler);
    
    return () => {
      console.log(`[useChatEvent] Unsubscribing from event: ${event}`);
      unsubscribe();
    };
  }, [facade, event, enabled]); // Only re-subscribe if facade, event type, or enabled changes
};
