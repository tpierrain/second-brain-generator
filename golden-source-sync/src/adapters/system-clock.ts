// IClock on the real wall clock. Trivial by design — kept as a seam so the domain
// (watermarks, "synced at") stays deterministic under test (PRD §5).

import type { IClock } from '../domain/ports.js';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
