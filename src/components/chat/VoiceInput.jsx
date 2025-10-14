
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Square, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const VoiceInput = forwardRef(({ onVoiceInput, isProcessing, disabled }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    startRecording: () => startRecording(),
    stopRecording: () => stopRecording(),
    cancelRecording: () => cancelRecording(),
    toggleRecording: () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    },
    isRecording: () => isRecording
  }));

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
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        onVoiceInput(audioBlob);
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

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Remove the ondataavailable and onstop handlers to prevent processing
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      
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

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative">
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              <div
                className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse"
                style={{
                  transform: `scale(${1 + audioLevel * 0.5})`,
                  transition: 'transform 0.1s ease-out'
                }}
              />
              <div
                className="absolute inset-2 rounded-full bg-red-500/10 animate-pulse"
                style={{
                  transform: `scale(${1 + audioLevel * 0.3})`,
                  transition: 'transform 0.1s ease-out'
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          size="lg"
          variant={isRecording ? "destructive" : "default"}
          className={`relative w-[38px] h-[38px] rounded-lg transition-all duration-200 shadow-lg 
            ${ isRecording 
              ? "bg-red-500 hover:bg-red-600 shadow-red-500/25" 
              : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/25"
          }`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          ) : isRecording ? (
            <Square className="w-5 h-5 text-white" />
          ) : (
            <Mic className="w-5 h-5 text-white" />
          )}
        </Button>

        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap"
            >
              Recording...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            <Button
              size="lg"
              variant="ghost"
              className="w-[38px] h-[38px] rounded-lg bg-stone-700/50 hover:bg-stone-600/50 text-stone-300 hover:text-white transition-all duration-200"
              onClick={cancelRecording}
              disabled={disabled || isProcessing}
            >
              <X className="w-5 h-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

VoiceInput.displayName = "VoiceInput";

export default VoiceInput;
