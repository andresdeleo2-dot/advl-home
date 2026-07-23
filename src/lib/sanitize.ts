import DOMPurify from 'dompurify'

/** Etiquetas/atributos permitidos en las notas de tarea y descripciones de épica.
 *  Son notas escritas con contentEditable (negritas, listas, links), así que el
 *  set es chico a propósito: todo lo demás se descarta. */
const CFG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'a', 'code', 'blockquote', 'h3', 'h4'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
}

/** Limpia HTML antes de renderizarlo con dangerouslySetInnerHTML.
 *  En el servidor (sin DOM) devuelve texto plano sin etiquetas, por si acaso. */
export function sanitizeHtml(html: string | null | undefined): string {
  const s = html || ''
  if (!s) return ''
  if (typeof window === 'undefined') return s.replace(/<[^>]*>/g, '')
  const clean = DOMPurify.sanitize(s, CFG)
  return clean
}
