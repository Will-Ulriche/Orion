/** Laisse le navigateur peindre une frame (spinner…) avant un gros travail synchrone. */
export const nextPaint = () => new Promise<void>(r => setTimeout(r, 0));