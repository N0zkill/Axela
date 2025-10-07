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

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState("ai"); // "manual", "ai", or "chat"
  const [autoSpeak, setAutoSpeak] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);

  const axelaAPI = useAxelaAPI();

  const loadMode = useCallback(async () => {
    try {
      const response = await axelaAPI.getConfig();
      console.log('>>> Config response:', response);
      console.log('>>> Mode from config:', response?.config?.mode);
      // API returns { config: { mode: ... } }
      const newMode = response?.config?.mode || "ai";
      console.log('>>> Setting mode to:', newMode);
      setMode(newMode);
      
      // Load auto-speak setting
      const autoSpeakEnabled = response?.config?.custom?.auto_speak_responses === true;
      setAutoSpeak(autoSpeakEnabled);
    } catch (error) {
      console.error("Error loading mode:", error);
      setMode("ai"); // Fallback to AI mode on error
    }
  }, [axelaAPI]);

  useEffect(() => {
    if (conversations.length === 0) {
      createNewConversation();
    }
    loadMode();

    const handleConfigChange = (event) => {
      if (event.detail.section === 'app' && event.detail.settings.mode) {
        loadMode();
      } else if (event.detail.section === 'custom' && 'auto_speak_responses' in event.detail.settings) {
        setAutoSpeak(event.detail.settings.auto_speak_responses);
      }
    };

    window.addEventListener('axela-config-changed', handleConfigChange);

    return () => {
      window.removeEventListener('axela-config-changed', handleConfigChange);
    };
  }, [loadMode]);

  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const createNewConversation = () => {
    const newConv = {
      id: Date.now().toString(),
      title: "New Conversation",
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversation(newConv);
  };

  const deleteConversation = (convId) => {
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (currentConversation?.id === convId) {
      const remaining = conversations.filter(c => c.id !== convId);
      if (remaining.length > 0) {
        setCurrentConversation(remaining[0]);
      } else {
        createNewConversation();
      }
    }
  };

  const cycleMode = async (direction) => {
    const modes = ["manual", "ai", "chat"];
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
    if (!content.trim()) return;

    let conv = currentConversation;
    if (!conv) {
      conv = {
        id: Date.now().toString(),
        title: content.substring(0, 50),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      };
      setConversations(prev => [conv, ...prev]);
      setCurrentConversation(conv);
    }

    const userMessage = {
      id: Date.now().toString(),
      content,
      role: "user",
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...(conv.messages || []), userMessage];
    const updatedConv = { ...conv, messages: updatedMessages, updatedAt: new Date().toISOString() };

    setCurrentConversation(updatedConv);
    setConversations(prev => prev.map(c => c.id === conv.id ? updatedConv : c));
    setIsProcessing(true);

    try {
      console.log('>>> Current mode state before sending:', mode);
      console.log('>>> Mode type:', typeof mode);
      console.log('>>> Mode value check:', mode === 'chat', mode === 'ai', mode === 'manual');
      const result = await axelaAPI.executeCommand(content, mode);

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        content: result.success
          ? result.message
          : `Error: ${result.message || 'Command failed'}`,
        role: "assistant",
        timestamp: new Date().toISOString(),
        success: result.success,
        data: result.data
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const finalConv = {
        ...updatedConv,
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
        title: finalMessages.length === 2 ? content.substring(0, 50) : updatedConv.title
      };

      setCurrentConversation(finalConv);
      setConversations(prev => prev.map(c => c.id === conv.id ? finalConv : c));

      // Auto-speak if enabled and message was successful
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

      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: `I encountered an error: ${error.message}. Please make sure the Axela backend is running.`,
        role: "assistant",
        timestamp: new Date().toISOString(),
        success: false
      };

      const finalMessages = [...updatedMessages, errorMessage];
      const finalConv = { ...updatedConv, messages: finalMessages, updatedAt: new Date().toISOString() };

      setCurrentConversation(finalConv);
      setConversations(prev => prev.map(c => c.id === conv.id ? finalConv : c));
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div className="flex h-screen bg-stone-950">
      {/* Sidebar */}
      <div className="w-72 flex flex-col bg-stone-900/50 backdrop-blur-xl border-r border-stone-800/50">
        {/* Header */}
        <div className="p-6 border-b border-stone-800/50">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 flex items-center justify-center">
              <img src="/src/assets/logo.png" alt="AXELA" className="w-full h-full object-contain brightness-0 invert" />
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

        {/* Conversations List - Fixed Height */}
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
                      <img src="/src/assets/logo.png" alt="AXELA" className="w-full h-full object-contain brightness-0 invert" />
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