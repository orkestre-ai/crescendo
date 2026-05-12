import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppLayout } from '@/components/layout/app-layout';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
  weight: ['700', '800', '900'],
  style: ['italic'],
});

export const metadata: Metadata = {
  title: 'Crescendo',
  description: 'Crescendo by Orkestre AI — AI-powered optimization for nonprofit fundraising pages',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans bg-background text-foreground antialiased">
        <ThemeProvider>
          <AppLayout>{children}</AppLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
