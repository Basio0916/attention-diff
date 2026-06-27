export function createRunId({ prNumber, headSha, diffId }) {
  const normalizedDiffId = diffId.startsWith("sha256:") ? diffId.slice("sha256:".length) : diffId;
  return `pr-${prNumber}-${headSha.slice(0, 7)}-${normalizedDiffId.slice(0, 8)}`;
}
