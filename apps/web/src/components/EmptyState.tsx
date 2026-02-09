import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

const SUGGESTIONS = [
  "List all broadcasts",
  "What tools do you have?",
  "How does async/await work?",
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[400px] items-center justify-center text-center animate-in fade-in duration-500">
      <div className="max-w-md space-y-6 px-4">
        <div className="mx-auto flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-2xl animate-float">
          <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
            Start a Conversation
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Ask me anything and watch my thinking process in real-time
          </p>
        </div>
        <div className="grid gap-2 sm:gap-3 text-left">
          {SUGGESTIONS.map((suggestion, i) => (
            <button
              key={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
              className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-foreground transition-all duration-200 text-left animate-in fade-in slide-in-from-left-4"
              style={{
                animationDelay: `${i * 100}ms`,
                animationFillMode: "both",
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
