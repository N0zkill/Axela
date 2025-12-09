import React, { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Settings, Plus, Trash2, FileText, Sparkles, Circle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ChatMessage from "../components/chat/ChatMessage";
import ChatInput from "../components/chat/ChatInput";
import SettingsPanel from "../components/settings/SettingsPanel";
import ScriptManagementPanel from "../components/scripts/ScriptManagementPanel";
import { useAxelaAPI } from "../hooks/useAxelaAPI";
import { useAuth } from "../contexts/AuthContext";
import { Script } from "../api/entities";
import {
  getConversationsWithMessages,
  createConversation,
  deleteConversation as deleteConversationDB,
  createMessage,
  updateConversation,
} from "../lib/chatService";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "../lib/supabaseClient";
import logoImg from "../assets/logo.png";
import { saveAiMetadata, loadAiMetadata } from "@/lib/aiMetadataCache";

const SCRIPT_CATEGORIES = [
  { value: "General", label: "General" },
  { value: "Automation", label: "Automation" },
  { value: "Productivity", label: "Productivity" },
  { value: "System", label: "System" },
  { value: "Web", label: "Web" },
  { value: "File Management", label: "File Management" }
];

const DEFAULT_CATEGORY = SCRIPT_CATEGORIES[0].value;

const generateClientId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cmd_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const formatInstructionFromCommand = (command = {}) => {
  if (!command) return "";
  if (command.instruction_text) {
    return command.instruction_text;
  }
  if (typeof command.raw_text === "string" && command.raw_text.trim()) {
    return command.raw_text.trim();
  }

  const params = command.parameters || {};
  const type = (command.command_type || "").toLowerCase();
  const action = (command.action || "").toLowerCase();

  if (type === "mouse") {
    const target = params.target;
    if (action === "click") {
      if (target) return `click on ${target}`;
      if (typeof params.x === "number" && typeof params.y === "number") {
        return `click at ${Math.round(params.x)}, ${Math.round(params.y)}`;
      }
      return "click";
    }
    if (action === "double_click") {
      return target ? `double click on ${target}` : "double click";
    }
    if (action === "right_click") {
      return target ? `right click on ${target}` : "right click";
    }
    if (action === "drag") {
      const source = params.source || "current position";
      const destination = params.destination || "target";
      return `drag from ${source} to ${destination}`;
    }
    if (action === "scroll") {
      return `scroll ${params.direction || "down"}`;
    }
    if (action === "move") {
      if (target) return `move mouse to ${target}`;
      if (typeof params.x === "number" && typeof params.y === "number") {
        return `move mouse to ${Math.round(params.x)}, ${Math.round(params.y)}`;
      }
      return "move mouse";
    }
  }

  if (type === "keyboard") {
    if (action === "type") {
      const text = params.text || "";
      return text ? `type "${text}"` : "type text";
    }
    if (action === "key_press" || action === "key_combo") {
      const combo = params.combo || params.key || params.keys;
      return combo ? `press ${combo}` : "press key";
    }
  }

  if (type === "screenshot") {
    if (action === "capture") {
      const filename = params.filename;
      return `take screenshot${filename ? ` as ${filename}` : ""}`;
    }
    if (action === "save") {
      const filename = params.filename || "screenshot.png";
      return `save screenshot as ${filename}`;
    }
  }

  if (type === "system") {
    if (action === "shutdown") return "shutdown computer";
    if (action === "restart") return "restart computer";
    if (action === "logout") return "log out current user";
    if (action === "sleep") return "put system to sleep";
  }

  if (type === "file") {
    const source = params.source;
    const destination = params.destination;
    const path = params.path;
    if (action === "open" && path) return `open ${path}`;
    if (action === "create" && path) return `create ${path}`;
    if (action === "delete" && path) return `delete ${path}`;
    if (action === "copy" && source && destination) return `copy ${source} to ${destination}`;
    if (action === "move_file" && source && destination) return `move ${source} to ${destination}`;
    if (action === "rename" && source && destination) return `rename ${source} to ${destination}`;
  }

  if (type === "program") {
    const program = params.program || "";
    if (action === "start") return `start ${program}`.trim();
    if (action === "close") return `close ${program}`.trim();
    if (action === "minimize") return `minimize ${program}`.trim();
    if (action === "maximize") return `maximize ${program}`.trim();
  }

  if (type === "web") {
    if (action === "search") {
      const query = params.query || params.url || "";
      return `search for "${query}"`.trim();
    }
    if (action === "navigate") {
      const url = params.url || params.query || "";
      return `go to ${url}`.trim();
    }
  }

  if (type === "utility") {
    if ((action === "wait" || action === "delay") && params.duration !== undefined) {
      return `wait ${params.duration} seconds`;
    }
  }

  return `${command.command_type || ""} ${command.action || ""}`.trim();
};

const extractInstructionSources = (data = {}) => {
  if (Array.isArray(data.commands) && data.commands.length > 0) {
    return data.commands;
  }

  if (Array.isArray(data.instructions) && data.instructions.length > 0) {
    return data.instructions.map((text, index) => ({
      instruction_text: text,
      raw_text: text,
      description: `Step ${index + 1}`
    }));
  }

  if (typeof data.instructions_text === "string" && data.instructions_text.trim()) {
    return data.instructions_text
      .split(/;\s*/)
      .filter(Boolean)
      .map((text, index) => ({
        instruction_text: text.trim(),
        raw_text: text.trim(),
        description: `Step ${index + 1}`
      }));
  }

  return [];
};

const buildScriptDraftFromMessage = (message) => {
  if (!message) return null;
  const payload = message.aiMetadata ?? message.data ?? loadAiMetadata(message.id);
  if (!payload) return null;

  const commandSources = extractInstructionSources(payload);
  if (!commandSources.length) return null;

  const instructions = commandSources
    .map((cmd) => formatInstructionFromCommand(cmd))
    .filter((text) => Boolean(text));

  if (!instructions.length) {
    return null;
  }
  const prompt = instructions.join("; ");
  const baseNameSource = message.data.original_prompt || "";
  const fallbackName = baseNameSource || "Saved Script";
  const truncatedName = fallbackName.length > 60 ? `${fallbackName.slice(0, 57)}...` : fallbackName;

  const commandEntries = instructions.map((text, index) => {
    const source = commandSources[index] || {};
    const description = source.description || `${source.command_type || ""} ${source.action || ""}`.trim();
    return {
      id: source.id || generateClientId(),
      text,
      description,
      order: index,
      isEnabled: source.isEnabled !== undefined
        ? source.isEnabled
        : (source.is_enabled !== undefined ? source.is_enabled : true),
      command_type: source.command_type,
      action: source.action,
      parameters: source.parameters
    };
  });

  return {
    defaultName: truncatedName || "Saved Script",
    defaultDescription: message.content || message.data.ai_explanation || "",
    prompt,
    instructions,
    commands: commandEntries,
    originalPrompt: baseNameSource
  };
};

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState("ai"); // "manual", "ai", "agent", or "chat"
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [scriptDraft, setScriptDraft] = useState(null);
  const [scriptName, setScriptName] = useState("");
  const [scriptDescription, setScriptDescription] = useState("");
  const [scriptCategory, setScriptCategory] = useState(DEFAULT_CATEGORY);
  const [isSavingScript, setIsSavingScript] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const sendMessageRef = useRef(null);

  const axelaAPI = useAxelaAPI();
  const { user } = useAuth();
  const { toast } = useToast();

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

  const resetScriptDraft = useCallback(() => {
    setScriptDraft(null);
    setScriptName("");
    setScriptDescription("");
    setScriptCategory(DEFAULT_CATEGORY);
  }, []);

  const closeScriptModal = useCallback(() => {
    if (isSavingScript) {
      return;
    }
    resetScriptDraft();
  }, [isSavingScript, resetScriptDraft]);

  const handleSaveScriptRequest = useCallback((message) => {
    if (!user?.id) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save scripts for later.",
        variant: "destructive"
      });
      return;
    }

    const draft = buildScriptDraftFromMessage(message);
    if (!draft) {
      toast({
        title: "Nothing to save",
        description: "This response does not include executable steps.",
      });
      return;
    }

    setScriptDraft(draft);
    setScriptName(draft.defaultName || "Saved Script");
    setScriptDescription(draft.defaultDescription || "");
    setScriptCategory(DEFAULT_CATEGORY);
  }, [toast, user?.id]);

  const handleCreateScript = useCallback(async () => {
    if (!scriptDraft || !user?.id) {
      return;
    }

    const trimmedName = scriptName.trim();
    if (!trimmedName) {
      toast({
        title: "Script name required",
        description: "Please provide a name for this script.",
        variant: "destructive"
      });
      return;
    }

    setIsSavingScript(true);
    try {
      const commandsPayload = scriptDraft.commands.map((command, index) => ({
        id: command.id || generateClientId(),
        text: command.text,
        description: command.description || "",
        order: index,
        isEnabled: command.isEnabled !== undefined ? command.isEnabled : true,
        command_type: command.command_type,
        action: command.action,
        parameters: command.parameters
      }));

      await Script.create(user.id, {
        name: trimmedName,
        prompt: scriptDraft.prompt || commandsPayload.map((cmd) => cmd.text).join("; "),
        description: scriptDescription.trim(),
        category: scriptCategory,
        commands: commandsPayload,
        is_recurring: false,
        recurring_enabled: false
      });

      toast({
        title: "Script saved",
        description: `${trimmedName} is now available in the Scripts tab.`
      });
      resetScriptDraft();
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event("axela-scripts-updated"));
      }
    } catch (error) {
      console.error("Error saving script:", error);
      toast({
        title: "Failed to save script",
        description: error?.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSavingScript(false);
    }
  }, [scriptDraft, scriptName, scriptDescription, scriptCategory, resetScriptDraft, toast, user?.id]);

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

  const scriptInstructionsPreview = scriptDraft
    ? scriptDraft.commands.map((cmd, index) => `${index + 1}. ${cmd.text}`).join("\n")
    : "";
  const disableScriptSave = !scriptDraft || !scriptName.trim() || !scriptDraft.commands.length || isSavingScript;

  // Realtime subscription for new messages in current conversation
  useEffect(() => {
    if (!currentConversation?.id || !user?.id) {
      return;
    }

    const conversationId = currentConversation.id;
    console.log('[Chat] Setting up realtime subscription for conversation:', conversationId);

    const channel = supabase
      .channel(`messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new;
          console.log('[Chat] New message received via realtime:', newMessage);

          // Add new message to current conversation without animations
          const message = {
            id: newMessage.id,
            content: newMessage.content,
            role: newMessage.role,
            timestamp: newMessage.created_at,
            success: newMessage.success,
            data: newMessage.data,
          };

          setCurrentConversation((prev) => {
            if (!prev || prev.id !== conversationId) {
              return prev;
            }
            // Check if message already exists (avoid duplicates)
            const messageExists = prev.messages?.some((msg) => msg.id === newMessage.id);
            if (messageExists) {
              console.log('[Chat] Message already exists, skipping');
              return prev;
            }
            return {
              ...prev,
              messages: [...(prev.messages || []), message],
              updatedAt: new Date().toISOString(),
            };
          });

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== conversationId) {
                return conv;
              }
              // Check if message already exists (avoid duplicates)
              const messageExists = conv.messages?.some((msg) => msg.id === newMessage.id);
              if (messageExists) {
                return conv;
              }
              return {
                ...conv,
                messages: [...(conv.messages || []), message],
                updatedAt: new Date().toISOString(),
              };
            })
          );

          // Scroll to bottom when new message arrives
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      )
      .subscribe((status) => {
        console.log('[Chat] Realtime subscription status:', status);
      });

    return () => {
      console.log('[Chat] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [currentConversation?.id, user?.id]);

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
      // Use the selected mode (agent, ai, manual, or chat) regardless of which tab we're on
      // The "chat" tab is just the UI tab, not the execution mode
      const executionMode = mode;
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
        data: assistantMsgData.data ?? result.data ?? null,
        aiMetadata: result.data ?? assistantMsgData.data ?? null
      };

      if (assistantMessage.aiMetadata) {
        saveAiMetadata(assistantMessage.id, assistantMessage.aiMetadata);
      }

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
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        onSaveScript={handleSaveScriptRequest}
                      />
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
      <Dialog open={Boolean(scriptDraft)} onOpenChange={(open) => {
        if (!open) {
          closeScriptModal();
        }
      }}>
        <DialogContent className="bg-stone-950 border border-stone-800/60 text-stone-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>Save Script</DialogTitle>
            <DialogDescription className="text-stone-400">
              Store these AI-generated steps so you can replay them from the Scripts tab later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="script-name" className="text-sm">Script Name</Label>
              <Input
                id="script-name"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="Give this script a memorable name"
                className="bg-stone-900 border-stone-700"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="script-description" className="text-sm">Description</Label>
              <Textarea
                id="script-description"
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                placeholder="Optional: describe what this script accomplishes"
                className="min-h-[80px] bg-stone-900 border-stone-700 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Category</Label>
              <Select value={scriptCategory} onValueChange={setScriptCategory}>
                <SelectTrigger className="bg-stone-900 border-stone-700">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {SCRIPT_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Instructions</Label>
              <Textarea
                value={scriptInstructionsPreview}
                readOnly
                className="min-h-[140px] bg-stone-900 border-stone-800 text-stone-200 font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeScriptModal}
              disabled={isSavingScript}
              className="border-stone-700 text-stone-300 hover:text-orange-400 hover:border-orange-500/60"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateScript}
              disabled={disableScriptSave}
              className="bg-orange-500 hover:bg-orange-600 text-white border-0"
            >
              {isSavingScript ? "Saving..." : "Save Script"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
