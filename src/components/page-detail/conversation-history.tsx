'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

interface ConversationHistoryProps {
  conversations: ConversationListItem[];
  currentId: string | null;
  isLoading: boolean;
  onSelect: (conversationId: string) => void;
  onRefresh: () => void;
}

export function ConversationHistory({
  conversations,
  currentId,
  isLoading,
  onSelect,
  onRefresh,
}: ConversationHistoryProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onRefresh();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title="Conversation history"
        >
          <History className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            No conversations yet
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            {conversations.map((conv) => (
              <DropdownMenuItem
                key={conv.id}
                className={`flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer ${
                  conv.id === currentId ? 'bg-accent' : ''
                }`}
                onClick={() => onSelect(conv.id)}
              >
                <span className="text-sm font-medium truncate w-full">
                  {conv.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(conv.updatedAt), {
                    addSuffix: true,
                  })}
                  {' \u00b7 '}
                  {conv._count.messages} messages
                </span>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
