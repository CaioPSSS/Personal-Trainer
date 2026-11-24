import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface HealthDisclaimerProps {
  compact?: boolean;
  className?: string;
}

export default function HealthDisclaimer({ compact = false, className = '' }: HealthDisclaimerProps) {
  return (
    <div
      role="note"
      className={`rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed ${className}`}
    >
      <ShieldAlert className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" />
      <p>
        {compact ? (
          <>
            <strong className="text-slate-300 font-semibold">Aviso de Saúde:</strong> As prescrições,
            substituições e métricas de prontidão são apoio algorítmico e não substituem avaliação médica,
            fisioterapêutica ou de profissional de educação física.
          </>
        ) : (
          <>
            <strong className="text-slate-300 font-semibold">Orientação Técnica &amp; Segurança:</strong>{' '}
            Os planos de treino, substituições de exercícios e análises de carga gerados pela plataforma têm
            caráter informativo e organizacional. Eles não constituem diagnóstico médico nem substituem o
            acompanhamento presencial de médico do esporte, fisioterapeuta ou profissional de educação física
            — interrompa qualquer exercício em caso de dor aguda ou desconforto articular.
          </>
        )}
      </p>
    </div>
  );
}
