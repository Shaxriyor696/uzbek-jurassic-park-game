import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Game } from '../game/game';
import type { GameScene } from '../three/scene';

export const GameContext = createContext<{ game: Game; scene: GameScene | null } | null>(null);

/** Domen holati o‘zgarganda komponentni qayta chizadi. */
export function useGame(): Game {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('GameContext yo‘q');
  useSyncExternalStore(
    (fn) => ctx.game.subscribe(fn),
    () => ctx.game.version,
  );
  return ctx.game;
}

export function useScene(): GameScene | null {
  return useContext(GameContext)?.scene ?? null;
}

export function assetUrl(path: string) {
  return import.meta.env.BASE_URL + path;
}
