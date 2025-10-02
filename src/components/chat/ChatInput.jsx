import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSendMessage, isProcessing, disabled }) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isProcessing && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative">

      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1 relative">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={disabled ? "Connecting to backend..." : "Ask AXELA anything..."}
            disabled={disabled || isProcessing}
            className="bg-stone-800/50 text-stone-100 px-4 py-2 text-sm border border-stone-700/50 focus:border-orange-500/50 focus-visible:ring-2 focus-visible:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-stone-800/30 flex-1 placeholder:text-stone-500 resize-none min-h-[38px] max-h-[160px] rounded-lg shadow-sm transition-all duration-200"
            rows={1} />
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={!message.trim() || isProcessing || disabled}
          className="bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-lg shadow-orange-500/20 h-[38px] px-5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:shadow-none">

          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </form>

      {disabled && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -top-12 left-0 right-0 flex items-center justify-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
          <Sparkles className="w-4 h-4" />
          <span className="font-medium">Backend is starting up...</span>
        </motion.div>
      )}
    </motion.div>
  );
}