import { describe, it, expect } from 'vitest';
import { EditorDoc, deleteKeys, duplicate, newCourseTemplate, renamePiece, uniqueId, setKeyTransform, normYaw } from '../src/editor/doc';
import { formatCourse } from '../src/levels/format';
import { courseById } from '../src/levels/index';

function sample() {
  const c = newCourseTemplate('draft', 'Draft');
  c.pieces.push({ id: 'a', type: 'block', pos: [0, -1, -50], size: [6, 1, 6] });
  c.pieces.push({ id: 'wall', type: 'block', pos: [-3.5, -5, -60], size: [1, 10, 10], tags: ['wallrun'] });
  c.jumpLinks.push({ from: 'floor', to: 'a', move: 'run-jump' }, { from: 'a', to: 'floor', move: 'wallrun', via: 'wall' });
  return c;
}

describe('editor document', () => {
  it('undoes and redoes a gesture as one step and tracks dirtiness', () => {
    const doc = new EditorDoc(sample());
    expect(doc.dirty).toBe(false);
    doc.begin();
    doc.course.pieces[1].pos = [1, -1, -50];
    doc.touch();
    doc.course.pieces[1].pos = [2, -1, -50];
    doc.end();
    expect(doc.dirty).toBe(true);
    doc.undo();
    expect(doc.course.pieces[1].pos).toEqual([0, -1, -50]);
    expect(doc.dirty).toBe(false);
    doc.redo();
    expect(doc.course.pieces[1].pos).toEqual([2, -1, -50]);
    doc.markSaved();
    expect(doc.dirty).toBe(false);
  });

  it('does not record no-op gestures', () => {
    const doc = new EditorDoc(sample());
    doc.begin();
    doc.end();
    expect(doc.canUndo).toBe(false);
  });

  it('duplicates with fresh ids and deletes with link cleanup', () => {
    const c = sample();
    const keys = duplicate(c, ['p:1', 'cp:0'], [2, 0, 0]);
    expect(keys).toEqual(['p:3', 'cp:1']);
    expect(c.pieces[3].id).toBe('a2');
    expect(c.pieces[3].pos).toEqual([2, -1, -50]);
    deleteKeys(c, ['p:2', 'start']);
    expect(c.pieces.find((p) => p.id === 'wall')).toBeUndefined();
    expect(c.jumpLinks).toEqual([{ from: 'floor', to: 'a', move: 'run-jump' }]);
    expect(c.start).toBeDefined();
  });

  it('renames ids through jump links and generates unique ids', () => {
    const c = sample();
    renamePiece(c, 2, 'screen');
    expect(c.jumpLinks[1].via).toBe('screen');
    expect(uniqueId(c, 'floor')).toBe('floor2');
    expect(uniqueId(c, 'ramp')).toBe('ramp');
  });

  it('snaps yaw and drops a zero rotation from the file', () => {
    const c = sample();
    setKeyTransform(c, 'p:1', [1.23456, 0, -0.00001], 370);
    expect(c.pieces[1].pos).toEqual([1.2346, 0, 0]);
    expect(c.pieces[1].rot).toBe(10);
    setKeyTransform(c, 'p:1', [1, 0, 0], 360);
    expect(c.pieces[1].rot).toBeUndefined();
    expect(normYaw(-190)).toBe(170);
  });

  it('round-trips a real course through the file format unchanged', () => {
    const course = courseById('narthex')!;
    const doc = new EditorDoc(course);
    expect(doc.text()).toBe(formatCourse(course));
    expect(JSON.parse(doc.text())).toEqual(JSON.parse(JSON.stringify(course)));
  });
});

import { Ray, Vector3, PerspectiveCamera } from 'three';
import { pickRay, keysInRect } from '../src/editor/pick';

describe('editor picking', () => {
  it('hits rotated pieces, repeat copies and markers, nearest first', () => {
    const c = newCourseTemplate('draft', 'Draft');
    c.pieces.push({ id: 'beam', type: 'block', pos: [10, 0, 0], size: [8, 1, 1], rot: 90 });
    c.pieces.push({ type: 'pillar', pos: [-10, 0, 0], size: [1, 4, 1], repeat: { count: 3, step: [0, 0, -5] } });
    const down = (x: number, z: number) => new Ray(new Vector3(x, 20, z), new Vector3(0, -1, 0));
    // Rotated 90°: the 8 m beam runs along Z, so (10, 3) hits and (13, 0) misses.
    expect(pickRay(c, down(10, 3))?.key).toBe('p:1');
    expect(pickRay(c, down(13, 0))?.key).not.toBe('p:1');
    expect(pickRay(c, down(-10, -10))?.key).toBe('p:2');
    expect(pickRay(c, down(0, 0))?.key).toBe('start');
    expect(pickRay(c, down(0, -10))?.key).toBe('p:0');
    expect(pickRay(c, down(50, 50))).toBeNull();
  });

  it('box-selects by projected centre', () => {
    const c = newCourseTemplate('draft', 'Draft');
    const cam = new PerspectiveCamera(90, 1, 0.1, 500);
    cam.position.set(0, 30, 0);
    cam.lookAt(0, 0, 0.0001);
    cam.updateMatrixWorld();
    const keys = keysInRect(c, cam, -0.2, -0.2, 0.2, 0.2);
    expect(keys).toContain('start');
    expect(keys).not.toContain('finish');
  });
});
