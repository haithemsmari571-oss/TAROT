/**
 * Client-specific chat behavior adapter
 * Handles events from the client's perspective
 */

import { BaseChatAdapter } from './BaseChatAdapter';
import { ChatEventType } from '../ChatEventTypes';

export class ClientChatAdapter extends BaseChatAdapter {
  getName(): string {
    return 'ClientChatAdapter';
  }
  
  handleEvent(eventType: string, raw: any): void {
    const data = raw.data || raw;

    switch (eventType) {
      case 'low_balance_warning':
        // Emit balance warning for client
        this.eventBus.emit(ChatEventType.BALANCE_WARNING, {
          remainingSeconds: data.remaining_seconds || 0,
          remainingPoints: data.remaining_points,
        });
        break;
      
      case 'balance_critical':
        // Emit critical balance warning
        this.eventBus.emit(ChatEventType.BALANCE_CRITICAL, {
          remainingSeconds: data.remaining_seconds || 0,
        });
        break;
      
      case 'balance_updated':
        // Emit balance update
        this.eventBus.emit(ChatEventType.BALANCE_UPDATED, {
          newBalance: data.new_balance || 0,
          amountDeducted: data.amount_deducted,
        });
        break;
      
      case 'session_info':
        // Initial session info on WebSocket connect
        this.eventBus.emit(ChatEventType.SESSION_INFO, data);
        break;
      
      case 'session_paused':
        // Client's session was paused
        this.eventBus.emit(ChatEventType.SESSION_PAUSED, {
          reason: data.reason || 'Session paused',
          elapsed_seconds: data.elapsed_seconds,
        });
        break;
      
      case 'session_resumed':
        // Client's session was resumed
        this.eventBus.emit(ChatEventType.SESSION_RESUMED, {
          elapsed_seconds: data.elapsed_seconds,
          remaining_seconds: data.remaining_seconds,
          client_balance: data.client_balance,
          rate_per_second: data.rate_per_second,
        });
        break;
      
      // Client-specific: show modals, navigate to top-up, etc.
      default:
        // Let facade handle common events
        break;
    }
  }
}
