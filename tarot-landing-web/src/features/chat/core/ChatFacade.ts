/**
 * Facade that provides a unified interface for all chat operations
 * Works for both Client and Psychic roles
 */

import { EventBus } from './EventBus';
import { ChatEventType, ChatMessage, ChatEventPayload } from './ChatEventTypes';
import { BaseChatAdapter } from './adapters/BaseChatAdapter';
import { ClientChatAdapter } from './adapters/ClientChatAdapter';
import { PsychicChatAdapter } from './adapters/PsychicChatAdapter';
import { ChatWebSocket } from '../api/chatApi';

type UnsubscribeFn = () => void;

export class ChatFacade {
  private eventBus: EventBus;
  private websocket: ChatWebSocket | null = null;
  private adapter: BaseChatAdapter;
  private isConnecting: boolean = false;
  
  constructor(
    private role: 'client' | 'psychic',
    private chatId: number
  ) {
    this.eventBus = new EventBus(true); // Enable debug mode
    
    // Create role-specific adapter
    this.adapter = role === 'client' 
      ? new ClientChatAdapter(this.eventBus)
      : new PsychicChatAdapter(this.eventBus);
  }
  
  /**
   * Connect to chat WebSocket
   */
  async connect(token: string): Promise<void> {
    if (this.isConnecting || this.websocket) {
      console.warn('[ChatFacade] Already connected or connecting');
      return;
    }
    
    this.isConnecting = true;
    
    try {
      this.websocket = new ChatWebSocket(this.chatId, token);
      
      // Set up WebSocket event handlers
      this.websocket.onConnect(() => {
        this.isConnecting = false;
        this.eventBus.emit(ChatEventType.CONNECTED, undefined);
      });
      
      this.websocket.onMessage((data) => {
        this.handleWebSocketMessage(data);
      });
      
      this.websocket.onDisconnect(() => {
        this.eventBus.emit(ChatEventType.DISCONNECTED, undefined);
      });
      
      this.websocket.onError((error) => {
        this.eventBus.emit(ChatEventType.ERROR, { 
          error: error instanceof Error ? error : new Error(String(error))
        });
      });
      
      // Set up session ending handlers
      this.websocket.onSessionEndingSoon((secondsRemaining) => {
        this.eventBus.emit(ChatEventType.SESSION_ENDING_SOON, { 
          remainingSeconds: secondsRemaining 
        });
      });
      
      this.websocket.onSessionEndedNoBalance(() => {
        this.eventBus.emit(ChatEventType.BALANCE_INSUFFICIENT, undefined);
        this.eventBus.emit(ChatEventType.SESSION_ENDED, {
          reason: 'insufficient_balance'
        });
      });
      
      // Connect
      this.websocket.connect();
    } catch (error) {
      this.isConnecting = false;
      this.eventBus.emit(ChatEventType.ERROR, { 
        error: error instanceof Error ? error : new Error(String(error))
      });
      throw error;
    }
  }
  
  /**
   * Send a message
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.websocket) {
      throw new Error('Not connected to chat');
    }
    
    if (!content.trim()) {
      throw new Error('Message content cannot be empty');
    }
    
    console.log('[ChatFacade] Sending message:', content);
    this.websocket.sendMessage(content);
    console.log('[ChatFacade] Emitting MESSAGE_SENT');
    this.eventBus.emit(ChatEventType.MESSAGE_SENT, { content });
  }
  
  /**
   * Subscribe to events with type safety
   */
  on<T extends ChatEventType>(
    event: T,
    callback: (payload: ChatEventPayload[T]) => void
  ): UnsubscribeFn {
    return this.eventBus.on(event, callback);
  }
  
  /**
   * Emit an event (for testing or manual triggers)
   */
  emit<T extends ChatEventType>(
    event: T,
    payload: ChatEventPayload[T]
  ): void {
    this.eventBus.emit(event, payload);
  }
  
  /**
   * Handle incoming WebSocket messages
   * Maps backend events to frontend events
   */
  private handleWebSocketMessage(data: any): void {
    const eventType = data.event || data.type;
    console.log('[ChatFacade] Received WebSocket message:', { eventType, data });
    
    // Common events handled by facade
    switch (eventType) {
      case 'message':
      case 'system':
        console.log('[ChatFacade] Received message event:', {
          type: data.type,
          id: data.id,
          sender_id: data.sender_id,
          user_id: data.user_id,
          content: data.content?.substring(0, 50),
          chat_id: data.chat_id,
          is_system: data.is_system,
          has_timestamp: !!data.timestamp,
          has_created_at: !!data.created_at,
        });
        console.log('[ChatFacade] Emitting MESSAGE_RECEIVED with full data:', data);
        this.eventBus.emit(ChatEventType.MESSAGE_RECEIVED, { 
          message: data as ChatMessage 
        });
        break;
      
      case 'session_ending_soon':
        console.log('[ChatFacade] Emitting SESSION_ENDING_SOON:', data.remaining_seconds);
        this.eventBus.emit(ChatEventType.SESSION_ENDING_SOON, {
          remainingSeconds: data.remaining_seconds || 0
        });
        break;
      
      case 'session_started':
        console.log('[ChatFacade] Emitting SESSION_STARTED:', data);
        this.eventBus.emit(ChatEventType.SESSION_STARTED, {
          chatId: data.chat_id || this.chatId,
          psychicRate: data.psychic_rate,
          clientBalance: data.client_balance,
          startedAt: data.session_started_at || data.started_at,
        });
        break;
      
      case 'session_timer_tick':
        console.log('[ChatFacade] Emitting SESSION_TIMER_TICK:', {
          elapsed: data.elapsed_seconds,
          remaining: data.remaining_seconds,
        });
        this.eventBus.emit(ChatEventType.SESSION_TIMER_TICK, {
          elapsedSeconds: data.elapsed_seconds,
          estimatedCost: data.estimated_cost,
          effectiveBalance: data.effective_balance,
          remainingSeconds: data.remaining_seconds,
        });
        break;
      
      case 'session_ended':
      case 'session_ended_no_balance':
      case 'session_ended_confirmed':
        console.log('[ChatFacade] Emitting SESSION_ENDED:', data.reason, 'DB Status:', data.chat_status);
        this.eventBus.emit(ChatEventType.SESSION_ENDED, {
          reason: data.reason || 'session_ended'
        });
        break;
      
      // Let adapter handle role-specific events
      default:
        console.log('[ChatFacade] Delegating to adapter:', eventType);
        this.adapter.handleEvent(eventType, data);
        break;
    }
  }
  
  /**
   * Disconnect from chat
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.disconnect();
      this.websocket = null;
    }
    this.eventBus.clear();
    this.isConnecting = false;
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.websocket?.isConnected() ?? false;
  }
  
  /**
   * Get the role
   */
  getRole(): 'client' | 'psychic' {
    return this.role;
  }
  
  /**
   * Get the chat ID
   */
  getChatId(): number {
    return this.chatId;
  }
}
