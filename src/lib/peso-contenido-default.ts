// Los tres documentos de fábrica de «Rutinas y dietas». Si no hay nada guardado (o falta la tabla), la página muestra
// esto; «Restaurar original» borra lo guardado y vuelve aquí.

import type { Contenido, Doc, DocId } from './peso-contenido'
import { RUTINA_DEFAULT } from './peso-contenido-rutina'
import { DIETA_DEFAULT } from './peso-contenido-dieta'
import { PLAN_DEFAULT } from './peso-contenido-plan'

export const CONTENIDO_DEFAULT: Contenido = { rutina: RUTINA_DEFAULT, dieta: DIETA_DEFAULT, plan: PLAN_DEFAULT }

export const defaultDe = (id: DocId): Doc => CONTENIDO_DEFAULT[id]
