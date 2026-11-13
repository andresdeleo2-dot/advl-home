// Lee el cuerpo de una petición SIN pasar de `max` bytes: corta la lectura en cuanto se excede. null = se pasó del tope.

export async function leerCuerpoAcotado(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  if (!req.body) return ''
  const lector = req.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > max) { try { await lector.cancel() } catch { /* ya se cortó */ } return null }
    trozos.push(value)
  }
  const todo = new Uint8Array(total)
  let pos = 0
  for (const t of trozos) { todo.set(t, pos); pos += t.byteLength }
  return new TextDecoder().decode(todo)
}
