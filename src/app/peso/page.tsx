import { supabase } from '@/lib/supabase'
import { firmaDatos, firmaBase, extraPlanes, type PesoRecord, type PesoPlan, type PesoAnalisisGuardado } from '@/lib/peso'
import { listarPlanes } from '@/lib/peso-planes-server'
import type { PlanesLista } from '@/lib/peso-planes'
import { PERFIL_DEFAULT, extraAnalisis } from '@/lib/peso-perfil'
import { cargarPerfil, ERROR_LECTURA_PERFIL, type PerfilCarga } from '@/lib/peso-perfil-server'
import SiteHeader from '@/components/SiteHeader'
import { PESO_TABS, type PesoTab } from './contratos'
import PesoClient from './PesoClient'
import { BTN, COLOR, Eyebrow, Panel } from './ui'

export const revalidate = 0

export type { PesoRecord, PesoPlan }

// peso_registros es la tabla principal: un fallo de lectura (red, proyecto pausado, llave mal puesta)
// NO es lo mismo que «aún no hay mediciones». Si se devolviera [] sin más, la página pintaría el
// estado de primer uso y Andrés podría creer que perdió su historial (o capturar «la primera» de
// nuevo). Por eso se distingue con `fallo` y la página muestra un aviso en vez de datos vacíos.
async function getRegistros(): Promise<{ registros: PesoRecord[]; fallo: boolean }> {
  try {
    const { data, error } = await supabase
      .from('peso_registros')
      .select('*')
      .order('fecha', { ascending: true })
      // Desempate estable entre mediciones del mismo día: sin él «peso actual» y «última» podrían alternar
      // entre dos filas con la misma fecha. La ruta del análisis ordena igual, así la huella coincide.
      .order('created_at', { ascending: true })
    if (error) {
      // Solo código y mensaje al log del servidor; el detalle nunca llega al cliente.
      console.error('[peso] leer peso_registros:', error.code ?? '', error.message ?? '')
      return { registros: [], fallo: true }
    }
    return { registros: data ?? [], fallo: false }
  } catch (e) {
    console.error('[peso] leer peso_registros (excepción):', e instanceof Error ? e.message : String(e))
    return { registros: [], fallo: true }
  }
}

// Tolera que sql/peso-01-plan.sql aún no se haya corrido (error 42P01 = tabla no existe): la
// página sigue funcionando igual que antes, solo sin la sección de Plan/Resultados esperados.
async function getPlan(): Promise<PesoPlan | null> {
  const { data, error } = await supabase.from('peso_plan').select('*').eq('id', 'main').maybeSingle()
  if (error) return null
  return data
}

// Igual con sql/peso-02-analisis.sql: sin la tabla el análisis con IA se genera a demanda pero no
// queda guardado, y la página no lo regenera sola en cada visita (`persistencia: false`).
async function getAnalisis(): Promise<{ analisis: PesoAnalisisGuardado | null; persistencia: boolean }> {
  const { data, error } = await supabase.from('peso_analisis').select('*').eq('id', 'main').maybeSingle()
  if (error) return { analisis: null, persistencia: false }
  return { analisis: (data as PesoAnalisisGuardado | null) ?? null, persistencia: true }
}

// Y con sql/peso-03-planes.sql (rutinas y dietas en HTML): sin la tabla la pestaña se muestra con
// instrucciones en lugar de romper la página. listarPlanes ya no lanza, pero un fallo aquí nunca
// debe tumbar /peso, así que se envuelve igual. Si lanza NO se dice `disponible: false` (eso
// significaría «falta correr el SQL»): la tabla puede estar bien y solo haber fallado la consulta,
// así que se devuelve `error` para que la pestaña avise y ofrezca reintentar en vez de pintar vacío.
async function getPlanes(): Promise<PlanesLista> {
  try {
    return await listarPlanes()
  } catch {
    return { planes: [], disponible: true, error: 'No se pudieron cargar tus rutinas y dietas.' }
  }
}

// Y con sql/peso-04-perfil.sql (estatura, sexo, edad y hábitos): sin la tabla todo se calcula con los datos supuestos de
// siempre. cargarPerfil no lanza, pero un fallo aquí tampoco debe tumbar /peso, así que se envuelve igual. `error` NO
// significa «falta la tabla» ni «aún no hay perfil»: es que la lectura falló y no se sabe qué hay guardado.
async function getPerfil(): Promise<PerfilCarga> {
  try {
    return await cargarPerfil()
  } catch {
    return { perfil: PERFIL_DEFAULT, configurado: false, disponible: true, actualizado: null, error: ERROR_LECTURA_PERFIL }
  }
}

// Huella que la página pasa al cliente para saber si el análisis guardado sigue vigente. Se arma igual que
// la ruta del análisis: mediciones + meta + (planes en uso + perfil guardado). Lo último lo arma `extraAnalisis` con
// `extraPlanes`, las MISMAS funciones que usa la ruta: no se arma a mano para que no puedan divergir.
// Si la lectura de los planes (`planes.error`) o la del perfil (`perfil.error`) falló no se sabe qué hay en uso o
// guardado, y comparar contra «ninguno» daría un «Desactualizado» falso y una llamada a la IA en cada visita mientras
// dure el fallo. En ese caso se compara solo lo demás (`firmaBase`): si el análisis guardado coincide en mediciones y
// meta, se da por vigente.
function huellaAnalisis(
  registros: PesoRecord[], plan: PesoPlan | null, planes: PlanesLista, perfil: PerfilCarga, analisis: PesoAnalisisGuardado | null,
): string {
  if (!registros.length) return ''
  if (!planes.error && !perfil.error) {
    return firmaDatos(registros, plan, extraAnalisis(extraPlanes(planes.planes), perfil.perfil, perfil.configurado))
  }
  const base = firmaDatos(registros, plan)
  return typeof analisis?.firma === 'string' && firmaBase(analisis.firma) === base ? analisis.firma : base
}

// Pantalla de marca para cuando no se pudieron leer las mediciones. Es de servidor (sin estado):
// «Reintentar» es un enlace que recarga la página completa, así se vuelve a consultar Supabase.
function FalloLectura({ href }: { href: string }) {
  return (
    <>
      <SiteHeader title="Peso" subtitle="Salud · ADVL" />
      <main className="px-4 pt-6 pb-16 max-w-3xl mx-auto space-y-6">
        <div className="min-w-0">
          <Eyebrow>Salud · composición corporal</Eyebrow>
          <h1 className="serif mt-1" style={{ fontSize: 'clamp(32px, 9vw, 42px)', lineHeight: 1.04, fontWeight: 600, color: COLOR.navy }}>
            Tracking de peso
          </h1>
        </div>
        <Panel eyebrow="Sin conexión con tus datos" icon="⚠️" title="No se pudieron leer tus mediciones" accent={COLOR.warn}>
          <div role="alert">
            <p style={{ fontSize: 14, lineHeight: 1.55, color: COLOR.ink }}>
              Tus datos no se borraron: lo que falló fue la lectura de la base de datos, y suele ser algo
              pasajero. Inténtalo de nuevo en unos segundos.
            </p>
            <p className="mt-2" style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.muted }}>
              Mientras no cargue, evita registrar una medición: la página no puede confirmar tu historial.
            </p>
          </div>
          <div className="mt-4">
            {/* Recarga completa a propósito (no <Link>): garantiza una consulta nueva al servidor. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={href} className={`${BTN.base} ${BTN.gold} min-h-[46px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A6420]`}>
              Reintentar
            </a>
          </div>
        </Panel>
      </main>
    </>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Un parámetro de la URL puede llegar repetido (?tab=a&tab=b): se toma el primero.
const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function PesoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const [{ registros, fallo }, plan, { analisis, persistencia }, planes, perfil] = await Promise.all([getRegistros(), getPlan(), getAnalisis(), getPlanes(), getPerfil()])

  // ?plan=<uuid> abre directo ese plan en la pestaña de rutinas y dietas (si no se pidió otra pestaña).
  const planParam = primero(sp.plan)
  const planInicial = planParam && UUID.test(planParam) ? planParam : null
  const tabParam = primero(sp.tab)
  const tabValida = PESO_TABS.find(t => t.id === tabParam)?.id
  const tabInicial: PesoTab = tabValida ?? (planInicial ? 'planes' : 'resumen')

  if (fallo) {
    // Reintentar conserva a dónde iba la persona (el uuid y la pestaña ya están validados arriba).
    const volver = planInicial ? `/peso?plan=${planInicial}` : tabValida ? `/peso?tab=${tabValida}` : '/peso'
    return <FalloLectura href={volver} />
  }

  // `planes.error` = la tabla existe pero su lectura falló: la lista viene vacía por eso, no porque no
  // haya planes. Se pasa aparte para que el cliente no pinte «aún no tienes rutinas» ni pise con []
  // una lista buena que ya tenía en memoria (ver PesoClient/PesoPlanes).
  return (
    <PesoClient
      initialData={registros}
      initialPlan={plan}
      initialAnalisis={analisis}
      persistencia={persistencia}
      firma={huellaAnalisis(registros, plan, planes, perfil, analisis)}
      planes={planes.planes}
      planesDisponible={planes.disponible}
      planesError={planes.error ?? null}
      perfil={{ perfil: perfil.perfil, configurado: perfil.configurado, disponible: perfil.disponible, actualizado: perfil.actualizado }}
      perfilError={perfil.error}
      tabInicial={tabInicial}
      planInicial={planInicial}
    />
  )
}
