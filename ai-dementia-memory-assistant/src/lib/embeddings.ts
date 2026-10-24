const DIM = 128;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function bucket(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % DIM;
}

export function embedText(text: string): number[] {
  const vector = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;
  for (const token of tokens) {
    vector[bucket(token)] += 1;
  }
  return l2Normalize(vector);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const mag = Math.sqrt(sum);
  if (mag === 0) return vector.slice();
  return vector.map((value) => value / mag);
}

export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dim; i += 1) acc[i] += vector[i] ?? 0;
  }
  return l2Normalize(acc.map((value) => value / vectors.length));
}

export function topSimilar<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  limit = 5,
): Array<T & { score: number }> {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(query, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
