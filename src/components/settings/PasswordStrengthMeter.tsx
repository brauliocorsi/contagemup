import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const COMMON = [
  '123456', '1234567', '12345678', '123456789', 'password', 'passw0rd', 'qwerty',
  'abc123', '111111', '000000', 'iloveyou', 'admin', 'welcome', 'senha', 'senha123',
  'letmein', 'monkey', 'dragon', 'sunshine', 'football', 'contagem', 'estoque',
];

export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  checks: { label: string; ok: boolean }[];
}

export function evaluatePassword(password: string): PasswordStrength {
  const lower = password.toLowerCase();
  const hasPredictableSequence = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|a1b2|b2c3|c3d4|d4e5)/i.test(password);
  const checks = [
    { label: 'Mínimo 8 caracteres', ok: password.length >= 8 },
    { label: 'Letras maiúsculas e minúsculas', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Pelo menos um número', ok: /\d/.test(password) },
    { label: 'Pelo menos um símbolo', ok: /[^A-Za-z0-9]/.test(password) },
    {
      label: 'Sem palavras ou sequências previsíveis',
      ok: password.length > 0 && !COMMON.some((c) => lower.includes(c)) && !hasPredictableSequence,
    },
  ];

  let score = checks.filter((c) => c.ok).length;
  if (password.length >= 14) score += 1;
  if (!checks[4].ok) score = Math.min(score, 1);
  score = Math.max(0, Math.min(4, score - 1));

  const labels = ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'];
  return { score, label: labels[score], checks };
}

const BAR_COLORS = [
  'bg-destructive',
  'bg-destructive',
  'bg-yellow-500',
  'bg-emerald-500',
  'bg-emerald-600',
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = useMemo(() => evaluatePassword(password), [password]);

  if (!password) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i <= strength.score ? BAR_COLORS[strength.score] : 'bg-muted',
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'text-xs font-medium',
            strength.score <= 1 ? 'text-destructive' : strength.score === 2 ? 'text-yellow-600' : 'text-emerald-600',
          )}
        >
          {strength.label}
        </span>
      </div>

      <ul className="space-y-1">
        {strength.checks.map((c) => (
          <li
            key={c.label}
            className={cn('flex items-center gap-1.5 text-xs', c.ok ? 'text-emerald-600' : 'text-muted-foreground')}
          >
            {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
