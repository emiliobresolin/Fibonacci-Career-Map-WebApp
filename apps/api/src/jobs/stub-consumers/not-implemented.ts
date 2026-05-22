/**
 * Helper that every stub consumer in this directory throws with.
 * Story 4-2 AC2: "consumers are stubbed with an explicit
 * 'not-implemented' handler that throws."
 *
 * The error message names the owning story so the operator + DLQ
 * triage know exactly which downstream story unblocks the queue.
 * Stub jobs are dead-on-arrival: they fail every attempt + every
 * retry + land in the DLQ. Production should NEVER enqueue against
 * a stub-only queue — the queue exists so future producers/consumers
 * can register at their own pace.
 */
export class NotImplementedError extends Error {
  readonly code = 'CONSUMER_NOT_IMPLEMENTED' as const;
  readonly queue: string;
  readonly owningStory: string;

  constructor(queue: string, owningStory: string) {
    super(
      `consumer for queue '${queue}' is not implemented yet — ships with Story ${owningStory}`,
    );
    this.name = 'NotImplementedError';
    this.queue = queue;
    this.owningStory = owningStory;
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
