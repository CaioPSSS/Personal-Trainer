import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Rastreador Metabólico Inteligente',
    description: 'Acompanhamento adaptativo de peso e calorias',
    };

    export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
          <html lang="pt-BR">
                <body className={`${inter.className} bg-slate-900 text-slate-100 min-h-screen`}>{children}</body>
                    </html>
                      );
                      }
                      