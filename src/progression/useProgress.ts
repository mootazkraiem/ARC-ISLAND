import { useEffect, useState } from 'react';
import { Progression } from './engine';
import { UserProgress } from './types';

/** Subscribes a component to the progression store. Re-renders whenever
 * recordCompletion() (or the day-recap consumer) changes the snapshot. */
export function useProgress(): UserProgress {
  const [, forceRender] = useState(0);
  useEffect(() => Progression.subscribe(() => forceRender((n) => n + 1)), []);
  return Progression.getSnapshot();
}
