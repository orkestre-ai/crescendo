'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GripVertical, Pencil, Trash2,
  BarChart3, TrendingUp, Globe, Smartphone, MousePointerClick,
  FileDiff, Search, Users, DollarSign, Target, Lightbulb,
  Zap, LineChart, PieChart, Activity,
  type LucideIcon,
} from 'lucide-react';
import { AVAILABLE_TOOLS } from '@/config/exploration-constants';

const ICON_MAP: Record<string, LucideIcon> = {
  BarChart3, TrendingUp, Globe, Smartphone, MousePointerClick,
  FileDiff, Search, Users, DollarSign, Target, Lightbulb,
  Zap, LineChart, PieChart, Activity,
};
import { useRouter } from 'next/navigation';

interface Exploration {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  enabledTools: string[];
}

interface ExplorationCardProps {
  exploration: Exploration;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}

export function ExplorationCard({
  exploration,
  onToggleEnabled,
  onDelete,
}: ExplorationCardProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exploration.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  // Map tool keys to display labels
  function getToolLabel(key: string): string {
    return AVAILABLE_TOOLS.find((t) => t.key === key)?.label ?? key;
  }

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes}>
        <Card className={isDragging ? 'shadow-lg' : ''}>
          <CardContent className="flex items-center gap-4 p-4">
            {/* Drag handle (per D-09) */}
            <button
              ref={setActivatorNodeRef}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none p-1 -m-1 rounded hover:bg-accent"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </button>

            {/* Icon */}
            {(() => {
              const Icon = ICON_MAP[exploration.icon];
              return Icon ? (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null;
            })()}

            {/* Name + description */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {exploration.name}
              </p>
              {exploration.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {exploration.description}
                </p>
              )}
              {/* Tool badges */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {exploration.enabledTools.map((key) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {getToolLabel(key)}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Enabled toggle (per D-05 / EXPL-05) */}
            <Switch
              checked={exploration.enabled}
              onCheckedChange={(checked) =>
                onToggleEnabled(exploration.id, checked)
              }
              aria-label={`${exploration.enabled ? 'Disable' : 'Enable'} ${exploration.name}`}
            />

            {/* Edit button (per D-11) */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                router.push(`/ai-config/explorations/${exploration.id}`)
              }
              aria-label={`Edit ${exploration.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            {/* Delete button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteDialog(true)}
              aria-label={`Delete ${exploration.name}`}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete exploration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{exploration.name}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(exploration.id);
                setShowDeleteDialog(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
