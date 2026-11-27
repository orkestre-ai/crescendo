import { Suspense } from 'react';
import { ReportStartForm } from '@/components/reports/report-start-form';

export const metadata = { title: 'New report' };

export default function NewReportPage() {
  return (
    <Suspense>
      <ReportStartForm />
    </Suspense>
  );
}
