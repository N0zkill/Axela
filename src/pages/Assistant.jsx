import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MessageCircle, Settings, Plus, Trash2, FileText, Sparkles, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ChatMessage from "../components/chat/ChatMessage";
import ChatInput from "../components/chat/ChatInput";
import SettingsPanel from "../components/settings/SettingsPanel";
import ScriptManagementPanel from "../components/scripts/ScriptManagementPanel";
import { useAxelaAPI } from "../hooks/useAxelaAPI";
import { useAuth } from "../contexts/AuthContext";
import {
  getConversationsWithMessages,
  createConversation,
  deleteConversation as deleteConversationDB,
  createMessage,
  updateConversation,
} from "../lib/chatService";
import logoImg from "../assets/logo.png";

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState("ai"); // "manual", "ai", "agent", or "chat"
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const sendMessageRef = useRef(null);

  const axelaAPI = useAxelaAPI();
  const { user } = useAuth();

  const loadMode = useCallback(async () => {
    try {
      const response = await axelaAPI.getConfig();
      console.log('>>> Config response:', response);
      console.log('>>> Mode from config:', response?.config?.mode);

      const newMode = response?.config?.mode || "ai";
      console.log('>>> Setting mode to:', newMode);
      setMode(newMode);

      // Load auto-speak setting
      const autoSpeakEnabled = response?.config?.custom?.auto_speak_responses === true;
      setAutoSpeak(autoSpeakEnabled);
    } catch (error) {
      console.error("Error loading mode:", error);
      setMode("ai");
    }
  }, [axelaAPI.getConfig]);

  const loadConversations = useCallback(async () => {
    if (!user?.id) {
      setIsLoadingConversations(false);
      return;
    }

    try {
      setIsLoadingConversations(true);
      const { data, error } = await getConversationsWithMessages(user.id);

      if (error) {
        console.error('Error loading conversations:', error);
        return;
      }

      if (data && data.length > 0) {
        // Mark the first conversation as active
        const updatedConversations = data.map((conv, index) => ({
          ...conv,
          isActive: index === 0,
        }));
        setConversations(updatedConversations);
        setCurrentConversation(updatedConversations[0]);
      } else {
        // No conversations exist, create a new one
        await createNewConversation();
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [user?.id]);

  // Separate useEffect for initial setup - only run once on mount
  useEffect(() => {
    loadMode();
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount

  // Separate useEffect for config changes (no hotkey listener here)
  useEffect(() => {
    const handleConfigChange = async (event) => {
      if (event.detail.section === 'app' && event.detail.settings.mode) {
        // Update mode directly from the event, no need to fetch config again
        setMode(event.detail.settings.mode);
      } else if (event.detail.section === 'custom' && 'auto_speak_responses' in event.detail.settings) {
        setAutoSpeak(event.detail.settings.auto_speak_responses);
      }
    };

    window.addEventListener('axela-config-changed', handleConfigChange);

    return () => {
      window.removeEventListener('axela-config-changed', handleConfigChange);
    };
  }, []); // No dependencies - event handler doesn't need to change

  // Separate useEffect for hotkeys - only run once on mount
  useEffect(() => {
    const handleHotkey = async (hotkey) => {
      if (hotkey === 'emergency_stop') {
        // Show emergency stop notification
        console.log('Emergency stop activated in UI!');

        const emergencyContent = '🚨 Emergency Stop Activated!\n\nThe Axela backend has been forcefully terminated. All running commands have been stopped.\n\nThe backend will automatically restart in 2 seconds...';

        setConversations(prev => {
          const current = prev.find(c => c.isActive);
          if (current && user?.id) {
            // Save emergency message to database
            createMessage(current.id, {
              role: 'assistant',
              content: emergencyContent,
              success: false,
            }).then(({ data: msgData }) => {
              if (msgData) {
                const emergencyMessage = {
                  id: msgData.id,
                  content: msgData.content,
                  role: msgData.role,
                  timestamp: msgData.created_at,
                  success: false
                };

                const updatedMessages = [...(current.messages || []), emergencyMessage];
                const updatedConv = {
                  ...current,
                  messages: updatedMessages,
                  updatedAt: new Date().toISOString()
                };

                setCurrentConversation(updatedConv);
                setConversations(prev => prev.map(c => c.id === current.id ? updatedConv : c));
              }
            }).catch(err => console.error('Error saving emergency message:', err));
          }
          return prev;
        });

        // Show restart notification after backend auto-restarts (4 seconds)
        setTimeout(() => {
          console.log('Adding restart success message');
          const restartContent = '✅ Backend Restarted Successfully\n\nAxela is back online and ready to accept commands.';

          setConversations(prev => {
            const current = prev.find(c => c.isActive);
            if (current && user?.id) {
              // Save restart message to database
              createMessage(current.id, {
                role: 'assistant',
                content: restartContent,
                success: true,
              }).then(({ data: msgData }) => {
                if (msgData) {
                  const restartMessage = {
                    id: msgData.id,
                    content: msgData.content,
                    role: msgData.role,
                    timestamp: msgData.created_at,
                    success: true
                  };

                  const updatedMessages = [...(current.messages || []), restartMessage];
                  const updatedConv = {
                    ...current,
                    messages: updatedMessages,
                    updatedAt: new Date().toISOString()
                  };

                  setCurrentConversation(updatedConv);
                  setConversations(prev => prev.map(c => c.id === current.id ? updatedConv : c));
                }
              }).catch(err => console.error('Error saving restart message:', err));
            }
            return prev;
          });
        }, 4000);
      }
    };

    if (window.electronAPI?.onHotkeyPressed) {
      window.electronAPI.onHotkeyPressed(handleHotkey);
    }

    // Only clean up on unmount
    return () => {
      // Don't remove all listeners, other components might be using them
      // The Electron main process manages the actual hotkey registration
    };
  }, [user]); // Include user in dependencies

  // Keep sendMessage ref up to date
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  // Listen for commands from overlay window
  useEffect(() => {
    if (window.electronAPI?.onOverlayCommand) {
      const cleanup = window.electronAPI.onOverlayCommand((command) => {
        console.log('Received command from overlay:', command);
        // Use the ref to always call the latest version of sendMessage
        if (sendMessageRef.current) {
          sendMessageRef.current(command);
        }
      });

      return cleanup;
    }
  }, []); // Only set up once - ref pattern handles stale closures

  useEffect(() => {
    scrollToBottom();

    // Send chat update to Electron for overlay
    if (window.electronAPI?.sendChatUpdate && currentConversation) {
      window.electronAPI.sendChatUpdate({
        messages: currentConversation.messages || []
      });
    }
  }, [currentConversation?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createNewConversation = async () => {
    if (!user?.id) {
      console.error('Cannot create conversation: user not authenticated');
      return;
    }

    try {
      const { data, error } = await createConversation(user.id, "New Conversation");

      if (error) {
        console.error('Error creating conversation:', error);
        return;
      }

      const newConv = {
        id: data.id,
        title: data.title,
        messages: [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isActive: true
      };

      setConversations(prev => {
        // Mark all other conversations as inactive
        const updatedPrev = prev.map(c => ({ ...c, isActive: false }));
        return [newConv, ...updatedPrev];
      });
      setCurrentConversation(newConv);
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const deleteConversation = async (convId) => {
    try {
      // Delete from database
      const { error } = await deleteConversationDB(convId);

      if (error) {
        console.error('Error deleting conversation:', error);
        return;
      }

      // Update local state using functional form to avoid stale closures
      setConversations(prev => {
        const remaining = prev.filter(c => c.id !== convId);

        // If we're deleting the current conversation, switch to another
        if (currentConversation?.id === convId) {
          if (remaining.length > 0) {
            setCurrentConversation(remaining[0]);
          } else {
            // Create new conversation if no remaining conversations
            createNewConversation();
          }
        }

        return remaining;
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const cycleMode = async (direction) => {
    const modes = ["manual", "ai", "agent", "chat"];
    const currentIndex = modes.indexOf(mode);
    const newIndex = direction === "next"
      ? (currentIndex + 1) % modes.length
      : (currentIndex - 1 + modes.length) % modes.length;
    const newMode = modes[newIndex];

    try {
      await fetch('http://127.0.0.1:8000/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: "app", settings: { mode: newMode } })
      });

      setMode(newMode);
    } catch (error) {
      console.error("Error updating mode:", error);
    }
  };

  const sendMessage = async (content) => {
    if (!content.trim() || !user?.id) return;

    let conv = currentConversation;

    // Create new conversation if none exists
    if (!conv) {
      try {
        const { data, error } = await createConversation(user.id, content.substring(0, 50));

        if (error) {
          console.error('Error creating conversation:', error);
          return;
        }

        conv = {
          id: data.id,
          title: data.title,
          messages: [],
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          isActive: true
        };

        setConversations(prev => [conv, ...prev]);
        setCurrentConversation(conv);
      } catch (error) {
        console.error('Error creating conversation:', error);
        return;
      }
    }

    setIsProcessing(true);

    // Save user message to database
    let userMessageDB;
    try {
      const { data: msgData, error: msgError } = await createMessage(conv.id, {
        role: 'user',
        content: content,
        success: true,
      });

      if (msgError) {
        console.error('Error saving user message:', msgError);
        setIsProcessing(false);
        return;
      }

      userMessageDB = msgData;

      // Update local state with user message
      const userMessage = {
        id: msgData.id,
        content: msgData.content,
        role: msgData.role,
        timestamp: msgData.created_at
      };

      const updatedMessages = [...(conv.messages || []), userMessage];
      const updatedConv = { ...conv, messages: updatedMessages, updatedAt: new Date().toISOString() };

      setCurrentConversation(updatedConv);
      setConversations(prev => prev.map(c => c.id === conv.id ? updatedConv : c));

      // Execute the command
      const executionMode = activeTab === "chat" ? "chat" : mode;
      console.log('>>> Current mode state before sending:', mode);
      console.log('>>> Active tab:', activeTab);
      console.log('>>> Execution mode:', executionMode);
      const result = await axelaAPI.executeCommand(content, executionMode);

      // Save assistant message to database
      const { data: assistantMsgData, error: assistantMsgError } = await createMessage(conv.id, {
        role: 'assistant',
        content: result.success ? result.message : `Error: ${result.message || 'Command failed'}`,
        success: result.success,
        data: result.data,
      });

      if (assistantMsgError) {
        console.error('Error saving assistant message:', assistantMsgError);
        setIsProcessing(false);
        return;
      }

      const assistantMessage = {
        id: assistantMsgData.id,
        content: assistantMsgData.content,
        role: assistantMsgData.role,
        timestamp: assistantMsgData.created_at,
        success: assistantMsgData.success,
        data: assistantMsgData.data
      };

      const finalMessages = [...updatedMessages, assistantMessage];

      // Update conversation title if this is the first message
      let finalTitle = updatedConv.title;
      if (finalMessages.length === 2 && finalTitle === 'New Conversation') {
        finalTitle = content.substring(0, 50);
        await updateConversation(conv.id, { title: finalTitle });
      }

      const finalConv = {
        ...updatedConv,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
        title: finalTitle
      };

      setCurrentConversation(finalConv);
      setConversations(prev => prev.map(c => c.id === conv.id ? finalConv : c));


      if (autoSpeak && result.success && assistantMessage.content) {
        try {
          await fetch('http://127.0.0.1:8000/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: assistantMessage.content, blocking: false })
          });
        } catch (speakError) {
          console.error("Error auto-speaking response:", speakError);
        }
      }

    } catch (error) {
      console.error("Error sending message:", error);

      // Check if backend is restarting before showing error
      const isRestarting = window.electronAPI?.isBackendRestarting
        ? await window.electronAPI.isBackendRestarting()
        : false;

      // Don't show error message if backend is restarting
      if (!isRestarting && conv) {
        const errorContent = `I encountered an error: ${error.message}. Please make sure the Axela backend is running.`;

        // Save error message to database
        try {
          const { data: errorMsgData } = await createMessage(conv.id, {
            role: 'assistant',
            content: errorContent,
            success: false,
          });

          if (errorMsgData) {
            const errorMessage = {
              id: errorMsgData.id,
              content: errorMsgData.content,
              role: errorMsgData.role,
              timestamp: errorMsgData.created_at,
              success: false
            };

            const currentMessages = conv.messages || [];
            const finalMessages = [...currentMessages, errorMessage];
            const finalConv = {
              ...conv,
              messages: finalMessages,
              updatedAt: new Date().toISOString()
            };

            setCurrentConversation(finalConv);
            setConversations(prev => prev.map(c => c.id === conv.id ? finalConv : c));
          }
        } catch (dbError) {
          console.error('Error saving error message to database:', dbError);
        }
      }
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div className="flex h-screen bg-stone-950">

      <div className="w-72 flex flex-col bg-stone-900/50 backdrop-blur-xl border-r border-stone-800/50">

        <div className="p-6 border-b border-stone-800/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 flex items-center justify-center">
              <img src={logoImg} alt="AXELA" className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AXELA</h1>
              <p className="text-xs text-stone-400">AI Assistant</p>
            </div>
          </div>

          <Button
            onClick={createNewConversation}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 border-0 h-11"
            size="lg">
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="space-y-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  currentConversation?.id === conv.id
                    ? 'bg-orange-500/10 border-2 border-orange-500/30 shadow-sm'
                    : 'bg-stone-800/30 hover:bg-stone-800/50 border border-transparent'
                }`}
                onClick={() => setCurrentConversation(conv)}>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className={`w-3.5 h-3.5 flex-shrink-0 ${
                        currentConversation?.id === conv.id ? 'text-orange-400' : 'text-stone-500'
                      }`} />
                      <h3 className={`font-medium text-sm truncate ${
                        currentConversation?.id === conv.id ? 'text-orange-100' : 'text-stone-300'
                      }`}>
                        {conv.title || 'New Chat'}
                      </h3>
                    </div>
                    <p className="text-xs text-stone-500">
                      {conv.messages?.length || 0} messages
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}>
                    <Trash2 className="w-3.5 h-3.5 text-stone-400 hover:text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Footer */}
        <div className="px-5 py-6 border-t border-stone-800/50 bg-stone-900/30">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Circle className={`w-2 h-2 ${axelaAPI.status.connected ? 'fill-orange-500 text-orange-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              <span className="text-stone-300 font-medium">
                {axelaAPI.status.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center -space-x-1">
                <button
                  onClick={() => cycleMode("prev")}
                  className="hover:bg-stone-700/50 rounded transition-colors p-0.5"
                  title="Previous mode"
                >
                  <ChevronLeft className="w-3 h-3 text-stone-400 hover:text-orange-400" />
                </button>
                <span className="text-orange-400 font-medium text-xs px-2">
                  {mode === "chat" && "Chat"}
                  {mode === "ai" && "AI"}
                  {mode === "agent" && "Agent"}
                  {mode === "manual" && "Manual"}
                </span>
                <button
                  onClick={() => cycleMode("next")}
                  className="hover:bg-stone-700/50 rounded transition-colors p-0.5"
                  title="Next mode"
                >
                  <ChevronRight className="w-3 h-3 text-stone-400 hover:text-orange-400" />
                </button>
              </div>
              {axelaAPI.status.ai_available && (
                <Sparkles className="w-4 h-4 text-orange-400" title="AI Available" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          {/* Tab Header */}
          <div className="border-b border-stone-800/50 bg-stone-900/30 backdrop-blur-xl px-8 py-4 flex justify-center">
            <TabsList className="bg-stone-800/50 p-1.5 h-12">
              <TabsTrigger
                value="chat"
                className="data-[state=active]:bg-stone-700 data-[state=active]:text-orange-400 px-6 font-medium text-stone-400">
                <MessageCircle className="w-4 h-4 mr-2" />
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="scripts"
                className="data-[state=active]:bg-stone-700 data-[state=active]:text-orange-400 px-6 font-medium text-stone-400">
                <FileText className="w-4 h-4 mr-2" />
                Scripts
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="data-[state=active]:bg-stone-700 data-[state=active]:text-orange-400 px-6 font-medium text-stone-400">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 flex flex-col m-0 p-0 min-h-0 data-[state=inactive]:hidden">
            {/* Messages Area - Fixed Height with Scroll */}
            <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
              {!currentConversation || currentConversation.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-2xl">
                    <div className="w-28 h-28 flex items-center justify-center mb-4 mx-auto">
                      <img src={logoImg} alt="AXELA" className="w-full h-full object-contain brightness-0 invert" />
                    </div>
                    <h2 className="text-4xl font-bold mb-3 text-orange-400">
                      Hello! I'm AXELA
                    </h2>
                    <p className="text-lg text-stone-400 mb-8">
                      Your AI-powered desktop assistant. I can control your computer, execute commands, and help you get things done.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {["Open Calculator", "Take a screenshot", "Open Notepad", "Search for cats"].map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="outline"
                          onClick={() => sendMessage(suggestion)}
                          className="rounded-full border-2 border-stone-700 hover:border-orange-500/50 hover:bg-orange-500/10 text-stone-300 hover:text-orange-400 font-medium px-5 h-11 bg-stone-800/30">
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-4">
                  <AnimatePresence>
                    {currentConversation.messages.map((msg) => (
                      <ChatMessage key={msg.id} message={msg} />
                    ))}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area - Fixed at Bottom */}
            <div className="px-5 py-3.5 border-t pb-4 border-stone-800/50 bg-stone-900/50 backdrop-blur-xl">
              <div className="max-w-4xl mx-auto">
                <ChatInput
                  ref={chatInputRef}
                  onSendMessage={sendMessage}
                  isProcessing={isProcessing}
                  disabled={!axelaAPI.status.connected}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scripts" className="flex-1 m-0 overflow-y-auto data-[state=inactive]:hidden">
            <div className="p-8">
              <ScriptManagementPanel axelaAPI={axelaAPI} />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 m-0 p-0 overflow-y-auto data-[state=inactive]:hidden">
            <SettingsPanel axelaAPI={axelaAPI} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
