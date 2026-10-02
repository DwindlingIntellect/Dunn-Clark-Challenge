import type { PlayerInput } from './types';

/**
 * Compact run-length encoding of per-tick inputs:
 * [repeatCount, forward, right, jump(0/1), crouch(0/1), yaw(1e-4 rad)].
 */
export type EncodedInputs = [number, number, number, number, number, number][];

export function encodeInputs(inputs: PlayerInput[]): EncodedInputs {
  const out: EncodedInputs = [];
  for (const i of inputs) {
    const row: [number, number, number, number, number, number] = [
      1, i.forward, Math.round(i.right * 100) / 100, i.jump ? 1 : 0, i.crouch ? 1 : 0, Math.round(i.yaw * 1e4),
    ];
    const last = out[out.length - 1];
    if (last && last[1] === row[1] && last[2] === row[2] && last[3] === row[3] && last[4] === row[4] && last[5] === row[5]) last[0]++;
    else out.push(row);
  }
  return out;
}

export function decodeInputs(enc: EncodedInputs): PlayerInput[] {
  const out: PlayerInput[] = [];
  for (const [n, forward, right, jump, crouch, yaw] of enc) {
    for (let k = 0; k < n; k++) out.push({ forward, right, jump: jump === 1, crouch: crouch === 1, yaw: yaw / 1e4, pitch: 0 });
  }
  return out;
}
