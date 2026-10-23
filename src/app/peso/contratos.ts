// Contratos entre los componentes de /peso. Cada componente tiene UN dueño (ver el mapa en el brief
// del workflow); estas firmas son el único acoplamiento entre ellos. No se cambian sin coordinar.

import type { PesoRecord, PesoPlan, PesoAnalisisGuardado } from '@/lib/peso'
import type { PesoPlanMeta } from '@/lib/peso-planes'

export type PesoTab = 'resumen' | 'progreso' | 'planes' | 'historial' | 'perfil'

export const PESO_TABS: { id: PesoTab; label: string; icon: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'progreso', label: 'Progreso', icon: '📈' },
  { id: 'planes', label: 'Rutinas y dietas', icon: '🏋️' },
  { id: 'historial', label: 'Historial', icon: '🗂️' },
  { id: 'perfil', label: 'Mi perfil', icon: '👤' },
]

/** Franja de estado al tope (siempre visible, encima de las pestañas). */
export type PesoHeroProps = { data: PesoRecord[]; plan: PesoPlan | null; onMedir: () => void; onIrA?: (tab: PesoTab) => void }

/** Análisis con IA (pestaña Resumen). `perfilConfigurado` = PerfilEstado.configurado (hay una fila guardada; sin él se
 *  trata como perfil sin completar). `perfilSinLeer` = la lectura del perfil falló y no hay uno bueno en memoria: el pie
 *  no puede decir ni «basado en tu perfil» ni «perfil sin completar», porque no se sabe cuál de los dos es cierto. */
export type PesoIAProps = {
  firma: string; inicial: PesoAnalisisGuardado | null; persistencia: boolean; nMediciones: number
  perfilConfigurado?: boolean
  perfilSinLeer?: boolean
}

/** Bloque de gráficos explicativos calculados en código (pestaña Resumen). Default export de PesoVisuales.tsx. */
export type PesoVisualesProps = { data: PesoRecord[]; plan: PesoPlan | null }

/** Meta + proyección (pestaña Resumen). Default export de PesoMeta.tsx. */
export type PesoMetaProps = { plan: PesoPlan | null; data: PesoRecord[] }

/** Tarjetas de métricas con mini-gráfica (pestaña Resumen). Default export de PesoTiles.tsx. */
export type PesoTilesProps = { data: PesoRecord[] }

/** Rango + gráfica + análisis de tendencia (pestaña Progreso). Autocontenido: el rango es estado local. Default export de PesoProgreso.tsx. */
export type PesoProgresoProps = { data: PesoRecord[]; plan: PesoPlan | null }

/** Tabla del historial (pestaña Historial). Default export de PesoHistorial.tsx. */
export type PesoHistorialProps = { data: PesoRecord[]; onEdit: (r: PesoRecord) => void; onDelete: (r: PesoRecord) => void; deletingId: string | null }

/** Plan de texto (rutina/dieta/notas) editable — vive dentro de la pestaña de planes. Default export de PesoPlanTexto.tsx. */
export type PesoPlanTextoProps = { plan: PesoPlan | null }

/** Biblioteca de rutinas y dietas en HTML (pestaña "Rutinas y dietas"). Default export de PesoPlanes.tsx.
 *  Además exporta `PlanesEnUso` para la pestaña Resumen. */
export type PesoPlanesProps = {
  inicial: PesoPlanMeta[]
  disponible: boolean          // false = falta correr sql/peso-03-planes.sql
  data: PesoRecord[]
  plan: PesoPlan | null
  /** Id del plan a mostrar al abrir la pestaña (p. ej. venido de "Ver" en la pestaña Resumen). */
  seleccionInicial?: string | null
  /** La tabla existe pero su lectura falló (`PlanesLista.error`): `inicial` viene vacía por eso, no porque no haya
   *  documentos. Con lista vacía se pinta un aviso con «Reintentar» en vez del estado vacío; nunca pisa una lista buena. */
  error?: string | null
}
export type PlanesEnUsoProps = {
  planes: PesoPlanMeta[]
  onVer: (id: string) => void
  onIrAPlanes: () => void
  /** Mismo significado que en PesoPlanesProps: con lista vacía y error no se invita a «subir el primero». */
  error?: string | null
}

/** Pestaña «Mi perfil»: formulario de los datos personales + «Tus números base» calculados.
 *  `estado` es lo que cargó el servidor (o lo último que se guardó); al guardar, el componente avisa con `onGuardado`
 *  para que PesoClient actualice el proveedor y todo se recalcule al instante. */
import type { PerfilEstado, PesoPerfil } from '@/lib/peso-perfil'
export type PesoPerfilProps = {
  estado: PerfilEstado
  data: PesoRecord[]
  /** Se llama con el perfil ya guardado (para que PesoClient actualice el proveedor y todo se recalcule al instante).
   *  `estado` es la respuesta del servidor (trae la marca de tiempo que puso la base). */
  onGuardado: (perfil: PesoPerfil, estado?: PerfilEstado) => void
  /** La lectura del perfil falló en el servidor (distinto de «aún no hay perfil»): `estado` trae los datos supuestos
   *  y NO se sabe si hay uno guardado, así que el formulario se bloquea con «Reintentar» para no pisarlo. */
  error?: string | null
}
