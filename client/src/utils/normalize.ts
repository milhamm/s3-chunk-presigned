export const normalize = <T, U extends keyof T>(
  arr: T[],
  key: U
): Record<string, T> => {
  return arr.reduce((acc, curr) => {
    acc[curr[key] as string] = curr;
    return acc;
  }, {} as Record<string, T>);
};
