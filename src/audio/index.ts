import type { Game } from '../game/game';
import type { SoundId } from './audioConfig';
import { AudioDirector } from './audioDirector';
import { AudioEngine } from './audioEngine';

/**
 * Sahifada yagona audio tizimi (sahna yoki shahar qayta ochilsa ham ikkinchisi yaratilmaydi — ovozlar ko‘paymaydi).
 */
let engine: AudioEngine | null = null;
let director: AudioDirector | null = null;

export function startAudio(game: Game): AudioDirector {
  engine ??= new AudioEngine(import.meta.env.BASE_URL);
  director?.dispose();
  director = new AudioDirector(game, engine);
  return director;
}

export function stopAudio() {
  director?.dispose();
  director = null;
}

export function audioEngine(): AudioEngine | null {
  return engine;
}

/** Interfeys ovozi (bir harakatga bitta) */
export function uiSound(id: SoundId) {
  director?.ui(id);
}
