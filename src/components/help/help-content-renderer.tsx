import Image from 'next/image';
import { Lightbulb } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { HelpContext } from '@/lib/help-content';

interface HelpContentRendererProps {
  context: HelpContext;
}

export function HelpContentRenderer({ context }: HelpContentRendererProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold">{context.title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{context.subtitle}</p>

      {context.screenshotPath && (
        <div className="mt-4 rounded-lg border overflow-hidden">
          <Image
            src={context.screenshotPath}
            alt={`${context.title} screenshot`}
            width={960}
            height={600}
            className="w-full h-auto"
            unoptimized
          />
        </div>
      )}

      {context.sections.map((section, idx) => (
        <div key={idx}>
          <h3 className="text-lg font-medium mt-6">{section.title}</h3>
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
            {section.content}
          </p>

          {section.metrics && section.metrics.length > 0 && (
            <div className="mt-3 rounded-md border overflow-x-auto">
              {/* w-px + whitespace-nowrap on Name/Source/Format shrink-wraps
                  those columns to their content width; Description claims
                  all remaining space without any explicit percentages */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-px whitespace-nowrap">Name</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs w-px whitespace-nowrap">Source</TableHead>
                    {section.metrics.some((m) => m.format) && (
                      <TableHead className="text-xs w-px whitespace-nowrap">Format</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.metrics.map((metric, mIdx) => (
                    <TableRow key={mIdx} className="even:bg-muted/50">
                      <TableCell className="text-sm font-medium whitespace-nowrap align-top">
                        {metric.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground align-top">
                        {metric.description}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-top">
                        {metric.source}
                      </TableCell>
                      {section.metrics!.some((m) => m.format) && (
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-top">
                          {metric.format || '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {section.tips && section.tips.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-medium mb-2">Tips</h4>
              <ul className="space-y-1.5">
                {section.tips.map((tip, tIdx) => (
                  <li key={tIdx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
