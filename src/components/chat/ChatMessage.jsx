import React from "react";
import { Bot, User, Volume2, Copy, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function ChatMessage({ message, onSpeak }) {
  const isUser = message.sender === "user";
  const isVoice = message.type === "voice";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-4 mb-6 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center transition-colors duration-200">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
      )}
      
      <div className={`max-w-xs sm:max-w-md lg:max-w-lg xl:max-w-xl ${isUser ? "order-first" : ""}`}>
        <div
          className={`px-4 py-3 rounded-2xl transition-colors duration-200
            ${ isUser
              ? "bg-primary text-primary-foreground ml-auto"
              : "bg-card text-card-foreground border shadow-sm"
          }`}
        >
          {isVoice && (
            <div className="flex items-center gap-2 mb-2 text-xs opacity-75 text-muted-foreground">
              <Volume2 className="w-3 h-3" />
              <span>Voice message</span>
            </div>
          )}
          
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
          
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs opacity-60">
              {format(new Date(message.timestamp), 'HH:mm')}
            </span>
            
            {!isUser && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 hover:bg-muted transition-colors duration-200"
                  onClick={() => onSpeak(message.content)}
                >
                  <Volume2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 hover:bg-muted transition-colors duration-200"
                  onClick={copyToClipboard}
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 hover:bg-muted transition-colors duration-200"
                >
                  <ThumbsUp className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 hover:bg-muted transition-colors duration-200"
                >
                  <ThumbsDown className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center transition-colors duration-200">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      )}
    </motion.div>
  );
}