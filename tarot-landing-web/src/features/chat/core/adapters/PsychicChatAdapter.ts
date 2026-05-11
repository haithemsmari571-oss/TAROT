/**
 * Psychic-specific chat behavior adapter
 * Handles events from the psychic's perspective
 */

import { BaseChatAdapter } from './BaseChatAdapter';
import { ChatEventType } from '../ChatEventTypes';

export class PsychicChatAdapter extends BaseChatAdapter {
  getName(): string {
    return 'PsychicChatAdapter';
  }
  
  handleEvent(eventType: string, raw: any): void {
    const data = raw.data || raw;

    switch (eventType) {
      case 'low_balance_warning':
        // For psychic: show that CLIENT's balance is low
        this.eventBus.emit(ChatEventType.BALANCE_WARNING, {
          remainingSeconds: data.remaining_seconds || 0,
          remainingPoints: data.remaining_points,
        });
        break;
      
      case 'balance_critical':
        // For psychic: CLIENT's balance is critical
        this.eventBus.emit(ChatEventType.BALANCE_CRITICAL, {
          remainingSeconds: data.remaining_seconds || 0,
        });
        break;
      
      case 'session_info':
        // Initial session info on WebSocket connect
        this.eventBus.emit(ChatEventType.SESSION_INFO, data);
        break;
      
      case 'session_paused':
        // CLIENT's session was paused (due to their balance)
        this.eventBus.emit(ChatEventType.SESSION_PAUSED, {
          reason: data.reason || 'Client balance insufficient',
          elapsed_seconds: data.elapsed_seconds,
        });
        break;
      
      case 'session_resumed':
        // CLIENT's session was resumed
        this.eventBus.emit(ChatEventType.SESSION_RESUMED, {
          elapsed_seconds: data.elapsed_seconds,
          remaining_seconds: data.remaining_seconds,
          client_balance: data.client_balance,
          rate_per_second: data.rate_per_second,
        });
        break;
      
      // Psychic-specific: track earnings, etc.
      default:
        // Let facade handle common events
        break;
    }
  }
}
