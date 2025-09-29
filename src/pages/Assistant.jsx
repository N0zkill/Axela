
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Settings, Plus, Trash2, FileText } from "lucide-react";
import { Conversation, UserSettings } from "@/api/entities";
import { InvokeLLM } from "@/api/integrations";
import { motion, AnimatePresence } from "framer-motion";

import ChatMessage from "../components/chat/ChatMessage";
import ChatInput from "../components/chat/ChatInput";
import SettingsPanel from "../components/settings/SettingsPanel";
import ScriptManagementPanel from "../components/scripts/ScriptManagementPanel";

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState(null);
  const messagesEndRef = useRef(null);
  
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [currentConversation?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadData = async () => {
    try {
      const [conversationsData, settingsData] = await Promise.all([
        Conversation.list("-updated_date"),
        UserSettings.list()
      ]);
      
      setConversations(conversationsData);
      if (conversationsData.length > 0) {
        setCurrentConversation(conversationsData[0]);
      }
      
      if (settingsData.length > 0) {
        setSettings(settingsData[0]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const createNewConversation = async () => {
    const newConv = await Conversation.create({
      title: "New Conversation",
      messages: []
    });
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversation(newConv);
  };

  const deleteConversation = async (convId) => {
    await Conversation.delete(convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (currentConversation?.id === convId) {
      const remaining = conversations.filter(c => c.id !== convId);
      setCurrentConversation(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const sendMessage = async (content, type = "text") => {
    if (!currentConversation) {
      const newConv = await Conversation.create({
        title: "New Conversation",
        messages: []
      });
      setConversations(prev => [newConv, ...prev]);
      setCurrentConversation(newConv);
      // Wait for state to update before proceeding
      setTimeout(() => proceedWithMessage(content, type, newConv), 0);
    } else {
      proceedWithMessage(content, type, currentConversation);
    }
  };
  
  const proceedWithMessage = async (content, type, conversation) => {
    const userMessage = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: new Date().toISOString(),
      type
    };

    const updatedMessages = [...(conversation.messages || []), userMessage];
    const updatedConv = { ...conversation, messages: updatedMessages };
    
    // Optimistically update UI
    setCurrentConversation(updatedConv);
    setConversations(prev => prev.map(c => c.id === conversation.id ? updatedConv : c));

    setIsProcessing(true);

    try {
      const personalityPrompts = {
        professional: "You are a professional AI assistant. Be helpful, precise, and formal.",
        friendly: "You are a friendly and warm AI assistant. Be conversational and empathetic.",
        creative: "You are a creative and imaginative AI assistant. Be innovative and think outside the box.",
        concise: "You are a concise AI assistant. Give brief, to-the-point responses."
      };
      
      const latestSettings = settings || (await UserSettings.list())[0];
      const personalityPrompt = latestSettings?.assistant_personality 
        ? personalityPrompts[latestSettings.assistant_personality]
        : personalityPrompts.friendly;

      const response = await InvokeLLM({
        prompt: `${personalityPrompt}\n\nUser: ${content}\n\nAssistant:`,
        add_context_from_internet: false
      });

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: "assistant",
        timestamp: new Date().toISOString(),
        type: "text"
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const finalConv = { ...updatedConv, messages: finalMessages };
      
      await Conversation.update(conversation.id, {
        messages: finalMessages,
        title: finalMessages.length === 2 ? content.substring(0, 50) : conversation.title
      });

      // Update UI with final data from server
      setCurrentConversation(finalConv);
      setConversations(prev => prev.map(c => c.id === conversation.id ? finalConv : c));

      if (latestSettings?.auto_speak_responses) {
        speakText(response);
      }

    } catch (error) {
      console.error("Error getting AI response:", error);
    }

    setIsProcessing(false);
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="flex h-[calc(100vh-89px)] overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-card/40 backdrop-blur-md border-r flex flex-col transition-colors duration-200">
        <div className="p-4 border-b">
          <Button
            onClick={createNewConversation}
            className="w-full bg-secondary hover:bg-muted text-secondary-foreground transition-colors duration-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Conversation
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
          <div className="space-y-2">
            {conversations.map((conv) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-3 rounded-lg cursor-pointer border transition-all duration-200 group
                  ${ currentConversation?.id === conv.id
                    ? "bg-primary/10 border-primary"
                    : "bg-card/60 hover:bg-muted"
                }`}
                onClick={() => setCurrentConversation(conv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-foreground">
                      {conv.title}
                    </p>
                    <p className="text-sm truncate text-primary">
                      {conv.messages?.length || 0} messages
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-all duration-200 text-muted-foreground hover:text-destructive hover:bg-destructive/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b bg-card/80 backdrop-blur-md transition-colors duration-200 sticky top-0 z-40">
            <TabsList className="h-16 w-full flex justify-start bg-transparent p-2">
              <TabsTrigger
                value="chat"
                className="flex items-center gap-2 px-6 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground transition-all duration-200 font-medium"
              >
                <MessageCircle className="w-5 h-5" />
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="scripts"
                className="flex items-center gap-2 px-6 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground transition-all duration-200 font-medium"
              >
                <FileText className="w-5 h-5" />
                Scripts
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="ml-auto flex items-center gap-2 px-6 py-3 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground hover:text-foreground transition-all duration-200 font-medium"
              >
                <Settings className="w-5 h-5" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 flex flex-col m-0 bg-background/50 transition-colors duration-200">
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
                <div className="max-w-4xl mx-auto p-6">
                  <AnimatePresence>
                    {currentConversation?.messages?.length === 0 || !currentConversation ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-20 flex flex-col items-center justify-center min-h-[400px]"
                      >
                        <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 transition-colors duration-200">
                          <MessageCircle className="w-10 h-10 text-primary-foreground" />
                        </div>
                        <h2 className="text-2xl font-bold mb-4">
                          Hello! I'm AXELA
                        </h2>
                        <p className="mb-8 max-w-md mx-auto text-primary">
                          I'm your AI personal assistant. Ask me anything or start a conversation!
                        </p>
                      </motion.div>
                    ) : (
                      <div className="space-y-6 pb-6">
                        {currentConversation.messages.map((message) => (
                          <ChatMessage
                            key={message.id}
                            message={message}
                            onSpeak={speakText}
                          />
                        ))}
                      </div>
                    )}
                  </AnimatePresence>
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </div>

            <div className="p-6 border-t bg-card/60 backdrop-blur-md transition-colors duration-200 flex-shrink-0">
              <div className="max-w-4xl mx-auto">
                <ChatInput
                  onSendMessage={sendMessage}
                  isProcessing={isProcessing}
                  disabled={!currentConversation && conversations.length === 0}
                />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="scripts" className="flex-1 m-0 bg-background/50">
            <ScrollArea className="h-full scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
              <ScriptManagementPanel />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 m-0 bg-background/50">
            <ScrollArea className="h-full scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 scrollbar-thumb-rounded-full">
              <div className="pb-6">
                <SettingsPanel />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
