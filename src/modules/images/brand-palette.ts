/**
 * Paleta por fonte para a capa gerada a partir do título (quando não há imagem
 * real do post). As cores aproximam a identidade visual de cada marca; fontes
 * sem entrada recebem uma cor derivada do nome (hue estável por hash), mantendo
 * tudo dentro da linguagem do minutoDev (gradiente escuro + texto claro).
 */
export interface BrandTheme {
  /** Cor inicial do gradiente de fundo. */
  from: string;
  /** Cor final do gradiente de fundo. */
  to: string;
  /** Cor de destaque (ponto + rótulo da fonte). */
  accent: string;
}

const BRANDS: Record<string, BrandTheme> = {
  alura: { from: '#06142e', to: '#1f6feb', accent: '#2bd4ff' },
  medium: { from: '#0b0b0b', to: '#1a2b1a', accent: '#2ecc71' },
  openai: { from: '#07130f', to: '#0f6f5c', accent: '#19c39c' },
  deepmind: { from: '#071226', to: '#1a56c4', accent: '#4c8dff' },
  'hugging face': { from: '#2a1d00', to: '#7a5300', accent: '#ffd21e' },
  'dev.to': { from: '#0a0a0a', to: '#2a32a8', accent: '#9aa4ff' },
  'github trending rss': { from: '#0d1117', to: '#283039', accent: '#58a6ff' },
  'hacker news': { from: '#2a1400', to: '#8a3b00', accent: '#ff7a33' },
  infoq: { from: '#071a24', to: '#1f6a93', accent: '#55bbe8' },
  tabnews: { from: '#0a0a0a', to: '#242424', accent: '#d6d6d6' },
  'angular blog': { from: '#2a0a1e', to: '#9d1f8f', accent: '#ff5ac6' },
};

/** Identidade do minutoDev: fallback e moldura comum a todas as capas. */
export const MINUTODEV_THEME: BrandTheme = {
  from: '#0b1020',
  to: '#4338ca',
  accent: '#22d3ee',
};

export function resolveBrandTheme(
  sourceName: string | null | undefined,
): BrandTheme {
  const key = (sourceName ?? '').trim().toLowerCase();
  if (key && BRANDS[key]) return BRANDS[key];
  if (!key) return MINUTODEV_THEME;

  // Sem marca cadastrada: deriva um tom estável a partir do nome, mantendo a
  // base escura do minutoDev e variando só o matiz do gradiente/destaque.
  const hue = hashHue(key);

  return {
    from: MINUTODEV_THEME.from,
    to: `hsl(${hue} 55% 32%)`,
    accent: `hsl(${hue} 85% 65%)`,
  };
}

function hashHue(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }

  return hash;
}
