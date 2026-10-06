import { describe, expect, test } from 'vitest';
import { formatLag, predecessorTexts } from '../src/predecessors';
import { buildTree } from '../src/tree';
import { dep, demoProject } from './fixtures/demo';

describe('predecessorTexts', () => {
  const project = demoProject();
  const tree = buildTree(project.tasks);

  test('Demo-Projekt wie in Kairos', () => {
    const texts = predecessorTexts(project.dependencies, tree, 8);
    expect(texts.get('wireframes')).toBe('2');
    expect(texts.get('frontend')).toBe('3');
    expect(texts.get('backend')).toBe('5SS');
    expect(texts.get('integration')).toBe('5, 6');
    expect(texts.get('golive')).toBe('8');
    expect(texts.get('konzeption')).toBeUndefined();
  });

  test('Typ und Lag werden angehängt', () => {
    const texts = predecessorTexts(
      [dep('anforderungen', 'tests', 'FF', 960), dep('wireframes', 'tests', 'SF', -120)],
      tree,
      8,
    );
    expect(texts.get('tests')).toBe('2FF+2d, 3SF-2h');
  });

  test('Abhängigkeiten zu unbekannten Vorgängen werden übersprungen', () => {
    const texts = predecessorTexts([dep('gibt-es-nicht', 'tests'), dep('tests', 'auch-nicht')], tree, 8);
    expect(texts.size).toBe(0);
  });
});

describe('formatLag', () => {
  test.each([
    [960, '+2d'],
    [-480, '-1d'],
    [-120, '-2h'],
    [45, '+45min'],
    [90, '+90min'],
  ])('%i → %s', (lag, expected) => {
    expect(formatLag(lag, 480)).toBe(expected);
  });

  test('ohne Minuten pro Tag nur Stunden/Minuten', () => {
    expect(formatLag(480, 0)).toBe('+8h');
  });
});
