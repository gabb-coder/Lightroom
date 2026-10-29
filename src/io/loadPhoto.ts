export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export function isAcceptedFile(file: Pick<File, 'type'>): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}
