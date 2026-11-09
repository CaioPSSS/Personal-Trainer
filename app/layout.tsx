import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { ToastProvider } from './components/ToastProvider';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Personal Trainer — Multi-Sport AI Coaching',
  description: 'Plataforma multi-esportes com periodização de hipertrofia por IA, corrida integrada ao Strava e análise fisiológica avançada.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Personal Trainer',
  },
  icons: {
    icon: [
      { url: '/personal_trainer.svg', type: 'image/svg+xml' },
      { url: '/personal_trainer.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/personal_trainer.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/personal_trainer.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen antialiased`}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
