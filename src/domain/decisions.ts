export type Choice = 'keep' | 'delete';
export type DecisionResult = 'kept' | 'deleted' | 'busy';

/** Serialize destructive requests before yielding, including repeated button/gesture input. */
export function createDecisionGate<T>(actions: {
  keep: (photo: T) => Promise<void>;
  delete: (photo: T) => Promise<void>;
}) {
  let busy = false;
  return async (photo: T, choice: Choice): Promise<DecisionResult> => {
    if (busy) return 'busy';
    busy = true;
    try {
      await actions[choice](photo);
      return choice === 'keep' ? 'kept' : 'deleted';
    } finally {
      busy = false;
    }
  };
}

export function swipeChoice(translation: number, width: number): Choice | null {
  'worklet';
  if (Math.abs(translation) < Math.min(width * 0.27, 110)) return null;
  return translation < 0 ? 'keep' : 'delete';
}

/** Keep the visible card stable while idle library refreshes replenish the buffer. */
export function mergePhotoQueue<T extends { id: string }>(previous: T[], fresh: T[], handled: ReadonlySet<string>): T[] {
  const freshIds = new Set(fresh.map(photo => photo.id));
  const retained = previous.filter(photo => freshIds.has(photo.id) && !handled.has(photo.id));
  const seen = new Set(retained.map(photo => photo.id));
  return [...retained, ...fresh.filter(photo => !seen.has(photo.id) && !handled.has(photo.id))];
}

export async function nextUnreviewed<T extends { id: string }>(
  read: (offset: number, limit: number) => Promise<T[]>,
  kept: ReadonlySet<string>,
  skipped: ReadonlySet<string>,
  limit = 40,
): Promise<T[]> {
  let offset = 0;
  const found: T[] = [];
  const seen = new Set<string>();
  while (found.length < 2) {
    const page = await read(offset, limit);
    for (const photo of page) {
      if (!kept.has(photo.id) && !skipped.has(photo.id) && !seen.has(photo.id)) {
        seen.add(photo.id);
        found.push(photo);
      }
    }
    if (page.length < limit) break;
    offset += page.length;
  }
  return found;
}
