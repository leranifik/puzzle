/**
 * 2048 engine, tile-identity based.
 * Each tile has a stable `id`, so the UI can animate real movement.
 * `dying` tiles are absorbed halves of a merge: they keep sliding to the
 * merge target for one frame and are dropped on the next move / cleanup.
 */

export type Direction = "up" | "down" | "left" | "right";

export type Tile = {
  id: number;
  value: number;
  r: number;
  c: number;
  /** true right after this tile absorbed another one (pop animation) */
  merged?: boolean;
  /** true for the absorbed half of a merge (rendered beneath, then removed) */
  dying?: boolean;
};

export type G2048State = {
  tiles: Tile[];
  nextId: number;
  score: number;
  best: number;
  moves: number;
  seconds: number;
  over: boolean;
  reached2048: boolean;
};

export type MoveOutcome = "none" | "moved" | "merged";

const SIZE = 4;

export function boardOf(tiles: Tile[]): number[] {
  const board = new Array<number>(SIZE * SIZE).fill(0);
  for (const t of tiles) {
    if (!t.dying) board[t.r * SIZE + t.c] = t.value;
  }
  return board;
}

function liveTiles(tiles: Tile[]): Tile[] {
  return tiles.filter((t) => !t.dying);
}

function spawnTile(state: G2048State): G2048State {
  const board = boardOf(state.tiles);
  const empty: number[] = [];
  board.forEach((v, i) => v === 0 && empty.push(i));
  if (empty.length === 0) return state;
  const index = empty[Math.floor(Math.random() * empty.length)];
  const tile: Tile = {
    id: state.nextId,
    value: Math.random() < 0.9 ? 2 : 4,
    r: Math.floor(index / SIZE),
    c: index % SIZE,
  };
  return { ...state, tiles: [...state.tiles, tile], nextId: state.nextId + 1 };
}

export function new2048(best = 0): G2048State {
  let state: G2048State = {
    tiles: [],
    nextId: 1,
    score: 0,
    best,
    moves: 0,
    seconds: 0,
    over: false,
    reached2048: false,
  };
  state = spawnTile(spawnTile(state));
  return state;
}

export function canMove(board: number[]): boolean {
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const v = board[i * SIZE + j];
      if (v === 0) return true;
      if (j + 1 < SIZE && board[i * SIZE + j + 1] === v) return true;
      if (i + 1 < SIZE && board[(i + 1) * SIZE + j] === v) return true;
    }
  }
  return false;
}

/**
 * Returns the next state and what happened; `state` is unchanged when the
 * move does nothing ("none").
 */
export function move2048(
  state: G2048State,
  direction: Direction,
): { state: G2048State; outcome: MoveOutcome } {
  const tiles = liveTiles(state.tiles).map((t) => ({ ...t, merged: false }));

  // Group tiles into lines along the movement axis, ordered from the edge
  // the tiles slide towards.
  const lines: Tile[][] = Array.from({ length: SIZE }, () => []);
  for (const t of tiles) {
    const lineIndex = direction === "left" || direction === "right" ? t.r : t.c;
    lines[lineIndex].push(t);
  }
  const towardsEnd = direction === "right" || direction === "down";
  for (const line of lines) {
    line.sort((a, b) => {
      const pa = direction === "left" || direction === "right" ? a.c : a.r;
      const pb = direction === "left" || direction === "right" ? b.c : b.r;
      return towardsEnd ? pb - pa : pa - pb;
    });
  }

  const place = (t: Tile, lineIndex: number, slot: number) => {
    const pos = towardsEnd ? SIZE - 1 - slot : slot;
    if (direction === "left" || direction === "right") {
      t.r = lineIndex; t.c = pos;
    } else {
      t.c = lineIndex; t.r = pos;
    }
  };

  let movedAny = false;
  let mergedAny = false;
  let gained = 0;
  const out: Tile[] = [];

  lines.forEach((line, lineIndex) => {
    let slot = 0;
    for (let i = 0; i < line.length; i++) {
      const current = line[i];
      const next = line[i + 1];
      const prevR = current.r, prevC = current.c;

      if (next && next.value === current.value) {
        // merge: `current` survives doubled, `next` dies sliding to the same cell
        place(current, lineIndex, slot);
        current.value *= 2;
        current.merged = true;
        gained += current.value;
        mergedAny = true;

        place(next, lineIndex, slot);
        next.dying = true;
        out.push(next);
        i++; // skip absorbed tile
      } else {
        place(current, lineIndex, slot);
      }
      if (current.r !== prevR || current.c !== prevC || current.merged) movedAny = true;
      out.push(current);
      slot++;
    }
  });

  if (!movedAny) return { state, outcome: "none" };

  const score = state.score + gained;
  let next: G2048State = {
    ...state,
    tiles: out,
    score,
    best: Math.max(state.best, score),
    moves: state.moves + 1,
    reached2048: state.reached2048 || out.some((t) => !t.dying && t.value >= 2048),
  };
  next = spawnTile(next);
  next.over = !canMove(boardOf(next.tiles));
  return { state: next, outcome: mergedAny ? "merged" : "moved" };
}

/** Drop absorbed tiles once their slide animation has played. */
export function pruneDying(state: G2048State): G2048State {
  if (!state.tiles.some((t) => t.dying)) return state;
  return { ...state, tiles: liveTiles(state.tiles) };
}

/** Progress used for the cloud save badge: log-scale toward the 2048 tile. */
export function progress2048(state: G2048State): number {
  const values = liveTiles(state.tiles).map((t) => t.value);
  const max = Math.max(...values, 2);
  return Math.min(Math.log2(max) / 11, 1); // 2048 = 2^11
}

export function serialize2048(state: G2048State): string {
  return JSON.stringify({ ...state, tiles: liveTiles(state.tiles) });
}

export function deserialize2048(raw: string): G2048State | null {
  try {
    const parsed = JSON.parse(raw) as G2048State & { board?: number[] };

    // Legacy format (flat board array) — convert to tiles.
    if (!Array.isArray(parsed.tiles) && Array.isArray(parsed.board) && parsed.board.length === 16) {
      const tiles: Tile[] = [];
      let id = 1;
      parsed.board.forEach((value, i) => {
        if (value !== 0) tiles.push({ id: id++, value, r: Math.floor(i / SIZE), c: i % SIZE });
      });
      return {
        tiles,
        nextId: id,
        score: parsed.score ?? 0,
        best: parsed.best ?? 0,
        moves: parsed.moves ?? 0,
        seconds: parsed.seconds ?? 0,
        over: !canMove(parsed.board),
        reached2048: parsed.board.some((v) => v >= 2048),
      };
    }

    if (!Array.isArray(parsed.tiles)) return null;
    const tiles = parsed.tiles.filter(
      (t): t is Tile =>
        typeof t?.id === "number" && typeof t?.value === "number" &&
        t.r >= 0 && t.r < SIZE && t.c >= 0 && t.c < SIZE && !t.dying,
    ).map((t) => ({ ...t, merged: false }));
    return {
      tiles,
      nextId: parsed.nextId ?? Math.max(0, ...tiles.map((t) => t.id)) + 1,
      score: parsed.score ?? 0,
      best: parsed.best ?? 0,
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
      over: parsed.over ?? !canMove(boardOf(tiles)),
      reached2048: parsed.reached2048 ?? tiles.some((t) => t.value >= 2048),
    };
  } catch {
    return null;
  }
}
