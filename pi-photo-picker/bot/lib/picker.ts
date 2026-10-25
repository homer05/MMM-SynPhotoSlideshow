import { randomInt } from "node:crypto";

export type PhotoCandidate = {
  path: string;
  synologyId?: number;
  created?: number;
};

export type CatalogPhoto = {
  path: string;
  synologyId: number | null;
  created: number | null;
};

export type CatalogState = {
  photos: CatalogPhoto[];
  shownPaths: string[];
  lastPath: string | null;
};

export type PickSuccess = {
  ok: true;
  path: string;
  synologyId: number | null;
  created: number | null;
  candidateCount: number;
  remainingAfterPick: number;
  cycleReset: boolean;
  source: "request" | "memory";
};

export type PickFailure = {
  ok: false;
  error: string;
};

export type PickOutcome = PickSuccess | PickFailure;

export function emptyCatalog(): CatalogState {
  return { photos: [], shownPaths: [], lastPath: null };
}

function normalize(photos: PhotoCandidate[]): CatalogPhoto[] {
  const seen = new Set<string>();
  const normalized: CatalogPhoto[] = [];

  for (const photo of photos) {
    const path = photo.path.trim();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    normalized.push({
      path,
      synologyId:
        typeof photo.synologyId === "number" ? photo.synologyId : null,
      created: typeof photo.created === "number" ? photo.created : null,
    });
  }

  return normalized;
}

function samePaths(left: CatalogPhoto[], right: CatalogPhoto[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const paths = new Set(left.map((photo) => photo.path));
  return right.every((photo) => paths.has(photo.path));
}

/**
 * Pick one photo uniformly at random.
 *
 * A repeated catalog skips paths already shown in this cycle. A new catalog
 * starts a new cycle. When every photo has been shown, the cycle restarts
 * and the photo shown immediately before is skipped when another one exists.
 */
export function pickFromState(
  previous: CatalogState,
  input: { photos?: PhotoCandidate[]; reset?: boolean },
  rng: (exclusiveMax: number) => number = (max) => randomInt(max),
): { state: CatalogState; result: PickOutcome } {
  const incoming =
    input.photos && input.photos.length > 0 ? normalize(input.photos) : null;
  let photos = previous.photos;
  let shown = [...previous.shownPaths];
  let lastPath = previous.lastPath;
  let source: "request" | "memory" = "memory";

  if (incoming) {
    source = "request";
    const unchanged = samePaths(incoming, photos);
    photos = incoming;
    if (!unchanged || input.reset) {
      shown = [];
      if (!unchanged) {
        lastPath = null;
      }
    }
  } else if (input.reset) {
    shown = [];
  }

  if (photos.length === 0) {
    return {
      state: { photos, shownPaths: shown, lastPath },
      result: {
        ok: false,
        error:
          "Kein Bildkatalog vorhanden. Die Diashow muss zuerst Fotos an den Agenten senden.",
      },
    };
  }

  let pool = photos.filter((photo) => !shown.includes(photo.path));
  let cycleReset = false;
  if (pool.length === 0) {
    cycleReset = true;
    shown = [];
    pool = photos.filter((photo) => photo.path !== lastPath);
    if (pool.length === 0) {
      pool = photos;
    }
  }

  const rawIndex = rng(pool.length);
  const index = Math.min(Math.max(rawIndex, 0), pool.length - 1);
  const choice = pool[index] ?? pool[0];
  if (!choice) {
    return {
      state: { photos, shownPaths: shown, lastPath },
      result: {
        ok: false,
        error: "Der Bildkatalog enthält keine wählbaren Fotos.",
      },
    };
  }

  shown.push(choice.path);

  return {
    state: { photos, shownPaths: shown, lastPath: choice.path },
    result: {
      ok: true,
      path: choice.path,
      synologyId: choice.synologyId,
      created: choice.created,
      candidateCount: pool.length,
      remainingAfterPick: photos.length - shown.length,
      cycleReset,
      source,
    },
  };
}
