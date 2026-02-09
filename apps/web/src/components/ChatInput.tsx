import { useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { Send, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  McpAttachMenu,
  AttachedResourcesBar,
  type AttachedResource,
} from "./McpAttachMenu";

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  attachedResources: AttachedResource[];
  onAttachResource: (resource: AttachedResource) => void;
  onRemoveResource: (uri: string) => void;
  onUsePrompt: (promptText: string) => void;
}

const MIN_HEIGHT = 52;
const MAX_HEIGHT = 320;

export function ChatInput({
  input,
  onInputChange,
  onSend,
  isLoading,
  attachedResources,
  onAttachResource,
  onRemoveResource,
  onUsePrompt,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset to auto so scrollHeight reflects the actual content height
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const clampedHeight = Math.min(
      Math.max(scrollHeight, MIN_HEIGHT),
      MAX_HEIGHT,
    );
    textarea.style.height = `${clampedHeight}px`;

    // Show scrollbar only when content exceeds max height
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  // Resize whenever input value changes (covers typing, clearing, programmatic sets)
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="border-t bg-muted/30 backdrop-blur"
    >
      <AttachedResourcesBar
        attachedResources={attachedResources}
        onRemove={onRemoveResource}
      />

      <div className="p-4 sm:p-6 pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
          className="flex items-end gap-2 sm:gap-3"
        >
          <div className="self-end mb-[5px]">
            <McpAttachMenu
              onAttachResource={onAttachResource}
              onUsePrompt={onUsePrompt}
              isLoading={isLoading}
            />
          </div>
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="w-full resize-none rounded-xl border-2 border-input bg-background px-4 py-3 sm:py-3.5 text-sm sm:text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200"
              rows={1}
              style={{
                minHeight: `${MIN_HEIGHT}px`,
                maxHeight: `${MAX_HEIGHT}px`,
              }}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={
              isLoading || (!input.trim() && attachedResources.length === 0)
            }
            className="h-[52px] w-[52px] shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">
            Enter
          </kbd>{" "}
          to send,{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">
            Shift+Enter
          </kbd>{" "}
          for new line
        </p>
      </div>
    </motion.div>
  );
}
