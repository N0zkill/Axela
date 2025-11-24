import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Square, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Overlay() {
  const [messages, setMessages] = useState([]);
  const [isHovered, setIsHovered] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState('ai');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Override body and html background for transparency
  useEffect(() => {
    const originalBodyBg = document.body.style.background;
    const originalHtmlBg = document.documentElement.style.background;
    
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    
    // Also remove any inherited background from the root div
    const rootDiv = document.getElementById('root');
    const originalRootBg = rootDiv?.style.background;
    if (rootDiv) {
      rootDiv.style.background = 'transparent';
      rootDiv.style.backgroundColor = 'transparent';
    }

    return () => {
      document.body.style.background = originalBodyBg;
      document.documentElement.style.background = originalHtmlBg;
      if (rootDiv) {
        rootDiv.style.background = originalRootBg || '';
      }
    };
  }, []);

  // Load initial mode
  useEffect(() => {
    const loadMode = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/config');
        const data = await response.json();
        if (data?.config?.mode) {
          setMode(data.config.mode);
        }
      } catch (error) {
        console.error('Failed to load mode:', error);
      }
    };
    loadMode();
  }, []);

  useEffect(() => {
    // Listen for chat updates from the main process
    if (window.electronAPI?.onChatUpdate) {
      const cleanup = window.electronAPI.onChatUpdate((data) => {
        console.log('Overlay received chat update:', data);
        if (data && data.messages) {
          setMessages(data.messages);
        }
      });
      
      return cleanup;
    }
    
    // Mock data for development/testing if not in Electron
    if (!window.electronAPI) {
      setMessages([
        { id: 1, role: 'user', content: 'Hello' },
        { id: 2, role: 'assistant', content: 'Hi there! How can I help you today?' }
      ]);
    }
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Voice recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        await handleVoiceInput(audioBlob);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      visualizeAudio();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioLevel(0);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  const visualizeAudio = () => {
    if (!analyserRef.current) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    setAudioLevel(average / 255);
    
    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(visualizeAudio);
    }
  };

  const handleVoiceInput = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');

      const response = await fetch('http://127.0.0.1:8000/transcribe', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.text) {
          // Send the transcribed text as a command
          const command = data.text.trim();
          const userMsg = {
            id: `overlay-${Date.now()}`,
            role: 'user',
            content: command
          };
          setMessages(prev => [...prev, userMsg]);

          if (window.electronAPI?.sendOverlayCommand) {
            window.electronAPI.sendOverlayCommand(command);
          }
        }
      }
    } catch (error) {
      console.error("Error transcribing audio:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Mode cycling
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

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const command = inputValue.trim();
    setInputValue('');
    setIsProcessing(true);

    // Add user message locally for immediate feedback
    const userMsg = {
      id: `overlay-${Date.now()}`,
      role: 'user',
      content: command
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      // Send command via IPC to main window
      if (window.electronAPI?.sendOverlayCommand) {
        window.electronAPI.sendOverlayCommand(command);
      } else {
        // Fallback: send directly to backend
        const response = await fetch('http://127.0.0.1:8000/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, mode: 'ai' })
        });
        const result = await response.json();
        
        const assistantMsg = {
          id: `overlay-resp-${Date.now()}`,
          role: 'assistant',
          content: result.success ? result.message : `Error: ${result.message || 'Command failed'}`
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (error) {
      console.error('Error sending command:', error);
      const errorMsg = {
        id: `overlay-err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error.message}`
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div 
      className={`h-screen w-screen flex flex-col overflow-hidden transition-opacity duration-300 ${
        isHovered ? 'opacity-100 bg-stone-950/90' : 'opacity-40 bg-transparent'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag Handle */}
      <div className="h-6 w-full bg-transparent cursor-move flex items-center justify-center group" style={{ WebkitAppRegion: 'drag' }}>
        <div className={`w-16 h-1 rounded-full transition-colors ${isHovered ? 'bg-stone-700 group-hover:bg-stone-600' : 'bg-stone-500/50'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide" style={{ WebkitAppRegion: 'no-drag' }}>
        <div className="space-y-2">
          <AnimatePresence>
            {messages.slice(-6).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-orange-500/80 text-white' 
                      : 'bg-stone-800/80 text-stone-200 backdrop-blur-md border border-stone-700/50'
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-stone-800/80 rounded-2xl px-3 py-2 text-xs text-stone-400 backdrop-blur-md border border-stone-700/50">
                <span className="animate-pulse">Processing...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Input Area */}
      <div 
        className={`p-2 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-60'}`}
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* Mode Selector */}
        <div className="flex items-center justify-center gap-1 mb-2">
          <button
            onClick={() => cycleMode("prev")}
            className="p-0.5 rounded hover:bg-stone-700/50 transition-colors"
          >
            <ChevronLeft className="w-3 h-3 text-stone-400 hover:text-orange-400" />
          </button>
          <span className="text-orange-400 font-medium text-[10px] px-2 min-w-[50px] text-center">
            {mode === "chat" && "Chat"}
            {mode === "ai" && "AI"}
            {mode === "agent" && "Agent"}
            {mode === "manual" && "Manual"}
          </span>
          <button
            onClick={() => cycleMode("next")}
            className="p-0.5 rounded hover:bg-stone-700/50 transition-colors"
          >
            <ChevronRight className="w-3 h-3 text-stone-400 hover:text-orange-400" />
          </button>
        </div>

        {/* Input Row */}
        <div className="flex items-center gap-2 bg-stone-800/80 backdrop-blur-md rounded-xl border border-stone-700/50 px-2 py-1.5">
          {/* Voice Button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative p-1.5 rounded-lg transition-all duration-200 ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-orange-500/80 hover:bg-orange-500'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isRecording && (
              <div 
                className="absolute inset-0 rounded-lg bg-red-500/30 animate-pulse"
                style={{ transform: `scale(${1 + audioLevel * 0.3})` }}
              />
            )}
            {isRecording ? (
              <Square className="w-3 h-3 text-white relative z-10" />
            ) : (
              <Mic className="w-3 h-3 text-white" />
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            disabled={isProcessing || isRecording}
            className="flex-1 bg-transparent text-xs text-white placeholder-stone-500 outline-none min-w-0"
          />
          
          <button
            onClick={handleSend}
            disabled={isProcessing || !inputValue.trim() || isRecording}
            className="p-1.5 rounded-lg hover:bg-stone-700/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3 h-3 text-orange-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

