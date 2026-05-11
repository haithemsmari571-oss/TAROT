/**
 * Base interface for chat role adapters
 */

import { EventBus } from '../EventBus';

export abstract class BaseChatAdapter {
  constructor(protected eventBus: EventBus) {}
  
  /**
   * Handle incoming WebSocket events
   * Adapters can override this to provide role-specific behavior
   */
  abstract handleEvent(eventType: string, data: any): void;
  
  /**
   * Get adapter name for debugging
   */
  abstract getName(): string;
}
