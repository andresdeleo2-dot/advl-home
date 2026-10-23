import { PLAN_IFRAME_SANDBOX, esUuid, prepararHtmlEmbed, slugArchivo } from '@/lib/peso-planes'
import { obtenerPlanHtml } from '@/lib/peso-planes-server'

export const dynamic = 'force-dynamic'

// El documento que sube Andrés NO se sanitiza (se rompería su diseño); lo que lo contiene es la
// cabecera `Content-Security-Policy: sandbox …` SIN allow-same-origin: el documento corre con origen
// opaco, así que ni en el iframe ni abierto en una pestaña puede leer cookies o storage de esta app
// ni llamar a /api con la sesión. Estas cabeceras van en TODA respuesta de esta ruta, también en los avisos.
function cabeceras(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `sandbox ${PLAN_IFRAME_SANDBOX}; frame-ancestors 'self'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
    'X-Frame-Options': 'SAMEORIGIN',
    ...extra,
  }
}

// Página mínima y amable para los casos de error (texto fijo: nada del usuario entra aquí).
function aviso(titulo: string, texto: string) {
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titulo}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:48px 16px;background:#F6F4EE;color:#1B2635;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #E4DFD2;border-top:3px solid #C2933A;border-radius:14px;padding:28px 22px;box-shadow:0 6px 24px rgba(15,35,64,.08)}
h1{margin:0 0 8px;font:600 26px/1.2 "Cormorant Garamond",Georgia,serif;color:#0F2340}
p{margin:0;color:#4a5668}
</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p></main></body></html>`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const q = new URL(req.url).searchParams
  const embed = q.get('embed') === '1'
  const descargar = q.get('descargar') === '1'

  // Los avisos también pueden ir en el iframe: con embed se les agrega el reporte de alto.
  const pagina = (status: number, titulo: string, texto: string) => {
    const html = aviso(titulo, texto)
    return new Response(embed && esUuid(id) ? prepararHtmlEmbed(html, id) : html, { status, headers: cabeceras() })
  }

  // Id mal formado: ni se toca la base.
  if (!esUuid(id)) return pagina(404, 'No se encontró este plan', 'El enlace no es válido. Vuelve a Rutinas y dietas y ábrelo desde ahí.')

  const r = await obtenerPlanHtml(id)
  if (!r.ok) {
    if (r.fallo === 'no_existe') return pagina(404, 'No se encontró este plan', 'Puede que ya lo hayas borrado. Vuelve a Rutinas y dietas y elige otro.')
    if (r.fallo === 'sin_tabla') return pagina(503, 'Falta un paso de configuración', 'Corre sql/peso-03-planes.sql en Supabase para activar Rutinas y dietas.')
    return pagina(500, 'No se pudo abrir el plan', 'Algo falló en el servidor. Inténtalo de nuevo en un momento.')
  }

  const { titulo, html } = r.valor

  // Descarga: el HTML ORIGINAL, sin inyecciones (aunque venga embed=1).
  if (descargar) {
    return new Response(html, { headers: cabeceras({ 'Content-Disposition': `attachment; filename="${slugArchivo(titulo)}.html"` }) })
  }
  return new Response(embed ? prepararHtmlEmbed(html, id) : html, { headers: cabeceras() })
}
