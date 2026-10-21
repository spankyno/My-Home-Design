/**
 * Genera un identificador único con prefijo (p. ej. `wall-3fa9c1d2e4b7`).
 *
 * Usa `crypto.getRandomValues`, disponible también en contextos no seguros
 * (http por IP de red local), a diferencia de `crypto.randomUUID`.
 * Sustituye a los `${prefix}-${Date.now()}` repartidos por el código, que
 * colisionaban al crear varios elementos en el mismo milisegundo.
 */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${rand}`;
}
