import { buildCoverSvg, wrapText } from './cover-image.util';

describe('buildCoverSvg', () => {
  it('gera um SVG com a fonte e o título', () => {
    const svg = buildCoverSvg({
      title: 'PostgreSQL 19 Released',
      sourceName: 'InfoQ',
    });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('INFOQ');
    expect(svg).toContain('PostgreSQL 19 Released');
    expect(svg).toContain('minuto');
  });

  it('escapa o título (sem injeção de markup no SVG)', () => {
    const svg = buildCoverSvg({
      title: '<script>alert(1)</script> & "aspas"',
      sourceName: 'x',
    });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
  });

  it('não quebra com fonte nula (usa o fallback minutoDev)', () => {
    const svg = buildCoverSvg({ title: 'Sem fonte', sourceName: null });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('MINUTODEV');
  });
});

describe('wrapText', () => {
  it('mantém um título curto em uma linha', () => {
    expect(wrapText('Título curto', 30, 4)).toEqual(['Título curto']);
  });

  it('quebra em várias linhas respeitando o limite', () => {
    const lines = wrapText('uma frase um pouco mais longa para quebrar', 12, 4);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 12)).toBe(true);
  });

  it('trunca com reticências quando excede o número de linhas', () => {
    const lines = wrapText(
      'palavra outra mais outra ainda mais e continua sem parar de verdade',
      8,
      2,
    );

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});
