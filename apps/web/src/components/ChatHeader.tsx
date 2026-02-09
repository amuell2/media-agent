import { Button } from "./ui/button";
import { Sparkles, Trash2, Plug } from "lucide-react";
import { motion } from "framer-motion";

interface ChatHeaderProps {
  onOpenConnectionsPanel: () => void;
  onClearChat: () => void;
  hasMessages: boolean;
}

export function ChatHeader({
  onOpenConnectionsPanel,
  onClearChat,
  hasMessages,
}: ChatHeaderProps) {
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 shadow-sm"
    >
      <div className="flex h-16 sm:h-20 w-full items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <motion.div
            animate={{
              rotate: [0, 10, -10, 10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatDelay: 3,
            }}
            className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg"
          >
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </motion.div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              AI Assistant
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Powered by GPT-OSS with MCP tools
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenConnectionsPanel}
            className="shrink-0"
            title="Connections & Knowledge"
          >
            <Plug className="h-5 w-5" />
          </Button>
          {hasMessages && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearChat}
              className="gap-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
