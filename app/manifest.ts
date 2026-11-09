import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal Trainer — Multi-Sport AI Coaching',
    short_name: 'Personal Trainer',
    description:
      'Plataforma multi-esportes com periodização de hipertrofia por IA, corrida integrada ao Strava e análise fisiológica avançada.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#6366f1',
    orientation: 'portrait',
    icons: [
      {
        src: '/personal_trainer.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/personal_trainer.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
