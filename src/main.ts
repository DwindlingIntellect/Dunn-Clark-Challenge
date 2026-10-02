import './render/colorMode';
import { initPhysics } from './sim/collision';
import { Game } from './game/game';

async function boot() {
  await initPhysics();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  game.loadCourse(game.course);
  game.start();
  // Exposed for debugging and automated screenshots in dev builds.
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
}

boot();
