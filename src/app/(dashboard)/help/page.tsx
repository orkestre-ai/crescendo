import { HelpPageLayout } from '@/components/help/help-page-layout';
import { helpContent, type HelpContextKey } from '@/lib/help-content';

export const metadata = {
  title: 'Help - Crescendo',
};

const validContexts = Object.keys(helpContent) as HelpContextKey[];

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  const params = await searchParams;
  const contextParam = params.context as HelpContextKey | undefined;
  const initialContext =
    contextParam && validContexts.includes(contextParam) ? contextParam : undefined;

  return <HelpPageLayout initialContext={initialContext} />;
}
