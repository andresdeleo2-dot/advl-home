import type { Epica, EpicaFeature, EpicaTask, Iniciativa } from './supabase'

/* "Alcance" de las vistas de tareas del Roadmap: qué tareas de una épica pasan el filtro de feature e
   iniciativa (la cascada Épica → Feature → Iniciativa). Una referencia que ya no resuelve (feature o
   iniciativa borrados) cuenta como "sin asignar", igual que en los chips de Épicas. Puro. */

export type Alcance = {
  featKey: string            // 'todas' | 'sin' | id del feature
  iniKey: string             // 'todas' | 'sin' | id de la iniciativa
  featSel?: EpicaFeature
  iniSel?: Iniciativa
  /** Iniciativas del feature elegido (para el siguiente nivel de la cascada). */
  inis: Iniciativa[]
  pasa: (t: EpicaTask) => boolean
}

/** `ep` sin definir = "todas las épicas": los filtros de feature/iniciativa no aplican (son de UNA épica). */
export function alcanceDe(ep: Epica | undefined, featureFilter: string, iniFilter: string): Alcance {
  const feats = ep?.features || []
  const featSel = ep && featureFilter !== 'todas' && featureFilter !== 'sin' ? feats.find(f => f.id === featureFilter) : undefined
  const featKey = !ep ? 'todas' : featureFilter === 'sin' ? 'sin' : featSel ? featSel.id : 'todas'
  const inis = featSel?.iniciativas || []
  const iniSel = featSel && iniFilter !== 'todas' && iniFilter !== 'sin' ? inis.find(i => i.id === iniFilter) : undefined
  const iniKey = !featSel ? 'todas' : iniFilter === 'sin' ? 'sin' : iniSel ? iniSel.id : 'todas'
  const pasa = (t: EpicaTask) => {
    const featOk = !!t.featureId && feats.some(f => f.id === t.featureId)
    if (featKey === 'sin') { if (featOk) return false }
    else if (featKey !== 'todas' && t.featureId !== featKey) return false
    if (iniKey === 'sin') return !t.iniciativaId || !inis.some(i => i.id === t.iniciativaId)
    if (iniKey !== 'todas') return t.iniciativaId === iniKey
    return true
  }
  return { featKey, iniKey, featSel, iniSel, inis, pasa }
}
