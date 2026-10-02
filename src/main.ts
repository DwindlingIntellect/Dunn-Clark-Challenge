import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FixedLoop } from './core/loop';
import { Input } from './core/input';

// Milestone 1 scaffold: blank scene, fixed-timestep loop, input and pointer lock.
async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2030);
  scene.fog = new THREE.Fog(0x1a2030, 5, 60);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.6, 0);
  scene.add(new THREE.GridHelper(100, 50, 0x667788, 0x334455));
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x222222, 1));

  const input = new Input(canvas);
  canvas.addEventListener('click', () => input.requestLock());

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const loop = new FixedLoop({
    tick(dt) {
      const i = input.sample();
      const fwd = new THREE.Vector3(-Math.sin(i.yaw), 0, -Math.cos(i.yaw));
      const right = new THREE.Vector3(Math.cos(i.yaw), 0, -Math.sin(i.yaw));
      camera.position.addScaledVector(fwd, i.forward * 8 * dt).addScaledVector(right, i.right * 8 * dt);
    },
    render() {
      camera.rotation.set(input.pitch, input.yaw, 0);
      renderer.render(scene, camera);
    },
  });
  loop.start();
}

boot();
