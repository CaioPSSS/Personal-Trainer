import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Hypertrophy Coach — Personal Trainer com IA',
  description: 'Plataforma de coaching de hipertrofia com periodização por IA, tracking de treino e análise fisiológica avançada.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-slate-900 text-slate-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}