// Collision-safe ID minting for runtime-created entities (outputs, feed posts,
// comments, custom paths/skills, outcomes).
//
// Previously these were minted as `prefix_${Date.now()}`, which collides when two
// entities are created in the same millisecond (rapid taps, batch creation, or two
// logOutput calls in one tick). Colliding ids are catastrophic for id-keyed code:
// the feed's react/comment sync (`find(f => f.id === p.id)`) resolved BOTH posts to
// the first match and silently overwrote one user post with a copy of the other,
// and the Supabase union-merge dedupes by id, dropping legitimate rows.
//
// The prefix is kept purely for debuggability — nothing parses it.
export function uid(prefix: string): string {
  const c = globalThis.crypto;
  const unique = c?.randomUUID
    ? c.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${unique}`;
}
