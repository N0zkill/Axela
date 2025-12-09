import React from "react";
import { Bot, User, Copy, Check, AlertCircle, Volume2, VolumeX, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { loadAiMetadata, saveAiMetadata } from "@/lib/aiMetadataCache";

export default function ChatMessage({ message, onSaveScript }) {
  const [copied, setCopied] = React.useState(false);
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const isUser = message.role === "user" || message.sender === "user";
  const isError = message.success === false;
  let structuredData = null;
  let rawData = message?.aiMetadata ?? message?.data ?? null;

  if (rawData) {
    if (typeof rawData === "string") {
      try {
        structuredData = JSON.parse(rawData);
      } catch {
        // Ignore malformed JSON payloads
        structuredData = null;
      }
    } else {
      structuredData = rawData;
    }
  } else if (message?.id) {
    rawData = loadAiMetadata(message.id);
    if (rawData) {
      structuredData = rawData;
    }
  }

  React.useEffect(() => {
    if (message?.id && structuredData) {
      saveAiMetadata(message.id, structuredData);
    }
  }, [message?.id, structuredData]);

  const agentSteps = structuredData?.mode === "agent" && Array.isArray(structuredData?.steps)
    ? structuredData.steps
    : [];

  const aiCommandList = Array.isArray(structuredData?.commands) ? structuredData.commands : [];
  const instructionFallback = Array.isArray(structuredData?.instructions)
    ? structuredData.instructions
    : (
        typeof structuredData?.instructions_text === "string"
          ? structuredData.instructions_text.split(/;\s*/).filter(Boolean)
          : []
      );

  const canSaveScript =
    !isUser &&
    typeof onSaveScript === "function" &&
    (aiCommandList.length > 0 || instructionFallback.length > 0);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const speakMessage = async () => {
    if (isSpeaking) {
      // Stop speaking
      try {
        await fetch('http://127.0.0.1:8000/speak/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        setIsSpeaking(false);
      } catch (error) {
        console.error("Error stopping speech:", error);
      }
    } else {
      // Start speaking
      try {
        setIsSpeaking(true);
        console.log("Sending TTS request for:", message.content.substring(0, 50));
        
        const response = await fetch('http://127.0.0.1:8000/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message.content, blocking: false })
        });
        
        const result = await response.json();
        console.log("TTS API response:", result);
        
        if (!result.success) {
          console.error("TTS failed:", result.message);
          alert(`TTS Error: ${result.message}`);
          setIsSpeaking(false);
        } else {
          console.log("TTS started successfully");
          // Auto-stop after a delay (estimate based on text length)
          const estimatedDuration = (message.content.split(' ').length / 3) * 1000; // ~180 words/min
          setTimeout(() => {
            console.log("TTS timeout completed");
            setIsSpeaking(false);
          }, estimatedDuration);
        }
      } catch (error) {
        console.error("Error speaking message:", error);
        alert(`TTS Error: ${error.message}`);
        setIsSpeaking(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Bot className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      <div className={`max-w-2xl ${isUser ? "order-first" : ""}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl transition-all duration-200 ${
            isUser
              ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
              : isError
                ? "bg-red-500/10 text-red-300 border border-red-500/30"
                : "bg-stone-800/50 text-stone-100 border border-stone-700/50 shadow-sm"
          }`}
        >
          {isError && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="font-medium">Error</span>
            </div>
          )}

          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>

          {agentSteps.length > 0 && (
            <div className="mt-3 bg-stone-900/40 rounded-lg border border-stone-700/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-2 font-semibold">
                Agent steps
              </p>
              <div className="space-y-1.5">
                {agentSteps.map((step) => (
                  <div key={`agent-step-${message.id}-${step.step}`} className="flex items-start gap-2">
                    <span className="text-xs font-mono text-stone-500 pt-0.5">{step.step}.</span>
                    <div className="flex-1">
                      <p className="text-xs text-stone-100">
                        {step.description || step.command?.action || "Action"}
                      </p>
                      {step.reasoning && (
                        <p className="text-[11px] text-stone-500">{step.reasoning}</p>
                      )}
                      {step.result && (
                        <p className="text-[11px] text-stone-400">{step.result}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${step.success ? "text-emerald-400" : "text-red-400"}`}>
                      {step.success ? "OK" : "ERR"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isUser && (
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/10">
              <span className={`text-xs font-medium ${
                isError ? 'text-red-400/60' : 'text-stone-400'
              }`}>
                {format(new Date(message.timestamp), 'h:mm a')}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 hover:bg-stone-700/50 rounded-lg ${isSpeaking ? 'bg-orange-500/20' : ''}`}
                  onClick={speakMessage}
                  title={isSpeaking ? "Stop speaking" : "Speak message"}
                >
                  {isSpeaking ? (
                    <VolumeX className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-stone-400" />
                  )}
                </Button>

                {canSaveScript && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-stone-700/50 rounded-lg"
                    onClick={() => onSaveScript(message)}
                    title="Save as script"
                  >
                    <BookmarkPlus className="w-3 h-3 text-stone-400" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-stone-700/50 rounded-lg"
                  onClick={copyToClipboard}
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-orange-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-stone-400" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isUser && (
          <div className="text-xs text-stone-500 mt-1 text-right">
            {format(new Date(message.timestamp), 'h:mm a')}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-stone-700 flex items-center justify-center">
            <User className="w-4 h-4 text-stone-300" />
          </div>
        </div>
      )}
    </motion.div>
  );
}
