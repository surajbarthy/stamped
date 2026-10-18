// Sample posts that keep a new wall from looking empty. The pictures are made-up
// pages stamped with the real extension (site/samples/). They show after the real
// posts, say "Sample" on the wall, and drop off once the wall has enough real posts.
export const SAMPLES_UNTIL = 12;

const SAMPLE_TIME = Date.UTC(2026, 9, 18, 0, 10);

export const SAMPLES = ["travel", "cottage", "handshake", "movement", "mouse", "lasagna"].map((name, index) => ({
  id: `sample-${name}`,
  createdAt: SAMPLE_TIME - index * 60_000,
  image: `/samples/${name}.jpg`,
}));
