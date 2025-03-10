import { useEffect, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal } from "lucide-react";

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface LogViewerProps {
  logs: LogEntry[];
  title?: string;
  maxHeight?: string;
}

export function LogViewer({ logs, title = "Process Logs", maxHeight = "400px" }: LogViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    if (viewportRef.current) {
      const scrollContainer = viewportRef.current;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-500';
      case 'success':
        return 'text-green-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center space-y-0 pb-2">
        <CardTitle className="flex items-center text-base font-medium">
          <Terminal className="h-4 w-4 mr-2" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="rounded-md border bg-muted p-4" style={{ height: maxHeight }}>
          <div ref={viewportRef} className="font-mono text-sm">
            {logs.map((log, index) => (
              <div key={index} className={`py-1 ${getLogColor(log.type)}`}>
                <span className="opacity-50">[{log.timestamp}]</span> {log.message}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-muted-foreground text-center py-4">
                No logs to display. Start processing to see logs here.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 