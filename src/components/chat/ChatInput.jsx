
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSendMessage, isProcessing, disabled }) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isProcessing) {
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/80 backdrop-blur-md rounded-2xl p-4 border shadow-lg transition-colors duration-200">

      <form onSubmit={handleSubmit} className="flex gap-3">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask AXELA anything..."
          disabled={disabled || isProcessing} 
          className="bg-background text-foreground p-2 text-sm flex w-full border border-input ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 flex-1 placeholder:text-muted-foreground resize-none min-h-[50px] max-h-[120px] transition-colors duration-200 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={1} />

        
        <Button
          type="submit"
          size="lg"
          disabled={!message.trim() || isProcessing || disabled}
          className="bg-primary hover:bg-primary/90 text-primary-foreground border-none shadow-lg shadow-primary/25 px-6 transition-all duration-200">

          {isProcessing ?
          <Loader2 className="w-5 h-5 animate-spin" /> :

          <Send className="w-5 h-5" />
          }
        </Button>
      </form>
    </motion.div>);

}
