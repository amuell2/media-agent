import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { EmptyState } from "./EmptyState";
import type { Message } from "@/types/chat";

interface MessageListProps {
  messages: Message[];
  onSuggestionClick: (suggestion: string) => void;
}

export function MessageList({ messages, onSuggestionClick }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 p-4 sm:p-6 overflow-y-auto overflow-x-hidden"
    >
      {messages.length === 0 ? (
        <EmptyState onSuggestionClick={onSuggestionClick} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {messages.map((message, index) => (
            <ChatMessage key={message.id || `msg-${index}`} {...message} />
          ))}
        </div>
      )}
    </div>
  );
}
