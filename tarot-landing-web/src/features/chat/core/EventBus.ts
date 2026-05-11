/**
 * Simple pub/sub event bus for chat events
 * Decouples event producers from consumers
 */

import { ChatEventType, ChatEventPayload } from './ChatEventTypes';

type AnyEventCallback = (payload: any) => void;
type UnsubscribeFn = () => void;

export class EventBus {
  private listeners: Map<ChatEventType, Set<AnyEventCallback>> = new Map();
  private debugMode: boolean = false;
  
  constructor(debugMode = false) {
    this.debugMode = debugMode;
  }
  
  /**
   * Subscribe to an event
   */
  on<T extends ChatEventType>(
    event: T,
    callback: (payload: ChatEventPayload[T]) => void
  ): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(callback as AnyEventCallback);
    
    if (this.debugMode) {
      console.log(`[EventBus] Subscribed to: ${event}`);
    }
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as AnyEventCallback);
      if (this.debugMode) {
        console.log(`[EventBus] Unsubscribed from: ${event}`);
      }
    };
  }
  
  /**
   * Emit an event
   */
  emit<T extends ChatEventType>(
    event: T,
    payload?: ChatEventPayload[T]
  ): void {
    const callbacks = this.listeners.get(event);
    const listenerCount = callbacks?.size ?? 0;
    
    if (this.debugMode) {
      console.log(`[EventBus] Emitting: ${event} to ${listenerCount} listeners`, payload);
    }
    
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(payload);
        } catch (error) {
          console.error(`[EventBus] Error in callback for ${event}:`, error);
        }
      });
    } else if (this.debugMode) {
      console.warn(`[EventBus] No listeners for: ${event}`);
    }
  }
  
  /**
   * Remove all listeners for an event
   */
  off(event: ChatEventType): void {
    this.listeners.delete(event);
    
    if (this.debugMode) {
      console.log(`[EventBus] Cleared all listeners for: ${event}`);
    }
  }
  
  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
    
    if (this.debugMode) {
      console.log('[EventBus] Cleared all listeners');
    }
  }
  
  /**
   * Get count of listeners for an event
   */
  getListenerCount(event: ChatEventType): number {
    return this.listeners.get(event)?.size ?? 0;
  }
  
  /**
   * Check if event has any listeners
   */
  hasListeners(event: ChatEventType): boolean {
    return this.getListenerCount(event) > 0;
  }
}
