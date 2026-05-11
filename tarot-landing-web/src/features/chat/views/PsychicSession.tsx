import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useChats } from "../hooks/useChats";
import { useUpdateChatStatus } from "../hooks/useChatMutations";
import { useChatSessionTime } from "../hooks/useChatSessionTime";
import { useToast } from "../../../components/Toast/useToast";
import { useChatWebSocket } from "../hooks/useChatWebSocket";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationType } from "@/features/notifications/types/notification.types";
import "../../../styles/starfield.css";

const PsychicSession = () => {
  const queryClient = useQueryClient();
  const { chats, loading, error } = useChats();
  const toast = useToast();
  const { user } = useAuth();
  const { onNotification } = useNotifications();
  const updateChatStatusMutation = useUpdateChatStatus();
  
  const [activeView, setActiveView] = useState<'queue' | 'chat'>('queue');
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [activeTab, setActiveTab] = useState<'ALL' | 'REQUESTED' | 'ACTIVE' | 'ENDED'>('ALL');
  
  // Refs for stable access in callbacks
  const toastRef = useRef(toast);
  const queryClientRef = useRef(queryClient);
  
  useEffect(() => {
    toastRef.current = toast;
    queryClientRef.current = queryClient;
  }, [toast, queryClient]);
  
  // Get selected chat data
  const selectedChatData = chats.find(c => c.id === selectedChat);
  const isChatActive = selectedChatData?.status === 'ACTIVE';
  
  // Fetch session time for active chats
  const { 
    data: sessionTimeData,
    isLoading: isFetchingTime
  } = useChatSessionTime(selectedChat, isChatActive);
  
  const pricePerSecond = sessionTimeData?.price_per_second || 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Determine if current user can actually participate in the chat
  const currentChat = chats.find(c => c.id === selectedChat);
  const canParticipate = currentChat && user && 
    (user.role === 'PSYCHIC' || user.role === 'USER');
  
  // WebSocket connection for real-time chat (only connect if user can participate)
  const { 
    messages, 
    sendMessage, 
    isConnected, 
    error: wsError, 
    connectionStatus,
    loadingMessages 
  } = useChatWebSocket(activeView === 'chat' && canParticipate ? selectedChat : null);

  const handleAcceptChat = async (chatId: number) => {
    updateChatStatusMutation.mutate(
      { chatId, status: { status: "ACTIVE" } },
      {
        onSuccess: () => {
          toast.success("Chat request accepted successfully!");
          
          // Enter the chat view (same for both psychics and admins)
          setSelectedChat(chatId);
          setActiveView('chat');
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail || "Failed to accept chat request. Please try again.";
          toast.error(errorMessage);
          console.error("Failed to accept chat:", err);
        }
      }
    );
  };

  const handleDenyChat = async (chatId: number) => {
    updateChatStatusMutation.mutate(
      { chatId, status: { status: "ENDED" } },
      {
        onSuccess: () => {
          toast.success("Chat request declined.");
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail || "Failed to decline chat request. Please try again.";
          toast.error(errorMessage);
          console.error("Failed to deny chat:", err);
        }
      }
    );
  };

  const handleEnterChat = (chatId: number) => {
    const chat = chats.find(c => c.id === chatId);
    console.log("Entering chat:", chatId, "Status:", chat?.status);
    
    // Enter the chat view (same for both psychics and admins)
    setSelectedChat(chatId);
    setActiveView('chat');
  };

  // Filter chats based on active tab
  const filteredChats = activeTab === 'ALL' 
    ? chats 
    : chats.filter(chat => chat.status === activeTab);
  
  // Debug logging
  useEffect(() => {
    console.log('All chats:', chats.map(c => ({ id: c.id, status: c.status })));
    console.log('Active tab:', activeTab);
    console.log('Filtered chats:', filteredChats.map(c => ({ id: c.id, status: c.status })));
  }, [chats, activeTab, filteredChats]);

  const handleTerminateChat = async () => {
    if (!selectedChat) return;
    
    updateChatStatusMutation.mutate(
      { chatId: selectedChat, status: { status: "ENDED" } },
      {
        onSuccess: () => {
          toast.success("Chat session ended successfully.");
          setActiveView('queue');
          setSelectedChat(null);
        },
        onError: (err: any) => {
          const errorMessage = err?.response?.data?.detail || "Failed to end chat session. Please try again.";
          toast.error(errorMessage);
          console.error("Failed to terminate chat:", err);
        }
      }
    );
  };

  // Initialize session time from React Query data
  useEffect(() => {
    if (activeView === 'chat' && sessionTimeData && isChatActive) {
      console.log(`Initial session data:`, sessionTimeData);
      setSeconds(sessionTimeData.elapsed_seconds || 0);
      setEstimatedCost(sessionTimeData.estimated_cost || 0);
    } else if (activeView === 'chat') {
      // Reset for non-active chats
      setSeconds(0);
      setEstimatedCost(0);
    }
  }, [activeView, sessionTimeData, isChatActive]);

  // Timer that increments every second when in chat view (only for ACTIVE chats)
  useEffect(() => {
    if (activeView === 'chat' && isChatActive && sessionTimeData) {
      const timer = setInterval(() => {
        setSeconds((s) => s + 1);
        // Update estimated cost based on price per second
        setEstimatedCost((prevCost) => prevCost + pricePerSecond);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [activeView, isChatActive, sessionTimeData, pricePerSecond]);
  
  // Handle chat requested notifications (stable callback using refs)
  const handleChatRequested = useCallback((notification: any) => {
    console.log("✅ Chat requested notification received:", notification);
    console.log("   Chat ID:", notification.data?.chat_id);
    console.log("   Client:", notification.data?.client_name);
    
    // Show toast notification using ref
    toastRef.current.success(notification.message);
    
    // Invalidate chats query to trigger automatic refetch using ref
    console.log("   Invalidating chats query...");
    queryClientRef.current.invalidateQueries({ queryKey: ["chats"] });
    
    // New chat request will appear in the queue automatically
    // If psychic is in chat view, they can see notification and decide to check queue
  }, []); // Empty deps - stable callback

  // Handle chat ended notifications (stable callback using refs)
  const handleChatEnded = useCallback((notification: any) => {
    console.log("Chat ended notification received:", notification);
    
    // Show toast notification using ref
    toastRef.current.info(notification.message);
    
    // Invalidate chats query to trigger automatic refetch using ref
    queryClientRef.current.invalidateQueries({ queryKey: ["chats"] });
    
    // If we're viewing the chat that ended, go back to queue
    if (notification.data?.chat_id === selectedChat && activeView === 'chat') {
      setActiveView('queue');
      setSelectedChat(null);
    }
  }, [selectedChat, activeView]); // Include activeView and selectedChat as dependencies

  // Register notification handlers
  useEffect(() => {
    console.log("Registering notification handlers (PsychicSession)");
    
    const unsubscribeRequested = onNotification(NotificationType.CHAT_REQUESTED, handleChatRequested);
    const unsubscribeEnded = onNotification(NotificationType.CHAT_ENDED, handleChatEnded);
    
    return () => {
      console.log("Unregistering notification handlers (PsychicSession)");
      unsubscribeRequested();
      unsubscribeEnded();
    };
  }, [onNotification, handleChatRequested, handleChatEnded]);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    if (!isConnected) {
      toast.error("Not connected to chat. Please wait or try rejoining.");
      return;
    }
    
    sendMessage(input);
    setInput("");
  };
  
  // Show WebSocket errors and log connection status
  useEffect(() => {
    if (wsError) {
      console.error("WebSocket Error:", wsError);
      toast.error(wsError);
    }
  }, [wsError, toast]);
  
  useEffect(() => {
    console.log("Connection Status:", connectionStatus, "Is Connected:", isConnected);
  }, [connectionStatus, isConnected]);

  // --- VIEW 1: REQUEST QUEUE ---
  if (activeView === 'queue') {
    if (loading) {
      return (
        <div className="min-h-screen pt-32 px-12 flex items-center justify-center relative" style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}>
          {/* Starfield Background */}
          <div className="fixed inset-0 pointer-events-none">
            <div className="starfield"></div>
            <div className="starfield-dense"></div>
          </div>
          <div className="text-center relative z-10">
            <div className="w-20 h-20 rounded-full border-4 border-white/10 border-t-primary mx-auto mb-6 animate-spin" />
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-2">Loading Your Chats</h2>
            <p className="text-sm text-white/40 font-medium">Please wait while we fetch your conversations...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen pt-32 px-12 flex items-center justify-center relative" style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}>
          {/* Starfield Background */}
          <div className="fixed inset-0 pointer-events-none">
            <div className="starfield"></div>
            <div className="starfield-dense"></div>
          </div>
          <div className="text-center max-w-md relative z-10">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
              <Icon icon="solar:danger-triangle-bold" className="text-4xl text-red-400" />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-3">Unable to Load Chats</h2>
            <p className="text-sm text-white/60 font-medium mb-6">{error}</p>
            <button 
              onClick={refetch} 
              className="px-8 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen pt-32 px-12 relative" style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}>
        {/* Starfield Background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="starfield"></div>
          <div className="starfield-dense"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <header className="mb-12 flex items-end justify-between">
            <div>
              <h1 className="text-5xl font-black italic uppercase tracking-tighter text-white leading-none">
                My <span className="text-white/20">Chats</span>
              </h1>
              <p className="text-[10px] uppercase font-black tracking-[0.5em] text-white/40 mt-4 ml-1">
                Manage your chat requests and conversations
              </p>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={refetch}
                className="px-6 py-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/10 transition-all flex items-center gap-2"
                title="Refresh chats"
              >
                <Icon icon="solar:refresh-bold" className="text-white text-lg" />
                <span className="text-[10px] font-black uppercase text-white tracking-widest">Refresh</span>
              </button>
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-white tracking-widest">Online</span>
              </div>
            </div>
          </header>

          {/* Tab Navigation */}
          <div className="mb-8 flex items-center gap-3">
            {(['ALL', 'REQUESTED', 'ACTIVE', 'ENDED'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${
                  activeTab === tab
                    ? 'bg-white text-black shadow-xl'
                    : 'bg-white/[0.03] text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                }`}
              >
                {tab === 'ALL' ? 'All Chats' : tab}
                <span className="ml-2 px-2 py-0.5 rounded-full bg-black/10 text-[9px]">
                  {tab === 'ALL' ? chats.length : chats.filter(c => c.status === tab).length}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-[40px] border border-white/10 bg-white/[0.02] backdrop-blur-3xl overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="p-8 text-[10px] font-black uppercase text-white tracking-[0.2em]">User</th>
                  <th className="p-8 text-[10px] font-black uppercase text-white tracking-[0.2em]">Recent Message</th>
                  <th className="p-8 text-[10px] font-black uppercase text-white tracking-[0.2em]">Status</th>
                  <th className="p-8 text-[10px] font-black uppercase text-white tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredChats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-16 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <Icon icon="solar:chat-dots-bold-duotone" className="text-3xl text-white/30" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">
                            {activeTab === 'ALL' ? 'No Chat Requests' : `No ${activeTab} Chats`}
                          </h3>
                          <p className="text-sm text-white/40 font-medium">
                            {activeTab === 'ALL' 
                              ? "You don't have any active or pending chat requests at the moment."
                              : `There are no ${activeTab.toLowerCase()} chats at the moment.`
                            }
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredChats.map((chat) => (
                    <tr key={chat.id} className="border-b border-white/[0.05] hover:bg-white/[0.03] transition-all group">
                      <td className="p-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
                            {chat.user_profile_pic_url ? (
                              <img src={chat.user_profile_pic_url} alt={chat.user_name} className="w-full h-full object-cover" />
                            ) : (
                              <Icon icon="solar:user-bold-duotone" className="text-white/40 text-xl" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-white uppercase tracking-tight">{chat.user_name}</span>
                            <span className="text-[9px] font-bold text-white/30 uppercase">Chat #{chat.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-8">
                        <div className="max-w-[300px] truncate text-[11px] text-white/60 font-medium italic">
                          "{chat.last_message}"
                        </div>
                      </td>
                      <td className="p-8">
                        <div className="flex items-center gap-2">
                          {chat.status === 'ACTIVE' && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-[11px] font-black uppercase tracking-wider text-green-400">Active</span>
                            </>
                          )}
                          {chat.status === 'REQUESTED' && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                              <span className="text-[11px] font-black uppercase tracking-wider text-primary">Pending</span>
                            </>
                          )}
                          {chat.status === 'ENDED' && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-white/30" />
                              <span className="text-[11px] font-black uppercase tracking-wider text-white/40">Ended</span>
                            </>
                          )}
                          {!['ACTIVE', 'REQUESTED', 'ENDED'].includes(chat.status) && (
                            <>
                              <div className="w-2 h-2 rounded-full bg-white/30" />
                              <span className="text-[11px] font-black uppercase tracking-wider text-white/40">{chat.status}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-8 text-right">
                        {updateChatStatusMutation.isPending ? (
                          <div className="flex justify-end">
                            <div className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                              <Icon icon="solar:spinner-bold" className="text-white/40 text-lg animate-spin" />
                              <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">Processing...</span>
                            </div>
                          </div>
                        ) : chat.status === 'ACTIVE' ? (
                          <button 
                            onClick={() => handleEnterChat(chat.id)} 
                            className="px-8 py-4 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
                          >
                            Join Chat
                          </button>
                        ) : chat.status === 'REQUESTED' ? (
                          <div className="flex justify-end gap-3 opacity-40 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleAcceptChat(chat.id)} 
                              className="px-6 py-3 rounded-xl border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 flex items-center gap-2 text-green-400 transition-all"
                              title="Accept chat request"
                            >
                              <Icon icon="solar:check-circle-bold" className="text-lg" />
                              <span className="text-[10px] font-black uppercase tracking-wider">Accept</span>
                            </button>
                            <button 
                              onClick={() => handleDenyChat(chat.id)} 
                              className="px-6 py-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 flex items-center gap-2 text-red-400 transition-all"
                              title="Decline chat request"
                            >
                              <Icon icon="solar:close-circle-bold" className="text-lg" />
                              <span className="text-[10px] font-black uppercase tracking-wider">Decline</span>
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleEnterChat(chat.id)} 
                            className="px-8 py-4 rounded-2xl bg-white/10 text-white font-black uppercase text-[10px] tracking-widest hover:bg-white/20 transition-all"
                          >
                            View Chat
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: ACTIVE CHAT TERMINAL ---
  const selectedChatData = chats.find(c => c.id === selectedChat);
  const chatUserName = selectedChatData?.user_name || "Unknown User";
  const chatUserPic = selectedChatData?.user_profile_pic_url;
  const isAdminViewMode = user && ['ADMIN', 'SUPERADMIN'].includes(user.role);
  const isChatActive = selectedChatData?.status === 'ACTIVE';

  return (
    <div className="h-screen w-full flex overflow-hidden pt-20 relative" style={{ fontFamily: TYPOGRAPHY.fontFamily.body }}>
      {/* Starfield Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="starfield"></div>
        <div className="starfield-dense"></div>
      </div>
      
      {/* --- LEFT: SEEKER DOSSIER --- */}
      <aside className="w-[380px] border-r border-white/10 bg-white/[0.02] backdrop-blur-3xl flex flex-col">
        <div className="p-10 pb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40">Dossier Context</span>
        </div>
        <div className="flex-1 overflow-y-auto px-8 space-y-8">
          <div className="p-8 rounded-[40px] border border-white/10 bg-white/[0.02]">
            <div className="w-24 h-24 rounded-[32px] border border-white/20 p-1 mb-6 relative">
              <div className="w-full h-full rounded-[28px] bg-white/5 flex items-center justify-center overflow-hidden">
                {chatUserPic ? (
                  <img src={chatUserPic} alt={chatUserName} className="w-full h-full object-cover" />
                ) : (
                  <Icon icon="solar:user-circle-bold-duotone" className="text-4xl text-white" />
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary border-4 border-[#0f0f0f]" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">{chatUserName}</h3>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/20 mt-2">Chat #{selectedChat}</p>
            
            {isAdminViewMode && (
              <div className="mt-4 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-[9px] font-black text-yellow-400 uppercase tracking-wider">Admin View Mode</p>
              </div>
            )}
            
            <div className="mt-8 space-y-5">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Status</span>
                <span className="text-xs font-black text-white">{selectedChatData?.status}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Last Message</span>
                <span className="text-xs font-black text-white truncate max-w-[150px]">{selectedChatData?.last_message.substring(0, 20)}...</span>
              </div>
            </div>
          </div>
          
          <div className="p-8 rounded-[32px] border border-white/10 bg-white/[0.01]">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Session Intent</span>
            <p className="text-sm text-white/80 mt-4 italic font-medium leading-relaxed">"{selectedChatData?.last_message || 'No messages yet'}"</p>
          </div>
        </div>
        <button onClick={() => setActiveView('queue')} className="m-8 p-6 rounded-[24px] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white transition-all">
          Terminate Terminal
        </button>
      </aside>

      {/* --- CENTER: CHAT INTERFACE --- */}
      <main className="flex-1 flex flex-col relative bg-transparent">
        <header className="h-32 flex items-center justify-center gap-4">
           {isChatActive ? (
             <div className="px-10 py-5 rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl flex items-center gap-12 shadow-2xl">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Live Pulse</span>
                  <span className="text-2xl font-black text-white tabular-nums italic tracking-tighter">{formatTime(seconds)}</span>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Est. Cost</span>
                  <span className="text-xl font-black text-primary italic tabular-nums">
                    {isFetchingTime ? '...' : `$${estimatedCost.toFixed(2)}`}
                  </span>
                </div>
                {!isAdminViewMode && (
                  <>
                    <div className="w-px h-10 bg-white/10" />
                    <button
                      onClick={handleTerminateChat}
                      disabled={updateChatStatusMutation.isPending}
                      className="px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="End chat session"
                    >
                      <Icon icon="solar:quit-full-screen-bold" className="text-red-400 text-lg" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
                        {updateChatStatusMutation.isPending ? 'Ending...' : 'End Chat'}
                      </span>
                    </button>
                  </>
                )}
             </div>
           ) : (
             <div className="px-10 py-5 rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-3xl flex items-center gap-4 shadow-2xl">
               <Icon icon="solar:chat-dots-bold-duotone" className="text-white/40 text-2xl" />
               <div>
                 <p className="text-sm font-black text-white uppercase tracking-tight">Chat Not Active</p>
                 <p className="text-[9px] text-white/40 uppercase tracking-wider mt-1">
                   Status: {selectedChatData?.status || 'Unknown'}
                 </p>
               </div>
             </div>
           )}
           
           
           {/* Connection Status - only show for participants */}
           {!isAdminViewMode && (
             <div className={`px-6 py-3 rounded-2xl border backdrop-blur-xl flex items-center gap-2 ${
               isConnected 
                 ? 'border-green-500/30 bg-green-500/10' 
                 : connectionStatus === 'connecting'
                 ? 'border-yellow-500/30 bg-yellow-500/10'
                 : 'border-red-500/30 bg-red-500/10'
             }`}>
               <div className={`w-2 h-2 rounded-full ${
                 isConnected 
                   ? 'bg-green-500 animate-pulse' 
                   : connectionStatus === 'connecting'
                   ? 'bg-yellow-500 animate-pulse'
                   : 'bg-red-500'
               }`} />
               <span className={`text-[10px] font-black uppercase tracking-widest ${
                 isConnected 
                   ? 'text-green-400' 
                   : connectionStatus === 'connecting'
                   ? 'text-yellow-400'
                   : 'text-red-400'
               }`}>
                 {isConnected ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
               </span>
             </div>
           )}
           {isAdminViewMode && (
             <div className="px-6 py-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-xl flex items-center gap-2">
               <Icon icon="solar:eye-bold" className="text-yellow-400 text-lg" />
               <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Admin View</span>
             </div>
           )}
        </header>

         <div className="flex-1 overflow-y-auto px-16 space-y-10 py-4 custom-scrollbar">
          {loadingMessages && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                <Icon icon="solar:spinner-bold" className="text-white/40 text-xl animate-spin" />
                <span className="text-sm text-white/60 font-medium">Loading messages...</span>
              </div>
            </div>
          )}
          
          {!loadingMessages && isAdminViewMode && messages.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mx-auto mb-6">
                  <Icon icon="solar:eye-bold" className="text-5xl text-yellow-400" />
                </div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-3">Admin View Mode</h3>
                <p className="text-sm text-white/60 font-medium mb-4">
                  You're viewing this chat as an administrator. Message history will appear here once participants start the conversation.
                </p>
                <p className="text-xs text-white/40">
                  Note: Admins cannot send messages in chats they are not part of.
                </p>
              </div>
            </div>
          )}
          
          {!isAdminViewMode && connectionStatus === 'connecting' && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                <Icon icon="solar:spinner-bold" className="text-white/40 text-xl animate-spin" />
                <span className="text-sm text-white/60 font-medium">Connecting to chat...</span>
              </div>
            </div>
          )}
          
          {!isAdminViewMode && connectionStatus === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 px-8">
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-red-500/30 bg-red-500/10 mb-4">
                <Icon icon="solar:danger-triangle-bold" className="text-red-400 text-xl" />
                <span className="text-sm text-red-400 font-medium">Failed to connect to chat</span>
              </div>
              {wsError && (
                <div className="max-w-md p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-white/60 font-medium mb-2">Error details:</p>
                  <p className="text-xs text-red-400">{wsError}</p>
                  <button
                    onClick={() => {
                      setActiveView('queue');
                      setSelectedChat(null);
                    }}
                    className="mt-4 px-6 py-2 rounded-xl bg-white/10 text-xs font-bold text-white hover:bg-white/20 transition-all w-full"
                  >
                    Return to Queue
                  </button>
                </div>
              )}
            </div>
          )}
          
          {!loadingMessages && !isAdminViewMode && messages.length === 0 && connectionStatus === 'connected' && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Icon icon="solar:chat-dots-bold-duotone" className="text-5xl text-white/20 mx-auto mb-4" />
                <p className="text-sm text-white/40 font-medium">No messages yet. Start the conversation!</p>
              </div>
            </div>
          )}
          
          {messages.map((msg, i) => {
            // Handle both user_id and sender_id formats
            const senderId = msg.sender_id || msg.user_id;
            const isMyMessage = senderId === user?.id;
            const messageTime = msg.timestamp || msg.created_at;
            
            return (
              <motion.div 
                key={msg.id || i} 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className={`flex w-full ${isMyMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[70%] p-8 rounded-[40px] border ${
                  isMyMessage
                  ? 'bg-white text-black font-black rounded-tr-none border-white shadow-2xl' 
                  : 'bg-white/[0.03] text-white font-medium rounded-tl-none border-white/10'
                }`}>
                  <p className="text-base leading-relaxed tracking-tight">{msg.content}</p>
                  {messageTime && (
                    <p className="text-xs opacity-50 mt-2">
                      {new Date(messageTime).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
          <div ref={scrollRef} />
        </div>

        <footer className="p-12">
          {isAdminViewMode ? (
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-4 p-6 border border-yellow-500/30 bg-yellow-500/5 rounded-2xl backdrop-blur-xl">
                <Icon icon="solar:eye-bold" className="text-yellow-400 text-2xl flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-yellow-400 uppercase tracking-tight mb-1">Read-Only Mode</p>
                  <p className="text-xs text-white/60 font-medium">
                    As an administrator, you can view this conversation but cannot send messages. Only chat participants can interact.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto">
              <div className={`flex gap-4 p-3 border rounded-full pl-10 backdrop-blur-xl transition-all ${
                isConnected 
                  ? 'border-white/20 bg-white/[0.03]' 
                  : 'border-white/10 bg-white/[0.01] opacity-50'
              }`}>
                <input 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isConnected ? "Type your message..." : "Waiting for connection..."}
                  disabled={!isConnected}
                  className="flex-1 bg-transparent border-none outline-none text-white text-sm font-medium disabled:cursor-not-allowed"
                />
                <button 
                  type="submit"
                  disabled={!isConnected || !input.trim()}
                  className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Icon icon="solar:paper-plane-bold" className="text-2xl" />
                </button>
              </div>
              {!isConnected && (
                <p className="text-center text-sm text-white/40 mt-3 font-medium">
                  {connectionStatus === 'connecting' ? 'Establishing connection...' : 'Unable to connect. Please try again.'}
                </p>
              )}
            </form>
          )}
        </footer>
      </main>
    </div>
  );
};

export default PsychicSession;