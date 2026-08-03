import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  message: string;
  onRetry: () => void;
}

export function ReportsErrorState({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertTriangle size={20} className="text-red-400" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">Couldn't load reports</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-sm">{message}</div>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-white/5 transition-colors"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}
