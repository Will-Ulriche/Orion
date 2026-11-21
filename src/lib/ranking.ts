export const RANK_EPSILON = 1e-9;

export interface RankableRow {
  id: string;
  mean: number | null;
}

function sameMean(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= RANK_EPSILON;
}

export function competitionRanks<T extends RankableRow>(rows: readonly T[]): Map<string, number> {
  const ranks = new Map<string, number>();
  if (rows.length === 0) return ranks;

  if (rows.every((row) => row.mean === null)) {
    for (const row of rows) ranks.set(row.id, 0);
    return ranks;
  }

  const order = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.mean === null && b.row.mean === null) return a.index - b.index;
      if (a.row.mean === null) return 1;
      if (b.row.mean === null) return -1;
      const diff = b.row.mean - a.row.mean;
      return Math.abs(diff) <= RANK_EPSILON ? a.index - b.index : diff;
    });

  let rank = 1;
  let previous = order[0].row.mean;
  order.forEach(({ row }, index) => {
    if (index > 0 && !sameMean(previous, row.mean)) {
      rank = index + 1;
      previous = row.mean;
    }
    ranks.set(row.id, rank);
  });
  return ranks;
}
