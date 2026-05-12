'use client';

import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { ConversationHistory } from './conversation-history';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

interface ConversationHeaderProps {
  title: string | null;
  conversationId: string | null;
  conversations: ConversationListItem[];
  isLoadingHistory: boolean;
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: () => void;
  onRefreshHistory: () => void;
}

export function ConversationHeader({
  title,
  conversationId,
  conversations,
  isLoadingHistory,
  onNew,
  onSelect,
  onDelete,
  onRefreshHistory,
}: ConversationHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 min-h-[44px]">
      {/* Title on the left */}
      <span className="flex-1 text-sm font-medium truncate text-foreground">
        {title || 'New conversation'}
      </span>

      {/* Action buttons on the right */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onNew}
          title="New conversation"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New
        </Button>

        <ConversationHistory
          conversations={conversations}
          currentId={conversationId}
          isLoading={isLoadingHistory}
          onSelect={onSelect}
          onRefresh={onRefreshHistory}
        />

        {conversationId && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                title="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete conversation?</DialogTitle>
                <DialogDescription>
                  This will permanently delete &ldquo;
                  {title || 'this conversation'}&rdquo; and all its messages.
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={onDelete}>
                    Delete
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
