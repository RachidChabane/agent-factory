import { describe, expect, it, vi } from 'vitest';
import { emptySnapshot, eventAt } from '../test/minimal-snapshot.ts';
import { CockpitStore } from './store.ts';

const NOW = Date.parse('2026-10-12T10:00:00.000Z');

describe('CockpitStore', () => {
  it('seeds the activity feed from the snapshot and keeps the events it already holds', () => {
    const store = new CockpitStore();
    store.recordEvent(eventAt(NOW, 12));
    store.replaceSnapshot({ ...emptySnapshot(NOW, 10), activity: [eventAt(NOW, 9), eventAt(NOW, 8)] });
    expect(store.getState().activity.map((event) => event.sequence)).toEqual([12, 9, 8]);
    expect(store.getState().lastSequence).toBe(12);
  });

  it('records an event of the stream once, newest first', () => {
    const store = new CockpitStore();
    expect(store.recordEvent(eventAt(NOW, 11))).toBe(true);
    expect(store.recordEvent(eventAt(NOW, 12))).toBe(true);
    expect(store.recordEvent(eventAt(NOW, 11))).toBe(false);
    expect(store.getState().activity.map((event) => event.sequence)).toEqual([12, 11]);
    expect(store.getState().lastSequence).toBe(12);
  });

  it('keeps only the latest events', () => {
    const store = new CockpitStore();
    for (let sequence = 1; sequence <= 230; sequence += 1) store.recordEvent(eventAt(NOW, sequence));
    expect(store.getState().activity).toHaveLength(200);
    expect(store.getState().activity[0]?.sequence).toBe(230);
  });

  it('never moves the highest sequence backwards when an older snapshot arrives', () => {
    const store = new CockpitStore();
    store.recordEvent(eventAt(NOW, 40));
    store.replaceSnapshot(emptySnapshot(NOW, 10));
    expect(store.getState().lastSequence).toBe(40);
  });

  it('patches the snapshot in place and notifies once, or not at all when nothing changes', () => {
    const store = new CockpitStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.patchSnapshot((snapshot) => snapshot);
    expect(listener).not.toHaveBeenCalled();
    store.replaceSnapshot(emptySnapshot(NOW));
    listener.mockClear();
    store.patchSnapshot((snapshot) => ({ ...snapshot, resources: { ...snapshot.resources, schedulingPaused: true } }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot?.resources.schedulingPaused).toBe(true);
  });

  it('counts and bounds the rejected messages', () => {
    const store = new CockpitStore();
    for (let index = 0; index < 25; index += 1) store.reject('factory', `bad ${index}`, NOW);
    expect(store.getState().rejectedCount).toBe(25);
    expect(store.getState().recentRejections).toHaveLength(20);
    expect(store.getState().recentRejections[0]?.reason).toBe('bad 24');
  });
});
