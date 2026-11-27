import { BlockGallery } from '@/components/reports/block-gallery';

export const metadata = { title: 'Report blocks' };

export default function ReportBlocksGalleryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Report blocks</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every block a report can be built from, drawn with sample data. Switch to Print to see
          each one as it sits on a Letter page.
        </p>
      </div>
      <BlockGallery />
    </div>
  );
}
