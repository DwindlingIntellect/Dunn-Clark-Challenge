import { initPhysics } from './sim/collision';
import { Game } from './game/game';
import { testCourse } from './levels/testCourse';

async function boot() {
  await initPhysics();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  game.loadCourse(testCourse);
  game.start();
}

boot();
