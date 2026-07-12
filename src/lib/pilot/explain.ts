export function explain(description: string, context: string[] = []) {
  return [description, ...context];
}
