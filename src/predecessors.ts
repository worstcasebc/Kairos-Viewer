import { minutesPerDay } from './format';
import type { DependencyDto } from './model';
import type { Tree } from './tree';

/** Lag kompakt mit Vorzeichen: ganze Tage → d, ganze Stunden → h, sonst min (wie DependencyTokenIO). */
export function formatLag(lagMinutes: number, mpd: number): string {
  const abs = Math.abs(lagMinutes);
  const body = mpd > 0 && abs % mpd === 0 ? `${abs / mpd}d` : abs % 60 === 0 ? `${abs / 60}h` : `${abs}min`;
  return (lagMinutes < 0 ? '-' : '+') + body;
}

export function predecessorTexts(dependencies: DependencyDto[], tree: Tree, hoursPerDay: number): Map<string, string> {
  const mpd = minutesPerDay(hoursPerDay);
  const tokens = new Map<string, string[]>();
  for (const d of dependencies) {
    const predecessor = tree.byId.get(d.predecessorId);
    if (!predecessor || !tree.byId.has(d.successorId)) continue;
    let token = String(predecessor.nr);
    if (d.type !== 'FS') token += d.type;
    if (d.lagMinutes !== 0) token += formatLag(d.lagMinutes, mpd);
    const list = tokens.get(d.successorId) ?? [];
    list.push(token);
    tokens.set(d.successorId, list);
  }
  return new Map([...tokens].map(([id, list]) => [id, list.join(', ')]));
}
