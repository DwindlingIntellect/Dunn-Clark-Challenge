import './render/colorMode';
import { initPhysics } from './sim/collision';
import { Game } from './game/game';
import { AudioSystem } from './audio/audio';

async function boot() {
  await initPhysics();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  const audio = new AudioSystem();
  wireAudio(game, audio);
  game.start();
  if (import.meta.env.DEV) {
    // The level editor (F2) only exists in dev builds; it saves through the dev server.
    const { installEditor } = await import('./editor/editor');
    const editor = installEditor(game);
    // Exposed for debugging and automated screenshots.
    Object.assign(window, { __game: game, __audio: audio, __editor: editor });
    // `?editor` in the URL (used by the launcher scripts) opens straight into the editor.
    if (new URLSearchParams(location.search).has('editor')) editor.open();
  }
}

function wireAudio(game: Game, audio: AudioSystem): void {
  // Browsers only allow audio after a user gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  audio.setVolume(game.save.settings.volume);
  game.onSettings = (s) => audio.setVolume(s.volume);
  game.onCourseLoaded = (c) => audio.setDrone(c.droneHz ?? 55);
  game.onSimEvent = (e) => {
    switch (e.type) {
      case 'footstep':
        audio.footstep(e.surface, e.speed);
        break;
      case 'land':
        audio.land(e.fallSpeed, e.surface);
        break;
      case 'jump':
        audio.jump();
        break;
      case 'wallrunStart':
      case 'wallJump':
        audio.whoosh();
        break;
      case 'mantle':
      case 'cling':
        audio.mantle();
        break;
    }
  };
  game.onRunEvent = (type) => {
    if (type === 'checkpoint') audio.chime();
    else if (type === 'finish') audio.bell();
    else if (type === 'respawn') audio.respawn();
  };
  game.onFrame = (dt, g) => {
    const p = g.player;
    audio.update(dt, {
      speed: g.simRunning ? p.speed : 0,
      sliding: p.mode === 'slide',
      airborne: !p.grounded,
      playing: g.simRunning,
    });
  };
}

boot();
