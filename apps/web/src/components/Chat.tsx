import { useState } from "react";
import { useChat } from "@/hooks/useChat";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { Card } from "./ui/card";

export function Chat() {
  const {
    messages,
    input,
    setInput,
    isLoading,
    sendMessage,
    clearChat,
    attachedResources,
    addAttachedResource,
    removeAttachedResource,
    handleUsePrompt,
  } = useChat();
  const [isConnectionsPanelOpen, setIsConnectionsPanelOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-background via-background to-muted/20">
      <ConnectionsPanel
        isOpen={isConnectionsPanelOpen}
        onClose={() => setIsConnectionsPanelOpen(false)}
      />

      <ChatHeader
        onOpenConnectionsPanel={() => setIsConnectionsPanelOpen(true)}
        onClearChat={clearChat}
        hasMessages={messages.length > 0}
      />

      <div className="flex-1 overflow-hidden flex items-center justify-center">
        <div className="h-full w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <Card className="flex h-full flex-col shadow-2xl border-2 bg-card/50 backdrop-blur">
            <MessageList messages={messages} onSuggestionClick={setInput} />

            <ChatInput
              input={input}
              onInputChange={setInput}
              onSend={sendMessage}
              isLoading={isLoading}
              attachedResources={attachedResources}
              onAttachResource={addAttachedResource}
              onRemoveResource={removeAttachedResource}
              onUsePrompt={handleUsePrompt}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
