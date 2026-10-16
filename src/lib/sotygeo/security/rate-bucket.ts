export const rateBucket = (now: number, windowSec: number) => Math.floor(now / 1000 / windowSec);
