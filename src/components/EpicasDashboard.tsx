'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { sanitizeHtml } from '@/lib/sanitize'
import { sameTask } from '@/lib/tareas'
import Link from 'next/link'
import type { Epica, EpicaMilestone, EpicaRoutine, EpicaTask, EpicaLink, EpicaTaskLink, EpicaSubtask, EpicaProgressEntry, EpicaRepeat, EpicaDayPlan } from '@/lib/supabase'
import { useFocusSession } from './FocusSession'
import SectionNav from './SectionNav'
import HeaderStats from './HeaderStats'
import CumplesWidget from './CumplesWidget'
import ExcepcionalesWidget from './ExcepcionalesWidget'
import BirthdayCelebration from './BirthdayCelebration'
import FavoritosStrip from './FavoritosStrip'
import { WidgetsDropdown, SpecialsDropdown } from './HeaderWidgets'
import {
  ARCHIVED,
  DAYNAMES,
  DAYS,
  DEFAULT_PREFS,
  DIF_WEIGHT,
  Dif,
  DifDots,
  EPIC_STATUSES,
  EpicDraft,
  GripIcon,
  LINK_TYPES,
  PICK_STATUSES,
  PREFS_KEY,
  PRIO_RANK,
  Prefs,
  Prio,
  PrioBars,
  ProgressRing,
  REPEAT_TONE,
  SWATCHES,
  TASK_STATUSES,
  TS_ORDER,
  addDays,
  addMonth,
  addMonths,
  cap,
  clickable,
  clone,
  dateLabel,
  dayNum,
  daysUntil,
  difStyle,
  doneCount,
  dueTone,
  fmtDue,
  getRoutineWeek,
  greeting,
  loadPrefs,
  mondayISO,
  monthGrid,
  monthLabel,
  monthWeekMondays,
  nextOccurrence,
  completeRecurring,
  norm,
  normalize,
  pctOf,
  pendCount,
  popoverStyle,
  primaryDash,
  prioFromDue,
  prioStyle,
  progressDeltas,
  relLong,
  relShort,
  repeatLabel,
  routineStats,
  spanLabel,
  statusStyle,
  taskCount,
  taskStyle,
  taskWeight,
  diasTrabajados,
  normalizeMilestone,
  milestoneOfTask,
  Donut,
  milestoneProgress,
  milestoneDone,
  MULTIDIA_TONE,
  todayISO,
  typeColor,
  hexA,
  isoToLocalInput,
  safeUrl,
  uid,
  upsertProgressPct,
  weekRangeLabel,
  weekdayAbbr,
  weekendISO,
} from './epicas/core'

export default function EpicasDashboard({ initialEpics }: { initialEpics: Epica[] }) {
  const [epics, setEpics] = useState<Epica[]>(initialEpics.map(normalize))
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [today, setToday] = useState<string>(todayISO())
  const todayRef = useRef(today)
  const [featuredId, setFeaturedId] = useState<string | null>(initialEpics[0]?.id ?? null)
  const [editing, setEditing] = useState<EpicDraft | null>(null)
  const [editMode, setEditMode] = useState<'new' | 'edit' | null>(null)
  const [toast, setToast] = useState<{ msg: string; error?: boolean; action?: { label: string; fn: () => void } } | null>(null)
  const [sortBy, setSortBy] = useState<'Pendientes' | 'Progreso' | 'Nombre'>('Pendientes')
  const [compact, setCompact] = useState(false)
  const [showRowKpi, setShowRowKpi] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [showArchivedEpic, setShowArchivedEpic] = useState(false)   // ver archivadas dentro de la épica
  const [estadoFilter, setEstadoFilter] = useState<'activas' | 'archivadas' | 'todas'>('activas')
  const [catFilter, setCatFilter] = useState<string>('todas')
  const [taskEdit, setTaskEdit] = useState<{ epicId: string; tid: string | null } | null>(null)
  // Épica DESTINO del editor. Se guarda aparte de taskEdit.epicId (que es la de origen)
  // porque el índice de la tarea sólo tiene sentido dentro del array de su épica actual.
  const [taskEditTarget, setTaskEditTarget] = useState<string>('')
  const [taskView, setTaskView] = useState<{ eId: string; tid: string } | null>(null) // vista de tarea (solo lectura)
  const [taskDraft, setTaskDraft] = useState<EpicaTask>({ t: '', status: 'Por hacer', due: '', note: '', links: [] })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [routineWeek, setRoutineWeek] = useState<string>(() => mondayISO(todayISO())) // lunes de la semana de rutinas en vista
  const [routineStat, setRoutineStat] = useState<{ eId: string; ri: number } | null>(null) // popup de info de rutina

  /* ─── Plan de hoy ─── */
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ] = useState('')
  const [pickerEpica, setPickerEpica] = useState<string>('todas')
  const [prioMenu, setPrioMenu] = useState<string | null>(null)   // key con popover de prioridad abierto
  const [rowMenu, setRowMenu] = useState<string | null>(null)     // key con menú ⋯ abierto
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)  // ancla del popover (⋯ o prioridad) abierto
  const [doneOpen, setDoneOpen] = useState(true)
  const [planSort, setPlanSort] = useState<'plan' | 'prioridad' | 'entrega' | 'avance' | 'epica'>('plan')  // orden del enfoque
  const [planFilter, setPlanFilter] = useState<'todas' | 'alta' | 'vencidas' | 'avance' | 'estancada' | 'multidia' | 'arrastre'>('todas')          // filtro del enfoque
  const [dayEpica, setDayEpica] = useState<string>('todas')                                                // filtro por épica en el enfoque de día
  const [tasksExpanded, setTasksExpanded] = useState(false)   // ver todas las tareas activas de la épica destacada
  const [epicSort, setEpicSort] = useState<'grupo' | 'manual' | 'prioridad' | 'entrega' | 'hacer' | 'progreso' | 'nombre'>('grupo')
  const [epicFilter, setEpicFilter] = useState<'todas' | 'planeadas' | 'sinplan' | 'vencidas' | 'alta' | 'estancada' | 'multidia' | 'arrastre'>('todas')
  const [epicObjFilter, setEpicObjFilter] = useState<string>('todas')  // filtro por objetivo dentro de la épica
  const [epicDay, setEpicDay] = useState<string>('')                   // filtro GLOBAL por fecha "Hacer" (día ancla; '' = sin filtro)
  const [epicSpan, setEpicSpan] = useState<'dia' | 'semana'>('dia')    // el filtro global cubre un día o toda su semana
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [backlogSort, setBacklogSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' })
  const [backlogDone, setBacklogDone] = useState(false)
  const [backlogFEpica, setBacklogFEpica] = useState<string>('todas')
  const [backlogFStatus, setBacklogFStatus] = useState<string>('todas')
  const [backlogFPrio, setBacklogFPrio] = useState<string>('todas')
  const [backlogQ, setBacklogQ] = useState('')                 // búsqueda de texto en el backlog
  const [backlogView, setBacklogView] = useState<'tabla' | 'tablero' | 'tarjetas' | 'semana' | 'detalle' | 'calendario'>('tabla')
  const [backlogWeek, setBacklogWeek] = useState<string>('')        // lunes ancla de la vista Semana del backlog ('' = esta semana)
  const [mdSel, setMdSel] = useState<{ eId: string; tid: string } | null>(null)  // tarea seleccionada en la vista maestro/detalle
  const [mdRange, setMdRange] = useState<'todas' | 'semana' | '2sem' | 'mes'>('todas')  // rango de fecha en Detalle/Agenda del Enfoque
  const [mdDay, setMdDay] = useState<string>('')                    // filtro por día concreto (L-D) en Detalle/Agenda del Enfoque
  const [workFilter, setWorkFilter] = useState<'' | 'plan' | 'openworked' | 'unworked'>('')  // filtro por estado de trabajo del día (Día/Detalle): planeadas · trabajadas sin terminar · sin trabajar
  const [dayCloseOpen, setDayCloseOpen] = useState(false)          // modal "Cerrar el día" (retro rápida del día)
  const [epicBudgets, setEpicBudgets] = useState<Record<string, number>>({})  // presupuesto de horas/semana por épica (localStorage, sin migración)
  const [diaryOpen, setDiaryOpen] = useState(false)                // modal "Diario de trabajo" (feed de notas+comentarios)
  const [diaryEpica, setDiaryEpica] = useState<string>('todas')    // filtro de épica del diario
  const [objsOpen, setObjsOpen] = useState(false)                  // modal "Objetivos en riesgo"
  const [weekCloseOpen, setWeekCloseOpen] = useState(false)        // modal "Cerrar la semana"
  const [triageOpen, setTriageOpen] = useState(false)              // modal "Triage" (tareas sin fecha)
  const [calPanelMonth, setCalPanelMonth] = useState('')            // mes de la vista Calendario+panel ('' = este mes)
  const [cpSinOpen, setCpSinOpen] = useState(true)                  // drop-down "Sin fecha" del panel
  const [cpAgOpen, setCpAgOpen] = useState(false)                   // drop-down "Agendadas" del panel
  const [boardDrag, setBoardDrag] = useState<string | null>(null)      // key de la tarjeta arrastrada
  const [boardOverCol, setBoardOverCol] = useState<string | null>(null)
  const boardDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const [backlogSel, setBacklogSel] = useState<Set<string>>(new Set())
  const [backlogEdit, setBacklogEdit] = useState(false)        // edición inline tipo Excel en el backlog
  const [editCell, setEditCell] = useState<{ key: string; field: 'title' | 'progress'; val: string } | null>(null) // celda en edición (input controlado)
  const [logExpanded, setLogExpanded] = useState(false)        // ver toda la bitácora de avance
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [planSel, setPlanSel] = useState<Set<string>>(new Set())   // selección múltiple del enfoque
  const [planMoveDay, setPlanMoveDay] = useState('')               // date input de la barra de acciones
  const [planMode, setPlanMode] = useState<'dia' | 'semana' | 'ajuste' | '2sem' | '3sem' | 'mes' | 'calendario' | 'timeline' | 'resumen' | 'agenda' | 'detalle'>('dia') // horizonte del enfoque
  const [dayTableEdit, setDayTableEdit] = useState(false)          // edición inline de la tabla del día
  const [dayCapacity, setDayCapacity] = useState(8)                // presupuesto de carga del día (puntos)
  const [calDrag, setCalDrag] = useState<string | null>(null)      // tarjeta arrastrada en el calendario
  const [calOverDay, setCalOverDay] = useState<string | null>(null)
  const calDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const [calExpanded, setCalExpanded] = useState<Set<string>>(new Set()) // días del calendario con "+N más" desplegado
  const [tlDragKey, setTlDragKey] = useState<string | null>(null)  // barra arrastrada en el timeline
  const [tlOffset, setTlOffset] = useState(0)                      // desplazamiento en px de la barra arrastrada
  const tlDragRef = useRef<{ key: string; e: Epica; i: number; x: number; moved: boolean } | null>(null)
  const [weekEpica, setWeekEpica] = useState<string>('todas')       // filtro por épica (vista semana)
  const [weekDif, setWeekDif] = useState<'todas' | Dif>('todas')    // filtro por dificultad (vista semana)
  const [routinesOpen, setRoutinesOpen] = useState(true)           // rutinas de la semana plegables
  const [boardHideDone, setBoardHideDone] = useState(false)        // ocultar tareas completadas en semana/sprint
  const [dayView, setDayView] = useState<'lista' | 'tabla'>('lista') // vista de la lista del enfoque de día
  const [boardView, setBoardView] = useState<'tablero' | 'tabla'>('tablero') // columnas o tabla en semana/2sem/3sem/mes
  // Orden de la tabla como CADENA de criterios (primero por…, luego por…). El
  // primer elemento manda; los siguientes desempatan. 'manual' vive solo.
  const [dayTableSort, setDayTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }[]>([{ key: 'manual', dir: 'asc' }])
  const [epicView, setEpicView] = useState<'lista' | 'tabla'>('lista') // vista de "Todas las épicas"
  const [epicTableSort, setEpicTableSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'manual', dir: 'asc' })
  const [resumenDay, setResumenDay] = useState<string | null>(null) // popup del día en el burndown
  const [epicPeek, setEpicPeek] = useState<string | null>(null)     // popup rápido de una épica
  const [milestonePick, setMilestonePick] = useState<{ eId: string; mId: string } | null>(null) // elegir tareas de un objetivo
  const [epicDrag, setEpicDrag] = useState<string | null>(null)     // tarea arrastrada en el panel de la épica
  const [epicDropTo, setEpicDropTo] = useState<number | null>(null) // índice destino durante el arrastre
  const epicDragRef = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  const epicListRef = useRef<HTMLDivElement>(null)
  const [editInline, setEditInline] = useState(false)              // editar la épica dentro del panel, no en modal
  const [edTasksOpen, setEdTasksOpen] = useState(false)            // lista de tareas del editor de épica (plegada)
  const [edTaskRow, setEdTaskRow] = useState<number | null>(null)  // fila de tarea expandida en el editor
  const [subPop, setSubPop] = useState<{ eId: string; tid: string; sid: string } | null>(null)  // popup de subtarea
  const [subSort, setSubSort] = useState<'manual' | 'prioridad' | 'dificultad' | 'dia'>('manual') // orden de subtareas
  const subNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newSubtask, setNewSubtask] = useState('')                 // input de subtarea nueva en el detalle
  const [estCustomId, setEstCustomId] = useState<string | null>(null)  // tarea con el Estimado en modo "Personalizado…" (input libre)
  const [newComment, setNewComment] = useState('')                 // input de comentario nuevo en el detalle
  const [faltanOpen, setFaltanOpen] = useState(true)                // seccion "Faltan por cerrar" plegable
  const [faltanView, setFaltanView] = useState<'lista' | 'tabla'>('lista')
  const [movidasOpen, setMovidasOpen] = useState(true)              // seccion "Se movieron / no se cumplieron"
  const [taskLinksOpen, setTaskLinksOpen] = useState(true)        // enlaces de la épica en la vista de tarea (abierto por defecto para que se vean)
  const [weekDrag, setWeekDrag] = useState<string | null>(null)     // key de la tarjeta arrastrada en la vista semana
  const [sinFechaOpen, setSinFechaOpen] = useState(true)            // panel "sin fecha" (arrastrar al día) en la vista Semana
  const [weekMoveKey, setWeekMoveKey] = useState<string | null>(null) // tarjeta con el selector de día abierto (agendar por día con un toque)
  const [sinDiaOpen, setSinDiaOpen] = useState(false)                 // bandeja "Sin día" (backlog) en la vista Ajuste
  const [sprintCollapsed, setSprintCollapsed] = useState<Set<string>>(new Set()) // semanas colapsadas en Ajuste multi-semana
  const [weekOverDay, setWeekOverDay] = useState<string | null>(null)
  const weekDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const [sprintDrag, setSprintDrag] = useState<string | null>(null) // tarjeta arrastrada en la vista multi-semana
  const [sprintOverCol, setSprintOverCol] = useState<string | null>(null) // lunes de la semana bajo el drag
  const [sprintOverDay, setSprintOverDay] = useState<string | null>(null) // día concreto bajo el drag (mover a ese día)
  const sprintDragRef = useRef<{ key: string; x: number; y: number; moved: boolean } | null>(null)
  const [hideYesterday, setHideYesterday] = useState(false)
  const [viewDate, setViewDate] = useState<string>(todayISO())               // día del plan en vista
  const [calOpen, setCalOpen] = useState(false)                              // popover de mes (masthead)
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7)) // 'YYYY-MM'
  const [movePick, setMovePick] = useState<{ eId: string; tid: string } | null>(null) // "Mover a otro día…"
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)        // chip de la tira bajo el drag
  const dayStripRef = useRef<HTMLDivElement>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const dragKeyRef = useRef<string | null>(null)
  const planListRef = useRef<HTMLDivElement>(null)
  const epicsRef = useRef<Epica[]>(epics)
  const planHistReady = useRef(false)   // true cuando la columna plan_hist existe (tras la migración)
  const ordenReady = useRef(false)       // true si la columna `orden` existe (lo dice el API); mismo patrón que plan_hist
  const remindReady = useRef(false)      // true si la columna remind_at existe (recordatorios)
  const comentariosReady = useRef(false) // true si la columna comentarios existe
  const resumenReady = useRef(false)     // true si la columna `resumen` existe (resumen de la tarea)
  const estMinReady = useRef(false)      // true si la columna est_min existe (estimado propio de horas por tarea)
  const dayPlansReady = useRef(false)    // true si la columna day_plans existe (sesiones por día)
  const weekBudgetReady = useRef(false)  // true si la columna week_budget existe (presupuesto semanal por épica)
  const modalOpenRef = useRef(false)     // hay un modal/editor abierto → no refrescar (no pisar una edición)
  const writeChain = useRef<Map<string, Promise<unknown>>>(new Map())  // cola de escrituras por épica (evita choques consigo misma)
  const removeUndoRef = useRef<{ eId: string; tid: string; snap: Partial<EpicaTask> } | null>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressPending = useRef<{ id: string; tasks: EpicaTask[] } | null>(null)
  useEffect(() => { epicsRef.current = epics }, [epics])
  // Persiste un avance pendiente si el componente se desmonta a media edición
  useEffect(() => () => {
    if (progressTimer.current) clearTimeout(progressTimer.current)
    const p = progressPending.current
    if (p) fetch('/api/tareas/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicaId: p.id, update: p.tasks }), keepalive: true,
    }).catch(() => {})
  }, [])

  // refresca desde el server al montar (revalidate corto en el page)
  const loadEpics = useCallback(() => {
    setLoading(true)
    fetch('/api/epicas').then(r => r.json()).then(j => {
      if (!j.ok || !Array.isArray(j.data)) throw new Error(j.error || 'respuesta inválida')
      planHistReady.current = !!j.planHistReady
      ordenReady.current = !!j.ordenReady
      remindReady.current = !!j.remindReady
      comentariosReady.current = !!j.comentariosReady
      resumenReady.current = !!j.resumenReady
      estMinReady.current = !!j.estMinReady
      dayPlansReady.current = !!j.dayPlansReady
      weekBudgetReady.current = !!j.weekBudgetReady
      {
        const raw = j.data as Epica[]
        const normed = raw.map(normalize)
        setEpics(normed)
        setFeaturedId(prev => (prev && normed.some(e => e.id === prev)) ? prev : (normed[0]?.id ?? null))
        // Persiste UNA vez la migración de rutinas legadas (days → weeks[semana actual]),
        // para que normalize no re-atribuya el progreso a la semana equivocada en futuras cargas.
        raw.forEach(e => {
          const ep = normed.find(n => n.id === e.id)
          if (!ep) return
          const body: Partial<Epica> = {}
          if ((e.routines || []).some(r => (!r.weeks || typeof r.weeks !== 'object') && Array.isArray(r.days) && r.days.some(Boolean))) body.routines = ep.routines
          // Migra una vez los KPIs viejos {v,l} al formato de objetivos medibles
          if ((e.kpis || []).some(k => (k as { t?: string }).t === undefined)) body.kpis = ep.kpis
          if (Object.keys(body).length) fetch(`/api/epicas/${e.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          }).catch(() => {})
        })
        setLoadError(null)
      }
    }).catch(() => {
      // Antes esto era `.catch(() => {})`: si Supabase fallaba se veían los datos rancios
      // del SSR sin ninguna señal. Ahora se avisa y se ofrece reintentar.
      setLoadError('No se pudieron cargar las épicas.')
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { loadEpics() }, [loadEpics])
  // Al volver a la pestaña de Épicas (tras editar en Tiempo u otra pestaña) se refresca solo,
  // salvo que haya un modal/editor abierto (para no pisar lo que estás editando). Mismo patrón que Tiempo.
  useEffect(() => {
    const can = () => document.visibilityState === 'visible' && !modalOpenRef.current
    const onVis = () => { if (can()) loadEpics() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [loadEpics])

  // Recordatorios: cada minuto (y al abrir la app) revisa las tareas con remindAt
  // vencido; dispara notificación del navegador (si hay permiso) + aviso in-app y
  // limpia el recordatorio (una sola vez). remindedRef evita repetirlo en la sesión.
  const remindedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const check = () => {
      const now = Date.now()
      epicsRef.current.forEach(e => (e.tasks || []).forEach(t => {
        if (!t.remindAt || t.status === 'Terminada' || t.status === ARCHIVED) return
        const due = new Date(t.remindAt).getTime()
        if (isNaN(due) || due > now) return
        const key = (t.id || '') + ':' + t.remindAt
        if (remindedRef.current.has(key)) return
        remindedRef.current.add(key)
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`⏰ ${e.name}`, { body: t.t }) } catch { /* noop */ }
        showToast(`⏰ Recordatorio · ${t.t}`)
        const fresh = epicsRef.current.find(x => x.id === e.id)
        const ii = fresh ? fresh.tasks.findIndex(x => x.id === t.id) : -1
        if (fresh && ii >= 0) { const tasks = clone(fresh.tasks); tasks[ii].remindAt = ''; patchEpic(fresh.id, { tasks }) }
      }))
    }
    const id = setInterval(check, 60000)
    const t0 = setTimeout(check, 4000)   // primera pasada tras cargar
    return () => { clearInterval(id); clearTimeout(t0) }
  }, [])

  // Preferencias de vista: se aplican DESPUÉS de montar (leer localStorage en el
  // initializer de useState provocaría un desajuste de hidratación con el SSR).
  const prefsReady = useRef(false)
  useEffect(() => {
    const p = loadPrefs()
    setSortBy(p.sortBy); setCompact(p.compact); setShowRowKpi(p.showRowKpi)
    setEstadoFilter(p.estadoFilter); setCatFilter(p.catFilter)
    setPlanSort(p.planSort); setPlanFilter(p.planFilter); setPlanMode(p.planMode === '2sem' || p.planMode === 'mes' ? '3sem' : p.planMode)
    setWeekEpica(p.weekEpica); setWeekDif(p.weekDif); setRoutinesOpen(p.routinesOpen); setBoardHideDone(p.boardHideDone); setDayView(p.dayView); setBoardView(p.boardView || 'tablero'); setEpicView(p.epicView); setDayCapacity(p.dayCapacity || 8)
    setEpicSort(p.epicSort); setEpicFilter(p.epicFilter)
    setBacklogOpen(p.backlogOpen); setBacklogSort(p.backlogSort); setBacklogDone(p.backlogDone)
    setBacklogView(p.backlogView)
    setBacklogFEpica(p.backlogFEpica); setBacklogFStatus(p.backlogFStatus); setBacklogFPrio(p.backlogFPrio)
    // La épica destacada se restaura tal cual: loadEpics conserva el valor previo
    // si el id sigue existiendo, y si no cae en la primera de la lista.
    if (p.featuredId) setFeaturedId(p.featuredId)
    prefsReady.current = true
  }, [])
  useEffect(() => {
    if (!prefsReady.current) return
    const prefs: Prefs = {
      sortBy, compact, showRowKpi, estadoFilter, catFilter, planSort, planFilter, planMode,
      weekEpica, weekDif, routinesOpen, boardHideDone, dayView, boardView, epicView, dayCapacity,
      epicSort, epicFilter, backlogOpen, backlogSort, backlogDone, backlogView,
      backlogFEpica, backlogFStatus, backlogFPrio, featuredId,
    }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* noop */ }
  }, [sortBy, compact, showRowKpi, estadoFilter, catFilter, planSort, planFilter, planMode,
      weekEpica, weekDif, routinesOpen, boardHideDone, dayView, boardView, epicView, dayCapacity,
      epicSort, epicFilter, backlogOpen, backlogSort, backlogDone, backlogView,
      backlogFEpica, backlogFStatus, backlogFPrio, featuredId])

  /* ─── Estado en la URL ───────────────────────────────────────
     Vista, día, épica y filtros viajan en el query string: el enlace es
     compartible y recargar te deja donde estabas. Se aplica DESPUÉS de las
     preferencias (la URL manda sobre lo guardado). */
  const urlReady = useRef(false)
  // Permite abrir el editor de una tarea desde otra sección (Tiempo) por deep-link (?e=&t=).
  const openTaskEditRef = useRef<((epicId: string, tid: string) => void) | null>(null)
  useEffect(() => {
    const MODES = ['dia', 'semana', 'ajuste', '2sem', '3sem', 'mes', 'calendario', 'timeline', 'resumen', 'agenda', 'detalle']
    const applyFromUrl = () => {
      const q = new URLSearchParams(window.location.search)
      const v = q.get('v'); if (v && MODES.includes(v)) setPlanMode((v === '2sem' || v === 'mes' ? '3sem' : v) as typeof planMode)
      const d = q.get('d'); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setViewDate(d)
      const e = q.get('e'); if (e) setFeaturedId(e)
      const tsk = q.get('t'); if (tsk && e) setTimeout(() => openTaskEditRef.current?.(e, tsk), 0)
      const f = q.get('f'); if (f && ['todas', 'alta', 'vencidas', 'avance', 'estancada', 'multidia', 'arrastre'].includes(f)) setPlanFilter(f as typeof planFilter)
      const ep = q.get('ep'); if (ep) setWeekEpica(ep)
      const df = q.get('df'); if (df && ['todas', 'facil', 'media', 'dificil'].includes(df)) setWeekDif(df as typeof weekDif)
    }
    applyFromUrl()
    urlReady.current = true
    window.addEventListener('popstate', applyFromUrl)
    return () => window.removeEventListener('popstate', applyFromUrl)
  }, [])
  useEffect(() => {
    if (!urlReady.current) return
    const q = new URLSearchParams()
    q.set('v', planMode)
    q.set('d', viewDate)
    if (featuredId) q.set('e', featuredId)
    if (planFilter !== 'todas') q.set('f', planFilter)
    if (weekEpica !== 'todas') q.set('ep', weekEpica)
    if (weekDif !== 'todas') q.set('df', weekDif)
    const next = `${window.location.pathname}?${q.toString()}`
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next)
  }, [planMode, viewDate, featuredId, planFilter, weekEpica, weekDif])

  // El día se recalcula solo: una pestaña abierta pasada la medianoche seguía
  // mostrando "Hoy" del día anterior y no recalculaba las arrastradas.
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayISO()
      if (d === todayRef.current) return
      const prev = todayRef.current
      todayRef.current = d
      setToday(d)
      setViewDate(v => (v === prev ? d : v))   // si estabas viendo "hoy", sigues viendo hoy
    }, 30000)
    return () => clearInterval(id)
  }, [])

  // Gestión de foco de los modales: al abrir uno, el foco entra al panel y Tab queda
  // atrapado dentro; al cerrarlo, vuelve al elemento que lo abrió. Antes el foco se
  // quedaba detrás del backdrop y con Tab se navegaba el contenido tapado.
  /* ─── Sesión de foco (mismo widget/estado que /tiempo, aquí dentro de Épicas) ───
     La sesión vive en `margen.v1` (localStorage + /api/tiempo-estado): es LA MISMA que
     en /tiempo. Al terminar, escribimos el tiempo a la bitácora de la tarea (y la
     cerramos si "✓ y hecha") con las mismas rutas de Épicas.
     Se declara ANTES de anyModal para poder pausar el refresco mientras el Modo foco edita. */
  const focus = useFocusSession({
    onFinishTask: (epicaId, taskId, info) => {
      // Resolver por taskId en TODAS las épicas: la tarea pudo moverse de épica durante la sesión.
      const ep = epicsRef.current.find(e => e.tasks.some(t => t.id === taskId)); if (!ep) return
      const tasks = clone(ep.tasks)
      const ti = tasks.findIndex(t => t.id === taskId); if (ti < 0) return
      const entry = { d: info.day, note: info.note, pct: tasks[ti].progress, min: info.minutes, logId: info.logId } as EpicaProgressEntry
      tasks[ti].progressLog = [...(tasks[ti].progressLog || []), entry]
      if (info.markDone) applyComplete(tasks[ti])
      patchEpic(ep.id, { tasks })
    },
    onFinishRoutine: (epicaId, rIdx, day) => {
      const ep = epicsRef.current.find(e => e.id === epicaId); if (!ep) return
      const routines = clone(ep.routines); const r = routines[rIdx]; if (!r) return
      const monday = mondayISO(day); const di = (new Date(day + 'T00:00:00').getDay() + 6) % 7
      if (!r.weeks) r.weeks = {}
      const wk = (r.weeks[monday] && r.weeks[monday].length === 7) ? [...r.weeks[monday]] : [false, false, false, false, false, false, false]
      wk[di] = true            // idempotente: marcar hecho, nunca desmarcar
      r.weeks[monday] = wk
      if (monday === mondayISO(todayISO())) r.days = wk
      patchEpic(ep.id, { routines })
    },
    priorMinFor: (taskId) => {
      for (const e of epicsRef.current) {
        const t = e.tasks.find(x => x.id === taskId)
        if (t) return (t.progressLog || []).reduce((s, l) => s + (typeof (l as { min?: number }).min === 'number' ? (l as { min?: number }).min! : 0), 0)
      }
      return 0
    },
    todayMinFor: (taskId) => {
      const d0 = todayISO()
      for (const e of epicsRef.current) {
        const t = e.tasks.find(x => x.id === taskId)
        if (t) return (t.progressLog || []).reduce((s, l) => s + ((l.d === d0 && typeof (l as { min?: number }).min === 'number') ? (l as { min?: number }).min! : 0), 0)
      }
      return 0
    },
    plannedMinFor: (taskId) => {
      for (const e of epicsRef.current) { const t = e.tasks.find(x => x.id === taskId); if (t) return estMinOf(t) }
      return 0
    },
    taskFor: (taskId) => {
      for (const e of epicsRef.current) { const t = e.tasks.find(x => x.id === taskId); if (t) return t }
      return null
    },
    onPatchTask: (taskId, patch) => {
      // Gates: no escribir columnas cuya migración no esté corrida (un 500 revierte TODO el write).
      // Devuelve boolean: false = NO se aplicó (gate sin migración) → el widget no limpia el input.
      if ('comentarios' in patch && !comentariosReady.current) { showToast('Corre sql/epicas-07-comentarios.sql para usar comentarios', true); return false }
      if ('resumen' in patch && !resumenReady.current) { showToast('Corre la migración de `resumen` para editarlo aquí', true); return false }
      if ('remindAt' in patch && !remindReady.current) { showToast('Corre sql/epicas-06-remind.sql para recordatorios', true); return false }
      const ep = epicsRef.current.find(e => e.tasks.some(t => t.id === taskId)); if (!ep) return false
      const tasks = clone(ep.tasks)
      const ti = tasks.findIndex(t => t.id === taskId); if (ti < 0) return false
      tasks[ti] = { ...tasks[ti], ...patch }
      // Cambiar la fecha "Hacer" (plan) debe reasignar planOrder/priority/estado como las demás rutas.
      if ('plan' in patch) {
        const plan = patch.plan || ''
        if (plan) {
          if (!tasks[ti].priority) tasks[ti].priority = prioFromDue(tasks[ti].due)
          if (ep.tasks[ti].plan !== plan || tasks[ti].planOrder == null) tasks[ti].planOrder = maxPlanOrderFor(plan) + 1000
          applyPlanStatus(tasks[ti], plan)
        } else {
          delete tasks[ti].plan; delete tasks[ti].priority; delete tasks[ti].planOrder
          applyPlanStatus(tasks[ti], '')
        }
      }
      patchEpic(ep.id, { tasks })
      return true
    },
    onToast: (msg) => showToast(msg),
  })

  const anyModal = !!(editing || taskEdit || taskView || routineStat || pickerOpen || focus.busy || dayCloseOpen || weekCloseOpen || triageOpen || objsOpen || diaryOpen)
  useEffect(() => { modalOpenRef.current = anyModal }, [anyModal])

  /* "¿Qué hago ahora?": elige la MEJOR siguiente tarea del día (vencidas primero, luego prioridad,
     entrega y orden manual) y arranca el cronómetro de foco en ella. Cierra el ciclo elegir→hacer. */
  const pickNextNow = () => {
    const pool = planPend.length ? planPend
      : activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i }))).filter(x => x.t.plan === today && x.t.status !== 'Terminada' && x.t.status !== ARCHIVED)
    if (!pool.length) { showToast('No hay tareas pendientes para hoy', true); return }
    const overdue = (t: EpicaTask) => { const d = daysUntil(t.due); return d != null && d < 0 ? 0 : 1 }
    const pick = [...pool].sort((a, b) =>
      overdue(a.t) - overdue(b.t)
      || (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media'])
      || (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      || ((a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
    )[0]
    // El "por qué" la eligió: vencida > prioridad alta > entrega cercana > primera del orden.
    const dl = daysUntil(pick.t.due)
    const why = (dl != null && dl < 0) ? `venció hace ${-dl}d` : pick.t.priority === 'alta' ? 'prioridad alta' : (dl != null && dl <= 3) ? `vence ${relLong(pick.t.due).toLowerCase()}` : 'es lo siguiente en tu orden'
    if (focus.begin({ name: pick.t.t, epicaId: pick.e.id, taskId: pick.t.id!, dur: estMinOf(pick.t) })) showToast(`▶ «${pick.t.t}» · ${why}`)
  }
  // Presupuesto semanal por épica (horas/semana). Si la columna week_budget existe (migración
  // corrida), se guarda en Supabase y SINCRONIZA entre dispositivos; si no, cae a localStorage.
  useEffect(() => { try { const raw = localStorage.getItem('advl_epicas_budget'); if (raw) setEpicBudgets(JSON.parse(raw)) } catch { /* noop */ } }, [])
  const budgetOf = (e: Epica): number => weekBudgetReady.current ? (e.week_budget || 0) : (epicBudgets[e.id] || 0)
  const setEpicBudget = (id: string, hours: number) => {
    const h = hours > 0 ? Math.round(hours) : 0
    if (weekBudgetReady.current) { patchEpic(id, { week_budget: h > 0 ? h : null }); return }
    setEpicBudgets(prev => {
      const next = { ...prev }; if (h > 0) next[id] = h; else delete next[id]
      try { localStorage.setItem('advl_epicas_budget', JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }
  // Minutos invertidos esta semana (L-D) en las tareas de una épica (suma de la bitácora).
  const investedThisWeek = (e: Epica): number => {
    const mon = mondayISO(today), sun = addDays(mon, 6)
    return (e.tasks || []).reduce((s, t) => s + (t.progressLog || []).reduce((a, l) => a + ((l.d >= mon && l.d <= sun && typeof (l as { min?: number }).min === 'number') ? (l as { min?: number }).min! : 0), 0), 0)
  }
  // Salud de la épica: último día con actividad (avance/cierre/ciclo recurrente) en cualquiera de sus tareas.
  const epicLastActivity = (e: Epica): string => {
    let m = ''
    for (const t of e.tasks || []) {
      if (t.status === ARCHIVED) continue
      for (const l of t.progressLog || []) if (l.d > m) m = l.d
      if (t.doneAt && t.doneAt > m) m = t.doneAt
      for (const d of t.repeatDone || []) if (d > m) m = d
    }
    return m
  }
  const daysSinceISO = (d: string): number | null => d ? Math.max(0, Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(d + 'T00:00:00').getTime()) / 86400000)) : null
  // Mueve una LISTA de tareas (por épica+índice) a un día, con planOrder corrido único entre épicas.
  const moveTasksTo = (list: { e: Epica; i: number }[], dayISO: string): number => {
    const byE = new Map<string, number[]>()
    list.forEach(x => { const a = byE.get(x.e.id) || []; a.push(x.i); byE.set(x.e.id, a) })
    let n = 0, base = maxPlanOrderFor(dayISO)
    byE.forEach((idxs, eId) => {
      const fresh = epicsRef.current.find(x => x.id === eId); if (!fresh) return
      const tasks = clone(fresh.tasks)
      idxs.forEach(i => { const t = tasks[i]; if (!t || t.status === 'Terminada') return; t.plan = dayISO; if (!t.priority) t.priority = prioFromDue(t.due); base += 1000; t.planOrder = base; applyPlanStatus(t, dayISO); n++ })
      patchEpic(eId, { tasks })
    })
    return n
  }
  // Cierre del día: mueve las pendientes del día en vista a otro día.
  const moveTodayPendingTo = (dayISO: string) => {
    const n = moveTasksTo(planPend.map(x => ({ e: x.e, i: x.i })), dayISO)
    setDayCloseOpen(false)
    if (n) showToast(`Moví ${n} ${n === 1 ? 'tarea' : 'tareas'} a ${relLong(dayISO).toLowerCase()}`)
  }
  // Cerrar días anteriores: mueve el ARRASTRE (pendientes de días pasados) a un día.
  const moveArrastradasTo = (dayISO: string) => {
    const n = moveTasksTo(arrastradas.map(x => ({ e: x.e, i: x.i })), dayISO)
    setDayCloseOpen(false)
    if (n) showToast(`Moví ${n} ${n === 1 ? 'arrastrada' : 'arrastradas'} a ${relLong(dayISO).toLowerCase()}`)
  }
  const lastFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!anyModal) {
      lastFocus.current?.focus?.()
      lastFocus.current = null
      return
    }
    lastFocus.current = document.activeElement as HTMLElement | null
    const panel = document.querySelector('[role="dialog"]') as HTMLElement | null
    if (!panel) return
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null)
    focusables()[0]?.focus()
    const onTab = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus() }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus() }
    }
    panel.addEventListener('keydown', onTab)
    return () => panel.removeEventListener('keydown', onTab)
  }, [anyModal])

  // ⌘K / Ctrl+K abre el picker; Escape cierra el overlay más superficial
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault(); setPickerOpen(true)
      } else if (e.key === 'Escape') {
        // De más superficial a más profundo: un solo Escape no debe cerrar el modal
        // completo si sólo había un popover encima.
        if (rowMenu || prioMenu || calOpen) { setRowMenu(null); setPrioMenu(null); setCalOpen(false); return }
        if (subPop) { setSubPop(null); return }
        if (milestonePick) { setMilestonePick(null); return }
        if (resumenDay) { setResumenDay(null); return }
        if (epicPeek) { setEpicPeek(null); return }
        if (movePick) { setMovePick(null); return }
        if (pickerOpen) { setPickerOpen(false); return }
        if (routineStat) { setRoutineStat(null); return }
        if (diaryOpen) { setDiaryOpen(false); return }
        if (objsOpen) { setObjsOpen(false); return }
        if (weekCloseOpen) { setWeekCloseOpen(false); return }
        if (triageOpen) { setTriageOpen(false); return }
        if (dayCloseOpen) { setDayCloseOpen(false); return }
        // Estos cuatro no cerraban con Escape: en un modal a pantalla completa
        // la tecla simplemente no hacía nada.
        if (taskEdit) { setTaskEdit(null); return }
        if (taskView) { setTaskView(null); return }
        if (editing) { setEditing(null); setEditMode(null); return }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rowMenu, prioMenu, calOpen, movePick, pickerOpen, routineStat, taskEdit, taskView, editing, resumenDay, epicPeek, milestonePick, subPop, diaryOpen, objsOpen, weekCloseOpen, triageOpen, dayCloseOpen])

  // cierra menú ⋯ / popovers (prioridad, calendario, mover) al hacer clic fuera.
  // Detección por contención (data-pop) en vez de stopPropagation: así un clic en una flecha
  // del calendario no cierra el popover en el mousedown (lo que impedía navegar de mes/año).
  useEffect(() => {
    if (!rowMenu && !prioMenu && !calOpen && !movePick) return
    const onDoc = (ev: MouseEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.('[data-pop]')) return
      setRowMenu(null); setPrioMenu(null); setCalOpen(false); setMovePick(null)
    }
    // El popover del ⋯/prioridad se ancla por coordenadas de viewport (portal): al
    // hacer scroll dejaría de seguir a su botón, así que se cierra.
    const onScroll = () => { setRowMenu(null); setPrioMenu(null) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('scroll', onScroll, true) }
  }, [rowMenu, prioMenu, calOpen, movePick])

  // La selección son índices de tareas planeadas para el día en vista: al cambiar de día
  // dejan de tener sentido.
  useEffect(() => { setPlanSel(new Set()) }, [viewDate])
  // El filtro por objetivo pertenece a una épica: al cambiar de destacada, se limpia
  useEffect(() => { setEpicObjFilter('todas') }, [featuredId])   // el filtro por día es GLOBAL: NO se limpia al cambiar de épica

  // Objetivos que se cumplen solos (los medidos con tareas) quedan sellados con
  // su fecha, para poder celebrarlos en el resumen de la semana.
  useEffect(() => {
    for (const e of epics) {
      const idx = (e.kpis || []).findIndex(m => !m.doneAt && milestoneDone(m, e))
      if (idx < 0) continue
      const kpis = clone(e.kpis)
      kpis[idx].done = true; kpis[idx].doneAt = todayISO()
      patchEpic(e.id, { kpis })
      showToast(`✦ Objetivo cumplido: ${kpis[idx].t}`)
      break   // uno por pasada; el siguiente render agarra el que siga
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epics])

  // El dropdown de enlaces de la épica arranca cerrado cada vez que abres una tarea
  useEffect(() => { setTaskLinksOpen(true); setNewSubtask('') }, [taskView])

  // centra el chip del día seleccionado en la tira
  useEffect(() => {
    dayStripRef.current?.querySelector('[data-day-selected]')
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [viewDate])

  function showToast(msg: string, error?: boolean, action?: { label: string; fn: () => void }) {
    setToast({ msg, error, action })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2600)
  }

  /* ─── Persistencia optimista ─────────────────────────────── */
  async function patchEpic(id: string, changes: Partial<Epica>): Promise<boolean> {
    // Revierte SOLO esta épica en caso de fallo (update funcional), para no pisar
    // los updates optimistas concurrentes de otras épicas del mismo tick (reorden multi-épica).
    const prevEpic = epicsRef.current.find(e => e.id === id)
    let { tasks: nextTasks } = changes
    const { tasks: _omit, ...epicFields } = changes; void _omit
    // Historial de días de plan: si el plan de una tarea cambió a otro día, guarda el
    // día viejo en planHist. Se hace aquí (punto único de escritura) para cubrir TODAS
    // las rutas de reprogramación: drag, posponer, editor, lote, etc. Sólo si la
    // columna plan_hist ya existe (gate), para no romper el guardado antes de migrar.
    if (nextTasks && planHistReady.current) {
      const beforePlan = new Map((prevEpic?.tasks || []).map(t => [t.id, t.plan || '']))
      nextTasks = nextTasks.map(t => {
        const prev = t.id ? beforePlan.get(t.id) : undefined
        if (prev && prev !== (t.plan || '')) {
          const hist = (t.planHist || []).filter(d => d !== prev)
          hist.push(prev)
          return { ...t, planHist: hist.slice(-40) }
        }
        return t
      })
      changes = { ...changes, tasks: nextTasks }
    }
    setEpics(list => list.map(e => (e.id === id ? { ...e, ...changes } : e)))
    // Serializa la parte de RED por épica: la 2ª escritura espera a la 1ª (y a su sellado de
    // updated_at). Así dos ediciones rapidísimas a la misma tarea no chocan entre sí ni se
    // descartan; sin serializar, la 2ª mandaba un updated_at viejo y el server la rechazaba.
    const prevChain = writeChain.current.get(id) || Promise.resolve()
    const run = (async () => {
      await prevChain.catch(() => {})
      // Campos de la épica (nombre, color, rutinas, links…)
      if (Object.keys(epicFields).length) {
        const r = await fetch(`/api/epicas/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(epicFields),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error)
      }
      // Tareas: en vez de reescribir el array completo, se manda SÓLO el diff
      // (altas, cambios y bajas) contra el estado previo. Así dos pestañas no se
      // pisan y editar una tarea no toca a las demás.
      if (nextTasks) {
        const before = prevEpic?.tasks || []
        const beforeById = new Map(before.map(t => [t.id, t]))
        const afterById = new Map(nextTasks.map(t => [t.id, t]))
        // Sella cada tarea a enviar con el updated_at MÁS fresco conocido (tras la escritura
        // anterior ya encadenada), no el del snapshot del render → no choca consigo misma.
        const freshById = new Map((epicsRef.current.find(e => e.id === id)?.tasks || []).map(t => [t.id, t]))
        const create = nextTasks.filter(t => t.id && !beforeById.has(t.id))
        const update = nextTasks.filter(t => { const b = t.id ? beforeById.get(t.id) : null; return b && !sameTask(b, t) })
          .map(t => { const f = t.id ? freshById.get(t.id) : null; return f?.updatedAt ? { ...t, updatedAt: f.updatedAt } : t })
        const remove = before.filter(t => t.id && !afterById.has(t.id)).map(t => t.id!)
        if (create.length || update.length || remove.length) {
          const r = await fetch('/api/tareas/sync', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ epicaId: id, create, update, remove }),
          })
          const j = await r.json()
          if (!j.ok) throw new Error(j.error)
          // Sella los updated_at frescos en memoria (estado + ref sincrónico para la próxima escritura)
          if (j.stamps && Object.keys(j.stamps).length) {
            const stamps = j.stamps as Record<string, string>
            const restamp = (t: EpicaTask) => (t.id && stamps[t.id]) ? { ...t, updatedAt: stamps[t.id] } : t
            setEpics(list => list.map(e => e.id !== id ? e : { ...e, tasks: e.tasks.map(restamp) }))
            epicsRef.current = epicsRef.current.map(e => e.id !== id ? e : { ...e, tasks: e.tasks.map(restamp) })
          }
          // Choque con otra pestaña: avisa y recarga con lo más fresco de la BD
          if (j.conflicts && j.conflicts.length) {
            showToast('Esa tarea cambió en otra pestaña · recargando', true)
            loadEpics()
          }
        }
      }
    })()
    writeChain.current.set(id, run.catch(() => {}))
    try {
      await run
      return true
    } catch {
      if (prevEpic) setEpics(list => list.map(e => (e.id === id ? prevEpic : e)))
      showToast('No se pudo guardar', true)
      return false
    }
  }

  /* ─── Deshacer genérico ──────────────────────────────────────
     Toma una foto de las tareas de las épicas afectadas ANTES de mutar y la
     ofrece en el toast. Sirve igual para una tarea o para una acción en lote. */
  type Snap = { id: string; tasks: EpicaTask[] }
  const snapshot = (epicIds: string[]): Snap[] => {
    const seen = new Set<string>()
    return epicIds.filter(id => !seen.has(id) && seen.add(id)).map(id => {
      const e = epicsRef.current.find(x => x.id === id)
      return e ? { id, tasks: clone(e.tasks) } : null
    }).filter(Boolean) as Snap[]
  }
  const restore = (snaps: Snap[]) => snaps.forEach(s => patchEpic(s.id, { tasks: s.tasks }))
  const undoToast = (msg: string, snaps: Snap[]) =>
    showToast(msg, false, snaps.length ? { label: 'Deshacer', fn: () => restore(snaps) } : undefined)

  /* ─── Derivados de filtros (activas / archivadas / categoría) ─ */
  const activeEpics = useMemo(() => epics.filter(e => !e.archived), [epics])
  // CALIBRACIÓN de estimados: sobre tareas TERMINADAS con dificultad y tiempo real (bitácora), saca
  // un factor real/estimado por dificultad. Factor >1 = sueles tardar más de lo estimado.
  const calibration = useMemo(() => {
    const acc: Record<string, { real: number; est: number; n: number }> = { facil: { real: 0, est: 0, n: 0 }, media: { real: 0, est: 0, n: 0 }, dificil: { real: 0, est: 0, n: 0 } }
    for (const e of activeEpics) for (const t of e.tasks || []) {
      const dif = t.difficulty; if (!dif || t.status !== 'Terminada') continue
      const real = (t.progressLog || []).reduce((s, l) => s + (typeof (l as { min?: number }).min === 'number' ? (l as { min?: number }).min! : 0), 0)
      if (real <= 0) continue
      acc[dif].real += real; acc[dif].est += WEEK_EST_MIN(dif); acc[dif].n++
    }
    const factor = (d: string) => acc[d].est > 0 ? acc[d].real / acc[d].est : 0
    const totalN = acc.facil.n + acc.media.n + acc.dificil.n
    return { factor, n: (d: string) => acc[d].n, totalN }
  }, [activeEpics])
  // Entradas del DIARIO: todas las notas de avance + comentarios de todas las tareas, cronológico.
  const diaryEntries = useMemo(() => {
    type D = { at: string; day: string; kind: 'nota' | 'comentario'; text: string; eId: string; eName: string; color: string; tid: string; tName: string }
    const out: D[] = []
    for (const e of activeEpics) for (const t of e.tasks || []) {
      if (!t.id) continue
      for (const l of t.progressLog || []) if (l.note && l.note.trim() && !l.note.startsWith('⏱')) out.push({ at: l.d + 'T12:00', day: l.d, kind: 'nota', text: l.note, eId: e.id, eName: e.name, color: e.color, tid: t.id, tName: t.t })
      for (const c of t.comentarios || []) { const cd = new Date(c.at); const day = isNaN(cd.getTime()) ? (c.at || '').slice(0, 10) : `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}`; out.push({ at: c.at, day, kind: 'comentario', text: c.text, eId: e.id, eName: e.name, color: e.color, tid: t.id, tName: t.t }) }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [activeEpics])
  // OBJETIVOS EN RIESGO: reúne los KPIs medibles de todas las épicas y los ordena por riesgo
  // (vencidos primero, luego por cercanía de fecha y menor avance). Deja fuera los ya cumplidos.
  const objetivosAll = useMemo(() => {
    const out: { e: Epica; k: EpicaMilestone; pct: number; cur: number; target: number; hasMeta: boolean; days: number | null; risk: number }[] = []
    for (const e of activeEpics) for (const k of e.kpis || []) {
      if (milestoneDone(k, e)) continue
      const mp = milestoneProgress(k, e)
      const days = k.due ? daysUntil(k.due) : null
      // Riesgo: vencido y sin cumplir = 0 (peor); si no, "días para vencer − colchón por avance".
      const risk = (days != null && days < 0) ? -1000 + days : (days == null ? 900 - mp.pct * 200 : days + (1 - mp.pct) * -30)
      out.push({ e, k, pct: mp.pct, cur: mp.cur, target: mp.target, hasMeta: mp.hasMeta, days, risk })
    }
    return out.sort((a, b) => a.risk - b.risk)
  }, [activeEpics])
  // Semana en curso (para "Cerrar la semana"): comprometido, cerrado y lo que se arrastra.
  const weekSummary = useMemo(() => {
    const mon = mondayISO(today), sun = addDays(mon, 6)
    const inWk = (d?: string) => !!d && d >= mon && d <= sun
    const committed: { e: Epica; t: EpicaTask; i: number }[] = []
    const closed: { e: Epica; t: EpicaTask }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      if (t.status === ARCHIVED) return
      if (inWk(t.plan) && t.status !== 'Terminada') committed.push({ e, t, i })
      if (inWk(t.doneAt) || (t.repeatDone || []).some(d => inWk(d))) closed.push({ e, t })
    }))
    return { mon, committed, closedN: closed.length }
  }, [activeEpics, today])
  // TRIAGE: tareas activas SIN plan y SIN vencimiento (se pudren sin fecha). Más viejas primero.
  const sinFechaTasks = useMemo(() => {
    const out: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      if (t.status === ARCHIVED || t.status === 'Terminada') return
      if (!t.plan && !t.due) out.push({ e, t, i })
    }))
    return out.sort((a, b) => (a.t.createdAt || '9999').localeCompare(b.t.createdAt || '9999') || (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']))
  }, [activeEpics])
  // Cerrar la semana: mueve lo comprometido NO terminado al lunes de la próxima semana.
  const moveWeekPendingToNext = () => {
    const next = addDays(weekSummary.mon, 7)
    const byE = new Map<string, number[]>()
    weekSummary.committed.forEach(x => { const a = byE.get(x.e.id) || []; a.push(x.i); byE.set(x.e.id, a) })
    let n = 0, base = maxPlanOrderFor(next)
    byE.forEach((idxs, eId) => {
      const fresh = epicsRef.current.find(x => x.id === eId); if (!fresh) return
      const tasks = clone(fresh.tasks)
      idxs.forEach(i => { const t = tasks[i]; if (!t || t.status === 'Terminada') return; t.plan = next; if (!t.priority) t.priority = prioFromDue(t.due); base += 1000; t.planOrder = base; applyPlanStatus(t, next); n++ })
      patchEpic(eId, { tasks })
    })
    setWeekCloseOpen(false)
    if (n) showToast(`Moví ${n} ${n === 1 ? 'tarea' : 'tareas'} a la próxima semana`)
  }
  const archivedCount = useMemo(() => epics.filter(e => e.archived).length, [epics])
  const categorias = useMemo(() => {
    const m: Record<string, number> = {}
    activeEpics.forEach(e => { const c = (e.categoria || '').trim(); if (c) m[c] = (m[c] || 0) + 1 })
    return m
  }, [activeEpics])
  const visibleEpics = useMemo(() => epics.filter(e => {
    if (estadoFilter === 'activas' && e.archived) return false
    if (estadoFilter === 'archivadas' && !e.archived) return false
    if (catFilter !== 'todas' && (e.categoria || '') !== catFilter) return false
    return true
  }), [epics, estadoFilter, catFilter])

  const featured = useMemo(() => visibleEpics.find(e => e.id === featuredId) || visibleEpics[0] || epics[0] || null, [visibleEpics, featuredId, epics])

  /* ─── Próximos vencimientos (tareas con fecha ≤45d o vencidas) ─ */
  const vencimientos = useMemo(() => {
    const items: { id: string; epica: string; color: string; task: string; due: string; dl: number }[] = []
    activeEpics.forEach(e => {
      (e.tasks || []).forEach(t => {
        if (t.status === 'Terminada' || t.status === ARCHIVED || !t.due) return
        const dl = daysUntil(t.due)
        if (dl == null || dl > 45) return
        items.push({ id: e.id, epica: e.name, color: e.color, task: t.t, due: t.due, dl })
      })
    })
    return items.sort((a, b) => a.dl - b.dl)
  }, [activeEpics])

  /* ─── Overview (sobre épicas activas, no archivadas) ─────────── */
  const overview = useMemo(() => {
    const src = activeEpics
    const total = src.length
    const activas = src.filter(e => e.status !== 'En pausa').length
    const tareasActivas = src.reduce((n, e) => n + pendCount(e), 0)
    const prom = total ? Math.round(src.reduce((n, e) => n + pctOf(e), 0) / total) : 0
    const riesgo = src.filter(e => e.status === 'En riesgo').length
    return [
      { label: 'Épicas activas', value: String(activas), hint: `de ${total}`, hintColor: 'rgba(20,35,61,0.45)' },
      { label: 'Tareas activas', value: String(tareasActivas), hint: 'por hacer', hintColor: 'rgba(20,35,61,0.45)' },
      { label: 'Progreso prom.', value: `${prom}%`, hint: 'global', hintColor: '#2E6E6E' },
      { label: 'En riesgo', value: String(riesgo), hint: riesgo ? 'requieren foco' : 'todo bien', hintColor: riesgo ? '#B0522E' : '#2E6E6E' },
    ]
  }, [activeEpics])

  const sourceCount = useMemo(
    () => epics.reduce((n, e) => n + (e.source_table ? 1 : 0) + (e.links?.length || 0), 0),
    [epics],
  )

  /* ─── Lista (resto, ordenada) ────────────────────────────── */
  const rest = useMemo(() => {
    // "Todas las épicas" muestra TODAS las visibles (incluida la destacada): antes se
    // excluía la destacada y una épica recién creada —que queda destacada— parecía no
    // aparecer en la lista. La destacada sólo se resalta arriba, pero también se lista.
    const sorted = [...visibleEpics]
    if (sortBy === 'Pendientes') sorted.sort((a, b) => pendCount(b) - pendCount(a))
    else if (sortBy === 'Progreso') sorted.sort((a, b) => pctOf(b) - pctOf(a))
    else sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return sorted
  }, [visibleEpics, sortBy])

  /* ─── Plan de hoy: derivados ─────────────────────────────── */
  const isToday = viewDate === today
  /** Filtro por estado de trabajo:
   *  plan       = las que se trabajarán en `ref` (planeadas para ese día).
   *  openworked = "Trabajadas · sin terminar": se trabajó en ellas EL DÍA EN EL QUE
   *               ESTÁN (su propio día planeado) y siguen abiertas. NO cuenta si se
   *               trabajó en ellas otros días distintos a su día.
   *  unworked   = aún sin trabajar en su día, abiertas. '' = todas. */
  const passWork = (t: EpicaTask, ref: string) => {
    if (!workFilter) return true
    if (workFilter === 'plan') return t.plan === ref
    const workedOwnDay = !!t.plan && (t.progressLog || []).some(x => x.d === t.plan)
    return workFilter === 'openworked'
      ? (workedOwnDay && t.status !== 'Terminada')
      : (!workedOwnDay && t.status !== 'Terminada')   // unworked (sin trabajar en su día)
  }
  const renderWorkFilters = (ref: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
      <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>{ref === today ? '⚡ Trabajo de hoy' : '⚡ Trabajo del día'}</span>
      {([['plan', '▶ Se trabajarán'], ['openworked', '◐ Trabajadas · sin terminar'], ['unworked', '○ Sin trabajar']] as const).map(([k, label]) => {
        const on = workFilter === k
        return <button key={k} onClick={() => setWorkFilter(on ? '' : k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 11px', fontSize: 11, fontWeight: 700, border: on ? '1.5px solid #2E6E6E' : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(62,142,142,0.12)' : '#fff', color: on ? '#1F5A5A' : 'rgba(20,35,61,0.6)' }}>{label}</button>
      })}
      {workFilter && <button onClick={() => setWorkFilter('')} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#1F5A5A', fontSize: 11, fontWeight: 700 }}>Todas</button>}
    </div>
  )
  const planKey = (eId: string, t: EpicaTask) => `${eId}:${t.id}`
  /** Resuelve una referencia estable (épica + id de tarea) al índice actual.
   *  Devuelve null si la tarea ya no existe: así una referencia abierta (modal,
   *  selección) simplemente deja de aplicar en vez de apuntar a otra tarea. */
  const findTask = (eId: string, tid: string) => {
    const e = epics.find(x => x.id === eId)
    if (!e) return null
    const i = (e.tasks || []).findIndex(t => t.id === tid)
    return i < 0 ? null : { e, t: e.tasks[i], i }
  }
  /** Igual, pero contra el ref (para handlers async fuera del render). */
  const findTaskRef = (eId: string, tid: string) => {
    const e = epicsRef.current.find(x => x.id === eId)
    if (!e) return null
    const i = (e.tasks || []).findIndex(t => t.id === tid)
    return i < 0 ? null : { e, t: e.tasks[i], i }
  }
  /** Parsea una clave "epicaId:taskId" a índice actual. */
  const keyToTask = (key: string) => {
    const c = key.lastIndexOf(':')
    return findTaskRef(key.slice(0, c), key.slice(c + 1))
  }
  const planItems = useMemo(() => {
    const arr: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan === viewDate && t.status !== ARCHIVED) arr.push({ e, t, i }) }))
    return arr.sort((a, b) =>
      ((a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)) ||
      ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9)))
  }, [activeEpics, viewDate])
  const planPend = useMemo(() => planItems.filter(x => x.t.status !== 'Terminada'), [planItems])
  const planDone = useMemo(() => planItems.filter(x => x.t.status === 'Terminada'), [planItems])
  const planTotal = planItems.length
  const planPct = planTotal ? Math.round((planDone.length / planTotal) * 100) : 0
  const planAllDone = planTotal > 0 && planDone.length === planTotal
  // planOrder máximo de CUALQUIER día (el modal y "Mover a…" planean a fechas ≠ viewDate)
  const maxPlanOrderFor = (dateISO: string) => {
    let m = 0
    epicsRef.current.forEach(e => (e.tasks || []).forEach(t => { if (t.plan === dateISO) m = Math.max(m, t.planOrder ?? 0) }))
    return m
  }
  // Minutos reales invertidos (suma de la bitácora) y estimado por dificultad (feature "estimado vs real").
  const investedMinOf = (t: EpicaTask): number => (t.progressLog || []).reduce((s, l) => s + (typeof (l as { min?: number }).min === 'number' ? (l as { min?: number }).min! : 0), 0)
  const lastProgressDay = (t: EpicaTask): string => (t.progressLog || []).reduce((m, l) => (l.d > m ? l.d : m), '')
  // TAREA ESTANCADA: no terminada y (reprogramada ≥3 veces  ·  o con avance previo pero ≥5 días sin
  // tocarla  ·  o simplemente ≥8 días desde su último avance/creación). Devuelve el motivo o null.
  const stuckReason = (t: EpicaTask): string | null => {
    if (t.status === 'Terminada' || t.status === ARCHIVED) return null
    const resched = new Set(t.planHist || []).size
    const last = lastProgressDay(t) || t.createdAt || ''
    const daysSince = last ? Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(last + 'T00:00:00').getTime()) / 86400000) : 0
    const worked = investedMinOf(t) > 0 || (t.progressLog || []).length > 0
    if (resched >= 3) return `Reprogramada ${resched} veces — quizá conviene dividirla o soltarla`
    if (worked && daysSince >= 5) return `${daysSince} días sin avanzar desde el último toque`
    if (daysSince >= 8) return `${daysSince} días sin movimiento`
    return null
  }
  // Predicados de estado reutilizables por los filtros (Día, backlog y épicas).
  const isStuck = (t: EpicaTask) => stuckReason(t) != null                                   // 🐌 estancada
  const isMultiDay = (t: EpicaTask) => diasTrabajados(t) >= 2                                 // ⧗ trabajada en varios días
  const isCarried = (t: EpicaTask) => !!t.plan && t.plan < today && t.status !== 'Terminada' && t.status !== ARCHIVED  // ⏳ de días anteriores
  // Días que llevas con una tarea (desde que la creaste; si no hay fecha de creación, desde que la planeaste).
  const diasCon = (t: EpicaTask): number => {
    const desde = t.createdAt || t.plan
    if (!desde) return 0
    const d = Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(desde + 'T00:00:00').getTime()) / 86400000)
    return d > 0 ? d : 0
  }
  // ARRASTRADAS: tareas planeadas para un día YA PASADO y sin terminar → se muestran
  // en el enfoque de hoy (no se pierden), marcadas y con "desde hace N días".
  const arrastradas = useMemo(() => {
    if (viewDate !== today) return [] as { e: Epica; t: EpicaTask; i: number }[]
    const arr: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan && t.plan < today && t.status !== 'Terminada' && t.status !== ARCHIVED) arr.push({ e, t, i }) }))
    return arr.sort((a, b) => (a.t.plan || '').localeCompare(b.t.plan || ''))
  }, [activeEpics, viewDate, today])
  // conteo de tareas por día (para la tira y el calendario)
  const planCounts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>()
    activeEpics.forEach(e => (e.tasks || []).forEach(t => {
      if (!t.plan || t.status === ARCHIVED) return
      const c = m.get(t.plan) || { total: 0, done: 0 }
      c.total++; if (t.status === 'Terminada') c.done++
      m.set(t.plan, c)
    }))
    return m
  }, [activeEpics])
  // Ventana de la tira: 6 días atrás + hoy + 13 adelante. Los días pasados
  // importan para reprogramar lo que quedó pendiente sin abrir el calendario.
  const STRIP_BACK = 6
  const STRIP_LEN = 20
  const stripDays = useMemo(() => {
    const o = daysUntil(viewDate)
    const inBase = o != null && o >= -STRIP_BACK && o <= STRIP_LEN - STRIP_BACK - 1
    const start = inBase ? addDays(today, -STRIP_BACK) : addDays(viewDate, -STRIP_BACK)
    return Array.from({ length: STRIP_LEN }, (_, i) => addDays(start, i))
  }, [today, viewDate])

  /* ─── Plan de hoy: acciones (cada tarjeta = 1 patchEpic) ──── */
  // Reasigna planOrder=1000,2000,… agrupando por épica (1 patch por épica tocada).
  const applyPlanOrder = (ordered: { e: Epica; i: number }[]) => {
    const byEpic = new Map<string, { e: Epica; set: [number, number][] }>()
    ordered.forEach((x, pos) => {
      if (!byEpic.has(x.e.id)) byEpic.set(x.e.id, { e: x.e, set: [] })
      byEpic.get(x.e.id)!.set.push([x.i, (pos + 1) * 1000])
    })
    byEpic.forEach(({ e, set }) => {
      const tasks = clone(e.tasks)
      set.forEach(([i, o]) => { if (tasks[i]) tasks[i].planOrder = o })
      patchEpic(e.id, { tasks })
    })
  }
  // Planea (o mueve) una tarea a un día. Lee maxPlanOrderFor ANTES de mutar,
  // así la propia tarea (con su plan viejo) no infla el conteo del día destino.
  // Si la tarea queda planeada para HOY → estado "En curso" (recordando el previo); si sale → se revierte.
  const applyPlanStatus = (task: EpicaTask, newPlanDay: string) => {
    if (task.status === 'Terminada') return
    if (newPlanDay === todayISO()) {
      if (task.status !== 'En curso') { if (task.planStatusPrev == null) task.planStatusPrev = task.status; task.status = 'En curso' }
    } else {
      if (task.status === 'En curso' && task.planStatusPrev != null) task.status = task.planStatusPrev
      delete task.planStatusPrev
    }
  }
  const planTaskToDay = (e: Epica, i: number, dayISO: string, opts?: { toast?: boolean }) => {
    const tasks = clone(e.tasks)
    const prev = tasks[i].plan
    tasks[i].plan = dayISO
    if (!tasks[i].priority) tasks[i].priority = prioFromDue(tasks[i].due)
    if (prev !== dayISO || tasks[i].planOrder == null) tasks[i].planOrder = maxPlanOrderFor(dayISO) + 1000
    applyPlanStatus(tasks[i], dayISO)
    const snaps = opts?.toast ? snapshot([e.id]) : []
    patchEpic(e.id, { tasks })
    if (opts?.toast && dayISO !== viewDate) undoToast(`Movida a ${relLong(dayISO).toLowerCase()}`, snaps)
  }
  const addToPlan = (e: Epica, i: number) => planTaskToDay(e, i, viewDate)
  const removeFromPlan = (e: Epica, i: number, withToast = true) => {
    const snap: Partial<EpicaTask> = { plan: e.tasks[i].plan, priority: e.tasks[i].priority, planOrder: e.tasks[i].planOrder }
    const tasks = clone(e.tasks)
    delete tasks[i].plan; delete tasks[i].priority; delete tasks[i].planOrder
    applyPlanStatus(tasks[i], '')
    patchEpic(e.id, { tasks })
    setRowMenu(null)
    if (withToast) {
      removeUndoRef.current = { eId: e.id, tid: e.tasks[i].id!, snap }
      showToast('Quitada del plan', false, {
        label: 'Deshacer', fn: () => {
          const u = removeUndoRef.current; if (!u) return
          const f = findTaskRef(u.eId, u.tid); if (!f) return   // la tarea ya no existe
          const tk = clone(f.e.tasks)
          tk[f.i].plan = u.snap.plan; tk[f.i].priority = u.snap.priority; tk[f.i].planOrder = u.snap.planOrder
          applyPlanStatus(tk[f.i], u.snap.plan || '')
          patchEpic(u.eId, { tasks: tk })
        },
      })
    }
  }
  const setPriority = (e: Epica, i: number, p: Prio) => {
    const tasks = clone(e.tasks); tasks[i].priority = p
    patchEpic(e.id, { tasks }); setPrioMenu(null); setRowMenu(null)
  }
  // Fija (o quita, si repites la misma) la dificultad de una tarea
  const setDifficulty = (e: Epica, i: number, d: Dif) => {
    const tasks = clone(e.tasks)
    if (tasks[i].difficulty === d) delete tasks[i].difficulty; else tasks[i].difficulty = d
    patchEpic(e.id, { tasks })
  }
  // Cicla la dificultad sin abrir el editor: (sin) → fácil → media → difícil → (sin)
  const cycleDifficulty = (e: Epica, i: number) => {
    const order: (Dif | undefined)[] = [undefined, 'facil', 'media', 'dificil']
    const cur = e.tasks[i]?.difficulty
    const next = order[(order.indexOf(cur) + 1 + order.length) % order.length]
    const tasks = clone(e.tasks)
    if (next) tasks[i].difficulty = next; else delete tasks[i].difficulty
    patchEpic(e.id, { tasks })
  }
  const setDifficultyVal = (e: Epica, i: number, v: string) => {
    const tasks = clone(e.tasks); if (v) tasks[i].difficulty = v as Dif; else delete tasks[i].difficulty
    patchEpic(e.id, { tasks })
  }
  const setPriorityVal = (e: Epica, i: number, v: string) => {
    const tasks = clone(e.tasks); if (v) tasks[i].priority = v as Prio; else delete tasks[i].priority
    patchEpic(e.id, { tasks })
  }
  /** Aplica "completar" a la tarea t (MUTÁNDOLA). Si se repite y aún no está Terminada, la
   *  REPROGRAMA a su siguiente ocurrencia (en vez de terminarla) y apunta el ciclo cumplido; si no,
   *  la marca Terminada. Devuelve el mensaje de toast de la recurrencia, o null. ÚNICO lugar con la
   *  lógica de recurrencia al completar: TODOS los caminos de "Terminar" pasan por aquí. */
  // Completa una tarea IN SITU delegando en completeRecurring (fuente única compartida con /tiempo,
  // así "✓ y hecha" hace lo MISMO se termine desde Épicas o desde Tiempo). Devuelve el mensaje.
  const applyComplete = (t: EpicaTask): string | null => {
    if (t.status === 'Terminada') return null
    const done = todayISO()
    const wasRepeat = !!t.repeat
    const res = completeRecurring(t, done, d => maxPlanOrderFor(d) + 1000)
    Object.assign(t, res)
    // Object.assign no borra las claves que completeRecurring quitó (rama reprogramación).
    for (const k of ['doneAt', 'progress', 'planStatusPrev'] as const) if (!(k in res)) delete t[k]
    if (!wasRepeat) return null
    if (t.status === 'Terminada') return 'Hecha ✓ · serie terminada'
    return `Hecha ✓ · vuelve ${relLong(t.plan || done).toLowerCase()}`
  }
  /** Completar desde el plan/tablero, con toast + deshacer para la recurrencia. */
  const completeFromPlan = (e: Epica, i: number) => {
    const snap = clone(e.tasks[i])
    const tasks = clone(e.tasks)
    const msg = applyComplete(tasks[i])
    patchEpic(e.id, { tasks })
    if (msg) {   // hubo recurrencia → ofrece deshacer
      const undo = () => {
        const ep = epicsRef.current.find(x => x.id === e.id); if (!ep) return
        const back = clone(ep.tasks)
        if (back[i]?.t !== snap.t) return             // el array cambió: no toques otra tarea
        back[i] = snap
        patchEpic(e.id, { tasks: back })
      }
      showToast(msg, false, { label: 'Deshacer', fn: undo })
    }
  }
  const uncompleteFromPlan = (e: Epica, i: number) => {
    const tasks = clone(e.tasks)
    const wasDone = tasks[i].doneAt
    tasks[i].status = tasks[i].planPrev || 'Por hacer'
    delete tasks[i].doneAt; delete tasks[i].planPrev
    // Reabrir un ciclo de una recurrente: saca ese día de repeatDone (no siga contando como cumplido).
    if (wasDone && Array.isArray(tasks[i].repeatDone)) {
      tasks[i].repeatDone = tasks[i].repeatDone!.filter(d => d !== wasDone)
      if (!tasks[i].repeatDone!.length) delete tasks[i].repeatDone
    }
    patchEpic(e.id, { tasks })
  }

  // Keys de las filas REALMENTE visibles (en orden), leídas del DOM: así el reorden
  // respeta cualquier filtro activo (dayEpica/planFilter) en vez de usar planPend crudo.
  const visiblePlanKeys = () =>
    (Array.from(planListRef.current?.querySelectorAll('[data-plan-row]') || []) as HTMLElement[])
      .map(r => r.getAttribute('data-key') || '').filter(Boolean)

  const movePlan = (key: string, dir: 'up' | 'down') => {
    const vis = visiblePlanKeys()
    const vi = vis.indexOf(key)
    if (vi < 0) return
    const swapVi = dir === 'up' ? vi - 1 : vi + 1
    if (swapVi < 0 || swapVi >= vis.length) return
    const neighbor = vis[swapVi]
    const full = planPend.map(x => ({ e: x.e, i: x.i, key: planKey(x.e.id, x.t) }))
    const fi = full.findIndex(x => x.key === key); if (fi < 0) return
    const without = full.filter((_, idx) => idx !== fi)
    let insertAt = without.findIndex(x => x.key === neighbor); if (insertAt < 0) return
    if (dir === 'down') insertAt += 1
    const reordered = [...without.slice(0, insertAt), full[fi], ...without.slice(insertAt)]
    applyPlanOrder(reordered.map(x => ({ e: x.e, i: x.i })))
    setRowMenu(null)
  }
  const commitReorder = (key: string, destIndex: number) => {
    const vis = visiblePlanKeys()                    // orden visible (filtrado), del DOM
    const full = planPend.map(x => ({ e: x.e, i: x.i, key: planKey(x.e.id, x.t) }))
    const fi = full.findIndex(x => x.key === key); if (fi < 0) return
    const without = full.filter((_, idx) => idx !== fi)
    // destIndex está en la escala VISIBLE. Traducirlo al índice real en la lista completa:
    // insertar la tarea justo antes de la fila visible en destIndex (o tras la última).
    const anchor = destIndex < vis.length ? vis[destIndex] : null
    let insertAt: number
    if (anchor == null) {
      const lastVis = vis[vis.length - 1]
      const li = lastVis ? without.findIndex(x => x.key === lastVis) : -1
      insertAt = li < 0 ? without.length : li + 1
    } else {
      insertAt = without.findIndex(x => x.key === anchor)
      if (insertAt < 0) insertAt = without.length
    }
    const reordered = [...without.slice(0, insertAt), full[fi], ...without.slice(insertAt)]
    applyPlanOrder(reordered.map(x => ({ e: x.e, i: x.i })))
  }
  // Fija el orden mostrado (vista ordenada) como el orden manual del plan
  const commitPlanOrder = (list: { e: Epica; i: number }[]) => {
    applyPlanOrder(list.map(x => ({ e: x.e, i: x.i })))
    setPlanSort('plan')
    showToast('Orden fijado')
  }
  // Trae al plan de hoy TODAS las pendientes de días anteriores (reprograma plan=hoy).
  const bringOverdue = () => {
    let base = maxPlanOrderFor(today)
    const byEpic = new Map<string, { e: Epica; idx: number[] }>()
    arrastradas.forEach(x => { if (!byEpic.has(x.e.id)) byEpic.set(x.e.id, { e: x.e, idx: [] }); byEpic.get(x.e.id)!.idx.push(x.i) })
    byEpic.forEach(({ e, idx }) => {
      const tasks = clone(e.tasks)
      idx.forEach(i => {
        base += 1000; tasks[i].plan = today
        if (!tasks[i].priority) tasks[i].priority = prioFromDue(tasks[i].due)
        tasks[i].planOrder = base
        applyPlanStatus(tasks[i], today)   // igual que planTaskToDay: planear para hoy → "En curso"
      })
      patchEpic(e.id, { tasks })
    })
    showToast(`${arrastradas.length} ${arrastradas.length === 1 ? 'pendiente traída' : 'pendientes traídas'} a hoy`)
  }

  /* ─── Selección múltiple en el enfoque ───────────────────── */
  const togglePlanSel = (key: string) => setPlanSel(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n
  })
  const planSelGroup = () => {
    const m = new Map<string, number[]>()
    planSel.forEach(key => {
      const f = keyToTask(key); if (!f) return    // la tarea ya no existe: se ignora
      if (!m.has(f.e.id)) m.set(f.e.id, []); m.get(f.e.id)!.push(f.i)
    })
    return m
  }
  /** Aplica una mutación a toda la selección: un patch por épica tocada. */
  const planBulk = (mutate: (t: EpicaTask) => void, msg: string) => {
    const count = planSel.size
    const group = planSelGroup()
    const snaps = snapshot([...group.keys()])
    group.forEach((idxs, eId) => {
      const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
      const tasks = clone(ep.tasks)
      idxs.forEach(i => { if (tasks[i]) mutate(tasks[i]) })
      patchEpic(eId, { tasks })
    })
    undoToast(`${count} ${msg}`, snaps); setPlanSel(new Set())
  }
  const planBulkMove = (day: string) => {
    if (!day) return
    const count = planSel.size
    let base = maxPlanOrderFor(day)
    const group = planSelGroup()
    const snaps = snapshot([...group.keys()])
    group.forEach((idxs, eId) => {
      const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
      const tasks = clone(ep.tasks)
      idxs.forEach(i => {
        const t = tasks[i]; if (!t) return
        base += 1000
        t.plan = day
        if (!t.priority) t.priority = prioFromDue(t.due)
        t.planOrder = base
        applyPlanStatus(t, day)
      })
      patchEpic(eId, { tasks })
    })
    setPlanSel(new Set())
    undoToast(`${count} ${count === 1 ? 'movida' : 'movidas'} a ${relLong(day).toLowerCase()}`, snaps)
  }
  const planBulkDone = () => planBulk(t => { applyComplete(t) }, 'completadas')
  const planBulkRemove = () => planBulk(t => {
    delete t.plan; delete t.priority; delete t.planOrder; applyPlanStatus(t, '')
  }, 'quitadas del plan')
  const planBulkPrio = (p: Prio) => planBulk(t => { t.priority = p }, `· prioridad ${p}`)
  const planBulkDif = (d: Dif) => planBulk(t => { t.difficulty = d }, `· dificultad ${difStyle(d).label.toLowerCase()}`)
  const planBulkProgress = (v: number) => planBulk(t => {
    if (v > 0) { t.progress = v; upsertProgressPct(t, v) }
    else { delete t.progress; const log = (t.progressLog || []).filter(x => !(x.d === todayISO() && !x.note)); if (log.length) t.progressLog = log; else delete t.progressLog }
  }, `· avance ${v}%`)
  const planBulkStatus = (s: string) => planBulk(t => {
    if (s === 'Terminada') { applyComplete(t) }   // reprograma las recurrentes en vez de terminarlas
    else { t.status = s; delete t.doneAt; delete t.planPrev }
  }, `· ${taskStyle(s).label.toLowerCase()}`)
  // Mueve toda la selección a otra épica (una a una, preservando sus campos de plan)
  const planBulkEpica = (toEId: string) => {
    const toE = epicsRef.current.find(e => e.id === toEId); if (!toE) return
    const count = planSel.size
    const group = planSelGroup()
    const snaps = snapshot([...group.keys(), toEId])
    const moving: EpicaTask[] = []
    group.forEach((idxs, eId) => {
      if (eId === toEId) return
      const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
      const keep = clone(ep.tasks).filter((_, idx) => !idxs.includes(idx))
      idxs.forEach(i => { if (ep.tasks[i]) moving.push(clone(ep.tasks[i])) })
      patchEpic(eId, { tasks: keep })
    })
    if (moving.length) patchEpic(toEId, { tasks: [...clone(toE.tasks), ...moving] })
    undoToast(`${count} ${count === 1 ? 'movida' : 'movidas'} a ${toE.name}`, snaps); setPlanSel(new Set())
  }

  /* ─── Tablero: arrastrar tarjetas entre columnas ──────────────
     Pointer events (no HTML5 drag) para que también funcione en táctil.
     Un umbral de 6px distingue "arrastrar" de "clic para abrir la tarea". */
  const onCardDown = (ev: React.PointerEvent, key: string) => {
    boardDragRef.current = { key, x: ev.clientX, y: ev.clientY, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onCardMove = (ev: React.PointerEvent) => {
    const d = boardDragRef.current; if (!d) return
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return
      d.moved = true; setBoardDrag(d.key)
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    setBoardOverCol((el?.closest('[data-col]') as HTMLElement | null)?.dataset.col ?? null)
  }
  const onCardUp = (ev: React.PointerEvent, x: { e: Epica; t: EpicaTask; i: number }) => {
    const d = boardDragRef.current
    boardDragRef.current = null
    const col = boardOverCol
    setBoardDrag(null); setBoardOverCol(null)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: x.e.id, tid: x.t.id! }); return }   // fue un clic
    if (!col || col === x.t.status) return
    // Soltar en "Terminada" pasa por el mismo camino que el check del plan,
    // para que una tarea recurrente se reprograme en vez de terminarse.
    if (col === 'Terminada') completeFromPlan(x.e, x.i)
    else setTaskStatus(x.e, x.i, col)
    void ev
  }
  const onCardCancel = () => { boardDragRef.current = null; setBoardDrag(null); setBoardOverCol(null) }

  /* ─── Vista semana: arrastrar tarjetas entre días ─────────────
     Mismo patrón que el tablero, pero la columna destino es un día
     y soltar reprograma la tarea (planTaskToDay), no cambia su estado. */
  const onWeekDown = (ev: React.PointerEvent, key: string) => {
    weekDragRef.current = { key, x: ev.clientX, y: ev.clientY, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onWeekMove = (ev: React.PointerEvent) => {
    const d = weekDragRef.current; if (!d) return
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return
      d.moved = true; setWeekDrag(d.key)
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    setWeekOverDay((el?.closest('[data-weekday]') as HTMLElement | null)?.dataset.weekday ?? null)
  }
  const onWeekUp = (x: { e: Epica; t: EpicaTask; i: number }) => {
    const d = weekDragRef.current
    weekDragRef.current = null
    const day = weekOverDay
    setWeekDrag(null); setWeekOverDay(null)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: x.e.id, tid: x.t.id! }); return }   // fue un clic
    if (day && day !== x.t.plan) planTaskToDay(x.e, x.i, day, { toast: true })
  }
  const onWeekCancel = () => { weekDragRef.current = null; setWeekDrag(null); setWeekOverDay(null) }

  /* ─── Vista multi-semana (sprint): arrastrar tarjetas entre semanas ───
     Soltar en otra semana reprograma la tarea al MISMO día de la semana destino
     (lun→lun, mié→mié…), como mover una historia al siguiente sprint. */
  const onSprintDown = (ev: React.PointerEvent, key: string) => {
    sprintDragRef.current = { key, x: ev.clientX, y: ev.clientY, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onSprintMove = (ev: React.PointerEvent) => {
    const d = sprintDragRef.current; if (!d) return
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return
      d.moved = true; setSprintDrag(d.key)
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    // Un día concreto tiene prioridad (mover a ESE día); si no, la semana (mismo día de la semana)
    setSprintOverDay((el?.closest('[data-sprintday]') as HTMLElement | null)?.dataset.sprintday ?? null)
    setSprintOverCol((el?.closest('[data-weekcol]') as HTMLElement | null)?.dataset.weekcol ?? null)
  }
  const onSprintUp = (x: { e: Epica; t: EpicaTask; i: number }) => {
    const d = sprintDragRef.current
    sprintDragRef.current = null
    const day = sprintOverDay, mon = sprintOverCol
    setSprintDrag(null); setSprintOverCol(null); setSprintOverDay(null)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: x.e.id, tid: x.t.id! }); return }   // fue un clic
    if (!x.t.plan) return
    // Soltaste sobre un día → ese día exacto; sobre la columna → mismo día de esa semana
    let target = day
    if (!target && mon) { const wd = (new Date(x.t.plan + 'T00:00:00').getDay() + 6) % 7; target = addDays(mon, wd) }
    if (target && target !== x.t.plan) planTaskToDay(x.e, x.i, target, { toast: true })
  }
  const onSprintCancel = () => { sprintDragRef.current = null; setSprintDrag(null); setSprintOverCol(null); setSprintOverDay(null) }

  /* ─── Calendario: arrastrar tarjetas entre días de la retícula ─── */
  const onCalDown = (ev: React.PointerEvent, key: string) => {
    calDragRef.current = { key, x: ev.clientX, y: ev.clientY, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onCalMove = (ev: React.PointerEvent) => {
    const d = calDragRef.current; if (!d) return
    if (!d.moved) { if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return; d.moved = true; setCalDrag(d.key) }
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    setCalOverDay((el?.closest('[data-calday]') as HTMLElement | null)?.dataset.calday ?? null)
  }
  const onCalUp = (x: { e: Epica; t: EpicaTask; i: number }) => {
    const d = calDragRef.current; calDragRef.current = null
    const day = calOverDay; setCalDrag(null); setCalOverDay(null)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: x.e.id, tid: x.t.id! }); return }
    if (day && day !== x.t.plan) planTaskToDay(x.e, x.i, day, { toast: true })
  }
  const onCalCancel = () => { calDragRef.current = null; setCalDrag(null); setCalOverDay(null) }

  /* ─── Timeline: arrastrar una barra horizontalmente desplaza sus fechas ───
     Corre plan y entrega el mismo número de días (arrastrar toda la barra). */
  const TL_DAY_W = 30
  const shiftTaskDates = (e: Epica, i: number, delta: number) => {
    if (!delta) return
    const snaps = snapshot([e.id])
    const tasks = clone(e.tasks); const t = tasks[i]
    if (t.plan) { t.plan = addDays(t.plan, delta); t.planOrder = maxPlanOrderFor(t.plan) + 1000 }
    if (t.due) t.due = addDays(t.due, delta)
    patchEpic(e.id, { tasks })
    undoToast(`${t.t} · ${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'día' : 'días'}`, snaps)
  }
  const onTlDown = (ev: React.PointerEvent, key: string, e: Epica, i: number) => {
    tlDragRef.current = { key, e, i, x: ev.clientX, moved: false }
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onTlMove = (ev: React.PointerEvent) => {
    const d = tlDragRef.current; if (!d) return
    if (!d.moved) { if (Math.abs(ev.clientX - d.x) < 6) return; d.moved = true; setTlDragKey(d.key) }
    setTlOffset(ev.clientX - d.x)
  }
  const onTlUp = () => {
    const d = tlDragRef.current; const off = tlOffset
    tlDragRef.current = null; setTlDragKey(null); setTlOffset(0)
    if (!d) return
    if (!d.moved) { setTaskView({ eId: d.e.id, tid: d.e.tasks[d.i]?.id! }); return }
    shiftTaskDates(d.e, d.i, Math.round(off / TL_DAY_W))
  }
  const onTlCancel = () => { tlDragRef.current = null; setTlDragKey(null); setTlOffset(0) }

  /* Drag por manija (pointer events; mouse + touch con setPointerCapture) */
  const computeDropIndex = (clientY: number) => {
    const rows = Array.from(planListRef.current?.querySelectorAll('[data-plan-row]') || []) as HTMLElement[]
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return idx
    }
    return rows.length
  }
  const onGripDown = (ev: React.PointerEvent, key: string) => {
    ev.preventDefault(); ev.stopPropagation()
    dragKeyRef.current = key
    setDraggingKey(key)
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const onGripMove = (ev: React.PointerEvent) => {
    if (!dragKeyRef.current) return
    // ¿el puntero está sobre un chip de la tira de días? → mover de día (no reordenar)
    const overEl = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
    const over = overEl?.closest('[data-day]') as HTMLElement | null
    const day = over?.dataset.day ?? null
    setDragOverDay(day)
    setDropIndex(day && day !== viewDate ? null : computeDropIndex(ev.clientY))
  }
  const onGripUp = (ev: React.PointerEvent) => {
    const key = dragKeyRef.current
    if (!key) return
    const day = dragOverDay
    const di = computeDropIndex(ev.clientY)
    dragKeyRef.current = null
    setDraggingKey(null); setDropIndex(null); setDragOverDay(null)
    if (day && day !== viewDate) {
      // La key es `${eId}:${t.id}` (id = UUID), NO un índice. Resolver por keyToTask.
      const f = keyToTask(key)
      if (f) planTaskToDay(f.e, f.i, day, { toast: true })
    } else {
      commitReorder(key, di)
    }
  }
  // pointercancel (el navegador se lleva el puntero) libera el estado del drag SIN confirmar reorden
  const onGripCancel = () => {
    if (!dragKeyRef.current) return
    dragKeyRef.current = null
    setDraggingKey(null); setDropIndex(null); setDragOverDay(null)
  }

  /* ─── Interacciones inline en la destacada ───────────────── */
  const setTaskStatus = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks)
    // Marcar "Terminada" una tarea recurrente NO la termina: la reprograma (misma lógica que el
    // botón de completar). Así la serie no se rompe sin importar por dónde la marcaste.
    if (v === 'Terminada' && tasks[ti].repeat && tasks[ti].status !== 'Terminada') {
      const msg = applyComplete(tasks[ti]); patchEpic(e.id, { tasks }); if (msg) showToast(msg); return
    }
    // Recuerda el estado previo al completar, para que "descompletar" desde el plan lo restaure
    if (v === 'Terminada' && tasks[ti].status !== 'Terminada') tasks[ti].planPrev = tasks[ti].status
    const wasDone = tasks[ti].doneAt
    tasks[ti].status = v
    if (v === 'Terminada') { if (!tasks[ti].doneAt) tasks[ti].doneAt = todayISO() }
    else {
      delete tasks[ti].doneAt; delete tasks[ti].planPrev
      // Reabrir una recurrente cuya serie había terminado: saca ese día de repeatDone.
      if (wasDone && Array.isArray(tasks[ti].repeatDone)) {
        tasks[ti].repeatDone = tasks[ti].repeatDone!.filter(d => d !== wasDone)
        if (!tasks[ti].repeatDone!.length) delete tasks[ti].repeatDone
      }
    }
    patchEpic(e.id, { tasks })
  }
  const setTaskDue = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks); tasks[ti].due = v
    patchEpic(e.id, { tasks })
  }
  // Resumen editable inline (necesita la columna `resumen`).
  const setTaskResumen = (e: Epica, ti: number, v: string) => {
    if (!resumenReady.current) { showToast('Corre la migración de `resumen` para editarlo aquí', true); return }
    const tasks = clone(e.tasks); tasks[ti].resumen = v.trim()
    patchEpic(e.id, { tasks })
  }
  // Links editables inline (label/url/orden), sin abrir "Editar".
  const setTaskLinks = (e: Epica, ti: number, links: EpicaTaskLink[]) => {
    const tasks = clone(e.tasks); tasks[ti].links = links
    patchEpic(e.id, { tasks })
  }
  // Fecha en que se terminó (editable). Vacío = la quita (sin cambiar el estado).
  const setTaskDoneAt = (e: Epica, ti: number, v: string) => {
    const tasks = clone(e.tasks); if (v) tasks[ti].doneAt = v; else delete tasks[ti].doneAt
    patchEpic(e.id, { tasks })
  }
  // Recordatorio de la tarea (ISO datetime, o '' para limpiar). Al fijarlo pide permiso
  // de notificación. Necesita la columna remind_at (gate).
  const setTaskRemind = (e: Epica, ti: number, iso: string) => {
    if (!remindReady.current) { showToast('Corre sql/epicas-06-remind.sql para usar recordatorios', true); return }
    const tasks = clone(e.tasks)
    if (iso) {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return
      tasks[ti].remindAt = d.toISOString()
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
    } else {
      tasks[ti].remindAt = ''   // '' = limpiar (se manda como null)
    }
    patchEpic(e.id, { tasks })
  }
  // Comentarios rápidos de la tarea (sin abrir el editor). Necesita la columna comentarios.
  const addComment = (e: Epica, ti: number, text: string) => {
    const txt = (text || '').trim(); if (!txt) return
    if (!comentariosReady.current) { showToast('Corre sql/epicas-07-comentarios.sql para usar comentarios', true); return }
    const tasks = clone(e.tasks)
    const list = tasks[ti].comentarios || []
    list.push({ at: new Date().toISOString(), text: txt })
    tasks[ti].comentarios = list
    patchEpic(e.id, { tasks })
  }
  const removeComment = (e: Epica, ti: number, at: string) => {
    const tasks = clone(e.tasks)
    const list = (tasks[ti].comentarios || []).filter(c => c.at !== at)
    tasks[ti].comentarios = list   // se manda aunque quede vacío (la columna ya existe)
    patchEpic(e.id, { tasks })
  }
  const setTaskTitle = (e: Epica, ti: number, v: string) => {
    const t = (v || '').trim(); if (!t) return
    const tasks = clone(e.tasks); tasks[ti].t = t
    patchEpic(e.id, { tasks })
  }
  // Estimado propio (minutos) editable inline. null = usar el default por dificultad.
  const setTaskEstMin = (e: Epica, ti: number, min: number | null) => {
    if (!estMinReady.current) { showToast('Corre sql/epicas-09-est-min.sql para guardar tu estimado', true); return }
    const tasks = clone(e.tasks)
    if (min != null && min > 0) tasks[ti].estMin = Math.round(min)
    else tasks[ti].estMin = 0   // 0/propiedad presente = “sin estimado propio”, se limpia en la fila (est_min = null? -> guardamos 0 = usa dificultad)
    patchEpic(e.id, { tasks })
  }
  // ── Sesiones por día (dayPlans): la misma tarea en varios días, con horas/dificultad/hecho por día ──
  const dayPlansOf = (t: EpicaTask): EpicaDayPlan[] => Array.isArray(t.dayPlans) ? t.dayPlans : []
  const mutateDayPlans = (e: Epica, ti: number, fn: (arr: EpicaDayPlan[]) => EpicaDayPlan[]) => {
    if (!dayPlansReady.current) { showToast('Corre sql/epicas-10-day-plans.sql para agendar por día', true); return }
    const tasks = clone(e.tasks)
    const cur = Array.isArray(tasks[ti].dayPlans) ? tasks[ti].dayPlans! : []
    tasks[ti].dayPlans = fn(cur).sort((a, b) => a.day.localeCompare(b.day))
    patchEpic(e.id, { tasks })
  }
  const addDayPlan = (e: Epica, ti: number, day: string) => {
    if (!day) return
    mutateDayPlans(e, ti, arr => arr.some(d => d.day === day) ? arr : [...arr, { day }])
  }
  const removeDayPlan = (e: Epica, ti: number, day: string) => mutateDayPlans(e, ti, arr => arr.filter(d => d.day !== day))
  const setDayPlanField = (e: Epica, ti: number, day: string, patch: Partial<EpicaDayPlan>) =>
    mutateDayPlans(e, ti, arr => arr.map(d => d.day === day ? { ...d, ...patch } : d))
  const toggleDayPlanDone = (e: Epica, ti: number, day: string) =>
    mutateDayPlans(e, ti, arr => arr.map(d => d.day === day ? { ...d, done: !d.done } : d))
  // Control reusable de estimado de tiempo: dropdown de presets + "Personalizado…" (tiempo libre).
  // `ckey` identifica el control (para el modo personalizado); `onSet(min|null)` guarda el valor.
  const renderEstControl = (ckey: string, min: number | undefined, defMin: number, onSet: (m: number | null) => void, compact = false) => {
    const has = typeof min === 'number' && min > 0
    const cur = has ? min : 0
    const isPreset = has && EST_PRESETS.some(([m]) => m === cur)
    const isCustom = estCustomId === ckey || (has && !isPreset)
    const selVal = isCustom ? 'custom' : (has ? String(cur) : '')
    const selStyle: CSSProperties = { cursor: 'pointer', border: `1px solid ${has ? 'rgba(194,147,58,0.5)' : 'rgba(15,35,64,0.16)'}`, borderRadius: compact ? 7 : 9, padding: compact ? '4px 6px' : '8px 10px', fontSize: compact ? 11.5 : 13, fontWeight: 700, color: has ? '#A87A2C' : 'rgba(20,35,61,0.62)', background: has ? 'rgba(194,147,58,0.08)' : '#fff', outline: 'none', minWidth: compact ? 92 : 152 }
    return (
      <>
        <select value={selVal} aria-label="Estimado de tiempo" onChange={ev => { const v = ev.target.value; if (v === 'custom') setEstCustomId(ckey); else if (v === '') { setEstCustomId(null); onSet(null) } else { setEstCustomId(null); onSet(Number(v)) } }} style={selStyle}>
          <option value="">{defMin ? (compact ? `≈ ${fmtEst(defMin)}` : `Por dificultad · ~${fmtEst(defMin)}`) : (compact ? 'Tiempo…' : 'Por dificultad')}</option>
          <optgroup label="Elige un tiempo">{EST_PRESETS.map(([m, lbl]) => <option key={m} value={String(m)}>{lbl}</option>)}</optgroup>
          <option value="custom">Personalizado…</option>
        </select>
        {isCustom && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(194,147,58,0.5)', borderRadius: compact ? 7 : 9, padding: compact ? '3px 7px' : '6px 9px', background: 'rgba(194,147,58,0.06)' }}>
            <input key={`estc:${ckey}:${cur}`} type="text" autoFocus defaultValue={has ? fmtCustom(cur) : ''} placeholder="1h30 · 45m · 2h"
              onKeyDown={ev => { if (ev.key === 'Enter') (ev.currentTarget as HTMLInputElement).blur() }}
              onBlur={ev => { const v = ev.currentTarget.value.trim(); if (v === '') { onSet(null); setEstCustomId(null); return } const mm = parseEst(v); if (mm && mm > 0) { onSet(mm); setEstCustomId(null) } }}
              aria-label="Tiempo personalizado" style={{ width: compact ? 78 : 92, border: 'none', background: 'transparent', fontSize: compact ? 12 : 13, fontWeight: 700, color: '#A87A2C', outline: 'none' }} />
          </div>
        )}
      </>
    )
  }
  // Repetición editable inline en el detalle (mismos presets que el editor). null = no se repite.
  const setTaskRepeat = (e: Epica, ti: number, repeat: EpicaRepeat | null) => {
    const tasks = clone(e.tasks)
    if (repeat) tasks[ti].repeat = repeat
    else { delete tasks[ti].repeat; delete tasks[ti].repeatUntil }
    patchEpic(e.id, { tasks })
  }
  // Mueve una tarea a otra épica (saca de la actual, agrega a la destino). Limpia la selección (los índices cambian).
  const moveTaskToEpica = (fromE: Epica, i: number, toEId: string) => {
    if (fromE.id === toEId) return
    const toE = epicsRef.current.find(e => e.id === toEId); if (!toE) return
    const task = fromE.tasks[i]; if (!task) return
    const fromTasks = clone(fromE.tasks).filter((_, idx) => idx !== i)
    const toTasks = clone(toE.tasks); toTasks.push(clone(task))
    patchEpic(fromE.id, { tasks: fromTasks })
    patchEpic(toE.id, { tasks: toTasks })
    setBacklogSel(new Set())
    setFeaturedId(toE.id)   // no "desaparece" de la vista aunque haya filtro activo
    showToast(`«${task.t || 'Tarea'}» movida a ${toE.name}`)
  }
  /** Cambia el avance de una tarea.
   *  `defer` (arrastre del slider): pinta al instante y persiste UNA sola vez al soltar.
   *  Sin debounce, un arrastre de 0→100 con step=5 disparaba 20 PATCH con el array
   *  completo de tareas; llegaban desordenados y el último en responder ganaba. */
  const setTaskProgress = (e: Epica, ti: number, v: number, defer = false) => {
    const tasks = clone(e.tasks)
    if (v > 0) {
      tasks[ti].progress = v
      upsertProgressPct(tasks[ti], v)   // registra el % de hoy en la bitácora
    } else {
      delete tasks[ti].progress
      // Poner el avance en 0 no es "avanzar": limpia la entrada de hoy si no tiene nota,
      // para que la tarea no aparezca en "Trabajadas hoy" ni con el badge "✎ avancé".
      const log = (tasks[ti].progressLog || []).filter(x => !(x.d === todayISO() && !x.note))
      if (log.length) tasks[ti].progressLog = log; else delete tasks[ti].progressLog
    }
    if (!defer) { patchEpic(e.id, { tasks }); return }
    setEpics(list => list.map(x => (x.id === e.id ? { ...x, tasks } : x)))
    progressPending.current = { id: e.id, tasks }
    if (progressTimer.current) clearTimeout(progressTimer.current)
    progressTimer.current = setTimeout(() => {
      const p = progressPending.current; progressPending.current = null
      if (p) patchEpic(p.id, { tasks: p.tasks })
    }, 450)
  }
  const toggleSubtask = (e: Epica, ti: number, si: number) => {
    const tasks = clone(e.tasks); const st = tasks[ti].subtasks
    if (!st || !st[si]) return
    st[si].done = !st[si].done
    if (st[si].done) st[si].doneAt = new Date().toISOString(); else delete st[si].doneAt   // registra día+hora al completar
    patchEpic(e.id, { tasks })
  }
  /* ─── Subtareas editables sin abrir el editor ─────────────── */
  const addSubtask = (e: Epica, ti: number, text: string) => {
    const v = text.trim(); if (!v) return
    const tasks = clone(e.tasks)
    tasks[ti].subtasks = [...(tasks[ti].subtasks || []), { id: uid(), t: v, done: false }]
    patchEpic(e.id, { tasks })
  }
  const setSubtaskText = (e: Epica, ti: number, si: number, text: string) => {
    const v = text.trim()
    const tasks = clone(e.tasks); const st = tasks[ti].subtasks
    if (!st || !st[si] || st[si].t === v) return
    if (!v) { st.splice(si, 1); if (!st.length) delete tasks[ti].subtasks }
    else st[si].t = v
    patchEpic(e.id, { tasks })
  }
  const removeSubtask = (e: Epica, ti: number, si: number) => {
    const tasks = clone(e.tasks); const st = tasks[ti].subtasks
    if (!st || !st[si]) return
    st.splice(si, 1); if (!st.length) delete tasks[ti].subtasks
    patchEpic(e.id, { tasks })
  }
  /** Mueve una subtarea arriba/abajo (índices absolutos dentro del array). */
  const moveSubtask = (e: Epica, ti: number, from: number, to: number) => {
    const tasks = clone(e.tasks); const st = tasks[ti].subtasks
    if (!st || to < 0 || to >= st.length || from === to) return
    const [m] = st.splice(from, 1); st.splice(to, 0, m)
    patchEpic(e.id, { tasks })
  }
  /** Edita campos de una subtarea por su id (título, %, nota, links, done). */
  const patchSubtask = (e: Epica, ti: number, sid: string, patch: Partial<EpicaSubtask>) => {
    const fresh = epicsRef.current.find(x => x.id === e.id) || e   // evita pisar cambios concurrentes (debounce)
    const tasks = clone(fresh.tasks); const st = tasks[ti]?.subtasks; if (!st) return
    const si = st.findIndex(x => x.id === sid); if (si < 0) return
    st[si] = { ...st[si], ...patch }
    patchEpic(fresh.id, { tasks })
  }
  // ── Bitácora de avance (días en que se avanzó en la tarea) ──
  const addProgressDay = (e: Epica, ti: number, d: string) => {
    if (!d) return
    const tasks = clone(e.tasks)
    const log = tasks[ti].progressLog || []
    if (log.some(x => x.d === d)) return
    log.push({ d }); log.sort((a, b) => b.d.localeCompare(a.d))
    tasks[ti].progressLog = log
    patchEpic(e.id, { tasks })
  }
  const removeProgressDay = (e: Epica, ti: number, d: string) => {
    const tasks = clone(e.tasks)
    const log = (tasks[ti].progressLog || []).filter(x => x.d !== d)
    if (log.length) tasks[ti].progressLog = log; else delete tasks[ti].progressLog
    patchEpic(e.id, { tasks })
  }
  const setProgressNote = (e: Epica, ti: number, d: string, note: string) => {
    const tasks = clone(e.tasks)
    const entry = (tasks[ti].progressLog || []).find(x => x.d === d)
    if (!entry) return
    if (note.trim()) entry.note = note; else delete entry.note
    patchEpic(e.id, { tasks })
  }
  // Cambia la fecha de un día de la bitácora (si el nuevo día no existe ya) y reordena.
  const setProgressDate = (e: Epica, ti: number, oldD: string, newD: string) => {
    if (!newD || newD === oldD) return
    const tasks = clone(e.tasks)
    const log = tasks[ti].progressLog || []
    if (log.some(x => x.d === newD)) { showToast('Ya hay un avance ese día', true); return }
    const entry = log.find(x => x.d === oldD)
    if (!entry) return
    entry.d = newD
    log.sort((a, b) => b.d.localeCompare(a.d))
    tasks[ti].progressLog = log
    patchEpic(e.id, { tasks })
  }
  // Fija el % TOTAL al final de ese día (0-100) o lo borra; el delta "+x%" se recalcula solo.
  const setProgressPct = (e: Epica, ti: number, d: string, pct: number | null) => {
    const tasks = clone(e.tasks)
    const entry = (tasks[ti].progressLog || []).find(x => x.d === d)
    if (!entry) return
    if (pct == null || Number.isNaN(pct)) delete entry.pct
    else entry.pct = Math.max(0, Math.min(100, Math.round(pct)))
    patchEpic(e.id, { tasks })
  }
  const toggleRoutineDay = (e: Epica, ri: number, di: number) => {
    const routines = clone(e.routines)
    const r = routines[ri]
    if (!r.weeks) r.weeks = {}
    const wk = (r.weeks[routineWeek] && r.weeks[routineWeek].length === 7)
      ? r.weeks[routineWeek] : [false, false, false, false, false, false, false]
    wk[di] = !wk[di]
    r.weeks[routineWeek] = wk
    if (routineWeek === mondayISO(todayISO())) r.days = wk   // mantiene `days` sincronizado con la semana actual
    patchEpic(e.id, { routines })
  }
  // marca/desmarca una rutina en una semana y día concretos (vista semana del enfoque)
  const toggleRoutineWeekDay = (e: Epica, ri: number, monday: string, di: number) => {
    const routines = clone(e.routines)
    const r = routines[ri]
    if (!r.weeks) r.weeks = {}
    const wk = (r.weeks[monday] && r.weeks[monday].length === 7) ? r.weeks[monday] : [false, false, false, false, false, false, false]
    wk[di] = !wk[di]
    r.weeks[monday] = wk
    if (monday === mondayISO(todayISO())) r.days = wk   // mantiene `days` sincronizado con la semana actual
    patchEpic(e.id, { routines })
  }
  // marca/desmarca HOY para una rutina (usado en "Rutinas de hoy" del enfoque), sin depender de routineWeek
  const toggleRoutineToday = (e: Epica, ri: number) => {
    const monday = mondayISO(todayISO())
    const di = (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7
    const routines = clone(e.routines)
    const r = routines[ri]
    if (!r.weeks) r.weeks = {}
    const wk = (r.weeks[monday] && r.weeks[monday].length === 7) ? r.weeks[monday] : [false, false, false, false, false, false, false]
    wk[di] = !wk[di]
    r.weeks[monday] = wk
    r.days = wk
    patchEpic(e.id, { routines })
  }
  /** Mueve una tarea dentro de su épica y reasigna el orden (10,20,30…).
   *  Requiere sql/epicas-04-orden-tareas.sql. */
  /** Reordena la tarea `id` a la posición `to` dentro del orden manual actual
   *  de la épica (la lista visible en el panel). Reasigna orden 10,20,30… */
  const dropTaskInEpic = (e: Epica, ordered: { _i: number }[], id: string, to: number) => {
    const from = ordered.findIndex(x => e.tasks[x._i]?.id === id)
    if (from < 0) return
    let ins = to > from ? to - 1 : to
    ins = Math.max(0, Math.min(ins, ordered.length - 1))
    if (ins === from) return
    const seq = ordered.map(x => e.tasks[x._i]) // orden visible actual
    const [m] = seq.splice(from, 1); seq.splice(ins, 0, m)
    // Reasigna `orden` a TODA la épica respetando el nuevo orden visible + el resto
    const rest = e.tasks.filter(t => !seq.some(s => s.id === t.id))
    const full = [...seq, ...rest]
    const tasks = clone(e.tasks)
    if (ordenReady.current) full.forEach((t, k) => { const idx = tasks.findIndex(x => x.id === t.id); if (idx >= 0) tasks[idx].orden = k * 10 })
    patchEpic(e.id, { tasks })
  }
  // Drag por manija (pointer events) en el panel de la épica
  const onEpicGripDown = (ev: React.PointerEvent, id: string) => {
    ev.preventDefault(); ev.stopPropagation()
    epicDragRef.current = { id, y: ev.clientY, moved: false }
    setEpicDrag(id)
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId) } catch { /* noop */ }
  }
  const epicDropIndex = (clientY: number) => {
    const rows = Array.from(epicListRef.current?.querySelectorAll('[data-epic-row]') || []) as HTMLElement[]
    for (let k = 0; k < rows.length; k++) { const r = rows[k].getBoundingClientRect(); if (clientY < r.top + r.height / 2) return k }
    return rows.length
  }
  const onEpicGripMove = (ev: React.PointerEvent) => { if (!epicDragRef.current) return; epicDragRef.current.moved = true; setEpicDropTo(epicDropIndex(ev.clientY)) }
  const onEpicGripUp = (ev: React.PointerEvent, ordered: { _i: number }[]) => {
    const d = epicDragRef.current; epicDragRef.current = null
    const to = epicDropIndex(ev.clientY)
    setEpicDrag(null); setEpicDropTo(null)
    if (d?.moved) dropTaskInEpic(featured, ordered, d.id, to)
  }
  const onEpicGripCancel = () => { epicDragRef.current = null; setEpicDrag(null); setEpicDropTo(null) }

  const moveTaskInEpic = (e: Epica, from: number, dir: 'up' | 'down') => {
    const to = dir === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= e.tasks.length) return
    const tasks = clone(e.tasks)
    const [m] = tasks.splice(from, 1); tasks.splice(to, 0, m)
    if (ordenReady.current) tasks.forEach((t, k) => { t.orden = k * 10 })
    patchEpic(e.id, { tasks })
  }

  /* ─── Objetivos: avance rápido y vínculo con tareas ──────── */
  /** Mueve el valor actual de un objetivo sin abrir el editor. Si al hacerlo
   *  alcanza la meta, lo marca cumplido con la fecha de hoy y lo celebra. */
  const setMilestoneCurrent = (e: Epica, mIdx: number, value: number) => {
    const kpis = clone(e.kpis)
    const m = kpis[mIdx]; if (!m) return
    m.current = Number.isFinite(value) ? value : undefined
    const antes = milestoneDone(e.kpis[mIdx], e)
    const ahora = milestoneDone(m, { ...e, kpis })
    if (ahora && !antes) { m.done = true; m.doneAt = todayISO() }
    if (!ahora && antes && m.done && m.doneAt) { delete m.done; delete m.doneAt }
    patchEpic(e.id, { kpis })
    if (ahora && !antes) showToast(`✦ Objetivo cumplido: ${m.t}`)
  }
  /** Liga (o desliga) una tarea a un objetivo. El vínculo vive en el objetivo,
   *  así que una tarea pertenece a lo más a uno. */
  const setTaskMilestone = (e: Epica, taskId: string, milestoneId: string | null) => {
    const kpis = clone(e.kpis).map(m => ({ ...m, taskIds: (m.taskIds || []).filter(id => id !== taskId) }))
    if (milestoneId) {
      const m = kpis.find(x => x.id === milestoneId)
      if (m) m.taskIds = [...(m.taskIds || []), taskId]
    }
    patchEpic(e.id, { kpis: kpis.map(m => (m.taskIds?.length ? m : { ...m, taskIds: undefined })) })
  }

  const toggleArchive = (e: Epica) => {
    patchEpic(e.id, { archived: !e.archived })
    showToast(e.archived ? 'Épica reactivada' : 'Épica archivada')
  }
  // Edición inline de campos simples de una épica (tabla de épicas)
  const patchEpicField = (id: string, changes: Partial<Epica>) => patchEpic(id, changes)
  // Mueve una épica arriba/abajo en la tabla, reasignando epic_order 10,20,30…
  const reorderEpicList = (ordered: Epica[], from: number, dir: 'up' | 'down') => {
    const to = dir === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= ordered.length) return
    const arr = [...ordered]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    arr.forEach((e, pos) => { const o = pos * 10; if (e.epic_order !== o) patchEpic(e.id, { epic_order: o }) })
  }

  /* ─── Popup de edición por tarea ─────────────────────────── */
  /** `seed` prellena el borrador de una tarea nueva (p. ej. el día del plan
   *  desde el que se creó), para no tener que elegirlo a mano. */
  // ── Borrador del editor: si cierras por error una edición SIN guardar, se conserva
  // lo que estabas escribiendo (por tarea, en memoria + localStorage). Al reabrir
  // "Editar" se restaura para no empezar de cero. Al guardar/eliminar se descarta. ──
  const DRAFT_CACHE_KEY = 'advl_epicas_draftcache'
  const draftCacheRef = useRef<Record<string, { draft: EpicaTask; target: string }>>({})
  const editOpenSnapshotRef = useRef<EpicaTask | null>(null)   // tarea tal cual estaba al ABRIR el editor (para saber qué campos tocó el editor y no pisar cambios concurrentes del Modo foco)
  // Campos que el editor de tarea GESTIONA (para el dirty-check y para no pisar lo demás). Excluye
  // volátiles (updatedAt/progressLog/comentarios/remindAt) que cambian por sync/sesión aunque no edites.
  const EDITOR_FIELDS: (keyof EpicaTask)[] = ['t', 'status', 'due', 'note', 'resumen', 'links', 'priority', 'difficulty', 'plan', 'subtasks', 'progress', 'repeat', 'repeatUntil']
  const editorSlice = (t: EpicaTask | null) => { if (!t) return ''; const o: Record<string, unknown> = {}; for (const k of EDITOR_FIELDS) if (t[k] !== undefined) o[k] = t[k]; return JSON.stringify(o) }
  useEffect(() => { try { const r = localStorage.getItem(DRAFT_CACHE_KEY); if (r) draftCacheRef.current = JSON.parse(r) } catch { /* noop */ } }, [])
  const persistDrafts = () => { try { localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(draftCacheRef.current)) } catch { /* noop */ } }
  const baselineDraft = (epicId: string, tid: string): EpicaTask | null => {
    const f = findTask(epicId, tid)
    return f ? { ...clone(f.t), links: f.t.links || [] } : null
  }
  const openTaskEdit = (epicId: string, tid: string | null, seed?: Partial<EpicaTask>) => {
    // Resuelve contra el estado y, si falla (render aún no propaga un patch reciente), contra el ref.
    const found = tid ? (findTask(epicId, tid) || findTaskRef(epicId, tid)) : null
    if (found && tid) {
      const base = { ...clone(found.t), links: found.t.links || [] }
      editOpenSnapshotRef.current = clone(base)   // referencia de "qué había al abrir"
      const cached = draftCacheRef.current[`${epicId}:${tid}`]
      // Restaura un borrador sin guardar SÓLO si es válido (con título) y difiere de la tarea en
      // campos del editor. Un borrador vacío/corrupto se ignora (antes abría el editor en blanco).
      if (cached && (cached.draft?.t || '').trim() && editorSlice(cached.draft) !== editorSlice(base)) {
        setTaskDraft(cached.draft)
        setTaskEditTarget(cached.target || epicId)
        setTaskEdit({ epicId, tid })
        showToast('Borrador restaurado ↩', false, { label: 'Descartar', fn: () => { delete draftCacheRef.current[`${epicId}:${tid}`]; persistDrafts(); setTaskDraft(base) } })
        return
      }
      setTaskDraft(base)
    } else {
      editOpenSnapshotRef.current = null
      setTaskDraft({ t: '', status: 'Por hacer', due: '', note: '', links: [], ...seed })
    }
    setTaskEdit({ epicId, tid })
    setTaskEditTarget(epicId)
  }
  openTaskEditRef.current = (epicId, tid) => openTaskEdit(epicId, tid)
  /** Épica destino por defecto al crear una tarea: si estás filtrando por una épica
   *  (en el backlog), esa; si no, la épica que tienes destacada. */
  const defaultEpicId = () => (backlogFEpica !== 'todas' ? backlogFEpica : (featured?.id || activeEpics[0]?.id))
  /** Crea una tarea ya planeada para el día que estás viendo en el enfoque. */
  const newTaskForDay = (day: string) => {
    // Si hay un filtro de épica activo en la vista actual, la nueva tarea nace en esa
    // épica (día → dayEpica; semana/sprint/mes → weekEpica). Si no, la épica por defecto.
    const filterEpic = planMode === 'dia' ? dayEpica : weekEpica
    const preferred = (filterEpic && filterEpic !== 'todas' && activeEpics.some(e => e.id === filterEpic)) ? filterEpic : null
    const target = preferred || defaultEpicId()
    if (!target) { showToast('Crea una épica primero', true); return }
    openTaskEdit(target, null, { plan: day })
  }
  const closeTaskEdit = (opts?: { discard?: boolean }) => {
    const cur = taskEdit
    if (cur && cur.tid) {
      const key = `${cur.epicId}:${cur.tid}`
      if (opts && opts.discard === true) {
        delete draftCacheRef.current[key]   // se guardó/eliminó: descartar borrador
      } else {
        // Cierre "accidental": si hay cambios sin guardar EN CAMPOS DEL EDITOR, se conserva el
        // borrador. Compara sólo esos campos (no updatedAt/progressLog/comentarios/remindAt, que
        // cambian por sync o por la sesión de foco aunque no hayas editado → borrador espurio).
        const base = baselineDraft(cur.epicId, cur.tid)
        if (base && editorSlice(taskDraft) !== editorSlice(base)) draftCacheRef.current[key] = { draft: taskDraft, target: taskEditTarget }
        else delete draftCacheRef.current[key]
      }
      persistDrafts()
    }
    setTaskEdit(null)
  }
  const saveTask = () => {
    if (!taskEdit) return
    const e = epics.find(x => x.id === taskEdit.epicId); if (!e) { closeTaskEdit({ discard: true }); return }
    // Índice actual resuelto por id: nunca apunta a otra tarea aunque el array haya cambiado
    const cur = taskEdit.tid ? findTask(taskEdit.epicId, taskEdit.tid) : null
    const curIdx = cur?.i ?? null
    // Preserva campos del plan (plan/priority/planOrder/planPrev) al reescribir la tarea
    const orig: Partial<EpicaTask> = cur?.t || {}
    // ¿El EDITOR tocó este campo (vs cómo estaba al abrir)? Si NO, conserva el valor FRESCO de `orig`
    // (que ya trae los cambios hechos en paralelo desde el Modo foco). Evita pisar subtareas/links/
    // avance que marcaste en el overlay mientras el editor estaba abierto.
    const openSnap = editOpenSnapshotRef.current
    const draftChanged = (k: keyof EpicaTask) => !openSnap || JSON.stringify(taskDraft[k] ?? null) !== JSON.stringify(openSnap[k] ?? null)
    const links = draftChanged('links')
      ? (taskDraft.links || []).map(l => ({ label: (l.label || '').trim(), url: (l.url || '').trim() })).filter(l => l.label || l.url)
      : ((orig.links as EpicaTaskLink[] | undefined) || [])
    const t: EpicaTask = { ...orig, t: (taskDraft.t || '').trim(), status: orig.status || 'Por hacer', due: taskDraft.due || '', note: sanitizeHtml(taskDraft.note), links }
    // status/doneAt: sólo desde el borrador si el EDITOR los tocó; si no, conserva los frescos de
    // `orig` (el Modo foco pudo completar la tarea mientras el editor estaba abierto → no la revivas).
    if (draftChanged('status')) {
      t.status = taskDraft.status || 'Por hacer'
      if (t.status === 'Terminada') t.doneAt = taskDraft.doneAt || todayISO()
      else delete t.doneAt   // evita arrastrar una fecha de terminación obsoleta
    }
    // Resumen (sólo si la columna existe): se toma del borrador; '' limpia el campo (→ null).
    if (resumenReady.current) t.resumen = (taskDraft.resumen || '').trim()
    if (!t.t) { closeTaskEdit(); return }
    // Prioridad, dificultad y día del plan editados desde el modal
    if (taskDraft.priority) t.priority = taskDraft.priority; else delete t.priority
    if (taskDraft.difficulty) t.difficulty = taskDraft.difficulty; else delete t.difficulty
    const newPlan = (taskDraft.plan || '').trim()
    if (newPlan) {
      if (orig.plan !== newPlan || t.planOrder == null) t.planOrder = maxPlanOrderFor(newPlan) + 1000  // al final de ese día
      t.plan = newPlan
      if (!t.priority) t.priority = prioFromDue(t.due)
    } else { delete t.plan; delete t.planOrder }   // se despega del plan (conserva priority por si se re-planea)
    if (t.status !== 'Terminada') applyPlanStatus(t, newPlan)   // plan de hoy ⇒ En curso
    // Subtareas: sólo reescribe desde el borrador si el editor las tocó; si no, conserva las frescas
    // (con lo que hayas marcado en el Modo foco). PRESERVA id/progress/note/links de cada subtarea.
    if (draftChanged('subtasks')) {
      const subs = (taskDraft.subtasks || []).map(s => ({ ...s, t: (s.t || '').trim(), done: !!s.done })).filter(s => s.t)
      if (subs.length) t.subtasks = subs; else delete t.subtasks
    }   // else: t.subtasks ya viene de orig (fresco)
    // Avance: igual, sólo si el editor lo cambió.
    if (draftChanged('progress')) {
      if (typeof taskDraft.progress === 'number' && taskDraft.progress > 0) t.progress = Math.max(0, Math.min(100, taskDraft.progress)); else delete t.progress
      if ((orig.progress ?? 0) !== (t.progress ?? 0)) upsertProgressPct(t, t.progress ?? 0)   // registra el cambio de avance de hoy
    }
    // Recurrencia: se guarda sólo si sigue activa, y `hasta` sólo si hay recurrencia
    if (taskDraft.repeat) {
      t.repeat = { every: Math.max(1, Math.round(taskDraft.repeat.every || 1)), unit: taskDraft.repeat.unit }
      if (taskDraft.repeatUntil) t.repeatUntil = taskDraft.repeatUntil; else delete t.repeatUntil
    } else { delete t.repeat; delete t.repeatUntil }
    // Marcar "Terminada" en el editor una tarea recurrente = REPROGRAMAR la serie (no terminarla).
    // Va después del plan para ganarle: applyComplete fija plan=siguiente ocurrencia + estado de reposo.
    let recurMsg: string | null = null
    if (draftChanged('status') && t.repeat && taskDraft.status === 'Terminada' && orig.status !== 'Terminada') {
      t.status = 'Por hacer'; delete t.doneAt
      recurMsg = applyComplete(t)
    }
    if (curIdx == null) { t.id = t.id || uid(); if (!t.createdAt) t.createdAt = todayISO() }   // alta

    // Épica destino: puede diferir de la de origen si la cambiaste en el editor.
    const target = epics.find(x => x.id === taskEditTarget) || e
    const moved = curIdx != null && target.id !== e.id

    if (curIdx == null) {
      const tasks = clone(target.tasks); tasks.push(t)
      patchEpic(target.id, { tasks })
    } else if (moved) {
      // Cambiar de épica es sacar de un array y meter en otro: dos patches.
      const fromTasks = clone(e.tasks).filter((_, idx) => idx !== curIdx)
      const toTasks = clone(target.tasks); toTasks.push(t)
      patchEpic(e.id, { tasks: fromTasks })
      patchEpic(target.id, { tasks: toTasks })
      setFeaturedId(target.id)   // para que no "desaparezca" de la vista
    } else {
      const tasks = clone(e.tasks)
      tasks[curIdx] = t
      patchEpic(e.id, { tasks })
    }
    closeTaskEdit({ discard: true })
    if (t.id) setTaskView({ eId: target.id, tid: t.id })   // tras guardar, abre el detalle de la tarea (no cierra en seco)
    if (moved) showToast(`Movida a ${target.name}`)
    else if (recurMsg) showToast(recurMsg)   // recurrencia reprogramada (gana sobre "planeada para…")
    else if (newPlan && newPlan !== viewDate && orig.plan !== newPlan) {
      showToast(`Planeada para ${relLong(newPlan).toLowerCase()}`, false, { label: 'Ver', fn: () => setViewDate(newPlan) })
    }
  }
  const deleteTask = () => {
    if (!taskEdit?.tid) { closeTaskEdit({ discard: true }); return }
    const found = findTask(taskEdit.epicId, taskEdit.tid)
    if (!found) { closeTaskEdit({ discard: true }); return }
    const { e, t, i: idx } = found
    if (!window.confirm(`¿Eliminar "${t.t}"? No se puede deshacer.`)) return
    const snap = clone(e.tasks)
    const tasks = snap.filter((_, i) => i !== idx)
    patchEpic(e.id, { tasks })
    // Con ids estables los índices ya no se invalidan: sólo limpiamos la selección
    // de la tarea borrada y ofrecemos deshacer.
    const k = planKey(e.id, t)
    setBacklogSel(prev => { if (!prev.has(k)) return prev; const n = new Set(prev); n.delete(k); return n })
    setPlanSel(prev => { if (!prev.has(k)) return prev; const n = new Set(prev); n.delete(k); return n })
    closeTaskEdit({ discard: true })
    showToast('Tarea eliminada', false, { label: 'Deshacer', fn: () => patchEpic(e.id, { tasks: snap }) })
  }

  /* ─── Modal ──────────────────────────────────────────────── */
  const openNew = () => {
    setEditMode('new')
    setEditing({
      id: null, name: '', color: '#2E5A9E', description: '', status: 'En curso',
      categoria: '', archived: false,
      source_table: '', source_sync: null, epic_order: epics.length,
      kpis: [], routines: [], tasks: [{ t: '', status: 'Por hacer', due: '', note: '', createdAt: todayISO() }],
      links: [{ l: 'Dashboard', url: '', primary: true, type: 'Dashboard' }],
    })
  }
  const openEdit = (id: string, inline = false) => {
    const e = epics.find(x => x.id === id); if (!e) return
    setEditMode('edit'); setEditing(clone(normalize(e)) as EpicDraft); setEditInline(inline)
  }
  const closeEdit = () => { setEditing(null); setEditMode(null); setEditInline(false); setEdTasksOpen(false); setEdTaskRow(null) }
  const patchDraft = (fn: (d: EpicDraft) => EpicDraft) => setEditing(d => (d ? fn(clone(d)) : d))

  async function save() {
    if (!editing) return
    const d = clone(editing)
    d.name = (d.name || '').trim() || 'Nueva épica'
    d.kpis = (d.kpis || []).map(normalizeMilestone).filter(k => (k.t || '').trim())
    d.routines = (d.routines || []).filter(r => (r.t || '').trim()).map(r => ({ t: r.t, days: r.days || [false, false, false, false, false, false, false], weeks: (r.weeks && typeof r.weeks === 'object') ? r.weeks : {} }))
    d.tasks = (d.tasks || []).filter(t => (t.t || '').trim()).map((t, idx) => {
      const st = t.status || 'Por hacer'
      // Conserva campos del plan (plan/priority/planOrder/planPrev) que no toca el editor
      const out: EpicaTask = { ...t, id: t.id || uid(), ...(ordenReady.current ? { orden: idx * 10 } : {}), t: t.t, status: st, due: t.due || '', note: sanitizeHtml(t.note), links: t.links || [] }
      if (st === 'Terminada') out.doneAt = t.doneAt || todayISO()
      else delete out.doneAt   // evita arrastrar una fecha de terminación obsoleta
      return out
    })
    d.links = (d.links || []).filter(l => (l.l || '').trim() || (l.url || '').trim())
    d.links.forEach(l => { if (!l.type) l.type = 'Otro' })
    if (!d.links.some(l => l.primary) && d.links.length) d.links[0].primary = true

    const payload = {
      name: d.name, color: d.color, description: sanitizeHtml(d.description) || null, status: d.status,
      categoria: (d.categoria || '').trim() || null, archived: !!d.archived,
      source_table: d.source_table || null, source_sync: d.source_sync || null, epic_order: d.epic_order,
      kpis: d.kpis, routines: d.routines, tasks: d.tasks, links: d.links,
    }

    if (editMode === 'new') {
      closeEdit()
      try {
        const r = await fetch('/api/epicas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error)
        const created = normalize(j.data as Epica)
        setEpics(list => [...list, created])
        // Bug "no se ve la épica nueva": si había un filtro de estado o categoría activo
        // que no coincidía con la recién creada, quedaba oculta. Se limpian los filtros
        // y se destaca para que siempre aparezca.
        setEstadoFilter('activas'); setCatFilter('todas')
        setFeaturedId(created.id)
        showToast('Épica creada')
      } catch {
        showToast('No se pudo crear', true)
      }
    } else if (d.id) {
      const id = d.id
      closeEdit()
      // Espera el resultado: antes se anunciaba "guardado" antes de saber si el PATCH
      // había fallado, y el usuario veía un éxito falso seguido del error real.
      if (await patchEpic(id, payload)) showToast('Cambios guardados')
    }
  }

  async function deleteEpic() {
    if (!editing?.id) { closeEdit(); return }
    const id = editing.id
    const prev = epics
    const next = epics.filter(e => e.id !== id)
    setEpics(next)
    setFeaturedId(cur => (cur === id ? (next[0]?.id ?? null) : cur))
    closeEdit()
    try {
      const r = await fetch(`/api/epicas/${id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error)
      showToast('Épica eliminada')
    } catch {
      setEpics(prev)
      showToast('No se pudo eliminar', true)
    }
  }

  /* ─── Estilos compartidos ────────────────────────────────── */
  const lbl: CSSProperties = { display: 'block', font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 7, marginTop: 16 }
  const inpBig: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 11, padding: '11px 13px', fontSize: 15, color: '#14233D', background: '#fff', outline: 'none' }
  const inpSmall: CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#14233D', background: '#fff', outline: 'none' }
  const inpNarrow: CSSProperties = { ...inpSmall, flex: '0 0 64px', width: 64 }
  const monoInp: CSSProperties = { ...inpSmall, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12 }
  const dateInp: CSSProperties = { border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '6px 8px', fontSize: 12.5, color: '#14233D', background: '#fff', outline: 'none' }
  const delBtn: CSSProperties = { flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 8, height: 32, width: 32, color: 'rgba(20,35,61,0.5)', fontSize: 13 }
  const addBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 700 }
  const cardEd: CSSProperties = { background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 14, padding: '14px 15px', marginTop: 16 }
  const secHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }

  if (!featured) {
    return (
      <div style={{ minHeight: '100%' }}>
        <TopBar sourceCount={0} onNew={openNew} />
        <BirthdayCelebration />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '60px 18px', textAlign: 'center', color: 'rgba(20,35,61,0.5)' }}>
          <p style={{ fontSize: 15, marginBottom: 18 }}>Aún no hay épicas. Crea tu primer gran frente.</p>
          <button onClick={openNew} style={goldBtn}>+ Nueva épica</button>
        </div>
        {editing && !editInline && renderEditor()}
      </div>
    )
  }

  const fSt = statusStyle(featured.status)
  const fPct = pctOf(featured)
  const fDone = doneCount(featured)
  const fTotal = taskCount(featured)

  // conteos por estado para chips
  const fStateCounts = TS_ORDER.map(s => ({ s, n: featured.tasks.filter(t => t.status === s).length })).filter(x => x.n > 0)

  // grupos de tareas activas (con índice original para editar)
  const indexed = featured.tasks.map((t, i) => ({ ...t, _i: i }))
  const ACTIVE_ORDER = ['En curso', 'Esperando', 'Por hacer']
  const taskGroups = ACTIVE_ORDER.map(s => {
    const ts = taskStyle(s)
    return { key: s, color: ts.c, label: ts.group, items: indexed.filter(t => t.status === s) }
  }).filter(g => g.items.length > 0)

  // ── Filtro GLOBAL por fecha "Hacer" (día o semana), a nivel de TODA la sección ──
  // Afecta la épica destacada, los conteos de los chips de arriba y la lista de épicas.
  const scopeRange: readonly [string, string] | null = !epicDay
    ? null
    : epicSpan === 'semana' ? [mondayISO(epicDay), addDays(mondayISO(epicDay), 6)] : [epicDay, epicDay]
  const inScope = (t: EpicaTask) => !scopeRange || (!!t.plan && t.plan >= scopeRange[0] && t.plan <= scopeRange[1])
  // Pendientes de una épica dentro del alcance (para los conteos cuando el filtro está activo)
  const scopedPend = (e: Epica) => (e.tasks || []).filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED && inScope(t)).length

  // Filtro + orden de tareas de la épica destacada
  // Filtro por "chip" (plan/vencidas/alta) y por objetivo — se combinan (AND)
  const passEpicChip = (t: (typeof indexed)[number]) => {
    if (epicFilter === 'planeadas') return !!t.plan
    if (epicFilter === 'sinplan') return !t.plan
    if (epicFilter === 'vencidas') { const dl = daysUntil(t.due); return dl != null && dl < 0 }
    if (epicFilter === 'alta') return t.priority === 'alta'
    if (epicFilter === 'estancada') return isStuck(t)
    if (epicFilter === 'multidia') return isMultiDay(t)
    if (epicFilter === 'arrastre') return isCarried(t)
    return true
  }
  const objOfTask = (tid?: string) => featured.kpis.find(m => (m.taskIds || []).includes(tid || ''))
  const passEpicObj = (t: (typeof indexed)[number]) => {
    if (epicObjFilter === 'todas') return true
    if (epicObjFilter === 'sin') return !objOfTask(t.id)
    return (featured.kpis.find(m => m.id === epicObjFilter)?.taskIds || []).includes(t.id || '')
  }
  const passEpicFilter = (t: (typeof indexed)[number]) => passEpicChip(t) && passEpicObj(t) && inScope(t)
  // Objetivos que aún tienen tareas bajo el filtro de chip activo (cascada)
  const objOptions = featured.kpis.filter(m => indexed.some(t => t.status !== ARCHIVED && (m.taskIds || []).includes(t.id || '') && passEpicChip(t)))
  const hasSinObj = indexed.some(t => t.status !== ARCHIVED && !objOfTask(t.id) && passEpicChip(t))
  const filteredGroups = taskGroups.map(g => ({ ...g, items: g.items.filter(passEpicFilter) })).filter(g => g.items.length > 0)
  const filteredActive = indexed.filter(t => t.status !== 'Terminada' && t.status !== ARCHIVED && passEpicFilter(t))
  const epicSortCmp = (a: (typeof indexed)[number], b: (typeof indexed)[number]) => {
    if (epicSort === 'prioridad') return (PRIO_RANK[a.priority || 'media'] - PRIO_RANK[b.priority || 'media']) || ((daysUntil(a.due) ?? 1e9) - (daysUntil(b.due) ?? 1e9))
    if (epicSort === 'entrega') return (a.due || '9999-99').localeCompare(b.due || '9999-99')
    if (epicSort === 'hacer') return (a.plan || '9999-99').localeCompare(b.plan || '9999-99')
    if (epicSort === 'progreso') return (b.progress || 0) - (a.progress || 0)
    if (epicSort === 'manual') return (a.orden ?? 1e9) - (b.orden ?? 1e9) || a._i - b._i
    return a.t.localeCompare(b.t, 'es')
  }
  const flatActive = epicSort === 'grupo' ? [] : [...filteredActive].sort(epicSortCmp)
  const totalActiveShown = filteredActive.length

  // Terminadas: por fecha (doneAt o due) desc, agrupadas por mes
  const doneItems = indexed.filter(t => t.status === 'Terminada')
  const archivedItems = indexed.filter(t => t.status === ARCHIVED)   // tareas archivadas de esta épica
  const doneKey = (t: (typeof indexed)[number]) => {
    const s = t.doneAt || t.due
    if (!s) return -Infinity
    const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? -Infinity : d.getTime()
  }
  const doneSorted = [...doneItems].sort((a, b) => doneKey(b) - doneKey(a))
  const doneMonths: { label: string; items: typeof doneSorted }[] = []
  doneSorted.forEach(t => {
    const lab = monthLabel(t.doneAt || t.due || '')
    const g = doneMonths.find(x => x.label === lab)
    if (g) g.items.push(t); else doneMonths.push({ label: lab, items: [t] })
  })

  const setTaskPlan = (e: Epica, ti: number, v: string) => {
    if (v) { planTaskToDay(e, ti, v); return }
    // se despega del plan pero conserva priority por si se re-planea (igual que el modal)
    const tasks = clone(e.tasks)
    delete tasks[ti].plan; delete tasks[ti].planOrder
    applyPlanStatus(tasks[ti], '')   // revierte el "En curso" forzado por el plan de hoy
    patchEpic(e.id, { tasks })
  }
  const renderTaskRow = (t: (typeof indexed)[number], dragCtx?: { ordered: { _i: number }[] }) => {
    const dragging = epicDrag === t.id
    const ts = taskStyle(t.status)
    const done = t.status === 'Terminada'
    const dt = dueTone(t.due, done)
    const subs = t.subtasks || []
    const subsDone = subs.filter(s => s.done).length
    const dateLbl: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)', width: 30, flexShrink: 0 }
    return (
      <div key={t._i} data-epic-row style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.06)', background: dragging ? '#FFFDF8' : 'transparent', borderRadius: dragging ? 10 : 0, boxShadow: dragging ? '0 14px 26px -16px rgba(15,35,64,0.45)' : 'none', opacity: epicDrag && !dragging ? 0.6 : 1, transition: 'opacity .12s' }}>
        {/* Manija de arrastre — sólo en orden manual */}
        {epicSort === 'manual' && dragCtx && (
          <span onPointerDown={ev => onEpicGripDown(ev, t.id!)} onPointerMove={onEpicGripMove} onPointerUp={ev => onEpicGripUp(ev, dragCtx.ordered)} onPointerCancel={onEpicGripCancel}
            title="Arrastra para reordenar" aria-label="Arrastra para reordenar"
            style={{ flexShrink: 0, marginTop: 2, color: 'rgba(20,35,61,0.5)', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}>
            <GripIcon />
          </span>
        )}
        <select value={t.status} onChange={e => setTaskStatus(featured, t._i, e.target.value)} title="Cambiar estado" style={{ flexShrink: 0, marginTop: 1, cursor: 'pointer', border: `1px solid ${ts.c}44`, background: ts.bg, color: ts.c, borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 700, outline: 'none' }}>
          {PICK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div {...clickable(() => setTaskView({ eId: featured.id, tid: t.id! }), `Ver tarea: ${t.t}`)} title="Ver tarea" style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: done ? 'line-through' : 'none' }}>{t.t}</div>
          {(subs.length > 0 || typeof t.progress === 'number') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4 }}>
              {subs.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: subsDone === subs.length ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {subsDone}/{subs.length} · {Math.round((subsDone / subs.length) * 100)}%</span>}
              {typeof t.progress === 'number' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: 1, maxWidth: 140 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: featured.color }} />
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                </span>
              )}
            </div>
          )}
          {subs.some(s => s.done) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {subs.filter(s => s.done).slice(0, 5).map((s, si) => (
                <span key={si} title={s.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: '#2E6E6E', background: 'rgba(62,142,142,0.09)', border: '1px solid rgba(62,142,142,0.22)', borderRadius: 99, padding: '1px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {s.t || 'subtarea'}</span>
              ))}
              {subsDone > 5 && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.45)' }}>+{subsDone - 5}</span>}
            </div>
          )}
          {t.note && <div className="ep-note" style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)', marginTop: 3, maxHeight: 32, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(180deg,#000 60%,transparent)' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.note) }} />}
          {t.links && t.links.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
              {t.links.map((l, li) => (
                <a key={li} href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '2px 8px' }}>🔗 {l.label || l.url}</a>
              ))}
            </div>
          )}
        </div>
        {done
          ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2E6E6E', marginTop: 2 }}>{(t.doneAt || t.due) ? '✓ ' + fmtDue(t.doneAt || t.due) : '✓'}</span>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Cuándo lo harás (aparece en tu enfoque)">
                <span style={dateLbl}>Hacer</span>
                <input type="date" value={t.plan || ''} onChange={e => setTaskPlan(featured, t._i, e.target.value)} style={{ border: '1px solid rgba(46,90,158,0.35)', borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.4)', background: t.plan ? 'rgba(46,90,158,0.06)' : '#fff', outline: 'none' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={t.due ? `Vence ${fmtDue(t.due)} · ${dt.label}` : 'Fecha de entrega'}>
                <span style={dateLbl}>Vence</span>
                <input type="date" value={t.due} onChange={e => setTaskDue(featured, t._i, e.target.value)} style={{ border: `1px solid ${dt.border}`, borderRadius: 8, padding: '4px 6px', fontSize: 11, fontWeight: 600, color: dt.c, background: dt.bg, outline: 'none' }} />
              </label>
            </div>
          )}
      </div>
    )
  }

  /* ─── Plan de hoy: render ────────────────────────────────── */
  // Estos tres eran componentes declarados dentro del render: su identidad de tipo cambiaba
  // en cada render, así que React desmontaba y remontaba el subárbol (se perdía el foco y se
  // re-animaba todo). Como funciones que devuelven JSX se reconcilian normalmente.
  const insLine = <div style={{ height: 2, background: '#C2933A', borderRadius: 99, margin: '3px 0' }} />

  const renderPrioPopover = ({ current, onPick }: { current?: Prio; onPick: (p: Prio) => void }) => createPortal(
    <div data-pop className="animate-fade" style={{ ...popoverStyle(menuRect, 152, 156), background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 12, boxShadow: '0 20px 40px -20px rgba(8,18,36,.5)', padding: 6 }}>
      {(['alta', 'media', 'baja'] as Prio[]).map(p => {
        const ps = prioStyle(p); const on = (current || 'media') === p
        return (
          <button key={p} onClick={() => onPick(p)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(194,147,58,0.10)' : 'transparent', color: '#16365F', fontSize: 12.5, fontWeight: 600 }}>
            <PrioBars p={p} /> {ps.label}
            {on && <span style={{ marginLeft: 'auto', color: '#C2933A' }}>✓</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )

  const renderRowMenu = ({ x, pos, total }: { x: { e: Epica; t: EpicaTask; i: number }; pos: number; total: number }) => {
    const { e, t, i } = x
    const key = planKey(e.id, t)
    const mi = (label: string, fn: () => void, disabled = false, danger = false) => (
      <button disabled={disabled} onClick={fn} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', background: 'transparent', color: disabled ? 'rgba(20,35,61,0.3)' : danger ? '#B0522E' : '#16365F', fontSize: 12.5, fontWeight: 600 }}>{label}</button>
    )
    return createPortal(
      <div data-pop className="animate-fade" style={{ ...popoverStyle(menuRect, 208, 470), background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 12, boxShadow: '0 20px 40px -20px rgba(8,18,36,.5)', padding: 6 }}>
        {planSort === 'plan' && <>
          {mi('↑  Subir', () => movePlan(key, 'up'), pos === 0)}
          {mi('↓  Bajar', () => movePlan(key, 'down'), pos === total - 1)}
          <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        </>}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 10px 6px' }}>Mover a</div>
        {mi('→  Posponer a mañana', () => { planTaskToDay(e, i, addDays(viewDate, 1), { toast: true }); setRowMenu(null) })}
        {mi('Mover a otro día…', () => { setRowMenu(null); setCalMonth((e.tasks[i]?.plan || viewDate).slice(0, 7)); setMovePick({ eId: e.id, tid: t.id! }) })}
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 10px 6px' }}>Prioridad</div>
        <div style={{ display: 'flex', gap: 5, padding: '0 8px 4px' }}>
          {(['alta', 'media', 'baja'] as Prio[]).map(p => {
            const ps = prioStyle(p); const on = (x.t.priority || 'media') === p
            return <button key={p} onClick={() => setPriority(e, i, p)} title={ps.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 0', border: on ? `1px solid ${ps.c}` : '1px solid rgba(15,35,64,0.12)', borderRadius: 8, background: on ? 'rgba(194,147,58,0.08)' : '#fff', cursor: 'pointer' }}><PrioBars p={p} /><span style={{ fontSize: 10, fontWeight: 700, color: on ? ps.c : 'rgba(20,35,61,0.5)' }}>{ps.label}</span></button>
          })}
        </div>
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        {/* Dificultad rápida */}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 10px 6px' }}>Dificultad</div>
        <div style={{ display: 'flex', gap: 5, padding: '0 8px 4px' }}>
          {(['facil', 'media', 'dificil'] as Dif[]).map(d => {
            const ds = difStyle(d); const on = t.difficulty === d
            return <button key={d} onClick={() => setDifficultyVal(e, i, on ? '' : d)} title={ds.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 0', border: on ? `1px solid ${ds.c}` : '1px solid rgba(15,35,64,0.12)', borderRadius: 8, background: on ? ds.bg : '#fff', cursor: 'pointer' }}><DifDots d={d} size={10} /><span style={{ fontSize: 10, fontWeight: 700, color: on ? ds.c : 'rgba(20,35,61,0.5)' }}>{ds.label}</span></button>
          })}
        </div>
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        {/* Avance rápido */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 6px' }}>
          <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Avance</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#A87A2C' }}>{t.progress ?? 0}%</span>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '0 8px 6px' }}>
          {[0, 25, 50, 75, 100].map(p => {
            const on = (t.progress ?? 0) === p
            return <button key={p} onClick={() => setTaskProgress(e, i, p)} style={{ flex: 1, padding: '6px 0', border: on ? '1px solid #A87A2C' : '1px solid rgba(15,35,64,0.12)', borderRadius: 7, background: on ? 'rgba(194,147,58,0.12)' : '#fff', color: on ? '#A87A2C' : 'rgba(20,35,61,0.55)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{p}</button>
          })}
        </div>
        <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '5px 4px' }} />
        {mi(t.status === ARCHIVED ? '↩  Desarchivar' : '🗄  Archivar', () => { setTaskStatus(e, i, t.status === ARCHIVED ? 'Por hacer' : ARCHIVED); setRowMenu(null) })}
        {mi('Quitar del plan', () => removeFromPlan(e, i), false, true)}
      </div>,
      document.body
    )
  }

  // Calendario mensual reutilizable (masthead y "Mover a otro día…")
  const renderMonthPopover = (value: string, onPick: (iso: string) => void) => {
    const arrow: CSSProperties = { height: 28, width: 28, borderRadius: 99, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 16, lineHeight: 1 }
    const title = cap(new Date(calMonth + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
    const cell = (cd: string) => {
      const inMonth = cd.slice(0, 7) === calMonth
      const sel = cd === value
      const isTd = cd === today
      const c = planCounts.get(cd)
      const dot = c ? (c.done === c.total ? '#2E6E6E' : '#C2933A') : null
      return (
        <button key={cd} onClick={() => onPick(cd)} style={{ position: 'relative', height: 36, borderRadius: 9, border: sel ? 'none' : isTd ? '1.5px solid rgba(194,147,58,0.6)' : '1px solid transparent', background: sel ? '#10233F' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="serif" style={{ fontSize: 15, fontWeight: 600, color: sel ? '#fff' : isTd ? '#A87A2C' : inMonth ? '#10233F' : 'rgba(20,35,61,0.3)' }}>{dayNum(cd)}</span>
          {dot && <span style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 99, background: sel ? '#E7C56B' : dot }} />}
        </button>
      )
    }
    return (
      <div className="animate-fade" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 16, boxShadow: '0 24px 50px -30px rgba(15,35,64,0.5)', padding: 14, width: 'min(300px, calc(100vw - 40px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCalMonth(m => addMonth(m, -12))} aria-label="Año anterior" title="Año anterior" style={arrow}>«</button>
            <button onClick={() => setCalMonth(m => addMonth(m, -1))} aria-label="Mes anterior" title="Mes anterior" style={arrow}>‹</button>
          </div>
          <span className="serif" style={{ fontWeight: 600, fontSize: 18, color: '#10233F', whiteSpace: 'nowrap' }}>{title}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCalMonth(m => addMonth(m, 1))} aria-label="Mes siguiente" title="Mes siguiente" style={arrow}>›</button>
            <button onClick={() => setCalMonth(m => addMonth(m, 12))} aria-label="Año siguiente" title="Año siguiente" style={arrow}>»</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
          {DAYS.map((d, i) => <span key={i} style={{ textAlign: 'center', font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', padding: '4px 0' }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>{monthGrid(calMonth).map(cell)}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {([['Hoy', today], ['Mañana', addDays(today, 1)], ['Este finde', weekendISO(today)]] as [string, string][]).map(([lbl, iso]) => {
            const on = iso === value
            return <button key={lbl} onClick={() => onPick(iso)} style={{ borderRadius: 99, padding: '6px 12px', font: '700 11.5px var(--font-ui)', cursor: 'pointer', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{lbl}</button>
          })}
        </div>
      </div>
    )
  }

  // Tira de días (navegación) + botón de calendario
  const renderDayStrip = () => (
    <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'stretch', position: 'relative' }}>
      <button data-pop onClick={() => { setCalOpen(v => !v); setCalMonth(viewDate.slice(0, 7)) }} aria-label="Elegir fecha" title="Elegir fecha"
        style={{ flexShrink: 0, width: 46, minWidth: 46, height: 62, borderRadius: 14, border: calOpen ? '1px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: calOpen ? 'rgba(194,147,58,0.10)' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10233F" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span style={{ font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', color: '#A87A2C' }}>{cap(new Date(viewDate + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))}</span>
      </button>
      {calOpen && (
        <div ref={calRef} data-pop style={{ position: 'absolute', top: 68, left: 0, zIndex: 55 }}>
          {renderMonthPopover(viewDate, iso => { setViewDate(iso); setCalMonth(iso.slice(0, 7)); setCalOpen(false) })}
        </div>
      )}
      <div ref={dayStripRef} className="plan-daystrip" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x proximity' }}>
        {stripDays.map(d => {
          const sel = d === viewDate
          const isT = d === today
          const c = planCounts.get(d)
          const allDone = !!c && c.done === c.total
          const over = dragOverDay === d && !sel
          const past = d < today
          const pend = c ? c.total - c.done : 0
          const pastPend = past && pend > 0            // día pasado con tareas sin terminar
          const lblColor = sel ? '#E7C56B' : isT ? '#A87A2C' : pastPend ? '#B0522E' : 'rgba(20,35,61,0.5)'
          const numColor = sel ? '#F3EFE6' : pastPend ? '#B0522E' : ((c && c.total > 0) || isT ? '#10233F' : 'rgba(16,35,64,0.4)')
          return (
            <button key={d} data-day={d} data-day-selected={sel || undefined} onClick={() => { setViewDate(d); setCalMonth(d.slice(0, 7)) }} className="plan-day"
              style={{ flexShrink: 0, minWidth: 58, height: 62, padding: '0 6px', borderRadius: 14, border: over ? '1.5px solid #C2933A' : sel ? '1px solid #10233F' : isT ? '1px solid rgba(194,147,58,0.45)' : pastPend ? '1px solid rgba(176,82,46,0.35)' : '1px solid rgba(15,35,64,0.10)', background: over ? 'rgba(194,147,58,0.12)' : sel ? '#10233F' : pastPend ? 'rgba(176,82,46,0.05)' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, scrollSnapAlign: 'start', opacity: past && !sel && !pastPend ? 0.55 : 1, boxShadow: sel ? '0 8px 18px -10px rgba(15,35,64,.55)' : 'none' }}>
              <span className="plan-day-lbl" style={{ font: '700 10px/1 var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.06em', color: lblColor }}>{relShort(d)}</span>
              <span className="serif plan-day-num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: numColor }}>{dayNum(d)}</span>
              {c && c.total > 0
                ? <span title={pastPend ? `${pend} sin terminar` : undefined} style={{ height: 16, padding: '0 6px', borderRadius: 99, display: 'flex', alignItems: 'center', font: '700 10px/1 var(--font-ui)', background: allDone ? (sel ? 'rgba(231,197,107,0.22)' : 'rgba(62,142,142,0.14)') : pastPend && !sel ? 'rgba(176,82,46,0.14)' : (sel ? 'rgba(255,255,255,0.16)' : 'rgba(194,147,58,0.14)'), color: allDone ? (sel ? '#E7C56B' : '#2E6E6E') : pastPend && !sel ? '#B0522E' : (sel ? '#F3EFE6' : '#A87A2C') }}>{allDone ? '✓' : pastPend ? pend : c.total}</span>
                : <span style={{ width: 3, height: 3, borderRadius: 99, background: sel ? 'rgba(255,255,255,0.3)' : 'rgba(15,35,64,0.16)' }} />}
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderPlanRow = (x: { e: Epica; t: EpicaTask; i: number }, pos: number, noDrag = false) => {
    const { e, t, i } = x
    const key = planKey(e.id, t)
    const ps = prioStyle(t.priority)
    const dt = dueTone(t.due, false)
    const dragging = draggingKey === key
    const selected = planSel.has(key)
    return (
      <div key={key} data-plan-row data-key={key} className="plan-row"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 6px', borderBottom: '1px solid rgba(15,35,64,0.06)', transition: 'background .18s, box-shadow .12s', borderRadius: dragging || selected ? 12 : 0, background: dragging ? '#FFFDF8' : selected ? 'rgba(16,35,64,0.045)' : 'transparent', boxShadow: dragging ? '0 18px 30px -18px rgba(15,35,64,0.45)' : 'none', opacity: draggingKey && !dragging ? 0.7 : 1 }}>
        <button onClick={() => togglePlanSel(key)} className="plan-sel" data-on={selected || undefined}
          aria-label={selected ? 'Quitar de la selección' : 'Seleccionar tarea'} title="Seleccionar (para acciones en lote)"
          style={{ flexShrink: 0, height: 20, width: 20, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: selected ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: selected ? '#10233F' : '#fff', color: '#fff' }}>
          {selected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
        </button>
        <button onClick={ev => { if (ev.detail > 1) return; completeFromPlan(e, i) }} aria-label="Marcar terminada" title="Marcar terminada" className="plan-check"
          style={{ flexShrink: 0, height: 30, width: 30, borderRadius: 99, border: '1.5px solid rgba(15,35,64,0.25)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'transparent', transition: 'border-color .15s, color .15s' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <span style={{ width: ps.accentW, height: 30, borderRadius: 99, background: ps.accent, flexShrink: 0 }} />
          <span className="serif plan-num" style={{ fontSize: 26, lineHeight: 1, fontWeight: 600, color: '#10233F', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{String(pos + 1).padStart(2, '0')}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pos === 0 && <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: '#A87A2C', marginBottom: 3 }}>Empieza aquí</div>}
          <div className="plan-title" onClick={() => setTaskView({ eId: e.id, tid: t.id! })} title="Ver tarea" style={{ fontSize: 15, fontWeight: 600, color: '#16365F', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.id && focus.mitIds.includes(t.id) && <span title="Lo más importante hoy (fijado en Tiempo)" style={{ color: '#C2933A' }}>★ </span>}{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
            <button onClick={() => setFeaturedId(e.id)} title={`Ver ${e.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}
            </button>
            <span style={{ padding: '2px 8px', borderRadius: 99, font: '700 10.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}` }}>{t.due ? fmtDue(t.due) : 'sin fecha'}</span>
            {t.difficulty && (() => { const ds = difStyle(t.difficulty); return (
              <button onClick={ev => { ev.stopPropagation(); cycleDifficulty(e, i) }} title={`Dificultad: ${ds.label} · clic para cambiar`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, font: '700 10px var(--font-ui)', color: ds.c, background: ds.bg, border: `1px solid ${ds.border}`, cursor: 'pointer' }}><DifDots d={t.difficulty} size={10} />{ds.label}</button>
            )})()}
            {/* Estimado por dificultad vs real invertido (bitácora). Sólo cuando hay algo que comparar. */}
            {(() => { const est = estMinOf(t), real = investedMinOf(t); if (!est && !real) return null; const over = est > 0 && real > est; const hmm = (m: number) => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m}m`; return (
              <span title={`Estimado por dificultad ${est ? hmm(est) : '—'} · llevas ${hmm(real)} invertidos${over ? ` (${hmm(real - est)} de más)` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: over ? '#B0522E' : 'rgba(20,35,61,0.5)', background: over ? 'rgba(176,82,46,0.10)' : 'rgba(15,35,64,0.05)', border: `1px solid ${over ? 'rgba(176,82,46,0.3)' : 'rgba(15,35,64,0.1)'}`, borderRadius: 99, padding: '1px 7px' }}>⏳ {est ? hmm(est) : '—'}{real > 0 ? ` / ${hmm(real)}` : ''}</span>
            )})()}
            {/* Tarea estancada: reprogramada muchas veces o días sin avanzar. */}
            {(() => { const r = stuckReason(t); if (!r) return null; return (
              <span title={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#A15B2E', background: 'rgba(176,110,58,0.12)', border: '1px solid rgba(176,110,58,0.4)', borderRadius: 99, padding: '1px 8px' }}>🐌 estancada</span>
            )})()}
            {t.plan && t.plan < today && (
              <span title={`Se planeó para el ${fmtDue(t.plan)} y sigue pendiente`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#B0522E', background: 'rgba(176,82,46,0.10)', border: '1px solid rgba(176,82,46,0.4)', borderRadius: 99, padding: '1px 8px' }}>⏳ de días anteriores</span>
            )}
            {diasCon(t) >= 1 && (
              <span title={`Llevas ${diasCon(t)} día${diasCon(t) === 1 ? '' : 's'} con esta tarea${t.createdAt ? ` (creada el ${fmtDue(t.createdAt)})` : ''}`} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>🕐 {diasCon(t)}d</span>
            )}
            {t.repeat && (
              <span title={`Se repite ${repeatLabel(t.repeat)}${t.repeatUntil ? ` hasta el ${fmtDue(t.repeatUntil)}` : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: REPEAT_TONE.c, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 99, padding: '1px 8px' }}>↻ {repeatLabel(t.repeat)}</span>
            )}
            {t.remindAt && (
              <span title={`Recordatorio: ${new Date(t.remindAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#7A6FB0', background: 'rgba(122,111,176,0.10)', border: '1px solid rgba(122,111,176,0.3)', borderRadius: 99, padding: '1px 7px' }}>🔔 {new Date(t.remindAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
            {diasTrabajados(t) >= 2 && (
              <span title={`La has trabajado en ${diasTrabajados(t)} días distintos — no se resuelve de una sentada`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: MULTIDIA_TONE.c, background: MULTIDIA_TONE.bg, border: `1px solid ${MULTIDIA_TONE.border}`, borderRadius: 99, padding: '1px 8px' }}>⧗ {diasTrabajados(t)} días de trabajo</span>
            )}
            {(t.progressLog || []).some(x => x.d === viewDate) && <span title="Avanzaste en esta tarea este día" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '1px 7px' }}>✎ avancé</span>}
            {(() => { const m = (t.progressLog || []).filter(x => x.d === viewDate).reduce((s, x) => s + (typeof (x as { min?: number }).min === 'number' ? (x as { min?: number }).min! : 0), 0); if (m <= 0) return null; const hh = Math.floor(m / 60), mm = m % 60; return <span title="Tiempo que le pusiste este día (desde la sección Tiempo)" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#2E6E6E', background: 'rgba(62,142,142,0.12)', border: '1px solid rgba(62,142,142,0.3)', borderRadius: 99, padding: '1px 8px' }}>⏱ {hh ? hh + 'h ' : ''}{mm}m</span> })()}
            {t.subtasks && t.subtasks.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: t.subtasks.every(s => s.done) ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {t.subtasks.filter(s => s.done).length}/{t.subtasks.length} · {Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100)}%</span>}
            {typeof t.progress === 'number' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, width: 80 }}>
                <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
              </span>
            )}
          </div>
          {t.subtasks && t.subtasks.some(s => s.done) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
              {t.subtasks.filter(s => s.done).slice(0, 6).map((s, si) => (
                <span key={si} title={s.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: '#2E6E6E', background: 'rgba(62,142,142,0.09)', border: '1px solid rgba(62,142,142,0.22)', borderRadius: 99, padding: '1px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {s.t || 'subtarea'}</span>
              ))}
              {t.subtasks.filter(s => s.done).length > 6 && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.45)' }}>+{t.subtasks.filter(s => s.done).length - 6}</span>}
            </div>
          )}
          {t.links && t.links.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
              {t.links.map((l, li) => (
                <a key={li} href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)', borderRadius: 99, padding: '2px 8px' }}>🔗 {l.label || l.url}</a>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative' }}>
          {/* Arrancar el cronómetro de foco directo desde la fila (misma sesión que /tiempo) */}
          {focus.session?.taskId === t.id
            ? <span title="Sesión en curso con esta tarea" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '800 10px var(--font-ui)', color: '#2E6E6E', background: 'rgba(62,142,142,0.12)', border: '1px solid rgba(62,142,142,0.35)', borderRadius: 99, padding: '4px 9px', whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: '#2E6E6E', boxShadow: '0 0 0 3px rgba(62,142,142,0.2)' }} />en curso</span>
            : <button onClick={ev => { ev.stopPropagation(); focus.begin({ name: t.t, epicaId: e.id, taskId: t.id!, dur: estMinOf(t) }) }} aria-label="Empezar con cronómetro" title="Empezar ahora con cronómetro (el tiempo se registra en esta tarea)"
                style={{ height: 30, width: 30, border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', borderRadius: 8, cursor: 'pointer', color: '#A87A2C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1 }}>▶</button>}
          {/* Cambiar la fecha "Hacer" con calendario, SIN abrir la tarea */}
          <button data-pop onClick={ev => { ev.stopPropagation(); setMenuRect(ev.currentTarget.getBoundingClientRect()); setCalMonth((t.plan || viewDate).slice(0, 7)); setMovePick(movePick && movePick.tid === t.id ? null : { eId: e.id, tid: t.id! }); setRowMenu(null); setPrioMenu(null) }} aria-label="Cambiar fecha" title="Cambiar el día (calendario)" style={{ height: 30, width: 30, border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: 'rgba(20,35,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, lineHeight: 1 }}>📅</button>
          <button data-pop onClick={ev => { ev.stopPropagation(); setMenuRect(ev.currentTarget.getBoundingClientRect()); setPrioMenu(prioMenu === key ? null : key); setRowMenu(null) }} title={`Prioridad: ${ps.label}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <PrioBars p={t.priority} />
          </button>
          {prioMenu === key && renderPrioPopover({ current: t.priority, onPick: p => setPriority(e, i, p) })}
          {!noDrag && <span className="plan-grip" onPointerDown={ev => onGripDown(ev, key)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripCancel} title="Arrastra para reordenar" style={{ color: 'rgba(20,35,61,0.55)', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}><GripIcon /></span>}
          <button data-pop onClick={ev => { ev.stopPropagation(); setMenuRect(ev.currentTarget.getBoundingClientRect()); setRowMenu(rowMenu === key ? null : key); setPrioMenu(null) }} aria-label="Más acciones" title="Más acciones" style={{ height: 30, width: 30, border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 8, cursor: 'pointer', color: 'rgba(20,35,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, lineHeight: 1 }}>⋯</button>
          {rowMenu === key && renderRowMenu({ x, pos, total: planPend.length })}
        </div>
      </div>
    )
  }

  const renderDoneRow = (x: { e: Epica; t: EpicaTask; i: number }) => {
    const { e, t, i } = x
    return (
      <div key={planKey(e.id, t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
        <button onClick={() => uncompleteFromPlan(e, i)} aria-label="Marcar sin terminar" title="Marcar sin terminar" style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 99, border: 'none', background: '#2E6E6E', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)', textDecoration: 'line-through', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} /><span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2E6E6E' }}>✓ {fmtDue(t.doneAt || viewDate)}</span>
      </div>
    )
  }

  /** Vista semanal tipo tablero: 7 columnas (Lun–Dom de la semana que contiene viewDate).
   *  Cada columna es un día; las tarjetas se arrastran entre días para reprogramar. */
  /** Interruptor Tablero | Tabla (+ botón editar en modo tabla) para las vistas
   *  semana / 2 sem / 3 sem / mes. Comparte la tabla con el enfoque de día. */
  const boardViewControls = (
    <>
      <div role="group" aria-label="Tablero o tabla" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
        {([['tablero', 'Tablero'], ['tabla', 'Tabla']] as const).map(([v, label]) => {
          const onv = boardView === v
          return <button key={v} aria-pressed={onv} onClick={() => setBoardView(v)} style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '5px 11px', font: '700 11px var(--font-ui)', background: onv ? '#10233F' : 'transparent', color: onv ? '#F3EFE6' : 'rgba(20,35,61,0.55)' }}>{label}</button>
        })}
      </div>
      {boardView === 'tabla' && <button onClick={() => setDayTableEdit(v => !v)} title="Editar la tabla como hoja de cálculo" style={{ cursor: 'pointer', borderRadius: 9, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: dayTableEdit ? 'none' : '1px solid rgba(15,35,64,0.14)', ...(dayTableEdit ? { background: '#10233F', color: '#fff' } : { background: '#fff', color: 'rgba(20,35,61,0.65)' }) }}>{dayTableEdit ? '✓ Listo' : '✎ Editar tabla'}</button>}
      <span style={{ width: 1, height: 18, background: 'rgba(15,35,64,0.12)' }} />
    </>
  )

  /** Chips de épica (color por épica) para filtrar cualquier vista de tablero por
   *  épica. Comparten el estado weekEpica; sólo listan las épicas presentes en esa
   *  vista (cascada: si la épica activa no está, `eff` cae a 'todas'). */
  const renderEpicaChips = (epicsForView: Epica[], eff: string) => {
    if (epicsForView.length <= 1) return null
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => setWeekEpica('todas')} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: eff === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: eff === 'todas' ? '#10233F' : '#fff', color: eff === 'todas' ? '#fff' : 'rgba(20,35,61,0.55)' }}>Todas</button>
        {epicsForView.map(ep => {
          const on = eff === ep.id
          return (
            <button key={ep.id} onClick={() => setWeekEpica(on ? 'todas' : ep.id)} title={`Sólo ${ep.name}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, transition: 'background .12s, border-color .12s',
                border: on ? `1.5px solid ${ep.color}` : '1px solid rgba(15,35,64,0.12)',
                background: on ? hexA(ep.color, 0.12) : '#fff',
                color: on ? ep.color : 'rgba(20,35,61,0.6)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color, flexShrink: 0 }} />{ep.name}
            </button>
          )
        })}
      </span>
    )
  }

  const renderPlanWeek = () => {
    const monday = mondayISO(viewDate)
    const sunday = addDays(monday, 6)
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    const inWeek = (t: EpicaTask) => !!t.plan && t.status !== ARCHIVED && t.plan >= monday && t.plan <= sunday
    // Épicas con tareas ESTA semana: son las únicas que aparecen en el filtro por épica.
    const weekEpics = activeEpics.filter(e => (e.tasks || []).some(inWeek))
    // Si el filtro apunta a una épica que no tiene tareas esta semana, se comporta como
    // "todas" (sin resetear el estado: al volver a una semana con esa épica, se reactiva).
    const effWeekEpica = weekEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    // Tareas planeadas de la semana, agrupadas por día. Las de días pasados sin terminar
    // se muestran en su día (quedaron ahí), para no perderlas de vista.
    const byDay = new Map<string, { e: Epica; t: EpicaTask; i: number }[]>()
    days.forEach(d => byDay.set(d, []))
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      if (!t.plan || !byDay.has(t.plan) || t.status === ARCHIVED) return
      if (effWeekEpica !== 'todas' && e.id !== effWeekEpica) return
      if (weekDif !== 'todas' && (t.difficulty || '') !== weekDif) return
      byDay.get(t.plan)!.push({ e, t, i })
    }))
    // Filtro y orden compartidos con la vista de día (planFilter / planSort)
    const passF = (t: EpicaTask) => (planFilter === 'alta' ? t.priority === 'alta'
      : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })()
      : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === t.plan)
      : planFilter === 'estancada' ? isStuck(t)
      : planFilter === 'multidia' ? isMultiDay(t)
      : planFilter === 'arrastre' ? isCarried(t)
      : true) && passWork(t, today)
    type WeekRow = { e: Epica; t: EpicaTask; i: number }
    const cmp = (a: WeekRow, b: WeekRow) => {
      // terminadas siempre al fondo de su columna
      const df = (a.t.status === 'Terminada' ? 1 : 0) - (b.t.status === 'Terminada' ? 1 : 0)
      if (df) return df
      if (planSort === 'prioridad') return (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) || ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9))
      if (planSort === 'entrega') return (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      if (planSort === 'avance') return (b.t.progress || 0) - (a.t.progress || 0)
      if (planSort === 'epica') return a.e.name.localeCompare(b.e.name, 'es')
      return (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)
    }

    return (
      <>
      {/* Filtros y orden — mismos controles que en la vista de día */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
        {boardViewControls}
        {boardView === 'tablero' && (
          <select value={planSort} onChange={e => setPlanSort(e.target.value as typeof planSort)} title="Ordenar dentro de cada día" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
            <option value="plan">Orden manual</option>
            <option value="prioridad">Prioridad</option>
            <option value="entrega">Entrega</option>
            <option value="avance">Avance</option>
            <option value="epica">Épica</option>
          </select>
        )}
        {([['todas', 'Todas'], ['alta', 'Alta'], ['vencidas', 'Vencidas'], ['avance', 'Con avance'], ['estancada', '🐌 Estancadas'], ['multidia', '⧗ Varios días'], ['arrastre', '⏳ Anteriores']] as [typeof planFilter, string][]).map(([k, label]) => {
          const on = planFilter === k
          return <button key={k} onClick={() => setPlanFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
        })}
        <span style={{ width: 1, height: 18, background: 'rgba(15,35,64,0.12)' }} />
        {/* Filtro por épica */}
        {/* Sólo lista las épicas con tareas ESTA semana (o "sin épicas" si no hay ninguna) */}
        {renderEpicaChips(weekEpics, effWeekEpica)}
        {/* Filtro por dificultad */}
        <select value={weekDif} onChange={e => setWeekDif(e.target.value as typeof weekDif)} title="Filtrar por dificultad" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: weekDif !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
          <option value="todas">Toda dificultad</option>
          <option value="facil">Fácil</option>
          <option value="media">Media</option>
          <option value="dificil">Difícil</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }} title="Ocultar tareas completadas">
          <input type="checkbox" checked={boardHideDone} onChange={e => setBoardHideDone(e.target.checked)} /> Ocultar completadas
        </label>
        {(planFilter !== 'todas' || effWeekEpica !== 'todas' || weekDif !== 'todas') && (
          <button onClick={() => { setPlanFilter('todas'); setWeekEpica('todas'); setWeekDif('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>
        )}
      </div>

      {/* Resumen de la semana: cuántas actividades, pendientes, dificultad y trabajo estimado */}
      {(() => {
        const all = [...byDay.values()].flat().filter(x => passF(x.t))
        if (all.length === 0) return null
        const pend = all.filter(x => x.t.status !== 'Terminada')
        const dc = { facil: 0, media: 0, dificil: 0, sin: 0 }
        pend.forEach(x => { const d = x.t.difficulty; if (d === 'facil') dc.facil++; else if (d === 'dificil') dc.dificil++; else if (d === 'media') dc.media++; else dc.sin++ })
        const totMin = pend.reduce((s, x) => s + estMinOf(x.t), 0)
        const hmw = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m` }
        const pill = (c: string, bg: string, label: string, n: number) => n > 0
          ? <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, padding: '3px 10px', font: '700 11.5px var(--font-ui)', color: c, background: bg }}><span style={{ width: 7, height: 7, borderRadius: 99, background: c }} />{label} {n}</span>
          : null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 12px', padding: '11px 14px', borderRadius: 14, background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: '#10233F' }}>{all.length} <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{all.length === 1 ? 'actividad' : 'actividades'}</span></span>
              <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginTop: 2 }}>{pend.length} pendientes · <b style={{ color: '#A87A2C' }}>~{hmw(totMin)}</b> de trabajo estimado</span>
            </div>
            <span style={{ width: 1, height: 30, background: 'rgba(15,35,64,0.1)' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ font: '700 9.5px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.4)', marginRight: 2 }}>dificultad</span>
              {pill('#5f8a52', 'rgba(95,138,82,0.12)', 'Fácil', dc.facil)}
              {pill('#A87A2C', 'rgba(168,122,44,0.12)', 'Media', dc.media)}
              {pill('#B0522E', 'rgba(176,82,46,0.12)', 'Difícil', dc.dificil)}
              {dc.sin > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, padding: '3px 10px', font: '700 11.5px var(--font-ui)', color: 'rgba(20,35,61,0.5)', background: 'rgba(15,35,64,0.05)' }}>sin dificultad {dc.sin}</span>}
            </div>
          </div>
        )
      })()}

      {boardView === 'tabla' ? renderDayTable([...byDay.values()].flat().filter(x => passF(x.t) && !(boardHideDone && x.t.status === 'Terminada'))) : (() => {
      // Rutinas ("las diarias") + tablero en UN solo contenedor, para que las celdas
      // de rutina cuadren columna a columna con los días de abajo. El riel izquierdo
      // nombra las rutinas; cada columna trae sus celdas de ese día arriba.
      const routines = activeEpics.flatMap(e => (e.routines || []).map((r, ri) => ({ e, r, ri })))
        .filter(x => effWeekEpica === 'todas' || x.e.id === effWeekEpica)   // respetan el filtro por épica
      const showRoutines = routines.length > 0 && routinesOpen
      const HEADER_H = 46, ROW_H = 30, railW = 132
      // Tareas SIN día (sin plan): se arrastran a un día para agendarlas. Respetan
      // los filtros de épica y dificultad de la vista.
      const unsch = activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i })))
        .filter(x => !x.t.plan && x.t.status !== ARCHIVED && x.t.status !== 'Terminada'
          && (effWeekEpica === 'todas' || x.e.id === effWeekEpica)
          && (weekDif === 'todas' || (x.t.difficulty || '') === weekDif))
      return (
      <>
      {unsch.length > 0 && (
        <div style={{ marginBottom: 10, border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12, background: '#FBFAF6', padding: '8px 11px' }}>
          <button onClick={() => setSinFechaOpen(o => !o)} aria-expanded={sinFechaOpen} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
            <span style={{ height: 6, width: 6, borderRadius: 99, background: '#5B6B86' }} />
            <span style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Sin fecha</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(20,35,61,0.45)' }}>{unsch.length}</span>
            {sinFechaOpen && <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.42)' }}>· arrastra una a un día para agendarla</span>}
            <span style={{ flex: 1 }} />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: sinFechaOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {sinFechaOpen && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 9 }}>
              {unsch.map(x => {
                const { e, t } = x; const k = planKey(e.id, t); const dragging = weekDrag === k; const ps = prioStyle(t.priority)
                return (
                  <div key={k} onPointerDown={ev => onWeekDown(ev, k)} onPointerMove={onWeekMove} onPointerUp={() => onWeekUp(x)} onPointerCancel={onWeekCancel}
                    title={`${t.t} — arrastra a un día para agendarla`}
                    style={{ flexShrink: 0, width: 178, background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${ps.accent}`, borderRadius: 9, padding: '7px 9px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 16px 26px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: weekDrag && !dragging ? 0.5 : 1, transform: dragging ? 'rotate(-1.5deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#16365F', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.t}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
                      {t.due && <span style={{ font: '700 9.5px var(--font-ui)', color: dueTone(t.due, false).c }}>{fmtDue(t.due)}</span>}
                      {t.difficulty && <DifDots d={t.difficulty} size={9} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
        {/* RIEL: nombres de las rutinas, alineados con sus celdas en cada columna */}
        {routines.length > 0 && (
          <div style={{ flex: `0 0 ${railW}px`, width: railW, boxSizing: 'border-box', border: '1px solid transparent' }}>
            <button onClick={() => setRoutinesOpen(o => !o)} aria-expanded={routinesOpen} title={routinesOpen ? 'Ocultar rutinas' : 'Mostrar rutinas'}
              style={{ height: HEADER_H, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid transparent', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
              <span style={{ height: 6, width: 6, borderRadius: 99, background: '#A87A2C' }} />
              <span style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Rutinas</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(20,35,61,0.4)' }}>{routines.length}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginLeft: 'auto', color: 'rgba(20,35,61,0.45)', transform: routinesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {routinesOpen && routines.map(({ e, r, ri }) => {
              const wk = getRoutineWeek(r, monday); const n = wk.filter(Boolean).length
              const nc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.42)'
              return (
                <button key={e.id + ':' + ri} onClick={() => setRoutineStat({ eId: e.id, ri })} title={`Ver estadísticas de ${r.t}`}
                  style={{ height: ROW_H, width: '100%', boxSizing: 'border-box', borderTop: '1px solid rgba(15,35,64,0.05)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', cursor: 'pointer', padding: '0 2px', textAlign: 'left' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: nc, flexShrink: 0 }}>{n}/7</span>
                </button>
              )
            })}
          </div>
        )}
        {days.map(d => {
          const full = byDay.get(d)!.filter(x => passF(x.t))
          const list = full.filter(x => !(boardHideDone && x.t.status === 'Terminada')).sort(cmp)
          const isTd = d === today
          const past = d < today
          const wd = (new Date(d + 'T00:00:00').getDay() + 6) % 7   // 0 = lunes
          const isWeekend = wd >= 5
          const over = weekOverDay === d && !!weekDrag
          const pend = full.filter(x => x.t.status !== 'Terminada').length
          const done = full.length - pend
          const allDone = full.length > 0 && pend === 0
          const dayMin = full.filter(x => x.t.status !== 'Terminada').reduce((s, x) => s + estMinOf(x.t), 0)
          const dayHrs = dayMin >= 60 ? `${Math.round(dayMin / 60 * 10) / 10}h` : `${dayMin}m`
          const overloaded = dayMin > 480   // más de ~8h planeadas en un día
          return (
            <div key={d} data-weekday={d}
              style={{ flex: '1 1 150px', minWidth: 150, maxWidth: 320, boxSizing: 'border-box', borderRadius: 14, background: over ? 'rgba(194,147,58,0.08)' : isTd ? 'rgba(194,147,58,0.05)' : isWeekend ? 'rgba(15,35,64,0.02)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : isTd ? '1.5px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.08)', overflow: 'hidden', opacity: past && !over ? 0.85 : 1, transition: 'background .15s, border-color .15s' }}>
              {/* Cabecera del día — altura fija para que las rutinas cuadren con el riel */}
              <div style={{ height: HEADER_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: isTd ? '#A87A2C' : 'rgba(20,35,61,0.55)' }}>{DAYNAMES[wd].slice(0, 3)}</span>
                <span className="serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: isTd ? '#A87A2C' : '#10233F', fontVariantNumeric: 'tabular-nums' }}>{dayNum(d)}</span>
                {list.length > 0 && (
                  <span style={{ height: 15, padding: '0 6px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', font: '700 9.5px/1 var(--font-ui)', background: allDone ? 'rgba(62,142,142,0.14)' : 'rgba(194,147,58,0.14)', color: allDone ? '#2E6E6E' : '#A87A2C' }}>{allDone ? '✓' : `${done}/${full.length}`}</span>
                )}
                {dayMin > 0 && (
                  <span title={`≈ ${dayHrs} de trabajo estimado por dificultad${overloaded ? ' · demasiado, reparte algunas' : ''}`} style={{ height: 15, padding: '0 6px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', font: '700 9.5px/1 var(--font-ui)', background: overloaded ? 'rgba(176,82,46,0.14)' : 'rgba(15,35,64,0.06)', color: overloaded ? '#B0522E' : 'rgba(20,35,61,0.5)' }}>~{dayHrs}</span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => newTaskForDay(d)} aria-label={`Nueva tarea para ${dateLabel(d)}`} title="Nueva tarea este día"
                  style={{ height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>

              {/* Rutinas de este día — una celda por rutina, alineada con el riel de nombres */}
              {showRoutines && (
                <div style={{ padding: '0 8px', background: isTd ? 'rgba(194,147,58,0.03)' : 'transparent' }}>
                  {routines.map(({ e, r, ri }) => {
                    const on = getRoutineWeek(r, monday)[wd]; const future = d > today
                    return (
                      <div key={e.id + ':' + ri} style={{ height: ROW_H, boxSizing: 'border-box', borderTop: '1px solid rgba(15,35,64,0.05)', display: 'flex', alignItems: 'center' }}>
                        <button onClick={() => toggleRoutineWeekDay(e, ri, monday, wd)} aria-label={`${r.t} · ${DAYNAMES[wd]} ${dayNum(d)}`} title={`${r.t} · ${DAYNAMES[wd]} ${dayNum(d)}${on ? ' · hecha' : ''}`}
                          style={{ flex: 1, height: 22, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: on ? 'none' : isTd ? '1.5px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: on ? e.color : future ? 'rgba(15,35,64,0.015)' : '#fff', opacity: future && !on ? 0.55 : 1, color: '#fff', transition: 'background .12s' }}>
                          {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                        </button>
                      </div>
                    )
                  })}
                  <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '7px 0 1px' }} />
                </div>
              )}

              {/* Tarjetas del día */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '8px', minHeight: 64 }}>
                {list.length === 0 && (
                  <button onClick={() => newTaskForDay(d)} style={{ borderRadius: 10, border: '1px dashed rgba(15,35,64,0.14)', background: 'transparent', padding: '14px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: over ? '#A87A2C' : 'rgba(20,35,61,0.4)', cursor: 'pointer' }}>{over ? 'Soltar aquí' : '+ Agregar'}</button>
                )}
                {list.map(x => {
                    const { e, t, i } = x
                    const k = planKey(e.id, t)
                    const dragging = weekDrag === k
                    const tdone = t.status === 'Terminada'
                    const ps = prioStyle(t.priority)
                    const dt = dueTone(t.due, tdone)
                    return (
                      <div key={k}
                        onPointerDown={ev => onWeekDown(ev, k)} onPointerMove={onWeekMove}
                        onPointerUp={() => onWeekUp(x)} onPointerCancel={onWeekCancel}
                        title={`${t.t} — arrastra a otro día para reprogramar`}
                        style={{ position: 'relative', background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${tdone ? '#2E6E6E' : ps.accent}`, borderRadius: 9, padding: '8px 9px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 16px 26px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: weekDrag && !dragging ? 0.5 : 1, transform: dragging ? 'rotate(-1.5deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                          <button onClick={ev => { ev.stopPropagation(); if (!tdone) completeFromPlan(e, i); else uncompleteFromPlan(e, i) }} onPointerDown={ev => ev.stopPropagation()}
                            aria-label={tdone ? 'Marcar sin terminar' : 'Marcar terminada'} title={tdone ? 'Marcar sin terminar' : 'Marcar terminada'}
                            style={{ flexShrink: 0, marginTop: 1, height: 18, width: 18, borderRadius: 99, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: tdone ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: tdone ? '#2E6E6E' : '#fff', color: '#fff' }}>
                            {tdone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                          </button>
                          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, color: tdone ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: tdone ? 'line-through' : 'none' }}>{t.t}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 6, paddingLeft: 25 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
                          {t.due && <span style={{ font: '700 9.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}`, borderRadius: 99, padding: '1px 6px' }}>{fmtDue(t.due)}</span>}
                          {t.repeat && <span title={`Se repite ${repeatLabel(t.repeat)}`} style={{ font: '700 9.5px var(--font-ui)', color: REPEAT_TONE.c }}>↻</span>}
                          {/* Dificultad editable en la tarjeta: clic cicla sin fácil → media → difícil */}
                          <button onClick={ev => { ev.stopPropagation(); cycleDifficulty(e, i) }} onPointerDown={ev => ev.stopPropagation()}
                            title={t.difficulty ? `Dificultad: ${difStyle(t.difficulty).label} · clic para cambiar` : 'Poner dificultad'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', border: 'none', borderRadius: 99, padding: t.difficulty ? '1px 6px' : '1px 3px', background: t.difficulty ? difStyle(t.difficulty).bg : 'transparent', color: t.difficulty ? difStyle(t.difficulty).c : 'rgba(20,35,61,0.4)' }}>
                            <DifDots d={t.difficulty} size={9} />{t.difficulty && <span style={{ font: '700 9.5px var(--font-ui)' }}>{difStyle(t.difficulty).label}</span>}
                          </button>
                          {typeof t.progress === 'number' && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>}
                          <button onClick={ev => { ev.stopPropagation(); setWeekMoveKey(weekMoveKey === k ? null : k) }} onPointerDown={ev => ev.stopPropagation()} title="Mover a otro día de la semana" aria-label="Mover a otro día" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: weekMoveKey === k ? '#A87A2C' : 'rgba(20,35,61,0.4)', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>📅</button>
                        </div>
                        {weekMoveKey === k && (
                          <div onPointerDown={ev => ev.stopPropagation()} style={{ display: 'flex', gap: 3, marginTop: 7, paddingLeft: 25 }}>
                            {days.map((dd, di) => { const cur = t.plan === dd; return (
                              <button key={dd} onClick={ev => { ev.stopPropagation(); setTaskPlan(e, i, dd); setWeekMoveKey(null) }} onPointerDown={ev => ev.stopPropagation()} title={`Mover a ${DAYNAMES[di]} ${dayNum(dd)}`} style={{ flex: 1, height: 24, borderRadius: 6, cursor: 'pointer', border: cur ? 'none' : '1px solid rgba(15,35,64,0.14)', background: cur ? '#10233F' : '#fff', color: cur ? '#fff' : 'rgba(20,35,61,0.6)', font: '700 10px var(--font-ui)' }}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'][di]}</button>
                            ) })}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })}
      </div>
      </>
      )
      })()}
      </>
    )
  }

  // Chip compacto reusable (vista Ajuste y multi-semana). `weekDays` = los 7 días de SU semana
  // (para el popover 📅). `fromDay` != null si viene de un día (habilita "Sin día").
  const ajusteChip = (x: { e: Epica; t: EpicaTask; i: number }, weekDays: string[], fromDay: string | null) => {
    const { e, t, i } = x; const k = planKey(e.id, t); const done = t.status === 'Terminada'; const dragging = weekDrag === k
    return (
      <div key={k} style={{ position: 'relative' }}>
        <div onPointerDown={ev => onWeekDown(ev, k)} onPointerMove={onWeekMove} onPointerUp={() => onWeekUp(x)} onPointerCancel={onWeekCancel}
          title={`${t.t} — clic para abrir · arrástrala a otro día`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderLeft: `3px solid ${done ? '#2E6E6E' : prioStyle(t.priority).accent}`, borderRadius: 8, padding: '5px 8px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: done ? 0.6 : (weekDrag && !dragging ? 0.5 : 1), boxShadow: dragging ? '0 12px 22px -14px rgba(15,35,64,0.5)' : 'none' }}>
          <button onClick={ev => { ev.stopPropagation(); if (!done) completeFromPlan(e, i); else uncompleteFromPlan(e, i) }} onPointerDown={ev => ev.stopPropagation()} title={done ? 'Marcar sin terminar' : 'Marcar terminada'} style={{ flexShrink: 0, height: 15, width: 15, borderRadius: 99, cursor: 'pointer', border: done ? 'none' : '1.5px solid rgba(15,35,64,0.28)', background: done ? '#2E6E6E' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6 9 17l-5-5" /></svg>}</button>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: done ? 'line-through' : 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
          {t.difficulty && <span title={`Dificultad ${difStyle(t.difficulty).label}`} style={{ flexShrink: 0, display: 'inline-flex' }}><DifDots d={t.difficulty} size={8} /></span>}
          {estMinOf(t) > 0 && <span style={{ flexShrink: 0, font: '700 9.5px var(--font-ui)', color: 'rgba(20,35,61,0.4)' }} title={typeof t.estMin === 'number' && t.estMin > 0 ? 'Tu estimado' : 'Estimado por dificultad'}>~{Math.round(estMinOf(t) / 60 * 10) / 10}h</span>}
          <button onClick={ev => { ev.stopPropagation(); setWeekMoveKey(weekMoveKey === k ? null : k) }} onPointerDown={ev => ev.stopPropagation()} title="Mover a otro día" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: weekMoveKey === k ? '#A87A2C' : 'rgba(20,35,61,0.35)', cursor: 'pointer', fontSize: 12, padding: 0 }}>📅</button>
        </div>
        {weekMoveKey === k && (
          <div onPointerDown={ev => ev.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 20, display: 'flex', gap: 3, padding: 6, background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 10, boxShadow: '0 16px 30px -18px rgba(15,35,64,0.6)' }}>
            {weekDays.map((dd, di) => { const cur = t.plan === dd; return <button key={dd} onClick={ev => { ev.stopPropagation(); planTaskToDay(e, i, dd, { toast: true }); setWeekMoveKey(null) }} title={`Mover a ${DAYNAMES[di]} ${dayNum(dd)}`} style={{ height: 26, width: 26, borderRadius: 6, cursor: 'pointer', border: cur ? 'none' : '1px solid rgba(15,35,64,0.14)', background: cur ? '#10233F' : '#fff', color: cur ? '#fff' : 'rgba(20,35,61,0.6)', font: '700 10px var(--font-ui)' }}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'][di]}</button> })}
            {fromDay && <button onClick={ev => { ev.stopPropagation(); setTaskPlan(e, i, ''); setWeekMoveKey(null) }} title="Quitar de la semana (sin día)" style={{ height: 26, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', font: '700 10px var(--font-ui)' }}>Sin día</button>}
          </div>
        )}
      </div>
    )
  }
  // Un carril de día (ancho completo) con sus chips. `items` sin ordenar; se ordena aquí.
  const ajusteLane = (d: string, items: { e: Epica; t: EpicaTask; i: number }[], weekDays: string[]) => {
    const sorted = [...items].sort((a, b) => ((a.t.status === 'Terminada' ? 1 : 0) - (b.t.status === 'Terminada' ? 1 : 0)) || ((a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)))
    const isTd = d === today; const past = d < today
    const wd = (new Date(d + 'T00:00:00').getDay() + 6) % 7
    const over = weekOverDay === d && !!weekDrag
    const pendN = sorted.filter(x => x.t.status !== 'Terminada').length
    const doneN = sorted.length - pendN
    const dayMin = sorted.filter(x => x.t.status !== 'Terminada').reduce((s, x) => s + estMinOf(x.t), 0)
    const dayHrs = dayMin >= 60 ? `${Math.round(dayMin / 60 * 10) / 10}h` : `${dayMin}m`
    const overloaded = dayMin > 480
    return (
      <div key={d} data-weekday={d} style={{ display: 'flex', gap: 12, alignItems: 'stretch', borderRadius: 14, background: over ? 'rgba(194,147,58,0.08)' : isTd ? 'rgba(194,147,58,0.04)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : isTd ? '1.5px solid rgba(194,147,58,0.45)' : '1px solid rgba(15,35,64,0.08)', opacity: past && !over ? 0.9 : 1, transition: 'background .15s' }}>
        <div style={{ flex: '0 0 96px', width: 96, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 12px', borderRight: '1px solid rgba(15,35,64,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: isTd ? '#A87A2C' : 'rgba(20,35,61,0.55)' }}>{DAYNAMES[wd].slice(0, 3)}</span>
            <span className="serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: isTd ? '#A87A2C' : '#10233F', fontVariantNumeric: 'tabular-nums' }}>{dayNum(d)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {sorted.length > 0 && <span style={{ font: '700 9.5px var(--font-ui)', color: doneN === sorted.length ? '#2E6E6E' : '#A87A2C' }}>{doneN}/{sorted.length}</span>}
            {dayMin > 0 && <span title={`≈ ${dayHrs} estimado por dificultad${overloaded ? ' · demasiado, reparte' : ''}`} style={{ borderRadius: 99, padding: '0 6px', font: '700 9.5px var(--font-ui)', color: overloaded ? '#B0522E' : 'rgba(20,35,61,0.5)', background: overloaded ? 'rgba(176,82,46,0.12)' : 'rgba(15,35,64,0.05)' }}>~{dayHrs}</span>}
          </div>
          <button onClick={() => newTaskForDay(d)} title="Nueva tarea este día" style={{ marginTop: 2, alignSelf: 'flex-start', height: 22, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', font: '700 11px var(--font-ui)' }}>+ tarea</button>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start', alignContent: 'flex-start', padding: '11px 12px' }}>
          {sorted.length === 0
            ? <span style={{ fontSize: 11.5, color: over ? '#A87A2C' : 'rgba(20,35,61,0.35)', padding: '4px 0' }}>{over ? 'Soltar aquí' : 'Sin actividades · arrastra una o toca “+ tarea”'}</span>
            : sorted.map(x => ajusteChip(x, weekDays, d))}
        </div>
      </div>
    )
  }

  /** Vista "Ajuste": carriles horizontales por día (ancho completo) con chips compactos,
   *  para VER muchas actividades de un vistazo y REPARTIRLAS por la semana (arrastrar o 📅).
   *  Resuelve el problema de las columnas angostas donde todo se amontona en un día. */
  const renderPlanAjuste = () => {
    const monday = mondayISO(viewDate)
    const sunday = addDays(monday, 6)
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    const inWeek = (t: EpicaTask) => !!t.plan && t.status !== ARCHIVED && t.plan >= monday && t.plan <= sunday
    const weekEpics = activeEpics.filter(e => (e.tasks || []).some(inWeek))
    const effWeekEpica = weekEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    const passF = (t: EpicaTask) => (planFilter === 'alta' ? t.priority === 'alta'
      : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })()
      : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === t.plan)
      : planFilter === 'estancada' ? isStuck(t)
      : planFilter === 'multidia' ? isMultiDay(t)
      : planFilter === 'arrastre' ? isCarried(t)
      : true) && passWork(t, today)
    const matchF = (e: Epica, t: EpicaTask) => (effWeekEpica === 'todas' || e.id === effWeekEpica) && (weekDif === 'todas' || (t.difficulty || '') === weekDif) && passF(t)
    const byDay = new Map<string, { e: Epica; t: EpicaTask; i: number }[]>()
    days.forEach(d => byDay.set(d, []))
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan && byDay.has(t.plan) && t.status !== ARCHIVED && matchF(e, t)) byDay.get(t.plan)!.push({ e, t, i }) }))
    // Carga TOTAL del día (todas las épicas, SIN filtro): para estimar la carga real
    // aunque estés filtrando por una épica y muevas actividades.
    const byDayTotal = new Map<string, { e: Epica; t: EpicaTask }[]>()
    days.forEach(d => byDayTotal.set(d, []))
    activeEpics.forEach(e => (e.tasks || []).forEach(t => { if (t.plan && byDayTotal.has(t.plan) && t.status !== ARCHIVED) byDayTotal.get(t.plan)!.push({ e, t }) }))
    const filtering = effWeekEpica !== 'todas' || weekDif !== 'todas' || planFilter !== 'todas' || workFilter !== ''
    const cmp = (a: { t: EpicaTask }, b: { t: EpicaTask }) => ((a.t.status === 'Terminada' ? 1 : 0) - (b.t.status === 'Terminada' ? 1 : 0)) || ((a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9))
    const sinDia = activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i }))).filter(x => !x.t.plan && x.t.status !== ARCHIVED && x.t.status !== 'Terminada' && matchF(x.e, x.t))
    const all = [...byDay.values()].flat()
    const pend = all.filter(x => x.t.status !== 'Terminada')
    const totMin = pend.reduce((s, x) => s + estMinOf(x.t), 0)
    const dc = { facil: 0, media: 0, dificil: 0, sin: 0 }; pend.forEach(x => { const d = x.t.difficulty; if (d === 'facil') dc.facil++; else if (d === 'dificil') dc.dificil++; else if (d === 'media') dc.media++; else dc.sin++ })
    const hmw = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m` }

    const chip = (x: { e: Epica; t: EpicaTask; i: number }, fromDay: string | null) => {
      const { e, t, i } = x; const k = planKey(e.id, t); const done = t.status === 'Terminada'; const dragging = weekDrag === k
      // ¿Se trabajó ESTE día? (hay avance en la bitácora con la fecha del carril). Se pinta en dorado
      // aunque no esté terminada, para que se note que ese día sí le metiste mano.
      const workedMinDay = fromDay ? (t.progressLog || []).filter(p => p.d === fromDay).reduce((s, p) => s + (typeof (p as { min?: number }).min === 'number' ? (p as { min?: number }).min! : 0), 0) : 0
      const workedDay = !done && !!fromDay && (t.progressLog || []).some(p => p.d === fromDay)
      return (
        <div key={k} style={{ position: 'relative' }}>
          <div onPointerDown={ev => onWeekDown(ev, k)} onPointerMove={onWeekMove} onPointerUp={() => onWeekUp(x)} onPointerCancel={onWeekCancel}
            title={`${t.t} — clic para abrir · arrástrala a otro día${workedDay ? `\n◐ trabajada este día${workedMinDay > 0 ? ` · ${Math.round(workedMinDay)}m` : ''}` : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', background: done ? '#fff' : workedDay ? 'rgba(194,147,58,0.10)' : '#fff', border: '1px solid rgba(15,35,64,0.10)', borderLeft: `3px solid ${done ? '#2E6E6E' : workedDay ? '#C2933A' : prioStyle(t.priority).accent}`, borderRadius: 8, padding: '5px 8px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: done ? 0.6 : (weekDrag && !dragging ? 0.5 : 1), boxShadow: dragging ? '0 12px 22px -14px rgba(15,35,64,0.5)' : 'none' }}>
            <button onClick={ev => { ev.stopPropagation(); if (!done) completeFromPlan(e, i); else uncompleteFromPlan(e, i) }} onPointerDown={ev => ev.stopPropagation()} title={done ? 'Marcar sin terminar' : 'Marcar terminada'} style={{ flexShrink: 0, height: 15, width: 15, borderRadius: 99, cursor: 'pointer', border: done ? 'none' : workedDay ? '1.5px solid #C2933A' : '1.5px solid rgba(15,35,64,0.28)', background: done ? '#2E6E6E' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: done ? '#fff' : '#C2933A' }}>{done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M20 6 9 17l-5-5" /></svg> : workedDay ? <span style={{ fontSize: 9, lineHeight: 1 }}>◐</span> : null}</button>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: done ? 'line-through' : 'none', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
            {t.difficulty && <span title={`Dificultad ${difStyle(t.difficulty).label}`} style={{ flexShrink: 0, display: 'inline-flex' }}><DifDots d={t.difficulty} size={8} /></span>}
            {estMinOf(t) > 0 && <span style={{ flexShrink: 0, font: '700 9.5px var(--font-ui)', color: 'rgba(20,35,61,0.4)' }} title={typeof t.estMin === 'number' && t.estMin > 0 ? 'Tu estimado' : 'Estimado por dificultad'}>~{Math.round(estMinOf(t) / 60 * 10) / 10}h</span>}
            <button onClick={ev => { ev.stopPropagation(); setWeekMoveKey(weekMoveKey === k ? null : k) }} onPointerDown={ev => ev.stopPropagation()} title="Mover a otro día" style={{ flexShrink: 0, border: 'none', background: 'transparent', color: weekMoveKey === k ? '#A87A2C' : 'rgba(20,35,61,0.35)', cursor: 'pointer', fontSize: 12, padding: 0 }}>📅</button>
          </div>
          {weekMoveKey === k && (
            <div onPointerDown={ev => ev.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 20, display: 'flex', gap: 3, padding: 6, background: '#fff', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 10, boxShadow: '0 16px 30px -18px rgba(15,35,64,0.6)' }}>
              {days.map((dd, di) => { const cur = t.plan === dd; return <button key={dd} onClick={ev => { ev.stopPropagation(); planTaskToDay(e, i, dd, { toast: true }); setWeekMoveKey(null) }} title={`Mover a ${DAYNAMES[di]} ${dayNum(dd)}`} style={{ height: 26, width: 26, borderRadius: 6, cursor: 'pointer', border: cur ? 'none' : '1px solid rgba(15,35,64,0.14)', background: cur ? '#10233F' : '#fff', color: cur ? '#fff' : 'rgba(20,35,61,0.6)', font: '700 10px var(--font-ui)' }}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'][di]}</button> })}
              {fromDay && <button onClick={ev => { ev.stopPropagation(); setTaskPlan(e, i, ''); setWeekMoveKey(null) }} title="Quitar de la semana (sin día)" style={{ height: 26, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', font: '700 10px var(--font-ui)' }}>Sin día</button>}
            </div>
          )}
        </div>
      )
    }

    return (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
        {renderEpicaChips(weekEpics, effWeekEpica)}
        <select value={weekDif} onChange={e => setWeekDif(e.target.value as typeof weekDif)} title="Filtrar por dificultad" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: weekDif !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
          <option value="todas">Toda dificultad</option><option value="facil">Fácil</option><option value="media">Media</option><option value="dificil">Difícil</option>
        </select>
        {(effWeekEpica !== 'todas' || weekDif !== 'todas' || planFilter !== 'todas') && <button onClick={() => { setPlanFilter('todas'); setWeekEpica('todas'); setWeekDif('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>}
      </div>

      {all.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 12px', padding: '11px 14px', borderRadius: 14, background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)' }}>
          <span className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: '#10233F' }}>{all.length} <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{all.length === 1 ? 'actividad' : 'actividades'}</span></span>
          <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)' }} title="El estimado sólo cuenta las tareas con dificultad (fácil 45m · media 2h · difícil 4h). Las sin dificultad no se estiman.">{pend.length} pendientes · <b style={{ color: '#A87A2C' }}>~{hmw(totMin)}</b> estimado por dificultad</span>
          <span style={{ width: 1, height: 26, background: 'rgba(15,35,64,0.1)' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {dc.facil > 0 && <span style={{ borderRadius: 99, padding: '3px 9px', font: '700 11px var(--font-ui)', color: '#5f8a52', background: 'rgba(95,138,82,0.12)' }}>Fácil {dc.facil}</span>}
            {dc.media > 0 && <span style={{ borderRadius: 99, padding: '3px 9px', font: '700 11px var(--font-ui)', color: '#A87A2C', background: 'rgba(168,122,44,0.12)' }}>Media {dc.media}</span>}
            {dc.dificil > 0 && <span style={{ borderRadius: 99, padding: '3px 9px', font: '700 11px var(--font-ui)', color: '#B0522E', background: 'rgba(176,82,46,0.12)' }}>Difícil {dc.dificil}</span>}
            {dc.sin > 0 && <span style={{ borderRadius: 99, padding: '3px 9px', font: '700 11px var(--font-ui)', color: 'rgba(20,35,61,0.5)', background: 'rgba(15,35,64,0.05)' }}>sin dif {dc.sin}</span>}
          </div>
        </div>
      )}

      {sinDia.length > 0 && (
        <div style={{ marginBottom: 12, borderRadius: 14, border: '1px dashed rgba(15,35,64,0.16)', background: 'rgba(15,35,64,0.015)', overflow: 'hidden' }}>
          <button onClick={() => setSinDiaOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none', background: 'transparent', padding: '10px 14px' }}>
            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)' }}>Sin día</span>
            <span style={{ font: '800 11px var(--font-ui)', color: '#A87A2C' }}>{sinDia.length}</span>
            <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>· mándalas a un día con 📅 o arrástralas</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(20,35,61,0.45)', transform: sinDiaOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
          </button>
          {sinDiaOpen && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}>{sinDia.slice(0, 60).map(x => chip(x, null))}</div>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map(d => {
          const items = byDay.get(d)!.sort(cmp)
          const isTd = d === today; const past = d < today
          const wd = (new Date(d + 'T00:00:00').getDay() + 6) % 7
          const over = weekOverDay === d && !!weekDrag
          const pendN = items.filter(x => x.t.status !== 'Terminada').length
          const doneN = items.length - pendN
          const dayMin = items.filter(x => x.t.status !== 'Terminada').reduce((s, x) => s + estMinOf(x.t), 0)
          const dayHrs = dayMin >= 60 ? `${Math.round(dayMin / 60 * 10) / 10}h` : `${dayMin}m`
          const overloaded = dayMin > 480
          return (
            <div key={d} data-weekday={d} style={{ display: 'flex', gap: 12, alignItems: 'stretch', borderRadius: 14, background: over ? 'rgba(194,147,58,0.08)' : isTd ? 'rgba(194,147,58,0.04)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : isTd ? '1.5px solid rgba(194,147,58,0.45)' : '1px solid rgba(15,35,64,0.08)', opacity: past && !over ? 0.9 : 1, transition: 'background .15s' }}>
              <div style={{ flex: filtering ? '0 0 122px' : '0 0 96px', width: filtering ? 122 : 96, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 12px', borderRight: '1px solid rgba(15,35,64,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: isTd ? '#A87A2C' : 'rgba(20,35,61,0.55)' }}>{DAYNAMES[wd].slice(0, 3)}</span>
                  <span className="serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: isTd ? '#A87A2C' : '#10233F', fontVariantNumeric: 'tabular-nums' }}>{dayNum(d)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {/* Contador del día: SIEMPRE el total real del día (todas las épicas, incluidas las
                      hechas), aunque haya filtro. Al filtrar se añade cuántas coinciden con el filtro. */}
                  {(() => {
                    const tot = byDayTotal.get(d) || []
                    const totLen = tot.length || items.length
                    if (totLen === 0) return null
                    const totDone = tot.length ? tot.filter(x => x.t.status === 'Terminada').length : doneN
                    return <span title={filtering ? `${totDone} hechas de ${totLen} actividades ese día (total, todas las épicas). ${items.length} coinciden con el filtro.` : `${totDone} hechas de ${totLen}`} style={{ font: '700 9.5px var(--font-ui)', color: totDone === totLen ? '#2E6E6E' : '#A87A2C' }}>{totDone}/{totLen}{filtering && items.length !== totLen && <span style={{ color: 'rgba(20,35,61,0.4)' }}> · {items.length} filtr.</span>}</span>
                  })()}
                  {dayMin > 0 && <span title={`≈ ${dayHrs} estimado por dificultad${overloaded ? ' · demasiado, reparte' : ''}`} style={{ borderRadius: 99, padding: '0 6px', font: '700 9.5px var(--font-ui)', color: overloaded ? '#B0522E' : 'rgba(20,35,61,0.5)', background: overloaded ? 'rgba(176,82,46,0.12)' : 'rgba(15,35,64,0.05)' }}>~{dayHrs}</span>}
                </div>
                {/* Carga TOTAL del día (TODAS las épicas, sin filtro) — visible al filtrar. */}
                {filtering && (() => {
                  const totPend = byDayTotal.get(d)!.filter(x => x.t.status !== 'Terminada')
                  if (totPend.length === 0) return null
                  const withDif = totPend.filter(x => x.t.difficulty)
                  const tMin = withDif.reduce((s, x) => s + estMinOf(x.t), 0)   // sólo las que tienen dificultad
                  const tHrs = tMin >= 60 ? `${Math.round(tMin / 60 * 10) / 10}h` : `${tMin}m`
                  const tOver = tMin > 480
                  const nSin = totPend.length - withDif.length
                  const tdc = { facil: 0, media: 0, dificil: 0 }; withDif.forEach(x => { const dd = x.t.difficulty; if (dd === 'facil') tdc.facil++; else if (dd === 'dificil') tdc.dificil++; else tdc.media++ })
                  return (
                    <div title={`Carga TOTAL del día (todas las épicas): ${totPend.length} actividades pendientes.\n~${tHrs} estimado sólo de las que tienen dificultad (fácil 45m · media 2h · difícil 4h).${nSin ? `\n${nSin} sin dificultad (no se estiman).` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2, paddingTop: 3, borderTop: '1px dashed rgba(15,35,64,0.1)' }}>
                      <span style={{ font: '700 8px/1 var(--font-ui)', letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.4)' }}>Todo el día</span>
                      <span style={{ font: '800 11px var(--font-ui)', color: tOver ? '#B0522E' : '#10233F' }}>{totPend.length}</span>
                      {tdc.facil > 0 && <span title="Fácil" style={{ font: '700 8.5px var(--font-ui)', color: '#5f8a52' }}>F{tdc.facil}</span>}
                      {tdc.media > 0 && <span title="Media" style={{ font: '700 8.5px var(--font-ui)', color: '#A87A2C' }}>M{tdc.media}</span>}
                      {tdc.dificil > 0 && <span title="Difícil" style={{ font: '700 8.5px var(--font-ui)', color: '#B0522E' }}>D{tdc.dificil}</span>}
                      {nSin > 0 && <span title="Sin dificultad (no se estiman)" style={{ font: '700 8.5px var(--font-ui)', color: 'rgba(20,35,61,0.4)' }}>·{nSin} s/dif</span>}
                      {tMin > 0 && <span title="Estimado por dificultad" style={{ font: '700 9px var(--font-ui)', color: tOver ? '#B0522E' : 'rgba(20,35,61,0.45)' }}>~{tHrs}</span>}
                    </div>
                  )
                })()}
                <button onClick={() => newTaskForDay(d)} title="Nueva tarea este día" style={{ marginTop: 2, alignSelf: 'flex-start', height: 22, padding: '0 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', font: '700 11px var(--font-ui)' }}>+ tarea</button>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start', alignContent: 'flex-start', padding: '11px 12px' }}>
                {items.length === 0
                  ? <span style={{ fontSize: 11.5, color: over ? '#A87A2C' : 'rgba(20,35,61,0.35)', padding: '4px 0' }}>{over ? 'Soltar aquí' : 'Sin actividades · arrastra una o toca “+ tarea”'}</span>
                  : items.map(x => chip(x, d))}
              </div>
            </div>
          )
        })}
      </div>
      </>
    )
  }

  /** Vista "Ajuste" MULTI-SEMANA (2 y 3 semanas): por cada semana, un bloque colapsable con
   *  su resumen + los 7 carriles de día con chips compactos. Mismo enfoque que Ajuste, pero
   *  a través de varias semanas (para repartir con más horizonte). */
  const renderSprintAjuste = (weekMondays: string[]) => {
    const hStart = weekMondays[0]
    const hEnd = addDays(weekMondays[weekMondays.length - 1], 6)
    const inHorizon = (t: EpicaTask) => !!t.plan && t.status !== ARCHIVED && t.plan >= hStart && t.plan <= hEnd
    const horizonEpics = activeEpics.filter(e => (e.tasks || []).some(inHorizon))
    const effEpica = horizonEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    const passF = (t: EpicaTask) => (planFilter === 'alta' ? t.priority === 'alta'
      : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })()
      : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === t.plan)
      : planFilter === 'estancada' ? isStuck(t)
      : planFilter === 'multidia' ? isMultiDay(t)
      : planFilter === 'arrastre' ? isCarried(t)
      : true) && passWork(t, today)
    const matchF = (e: Epica, t: EpicaTask) => (effEpica === 'todas' || e.id === effEpica) && (weekDif === 'todas' || (t.difficulty || '') === weekDif) && passF(t)
    const sinDia = activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i }))).filter(x => !x.t.plan && x.t.status !== ARCHIVED && x.t.status !== 'Terminada' && matchF(x.e, x.t))
    const firstWeekDays = Array.from({ length: 7 }, (_, k) => addDays(weekMondays[0], k))
    const hmw = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m` }
    const thisMon = mondayISO(today)
    return (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
        {renderEpicaChips(horizonEpics, effEpica)}
        <select value={weekDif} onChange={e => setWeekDif(e.target.value as typeof weekDif)} title="Filtrar por dificultad" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: weekDif !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
          <option value="todas">Toda dificultad</option><option value="facil">Fácil</option><option value="media">Media</option><option value="dificil">Difícil</option>
        </select>
        {(effEpica !== 'todas' || weekDif !== 'todas' || planFilter !== 'todas') && <button onClick={() => { setPlanFilter('todas'); setWeekEpica('todas'); setWeekDif('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>}
      </div>

      {sinDia.length > 0 && (
        <div style={{ marginBottom: 12, borderRadius: 14, border: '1px dashed rgba(15,35,64,0.16)', background: 'rgba(15,35,64,0.015)', overflow: 'hidden' }}>
          <button onClick={() => setSinDiaOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none', background: 'transparent', padding: '10px 14px' }}>
            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)' }}>Sin día</span>
            <span style={{ font: '800 11px var(--font-ui)', color: '#A87A2C' }}>{sinDia.length}</span>
            <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>· mándalas a un día con 📅 (van a la 1ª semana) o arrástralas</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(20,35,61,0.45)', transform: sinDiaOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
          </button>
          {sinDiaOpen && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}>{sinDia.slice(0, 60).map(x => ajusteChip(x, firstWeekDays, null))}</div>}
        </div>
      )}

      {weekMondays.map(wm => {
        const days = Array.from({ length: 7 }, (_, k) => addDays(wm, k))
        const byDay = new Map<string, { e: Epica; t: EpicaTask; i: number }[]>()
        days.forEach(d => byDay.set(d, []))
        activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.plan && byDay.has(t.plan) && t.status !== ARCHIVED && matchF(e, t)) byDay.get(t.plan)!.push({ e, t, i }) }))
        const all = [...byDay.values()].flat(); const pend = all.filter(x => x.t.status !== 'Terminada')
        const wMin = pend.reduce((s, x) => s + estMinOf(x.t), 0)
        // Semanas con tareas: abiertas por defecto. Semanas VACÍAS: colapsadas por defecto
        // (para no mostrar 7 carriles vacíos). El clic invierte el default en ambos casos.
        const collapsed = all.length > 0 ? sprintCollapsed.has(wm) : !sprintCollapsed.has(wm)
        const isThisWeek = wm === thisMon
        return (
          <div key={wm} style={{ marginBottom: 14, border: `1px solid ${isThisWeek ? 'rgba(194,147,58,0.35)' : 'rgba(15,35,64,0.08)'}`, borderRadius: 16, overflow: 'hidden' }}>
            <button onClick={() => setSprintCollapsed(s => { const n = new Set(s); if (n.has(wm)) n.delete(wm); else n.add(wm); return n })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer', border: 'none', background: isThisWeek ? 'rgba(194,147,58,0.08)' : '#FBFAF6', padding: '11px 14px' }}>
              <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: '#10233F' }}>{weekRangeLabel(wm)}</span>
              {isThisWeek && <span style={{ font: '700 9px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: '#A87A2C', border: '1px solid rgba(194,147,58,0.4)', borderRadius: 99, padding: '1px 7px' }}>Esta semana</span>}
              <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)' }}>{all.length} act · {pend.length} pend · <b style={{ color: '#A87A2C' }}>~{hmw(wMin)}</b></span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(20,35,61,0.45)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}>▾</span>
            </button>
            {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>{days.map(d => ajusteLane(d, byDay.get(d)!, days))}</div>}
          </div>
        )
      })}
      </>
    )
  }

  /** Vista multi-semana (2 sem / 3 sem / mes) tipo sprint: una columna por semana,
   *  con las tareas agrupadas por día. Arrastra una tarjeta a otra semana para
   *  reprogramarla (mismo día de la semana). Comparte filtros con la vista semana. */
  const renderPlanSprint = (weekMondays: string[]) => {
    const hStart = weekMondays[0]
    const hEnd = addDays(weekMondays[weekMondays.length - 1], 6)
    const inHorizon = (t: EpicaTask) => !!t.plan && t.status !== ARCHIVED && t.plan >= hStart && t.plan <= hEnd
    const horizonEpics = activeEpics.filter(e => (e.tasks || []).some(inHorizon))
    const effEpica = horizonEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    const passF = (t: EpicaTask) => (planFilter === 'alta' ? t.priority === 'alta'
      : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })()
      : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === t.plan)
      : planFilter === 'estancada' ? isStuck(t)
      : planFilter === 'multidia' ? isMultiDay(t)
      : planFilter === 'arrastre' ? isCarried(t)
      : true) && passWork(t, today)
    type Row = { e: Epica; t: EpicaTask; i: number }
    const cmp = (a: Row, b: Row) => {
      const df = (a.t.status === 'Terminada' ? 1 : 0) - (b.t.status === 'Terminada' ? 1 : 0)
      if (df) return df
      if (planSort === 'prioridad') return (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) || ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9))
      if (planSort === 'entrega') return (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      if (planSort === 'avance') return (b.t.progress || 0) - (a.t.progress || 0)
      if (planSort === 'epica') return a.e.name.localeCompare(b.e.name, 'es')
      return (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)
    }
    const cols = weekMondays.map(mon => {
      const sun = addDays(mon, 6)
      const items: Row[] = []
      activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
        if (!t.plan || t.status === ARCHIVED || t.plan < mon || t.plan > sun) return
        if (effEpica !== 'todas' && e.id !== effEpica) return
        if (weekDif !== 'todas' && (t.difficulty || '') !== weekDif) return
        if (!passF(t)) return
        items.push({ e, t, i })
      }))
      return { mon, sun, items }
    })

    return (
      <>
      {/* Filtros — iguales que en la vista semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
        {boardViewControls}
        {boardView === 'tablero' && (
          <select value={planSort} onChange={e => setPlanSort(e.target.value as typeof planSort)} title="Ordenar dentro de cada día" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
            <option value="plan">Orden manual</option>
            <option value="prioridad">Prioridad</option>
            <option value="entrega">Entrega</option>
            <option value="avance">Avance</option>
            <option value="epica">Épica</option>
          </select>
        )}
        {([['todas', 'Todas'], ['alta', 'Alta'], ['vencidas', 'Vencidas'], ['avance', 'Con avance'], ['estancada', '🐌 Estancadas'], ['multidia', '⧗ Varios días'], ['arrastre', '⏳ Anteriores']] as [typeof planFilter, string][]).map(([k, label]) => {
          const on = planFilter === k
          return <button key={k} onClick={() => setPlanFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
        })}
        <span style={{ width: 1, height: 18, background: 'rgba(15,35,64,0.12)' }} />
        {renderEpicaChips(horizonEpics, effEpica)}
        <select value={weekDif} onChange={e => setWeekDif(e.target.value as typeof weekDif)} title="Filtrar por dificultad" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: weekDif !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
          <option value="todas">Toda dificultad</option>
          <option value="facil">Fácil</option><option value="media">Media</option><option value="dificil">Difícil</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }} title="Ocultar tareas completadas">
          <input type="checkbox" checked={boardHideDone} onChange={e => setBoardHideDone(e.target.checked)} /> Ocultar completadas
        </label>
        {(planFilter !== 'todas' || effEpica !== 'todas' || weekDif !== 'todas') && (
          <button onClick={() => { setPlanFilter('todas'); setWeekEpica('todas'); setWeekDif('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>
        )}
      </div>

      {boardView === 'tabla' ? renderDayTable(cols.flatMap(c => c.items).filter(x => !(boardHideDone && x.t.status === 'Terminada')), { groupByWeek: true }) : (() => {
      // Pocas semanas (2/3 sem): las columnas llenan el ancho. Muchas (mes): ancho
      // fijo y scroll horizontal, para que no se aplasten.
      const wide = cols.length <= 3
      return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
        {cols.map(({ mon, sun, items }) => {
          const hasToday = today >= mon && today <= sun
          const pend = items.filter(x => x.t.status !== 'Terminada').length
          const done = items.length - pend
          const allDone = items.length > 0 && pend === 0
          const over = sprintOverCol === mon && !sprintOverDay && !!sprintDrag
          // Tarjetas visibles (respetan "ocultar completadas"), agrupadas por día.
          const dayMap = new Map<string, Row[]>()
          items.filter(x => !(boardHideDone && x.t.status === 'Terminada'))
            .forEach(x => { const k = x.t.plan!; if (!dayMap.has(k)) dayMap.set(k, []); dayMap.get(k)!.push(x) })
          // Los 7 días de la semana como zonas de destino: los vacíos sólo aparecen al arrastrar.
          const weekDays = Array.from({ length: 7 }, (_, k) => addDays(mon, k))
          const shownDays = weekDays.filter(dk => (dayMap.get(dk)?.length || 0) > 0 || !!sprintDrag)
          const visibleCount = [...dayMap.values()].reduce((n, a) => n + a.length, 0)
          return (
            <div key={mon} data-weekcol={mon}
              style={{ flex: wide ? '1 1 0' : '0 0 320px', minWidth: wide ? 240 : 300, maxWidth: wide ? 640 : 380, boxSizing: 'border-box', borderRadius: 15, background: over ? 'rgba(194,147,58,0.07)' : hasToday ? 'rgba(194,147,58,0.04)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : hasToday ? '1.5px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.08)', overflow: 'hidden', transition: 'background .15s, border-color .15s' }}>
              {/* Cabecera de la semana (sprint) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px 9px', borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
                {hasToday && <span title="Semana en curso" style={{ width: 7, height: 7, borderRadius: 99, background: '#A87A2C', flexShrink: 0 }} />}
                <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: hasToday ? '#A87A2C' : '#10233F' }}>{weekRangeLabel(mon)}</span>
                {items.length > 0 && (
                  <span style={{ height: 16, padding: '0 6px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', font: '700 9.5px/1 var(--font-ui)', background: allDone ? 'rgba(62,142,142,0.14)' : 'rgba(194,147,58,0.14)', color: allDone ? '#2E6E6E' : '#A87A2C' }}>{allDone ? '✓' : `${done}/${items.length}`}</span>
                )}
                <span style={{ flex: 1 }} />
                <button onClick={() => newTaskForDay(hasToday ? today : mon)} aria-label={`Nueva tarea la semana de ${weekRangeLabel(mon)}`} title="Nueva tarea esta semana"
                  style={{ height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px', minHeight: 70 }}>
                {visibleCount === 0 && !sprintDrag && (
                  <div style={{ borderRadius: 10, border: '1px dashed rgba(15,35,64,0.14)', padding: '16px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: over ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>{items.length > 0 ? 'Todo completado ✦' : 'Sin tareas'}</div>
                )}
                {shownDays.map(dk => {
                  const wd = (new Date(dk + 'T00:00:00').getDay() + 6) % 7
                  const isTd = dk === today
                  const dayItems = (dayMap.get(dk) || []).sort(cmp)
                  const dayOver = sprintOverDay === dk && !!sprintDrag
                  return (
                    <div key={dk} data-sprintday={dk}
                      style={{ borderRadius: 8, padding: dayOver ? 3 : 0, background: dayOver ? 'rgba(194,147,58,0.10)' : 'transparent', outline: dayOver ? '1.5px dashed #C2933A' : 'none', transition: 'background .1s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 2px 4px' }}>
                        <span style={{ font: '800 9.5px/1 var(--font-ui)', letterSpacing: '.07em', textTransform: 'uppercase', color: isTd ? '#A87A2C' : dayItems.length ? 'rgba(20,35,61,0.55)' : 'rgba(20,35,61,0.3)' }}>{DAYNAMES[wd].slice(0, 3)} {dayNum(dk)}</span>
                        {isTd && <span style={{ font: '800 8px/1 var(--font-ui)', letterSpacing: '.06em', color: '#fff', background: '#A87A2C', borderRadius: 99, padding: '2px 6px' }}>HOY</span>}
                        {dayItems.length > 0 && <span style={{ font: '700 9px/1 var(--font-ui)', color: 'rgba(20,35,61,0.4)' }}>{dayItems.length}</span>}
                        <span style={{ height: 1, flex: 1, background: 'rgba(15,35,64,0.08)' }} />
                      </div>
                      {dayItems.length === 0 && sprintDrag && (
                        <div style={{ borderRadius: 8, border: '1px dashed rgba(15,35,64,0.16)', padding: '7px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: dayOver ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>{dayOver ? 'Soltar aquí' : '—'}</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dayItems.map(x => {
                          const { e, t, i } = x
                          const k = planKey(e.id, t)
                          const dragging = sprintDrag === k
                          const tdone = t.status === 'Terminada'
                          const ps = prioStyle(t.priority)
                          const dt = dueTone(t.due, tdone)
                          return (
                            <div key={k}
                              onPointerDown={ev => onSprintDown(ev, k)} onPointerMove={onSprintMove}
                              onPointerUp={() => onSprintUp(x)} onPointerCancel={onSprintCancel}
                              title={`${t.t} — arrastra a otro día o semana para reprogramar`}
                              style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${tdone ? '#2E6E6E' : ps.accent}`, borderRadius: 9, padding: '7px 9px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 16px 26px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: sprintDrag && !dragging ? 0.5 : 1, transform: dragging ? 'rotate(-1.5deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                                <button onClick={ev => { ev.stopPropagation(); if (!tdone) completeFromPlan(e, i); else uncompleteFromPlan(e, i) }} onPointerDown={ev => ev.stopPropagation()}
                                  aria-label={tdone ? 'Marcar sin terminar' : 'Marcar terminada'} title={tdone ? 'Marcar sin terminar' : 'Marcar terminada'}
                                  style={{ flexShrink: 0, marginTop: 1, height: 18, width: 18, borderRadius: 99, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: tdone ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: tdone ? '#2E6E6E' : '#fff', color: '#fff' }}>
                                  {tdone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                                </button>
                                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, color: tdone ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: tdone ? 'line-through' : 'none' }}>{t.t}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 6, paddingLeft: 25 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
                                {t.due && <span style={{ font: '700 9.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}`, borderRadius: 99, padding: '1px 6px' }}>{fmtDue(t.due)}</span>}
                                {t.repeat && <span title={`Se repite ${repeatLabel(t.repeat)}`} style={{ font: '700 9.5px var(--font-ui)', color: REPEAT_TONE.c }}>↻</span>}
                                <button onClick={ev => { ev.stopPropagation(); cycleDifficulty(e, i) }} onPointerDown={ev => ev.stopPropagation()}
                                  title={t.difficulty ? `Dificultad: ${difStyle(t.difficulty).label} · clic para cambiar` : 'Poner dificultad'}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', border: 'none', borderRadius: 99, padding: t.difficulty ? '1px 6px' : '1px 3px', background: t.difficulty ? difStyle(t.difficulty).bg : 'transparent', color: t.difficulty ? difStyle(t.difficulty).c : 'rgba(20,35,61,0.4)' }}>
                                  <DifDots d={t.difficulty} size={9} />{t.difficulty && <span style={{ font: '700 9.5px var(--font-ui)' }}>{difStyle(t.difficulty).label}</span>}
                                </button>
                                {typeof t.progress === 'number' && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      )
      })()}
      </>
    )
  }

  /** Tabla editable del enfoque de día (tipo hoja de cálculo): celdas modificables
   *  inline, encabezados ordenables y selección para acciones en lote. */
  const renderDayTable = (rows: { e: Epica; t: EpicaTask; i: number }[], opts?: { groupByWeek?: boolean }) => {
    const edit = dayTableEdit
    const sort = dayTableSort
    const manual = sort.length === 1 && sort[0].key === 'manual'
    const groupByWeek = !!opts?.groupByWeek   // divide la tabla por semana (vistas 2/3 sem, mes)
    const canMove = manual && !groupByWeek     // reordenar manual sólo tiene sentido sin agrupar
    // Día de la semana abreviado: "Lun", "Mar", … (0 = lunes)
    const dow = (iso: string) => DAYNAMES[(new Date(iso + 'T00:00:00').getDay() + 6) % 7].slice(0, 3)
    // Compara UN criterio; el signo lo pone la dirección de cada nivel.
    const cmpKey = (a: typeof rows[number], b: typeof rows[number], k: string) => {
      if (k === 't') return a.t.t.localeCompare(b.t.t, 'es')
      if (k === 'epica') return a.e.name.localeCompare(b.e.name, 'es')
      if (k === 'status') return TASK_STATUSES.indexOf(a.t.status) - TASK_STATUSES.indexOf(b.t.status)
      if (k === 'priority') return PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']
      if (k === 'difficulty') return (a.t.difficulty ? ({ facil: 1, media: 2, dificil: 3 })[a.t.difficulty] : 0) - (b.t.difficulty ? ({ facil: 1, media: 2, dificil: 3 })[b.t.difficulty] : 0)
      if (k === 'progress') return (a.t.progress || 0) - (b.t.progress || 0)
      if (k === 'plan') return (a.t.plan || '9999-99').localeCompare(b.t.plan || '9999-99')
      if (k === 'due') return (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      return (a.t.planOrder ?? 1e9) - (b.t.planOrder ?? 1e9)   // manual
    }
    const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
      if (manual) return cmpKey(a, b, 'manual')
      // Recorre los niveles: el primero que rompe el empate decide.
      for (const s of sort) { const r = cmpKey(a, b, s.key) * (s.dir === 'asc' ? 1 : -1); if (r) return r }
      return a.t.t.localeCompare(b.t.t, 'es')
    }
    const sorted = [...rows].sort(cmp)
    const move = (from: number, d: 'up' | 'down') => {
      const to = d === 'up' ? from - 1 : from + 1
      if (to < 0 || to >= sorted.length) return
      const arr = sorted.map(x => ({ e: x.e, i: x.i }))
      const [m] = arr.splice(from, 1); arr.splice(to, 0, m)
      applyPlanOrder(arr)
    }
    // Clic normal = ordena sólo por esa columna (alterna dirección si ya era la única).
    // Mayús+clic = agrega/quita esa columna como criterio adicional (segundo, tercero…).
    const setSort = (key: string, additive = false) => setDayTableSort(prev => {
      if (key === 'manual') return [{ key: 'manual', dir: 'asc' }]
      const base = prev.filter(s => s.key !== 'manual')   // 'manual' no combina con nada
      const at = base.findIndex(s => s.key === key)
      if (additive) {
        if (at >= 0) { const n = [...base]; n[at] = { key, dir: n[at].dir === 'asc' ? 'desc' : 'asc' }; return n }
        return [...base, { key, dir: 'asc' as const }]
      }
      if (base.length === 1 && base[0].key === key) return [{ key, dir: base[0].dir === 'asc' ? 'desc' : 'asc' }]
      return [{ key, dir: 'asc' }]
    })
    const multiSort = sort.filter(s => s.key !== 'manual').length > 1
    const th = (key: string, label: string) => {
      const pos = sort.findIndex(s => s.key === key)
      const on = pos >= 0 && !manual
      const s = on ? sort[pos] : null
      return (
        <th onClick={ev => setSort(key, ev.shiftKey)} title="Clic para ordenar · Mayús+clic para agregar como criterio adicional"
          style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: on ? '#A87A2C' : 'rgba(15,35,64,0.5)', whiteSpace: 'nowrap', userSelect: 'none' }}>
          {on && multiSort && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 13, height: 13, borderRadius: 99, background: '#A87A2C', color: '#fff', font: '800 8.5px/1 var(--font-ui)', marginRight: 4, verticalAlign: 'middle' }}>{pos + 1}</span>}
          {label}{on ? (s!.dir === 'asc' ? ' ▲' : ' ▼') : ''}
        </th>
      )
    }
    const allKeys = sorted.map(x => planKey(x.e.id, x.t))
    const allSel = allKeys.length > 0 && allKeys.every(k => planSel.has(k))
    const cellInp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid transparent', borderRadius: 6, padding: '5px 7px', fontSize: 12.5, fontWeight: 600, color: '#14233D', background: 'transparent', outline: 'none' }
    const sel: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 700, background: '#fff', outline: 'none' }
    const dInp: CSSProperties = { border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }
    const arrow: CSSProperties = { height: 20, width: 20, borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    const KLABEL: Record<string, string> = { t: 'Tarea', epica: 'Épica', status: 'Estado', priority: 'Prioridad', difficulty: 'Dificultad', progress: 'Avance', plan: 'Hacer', due: 'Vence' }
    return (
      <>
      {/* Pista/estado del orden: en manual invita a Mayús+clic; con orden activo lo
          resume en palabras ("Vence → Épica") y deja quitarlo de un clic. */}
      {manual
        ? (rows.length > 1 && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', margin: '0 2px 7px' }}>Clic en un encabezado ordena · <strong style={{ fontWeight: 700 }}>Mayús+clic</strong> agrega un segundo criterio (p. ej. Vence, luego Épica).</div>)
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 2px 7px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.45)' }}>Orden</span>
            {sort.map((s, i) => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {i > 0 && <span style={{ color: 'rgba(20,35,61,0.35)', fontSize: 12 }}>→</span>}
                <button onClick={ev => setSort(s.key, ev.shiftKey)} title="Clic alterna dirección · Mayús+clic ajusta el nivel" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 99, padding: '3px 9px', font: '700 11px var(--font-ui)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 12, height: 12, borderRadius: 99, background: '#A87A2C', color: '#fff', font: '800 8px/1 var(--font-ui)' }}>{i + 1}</span>
                  {KLABEL[s.key] || s.key} {s.dir === 'asc' ? '▲' : '▼'}
                </button>
              </span>
            ))}
            <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>· Mayús+clic en un encabezado para sumar otro</span>
            <button onClick={() => setSort('manual')} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', font: '700 11px var(--font-ui)', marginLeft: 'auto' }}>Quitar orden</button>
          </div>
        )}
      <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)' }}>
              <th style={{ width: 34, padding: '8px 0 8px 12px' }}><input type="checkbox" checked={allSel} onChange={() => setPlanSel(allSel ? new Set() : new Set(allKeys))} title="Seleccionar todo" style={{ cursor: 'pointer' }} /></th>
              {!edit && <th style={{ width: 52, padding: '8px 6px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: manual ? '#A87A2C' : 'rgba(15,35,64,0.4)' }}>{manual ? 'Orden' : <button onClick={() => setSort('manual')} title="Orden manual" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(15,35,64,0.5)', font: 'inherit', textTransform: 'uppercase' }}>Manual</button>}</th>}
              {th('t', 'Tarea')}{th('epica', 'Épica')}{th('status', 'Estado')}{th('priority', 'Prioridad')}{th('difficulty', 'Dificultad')}{th('progress', 'Avance')}{th('plan', 'Hacer')}{th('due', 'Vence')}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const colCount = edit ? 9 : 10
              const renderRow = ({ e, t, i }: typeof sorted[number], idx: number) => {
              const k = planKey(e.id, t)
              const on = planSel.has(k)
              const done = t.status === 'Terminada'
              const openView = () => setTaskView({ eId: e.id, tid: t.id! })
              return (
                <tr key={k} className="backlog-row" style={{ borderBottom: '1px solid rgba(15,35,64,0.06)', background: on ? 'rgba(194,147,58,0.06)' : 'transparent', cursor: edit ? 'default' : 'pointer' }}
                  onClick={edit ? undefined : ev => { if ((ev.target as HTMLElement).closest('input,button,select,a')) return; openView() }}>
                  <td style={{ padding: '0 0 0 12px' }}><input type="checkbox" checked={on} onClick={ev => ev.stopPropagation()} onChange={() => togglePlanSel(k)} style={{ cursor: 'pointer' }} /></td>
                  {!edit && (
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 3 }} onClick={ev => ev.stopPropagation()}>
                        <button onClick={() => move(idx, 'up')} disabled={!canMove || idx === 0} aria-label="Subir" title={canMove ? 'Subir' : groupByWeek ? 'Reordena en el Tablero' : 'Ordena en "Manual" para mover'} style={{ ...arrow, opacity: (!canMove || idx === 0) ? 0.35 : 1 }}>↑</button>
                        <button onClick={() => move(idx, 'down')} disabled={!canMove || idx === sorted.length - 1} aria-label="Bajar" title={canMove ? 'Bajar' : groupByWeek ? 'Reordena en el Tablero' : 'Ordena en "Manual" para mover'} style={{ ...arrow, opacity: (!canMove || idx === sorted.length - 1) ? 0.35 : 1 }}>↓</button>
                      </div>
                    </td>
                  )}
                  {/* Tarea */}
                  <td style={{ padding: '4px 6px', minWidth: 220 }}>
                    {edit
                      ? <input defaultValue={t.t} onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== t.t) setTaskTitle(e, i, v) }} style={cellInp} />
                      : <span style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none' }}>{t.t}</span>}
                  </td>
                  {/* Épica */}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.6)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</span></td>
                  {/* Estado */}
                  <td style={{ padding: '4px 6px' }}>
                    {edit
                      ? <select value={t.status} onChange={ev => setTaskStatus(e, i, ev.target.value)} style={{ ...sel, color: taskStyle(t.status).c }}>{PICK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                      : <span style={{ font: '700 10.5px var(--font-ui)', color: taskStyle(t.status).c, background: taskStyle(t.status).bg, borderRadius: 99, padding: '3px 9px' }}>{taskStyle(t.status).label}</span>}
                  </td>
                  {/* Prioridad */}
                  <td style={{ padding: '4px 6px' }}>
                    {edit
                      ? <select value={t.priority || ''} onChange={ev => setPriorityVal(e, i, ev.target.value)} style={sel}><option value="">—</option>{(['alta', 'media', 'baja'] as Prio[]).map(p => <option key={p} value={p}>{prioStyle(p).label}</option>)}</select>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'rgba(20,35,61,0.6)' }}><PrioBars p={t.priority} size={12} />{prioStyle(t.priority).label}</span>}
                  </td>
                  {/* Dificultad */}
                  <td style={{ padding: '4px 6px' }}>
                    {edit
                      ? <select value={t.difficulty || ''} onChange={ev => setDifficultyVal(e, i, ev.target.value)} style={sel}><option value="">—</option>{(['facil', 'media', 'dificil'] as Dif[]).map(d => <option key={d} value={d}>{difStyle(d).label}</option>)}</select>
                      : (t.difficulty ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: difStyle(t.difficulty).c }}><DifDots d={t.difficulty} size={10} />{difStyle(t.difficulty).label}</span> : <span style={{ color: 'rgba(20,35,61,0.35)' }}>—</span>)}
                  </td>
                  {/* Avance */}
                  <td style={{ padding: '4px 6px' }}>
                    {edit
                      ? <input type="number" min={0} max={100} step={5} defaultValue={t.progress ?? 0} onBlur={ev => { const v = Math.max(0, Math.min(100, Number(ev.target.value) || 0)); if (v !== (t.progress ?? 0)) setTaskProgress(e, i, v) }} style={{ ...dInp, width: 62 }} />
                      : <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>{typeof t.progress === 'number' ? `${t.progress}%` : '—'}</span>}
                  </td>
                  {/* Hacer — con día de la semana (Lun/Mar…), también visible al editar */}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                    {edit
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input type="date" value={t.plan || ''} onChange={ev => setTaskPlan(e, i, ev.target.value)} style={{ ...dInp, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.5)' }} />
                          {t.plan && <span style={{ fontSize: 11, fontWeight: 800, color: '#2E5A9E' }}>{dow(t.plan)}</span>}
                        </span>
                      : <span style={{ fontSize: 12, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.4)' }}>{t.plan ? `${dow(t.plan)} ${fmtDue(t.plan)}` : '—'}</span>}
                  </td>
                  {/* Vence */}
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                    {edit
                      ? <input type="date" value={t.due || ''} onChange={ev => setTaskDue(e, i, ev.target.value)} style={dInp} />
                      : <span style={{ fontSize: 12, fontWeight: 600, color: dueTone(t.due, done).c }}>{t.due ? fmtDue(t.due) : '—'}</span>}
                  </td>
                </tr>
              )
              }
              // Índice real en `sorted` (para que las flechas de mover sigan bien).
              const keyIdx = new Map(sorted.map((r, i) => [planKey(r.e.id, r.t), i]))
              if (!groupByWeek) return sorted.map((r, idx) => renderRow(r, idx))
              // Divide por semana del día "Hacer"; las sin fecha van al final.
              const groups = new Map<string, typeof sorted>()
              for (const r of sorted) { const wk = r.t.plan ? mondayISO(r.t.plan) : ''; if (!groups.has(wk)) groups.set(wk, []); groups.get(wk)!.push(r) }
              const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || a.localeCompare(b))
              return keys.map(wk => {
                const items = groups.get(wk)!
                const pend = items.filter(x => x.t.status !== 'Terminada').length
                return (
                  <Fragment key={wk || 'sinfecha'}>
                    <tr>
                      <td colSpan={colCount} style={{ padding: '10px 12px 6px', background: 'rgba(194,147,58,0.07)', borderBottom: '1px solid rgba(194,147,58,0.22)' }}>
                        <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#A87A2C' }}>{wk ? weekRangeLabel(wk) : 'Sin fecha'}</span>
                        <span style={{ marginLeft: 9, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.45)' }}>{pend > 0 ? `${pend} por hacer · ${items.length}` : `${items.length} ${items.length === 1 ? 'tarea' : 'tareas'}`}</span>
                      </td>
                    </tr>
                    {items.map(r => renderRow(r, keyIdx.get(planKey(r.e.id, r.t))!))}
                  </Fragment>
                )
              })
            })()}
            {sorted.length === 0 && <tr><td colSpan={edit ? 9 : 10} style={{ padding: '18px', textAlign: 'center', fontSize: 12.5, color: 'rgba(20,35,61,0.55)' }}>Nada planeado para este día.</td></tr>}
          </tbody>
        </table>
      </div>
      </>
    )
  }

  /* ─── Fila de filtros compartida (épica/dificultad/completadas) ─── */
  const renderBoardFilters = (epicsForFilter: Epica[], effEpica: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px', flexWrap: 'wrap' }}>
      {([['todas', 'Todas'], ['alta', 'Alta'], ['vencidas', 'Vencidas'], ['avance', 'Con avance'], ['estancada', '🐌 Estancadas'], ['multidia', '⧗ Varios días'], ['arrastre', '⏳ Anteriores']] as [typeof planFilter, string][]).map(([k, label]) => {
        const on = planFilter === k
        return <button key={k} onClick={() => setPlanFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
      })}
      <span style={{ width: 1, height: 18, background: 'rgba(15,35,64,0.12)' }} />
      {renderEpicaChips(epicsForFilter, effEpica)}
      <select value={weekDif} onChange={e => setWeekDif(e.target.value as typeof weekDif)} title="Filtrar por dificultad" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: weekDif !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
        <option value="todas">Toda dificultad</option><option value="facil">Fácil</option><option value="media">Media</option><option value="dificil">Difícil</option>
      </select>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }} title="Ocultar tareas completadas">
        <input type="checkbox" checked={boardHideDone} onChange={e => setBoardHideDone(e.target.checked)} /> Ocultar completadas
      </label>
      {(planFilter !== 'todas' || effEpica !== 'todas' || weekDif !== 'todas') && (
        <button onClick={() => { setPlanFilter('todas'); setWeekEpica('todas'); setWeekDif('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>
      )}
    </div>
  )
  const passPlanFilter = (t: EpicaTask) => (planFilter === 'alta' ? t.priority === 'alta'
    : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })()
    : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === t.plan)
    : planFilter === 'estancada' ? isStuck(t)
    : planFilter === 'multidia' ? isMultiDay(t)
    : planFilter === 'arrastre' ? isCarried(t) : true) && passWork(t, today)

  /** Vista Calendario: retícula mensual con tarjetas por su día planeado; arrastra
   *  para reprogramar, clic para abrir. Marca las completadas (tachadas). */
  const renderPlanCalendar = () => {
    const monthStr = viewDate.slice(0, 7)
    const cells = monthGrid(monthStr)   // 42 celdas, lunes primero
    const hStart = cells[0], hEnd = cells[cells.length - 1]
    const calEpics = activeEpics.filter(e => (e.tasks || []).some(t => t.plan && t.status !== ARCHIVED && t.plan >= hStart && t.plan <= hEnd))
    const effEpica = calEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    const byDay = new Map<string, { e: Epica; t: EpicaTask; i: number }[]>()
    cells.forEach(c => byDay.set(c, []))
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      if (!t.plan || t.status === ARCHIVED || !byDay.has(t.plan)) return
      if (effEpica !== 'todas' && e.id !== effEpica) return
      if (weekDif !== 'todas' && (t.difficulty || '') !== weekDif) return
      if (boardHideDone && t.status === 'Terminada') return
      if (!passPlanFilter(t)) return
      byDay.get(t.plan)!.push({ e, t, i })
    }))
    const CAP = 4
    const cell: CSSProperties = { minHeight: 108, boxSizing: 'border-box', padding: 5, borderRight: '1px solid rgba(15,35,64,0.06)', borderBottom: '1px solid rgba(15,35,64,0.06)', display: 'flex', flexDirection: 'column', gap: 3 }
    return (
      <>
        {renderBoardFilters(calEpics, effEpica)}
        <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12 }}>
          <div style={{ minWidth: 720 }}>
            {/* cabecera de días */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)' }}>
              {DAYNAMES.map((d, k) => <div key={d} style={{ padding: '7px 8px', font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: k >= 5 ? 'rgba(20,35,61,0.4)' : 'rgba(15,35,64,0.5)', textAlign: 'center' }}>{d.slice(0, 3)}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {cells.map(cd => {
                const inMonth = cd.slice(0, 7) === monthStr
                const isTd = cd === today
                const items = byDay.get(cd)!
                const over = calOverDay === cd && !!calDrag
                const expanded = calExpanded.has(cd)
                const shown = expanded ? items : items.slice(0, CAP)
                return (
                  <div key={cd} data-calday={cd} style={{ ...cell, background: over ? 'rgba(194,147,58,0.10)' : isTd ? 'rgba(194,147,58,0.05)' : inMonth ? '#fff' : 'rgba(15,35,64,0.02)', outline: over ? '1.5px dashed #C2933A' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="serif" style={{ fontSize: 13, fontWeight: 600, color: isTd ? '#A87A2C' : inMonth ? '#10233F' : 'rgba(20,35,61,0.35)' }}>{dayNum(cd)}</span>
                      {isTd && <span style={{ font: '700 8px var(--font-ui)', color: '#A87A2C' }}>HOY</span>}
                      <span style={{ flex: 1 }} />
                      {inMonth && <button onClick={() => newTaskForDay(cd)} aria-label={`Nueva tarea ${fmtDue(cd)}`} title="Nueva tarea" style={{ height: 16, width: 16, borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.5)', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>}
                    </div>
                    {shown.map(x => {
                      const { e, t, i } = x; const k = planKey(e.id, t); const dragging = calDrag === k; const done = t.status === 'Terminada'
                      return (
                        <div key={k} onPointerDown={ev => onCalDown(ev, k)} onPointerMove={onCalMove} onPointerUp={() => onCalUp(x)} onPointerCancel={onCalCancel}
                          title={`${t.t} — arrastra a otro día`}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: `3px solid ${done ? '#2E6E6E' : e.color}`, background: done ? 'rgba(62,142,142,0.08)' : 'rgba(15,35,64,0.03)', borderRadius: 5, padding: '2px 5px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: calDrag && !dragging ? 0.5 : 1 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                        </div>
                      )
                    })}
                    {items.length > CAP && (
                      <button onClick={() => setCalExpanded(s => { const n = new Set(s); if (n.has(cd)) n.delete(cd); else n.add(cd); return n })}
                        title={expanded ? 'Ver menos' : `Ver las ${items.length - CAP} restantes`}
                        style={{ alignSelf: 'flex-start', cursor: 'pointer', border: 'none', background: 'transparent', padding: '1px 2px', fontSize: 10, fontWeight: 700, color: '#A87A2C' }}>
                        {expanded ? '− menos' : `+ ${items.length - CAP} más`}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>
    )
  }

  /** Vista Timeline (Gantt ligero): eje horizontal de los días del mes; cada tarea
   *  con fecha (plan/entrega) es una barra. Agrupadas por épica. Clic abre la tarea. */
  const renderPlanTimeline = () => {
    const monthStr = viewDate.slice(0, 7)
    const [y, m] = viewDate.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const days = Array.from({ length: lastDay }, (_, k) => `${monthStr}-${String(k + 1).padStart(2, '0')}`)
    const dayW = TL_DAY_W   // debe coincidir con el paso usado al soltar la barra
    const idxOf = (iso: string) => Math.max(0, Math.min(lastDay - 1, Number(iso.slice(8, 10)) - 1))
    const inMonth = (iso?: string) => !!iso && iso.slice(0, 7) === monthStr
    const groups = activeEpics.map(e => {
      const items = (e.tasks || []).map((t, i) => ({ t, i })).filter(({ t }) => {
        if (t.status === ARCHIVED) return false
        if (weekDif !== 'todas' && (t.difficulty || '') !== weekDif) return false
        if (boardHideDone && t.status === 'Terminada') return false
        if (!passPlanFilter(t)) return false
        return inMonth(t.plan) || inMonth(t.due)
      })
      return { e, items }
    }).filter(g => g.items.length > 0)
    const tlEpics = groups.map(g => g.e)
    const effEpica = tlEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
    const shown = effEpica !== 'todas' ? groups.filter(g => g.e.id === effEpica) : groups
    const railW = 180, trackW = days.length * dayW
    return (
      <>
        {renderBoardFilters(tlEpics, effEpica)}
        <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12 }}>
          <div style={{ minWidth: railW + trackW }}>
            {/* cabecera de días */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)', position: 'sticky', top: 0 }}>
              <div style={{ flex: `0 0 ${railW}px`, width: railW }} />
              <div style={{ display: 'flex' }}>
                {days.map(d => { const isTd = d === today; const wd = (new Date(d + 'T00:00:00').getDay() + 6) % 7
                  return <div key={d} style={{ width: dayW, textAlign: 'center', padding: '5px 0', borderLeft: '1px solid rgba(15,35,64,0.05)', background: isTd ? 'rgba(194,147,58,0.10)' : wd >= 5 ? 'rgba(15,35,64,0.02)' : 'transparent' }}>
                    <div style={{ font: '700 8px/1 var(--font-ui)', color: isTd ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>{DAYS[wd]}</div>
                    <div className="serif" style={{ fontSize: 12, fontWeight: 600, color: isTd ? '#A87A2C' : '#10233F' }}>{dayNum(d)}</div>
                  </div> })}
              </div>
            </div>
            {shown.map(({ e, items }) => (
              <div key={e.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', background: 'rgba(15,35,64,0.015)', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color }} /><span style={{ fontSize: 12, fontWeight: 700, color: '#16365F' }}>{e.name}</span>
                </div>
                {items.map(({ t, i }) => {
                  const done = t.status === 'Terminada'
                  const a = inMonth(t.plan) ? t.plan! : t.due!
                  const b = inMonth(t.due) ? t.due! : t.plan!
                  const s = Math.min(idxOf(a), idxOf(b)), en = Math.max(idxOf(a), idxOf(b))
                  const dt = dueTone(t.due, done)
                  return (
                    <div key={planKey(e.id, t)} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(15,35,64,0.05)', minHeight: 30 }}>
                      <div style={{ flex: `0 0 ${railW}px`, width: railW, padding: '4px 12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.t}</span>
                      </div>
                      <div style={{ position: 'relative', width: trackW, height: 30 }}>
                        {(() => {
                          const bk = planKey(e.id, t); const bdrag = tlDragKey === bk
                          const off = bdrag ? tlOffset : 0
                          const snapped = bdrag ? Math.round(off / dayW) * dayW : 0
                          return (
                            <button onPointerDown={ev => onTlDown(ev, bk, e, i)} onPointerMove={onTlMove} onPointerUp={onTlUp} onPointerCancel={onTlCancel}
                              title={`${t.t}${t.plan ? ' · plan ' + fmtDue(t.plan) : ''}${t.due ? ' · vence ' + fmtDue(t.due) : ''} — arrastra para correr las fechas`}
                              style={{ position: 'absolute', top: 6, left: s * dayW + 2 + snapped, width: (en - s + 1) * dayW - 4, height: 18, borderRadius: 5, cursor: bdrag ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', border: 'none', background: done ? 'rgba(62,142,142,0.25)' : e.color, opacity: tlDragKey && !bdrag ? 0.45 : done ? 0.7 : 1, display: 'flex', alignItems: 'center', padding: '0 6px', overflow: 'hidden', boxShadow: bdrag ? '0 10px 18px -10px rgba(15,35,64,0.6)' : 'none', zIndex: bdrag ? 3 : 1, transition: bdrag ? 'none' : 'left .12s' }}>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.t}</span>
                            </button>
                          )
                        })()}
                        {t.due && inMonth(t.due) && <span title={`Vence ${fmtDue(t.due)}`} style={{ position: 'absolute', top: 4, left: idxOf(t.due) * dayW + dayW / 2 - 1, width: 2, height: 22, background: dt.c, opacity: 0.5 }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            {shown.length === 0 && <div style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: 'rgba(20,35,61,0.55)' }}>No hay tareas con fecha en {monthLabel(viewDate)}.</div>}
          </div>
        </div>
      </>
    )
  }

  /** Vista Resumen: dashboard de la semana. KPIs, burndown, logros y en qué se
   *  trabajó. Pensado como retro de sprint: qué se comprometió, qué se cerró y
   *  qué se está arrastrando. */
  const renderPlanResumen = () => {
    const mon = mondayISO(viewDate), sun = addDays(mon, 6)
    const days = Array.from({ length: 7 }, (_, k) => addDays(mon, k))
    const inWeek = (d?: string) => !!d && d >= mon && d <= sun

    // Filtro por épica (chips): comparte weekEpica con las demás vistas. Sólo lista las
    // épicas con actividad en la semana; cascada a 'todas' si la activa no está.
    const touchesWeek = (t: EpicaTask) => t.status !== ARCHIVED && (inWeek(t.plan) || inWeek(t.doneAt) || (t.progressLog || []).some(l => inWeek(l.d)) || (t.repeatDone || []).some(d => inWeek(d)) || inWeek(t.due) || (t.planHist || []).some(d => inWeek(d)))
    const resEpics = activeEpics.filter(e => (e.tasks || []).some(touchesWeek))
    const effResEpica = resEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'

    type R = { e: Epica; t: EpicaTask; i: number }
    const all: R[] = []
    activeEpics.forEach(e => {
      if (effResEpica !== 'todas' && e.id !== effResEpica) return
      ;(e.tasks || []).forEach((t, i) => { if (t.status !== ARCHIVED) all.push({ e, t, i }) })
    })

    const committed = all.filter(x => inWeek(x.t.plan))                                   // lo planeado para la semana
    const doneWithDate = all.filter(x => inWeek(x.t.doneAt))                              // tareas cerradas (con doneAt) esta semana
    // Ciclos de tareas RECURRENTES cumplidos en la semana: no tienen doneAt (se borra al
    // reprogramarse), viven en repeatDone. Cada ciclo cuenta como un cierre.
    const cycles = all.flatMap(x => (x.t.repeat && Array.isArray(x.t.repeatDone))
      ? x.t.repeatDone.filter(d => d >= mon && d <= sun).map(() => x) : [])
    const completed = [...doneWithDate, ...cycles]                                        // todo lo cerrado (tareas + ciclos)
    const worked = all.filter(x => (x.t.progressLog || []).some(l => inWeek(l.d)))         // donde hubo avance
    const points = completed.reduce((n, x) => n + taskWeight(x.t), 0)
    const activeDays = days.filter(d => all.some(x => x.t.doneAt === d || (x.t.progressLog || []).some(l => l.d === d) || (x.t.repeatDone || []).includes(d)))
    // "Se están arrastrando": tareas NO terminadas que llevan varios días sin cerrarse
    // y están (o estuvieron) ligadas a esta semana, o venían arrastrándose de antes.
    // Señales de arrastre: trabajada en >1 día, su plan se movió (planHist), o ya venció.
    const dragSpan = (t: EpicaTask) => new Set<string>([...(t.progressLog || []).map(l => l.d), ...(t.planHist || []), ...(t.plan ? [t.plan] : [])])
    const arrastran = all.filter(x => {
      const t = x.t
      if (t.status === 'Terminada') return false
      const span = dragSpan(t)
      const touchedWeek = [...span].some(d => d >= mon && d <= sun)
      const cameFromBefore = !!t.plan && t.plan < mon          // sigue abierta y su plan quedó antes de esta semana
      if (!touchedWeek && !cameFromBefore) return false
      return span.size >= 2 || (t.planHist || []).length > 0 || (!!t.plan && t.plan < today)   // que de verdad se arrastre
    })
    const arrastraDias = (t: EpicaTask) => dragSpan(t).size   // días distintos en que ha estado en juego
    const pendientes = committed.filter(x => x.t.status !== 'Terminada').length
    const cumplimiento = committed.length ? Math.round(((committed.length - pendientes) / committed.length) * 100) : 0

    // Semana pasada (mismo cálculo, corrido 7 días) para comparar tendencia
    const lastMon = addDays(mon, -7), lastSun = addDays(mon, -1)
    const inLast = (d?: string) => !!d && d >= lastMon && d <= lastSun
    const lastCycles = all.flatMap(x => (x.t.repeat && Array.isArray(x.t.repeatDone))
      ? x.t.repeatDone.filter(d => d >= lastMon && d <= lastSun).map(() => x) : [])
    const lastCompleted = [...all.filter(x => inLast(x.t.doneAt)), ...lastCycles]
    const lastPoints = lastCompleted.reduce((n, x) => n + taskWeight(x.t), 0)
    const delta = (cur: number, prev: number) => {
      if (prev === 0) return { txt: cur > 0 ? `+${cur}` : '=', c: cur > 0 ? '#2E6E6E' : 'rgba(20,35,61,0.45)' }
      const d = cur - prev
      return { txt: d === 0 ? '=' : `${d > 0 ? '+' : ''}${d}`, c: d > 0 ? '#2E6E6E' : d < 0 ? '#B0522E' : 'rgba(20,35,61,0.45)' }
    }

    // Composición del pipeline (estado de lo comprometido esta semana)
    const estCount = (st: string) => committed.filter(x => x.t.status === st).length
    const estSegs = [
      { label: 'Terminada', value: estCount('Terminada'), color: '#2E6E6E' },
      { label: 'En curso', value: estCount('En curso'), color: '#2E5A9E' },
      { label: 'Esperando', value: estCount('Esperando'), color: '#A87A2C' },
      { label: 'Por hacer', value: estCount('Por hacer'), color: '#5B6B86' },
    ]
    // Tipo de trabajo cerrado (dificultad de lo completado) — leyenda con DifDots
    const difCount = (dd: Dif | 'sin') => completed.filter(x => (x.t.difficulty || 'sin') === dd).length
    const difSegs = [
      { label: 'Difícil', value: difCount('dificil'), color: difStyle('dificil').c, icon: <DifDots d="dificil" size={10} /> },
      { label: 'Media', value: difCount('media'), color: difStyle('media').c, icon: <DifDots d="media" size={10} /> },
      { label: 'Fácil', value: difCount('facil'), color: difStyle('facil').c, icon: <DifDots d="facil" size={10} /> },
      { label: 'Sin dif.', value: difCount('sin'), color: 'rgba(20,35,61,0.28)' },
    ]

    // Burndown: cuánto quedaba pendiente al cerrar cada día, contra la línea ideal
    const remaining = days.map(d => committed.filter(x => !(x.t.doneAt && x.t.doneAt <= d)).length)
    const ideal = days.map((_, k) => committed.length * (1 - k / 6))
    const maxY = Math.max(committed.length, 1)
    const W = 620, H = 150, PAD = 26
    const px = (k: number) => PAD + (k * (W - PAD * 2)) / 6
    const py = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2)
    const line = (arr: number[]) => arr.map((v, k) => `${k ? 'L' : 'M'}${px(k)},${py(v)}`).join(' ')
    const hoyIdx = days.indexOf(today)

    // Rutinas de la semana
    const rut = activeEpics.flatMap(e => (e.routines || []).map(r => ({ e, r, n: getRoutineWeek(r, mon).filter(Boolean).length })))
    const rutTotal = rut.reduce((n, x) => n + x.n, 0), rutMax = rut.length * 7

    const tile = (label: string, value: string, hint: string, color: string) => (
      <div key={label} className="glass" style={{ borderRadius: 15, padding: '14px 16px' }}>
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 8 }}>
          <span className="serif" style={{ fontWeight: 600, fontSize: 30, lineHeight: .9, color: '#10233F' }}>{value}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{hint}</span>
        </div>
      </div>
    )
    const secTitle = (txt: string, extra?: string) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{txt}</span>
        {extra && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>{extra}</span>}
      </div>
    )

    return (
      <div style={{ marginTop: 10 }}>
        {/* Filtro por épica (chips) — como en las demás vistas */}
        {resEpics.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.45)', marginRight: 2 }}>Épica</span>
            {renderEpicaChips(resEpics, effResEpica)}
          </div>
        )}
        {/* OBJETIVOS CUMPLIDOS ESTA SEMANA — lo más celebrable de la semana */}
        {(() => {
          const logrados = activeEpics.flatMap(e => (e.kpis || []).filter(m => inWeek(m.doneAt)).map(m => ({ e, m })))
          if (!logrados.length) return null
          return (
            <div style={{ marginBottom: 20, borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(194,147,58,0.45)', boxShadow: '0 18px 40px -28px rgba(194,147,58,0.9)' }}>
              <div style={{ background: 'linear-gradient(135deg,#10233F 0%,#1B3A63 45%,#A87A2C 100%)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>✦</span>
                  <span className="serif" style={{ fontStyle: 'italic', fontSize: 21, color: '#F3EFE6' }}>
                    {logrados.length === 1 ? 'Cumpliste un objetivo esta semana' : `Cumpliste ${logrados.length} objetivos esta semana`}
                  </span>
                </div>
              </div>
              <div style={{ background: 'rgba(194,147,58,0.07)', padding: '12px 20px 14px' }}>
                {logrados.map(({ e, m }) => (
                  <div key={m.id} {...clickable(() => setEpicPeek(e.id), `Ver ${e.name}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer' }}>
                    <span style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 99, background: '#C2933A', color: '#1B1305', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 12px var(--font-ui)' }}>✦</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#10233F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.t}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />
                      <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.6)' }}>{e.name}</span>
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#A87A2C' }}>{fmtDue(m.doneAt!)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 20 }}>
          {tile('Completadas', String(completed.length), `de ${committed.length} planeadas`, cumplimiento >= 70 ? '#2E6E6E' : '#A87A2C')}
          {tile('Puntos', String(points), 'esfuerzo cerrado', '#2E5A9E')}
          {tile('Cumplimiento', `${cumplimiento}%`, pendientes ? `${pendientes} sin cerrar` : 'todo cerrado', cumplimiento >= 70 ? '#2E6E6E' : '#B0522E')}
          {tile('Días activos', `${activeDays.length}/7`, 'con avance', activeDays.length >= 5 ? '#2E6E6E' : 'rgba(20,35,61,0.5)')}
          {tile('Rutinas', rutMax ? `${rutTotal}/${rutMax}` : '—', 'marcas de la semana', rutTotal >= rutMax * 0.7 ? '#2E6E6E' : '#A87A2C')}
          {(() => {
            const logr = activeEpics.flatMap(e => (e.kpis || []).filter(m => inWeek(m.doneAt))).length
            const abiertos = activeEpics.flatMap(e => (e.kpis || []).filter(m => !milestoneDone(m, e))).length
            return tile('Objetivos', String(logr), logr ? 'cumplidos ✦' : `${abiertos} abiertos`, logr ? '#C2933A' : 'rgba(20,35,61,0.5)')
          })()}
        </div>

        {/* Burndown */}
        <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 20 }}>
          {secTitle('Burndown de la semana', `${committed.length} tareas comprometidas · línea punteada = ritmo ideal`)}
          {committed.length === 0
            ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '10px 0' }}>No planeaste tareas para esta semana.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <svg width={W} height={H} style={{ display: 'block', minWidth: W }}>
                  {[0, 0.5, 1].map(f => <line key={f} x1={PAD} x2={W - PAD} y1={py(maxY * f)} y2={py(maxY * f)} stroke="rgba(15,35,64,0.08)" strokeWidth="1" />)}
                  {hoyIdx >= 0 && <line x1={px(hoyIdx)} x2={px(hoyIdx)} y1={PAD - 8} y2={H - PAD} stroke="rgba(194,147,58,0.5)" strokeWidth="1.5" strokeDasharray="3 3" />}
                  <path d={line(ideal)} fill="none" stroke="rgba(20,35,61,0.28)" strokeWidth="1.5" strokeDasharray="5 4" />
                  <path d={line(remaining)} fill="none" stroke="#C2933A" strokeWidth="2.5" strokeLinejoin="round" />
                  {remaining.map((v, k) => <circle key={k} cx={px(k)} cy={py(v)} r={3.5} fill={days[k] === today ? '#10233F' : '#C2933A'} />)}
                  {days.map((d, k) => <text key={d} x={px(k)} y={H - 8} textAnchor="middle" style={{ font: '700 9px var(--font-ui)', fill: d === today ? '#A87A2C' : 'rgba(20,35,61,0.45)' }}>{DAYS[k]} {dayNum(d)}</text>)}
                  {/* Zona clicable por día: abre el detalle de lo que pasó ese día */}
                  {days.map((d, k) => (
                    <rect key={'hit' + d} x={px(k) - (W - PAD * 2) / 12} y={0} width={(W - PAD * 2) / 6} height={H}
                      fill="transparent" style={{ cursor: 'pointer' }} onClick={() => setResumenDay(d)}>
                      <title>{`Ver qué pasó el ${dateLabel(d)}`}</title>
                    </rect>
                  ))}
                  <text x={PAD - 6} y={py(maxY) + 4} textAnchor="end" style={{ font: '700 9px var(--font-ui)', fill: 'rgba(20,35,61,0.4)' }}>{maxY}</text>
                  <text x={PAD - 6} y={py(0) + 4} textAnchor="end" style={{ font: '700 9px var(--font-ui)', fill: 'rgba(20,35,61,0.4)' }}>0</text>
                </svg>
              </div>
            )}
        </div>

        {/* PENDIENTES DE LA SEMANA — lo que falta por cerrar (lo más accionable) */}
        {(() => {
          const faltan = committed.filter(x => x.t.status !== 'Terminada')
          const rank = (x: typeof faltan[number]) => {
            const vencida = x.t.plan && x.t.plan < today ? 0 : 1        // arrastradas primero
            return [vencida, x.t.plan || '9999', PRIO_RANK[x.t.priority || 'media']] as const
          }
          const orden = [...faltan].sort((a, b) => { const A = rank(a), B = rank(b); return (A[0] - B[0]) || String(A[1]).localeCompare(String(B[1])) || (A[2] - B[2]) })
          return (
            <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 20, ...(faltan.length ? { border: '1px solid rgba(176,82,46,0.28)' } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: faltanOpen ? 9 : 0, flexWrap: 'wrap' }}>
                <button onClick={() => setFaltanOpen(v => !v)} aria-expanded={faltanOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                  <span style={{ height: 7, width: 7, borderRadius: 99, background: faltan.length ? '#B0522E' : '#2E6E6E' }} />
                  <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Faltan por cerrar</span>
                  <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: faltan.length ? '#B0522E' : '#2E6E6E' }}>{faltan.length}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: faltanOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <span style={{ flex: 1 }} />
                {faltanOpen && faltan.length > 0 && (
                  <div role="group" aria-label="Vista de faltantes" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
                    {([['lista', 'Lista'], ['tabla', 'Tabla']] as const).map(([v, label]) => {
                      const on = faltanView === v
                      return <button key={v} aria-pressed={on} onClick={() => setFaltanView(v)} style={{ cursor: 'pointer', border: 'none', borderRadius: 6, padding: '4px 10px', font: '700 10.5px var(--font-ui)', background: on ? '#10233F' : 'transparent', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                    })}
                  </div>
                )}
                {faltanOpen && faltan.length > 0 && (() => { const pts = faltan.reduce((n, x) => n + taskWeight(x.t), 0); return <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>{pts} pts restantes</span> })()}
              </div>
              {!faltanOpen ? null : faltan.length === 0
                ? <div style={{ fontSize: 13, color: '#2E6E6E', fontWeight: 600, padding: '4px 0' }}>Cerraste todo lo que planeaste esta semana ✦</div>
                : faltanView === 'tabla' ? (
                  <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)' }}>
                          {['Día', 'Tarea', 'Épica', 'Estado', 'Prioridad', 'Dificultad', 'Avance', 'Vence'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 10px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orden.map(x => {
                          const { e, t } = x
                          const vencida = t.plan && t.plan < today && t.status !== 'Terminada'
                          return (
                            <tr key={planKey(e.id, t)} className="backlog-row" onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ borderBottom: '1px solid rgba(15,35,64,0.06)', cursor: 'pointer' }}>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', font: '700 11px var(--font-ui)', color: vencida ? '#B0522E' : 'rgba(20,35,61,0.6)' }}>{t.plan ? fmtDue(t.plan) : '—'}{vencida ? ' ⏳' : ''}</td>
                              <td style={{ padding: '7px 10px', fontSize: 13, fontWeight: 600, color: '#16365F', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</td>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.6)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</span></td>
                              <td style={{ padding: '7px 10px' }}><span style={{ font: '700 10px var(--font-ui)', color: taskStyle(t.status).c, background: taskStyle(t.status).bg, borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>{taskStyle(t.status).label}</span></td>
                              <td style={{ padding: '7px 10px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'rgba(20,35,61,0.6)' }}><PrioBars p={t.priority} size={12} />{prioStyle(t.priority).label}</span></td>
                              <td style={{ padding: '7px 10px' }}>{t.difficulty ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: difStyle(t.difficulty).c }}><DifDots d={t.difficulty} size={10} />{difStyle(t.difficulty).label}</span> : <span style={{ color: 'rgba(20,35,61,0.35)' }}>—</span>}</td>
                              <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>{typeof t.progress === 'number' ? `${t.progress}%` : '—'}</td>
                              <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: dueTone(t.due, false).c }}>{t.due ? fmtDue(t.due) : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {orden.map(x => {
                      const { e, t } = x
                      const vencida = t.plan && t.plan < today && t.status !== 'Terminada'
                      const dt = dueTone(t.due, false)
                      return (
                        <div key={planKey(e.id, t)} {...clickable(() => setTaskView({ eId: e.id, tid: t.id! }), `Ver ${t.t}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                          <span title={t.plan ? `Planeada para ${fmtDue(t.plan)}` : 'Sin día'} style={{ flexShrink: 0, width: 52, textAlign: 'center', font: '700 10px var(--font-ui)', color: vencida ? '#B0522E' : 'rgba(20,35,61,0.55)', background: vencida ? 'rgba(176,82,46,0.10)' : 'rgba(15,35,64,0.04)', border: vencida ? '1px solid rgba(176,82,46,0.3)' : '1px solid transparent', borderRadius: 7, padding: '3px 0' }}>
                            {t.plan ? (relShort(t.plan) === 'Hoy' ? 'HOY' : `${DAYS[(new Date(t.plan + 'T00:00:00').getDay() + 6) % 7]} ${dayNum(t.plan)}`) : '—'}
                          </span>
                          <span style={{ width: prioStyle(t.priority).accentW, height: 22, borderRadius: 99, background: prioStyle(t.priority).accent, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}</span>
                              <span style={{ font: '700 10px var(--font-ui)', color: taskStyle(t.status).c, background: taskStyle(t.status).bg, borderRadius: 99, padding: '1px 7px' }}>{taskStyle(t.status).label}</span>
                              {vencida && <span style={{ font: '700 10px var(--font-ui)', color: '#B0522E' }}>⏳ atrasada</span>}
                              {t.difficulty && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '700 10px var(--font-ui)', color: difStyle(t.difficulty).c }}><DifDots d={t.difficulty} size={9} />{difStyle(t.difficulty).label}</span>}
                              {t.due && <span style={{ font: '700 10px var(--font-ui)', color: dt.c }}>vence {fmtDue(t.due)}</span>}
                            </div>
                          </div>
                          {typeof t.progress === 'number' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, width: 70 }}>
                              <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
          )
        })()}

        {/* NO SE TERMINARON ESTA SEMANA — tareas que se tenían que terminar esta semana
            (con entrega en la semana, o que estuvieron planeadas aquí según el historial)
            y no se cerraron dentro de la semana. Excluye las que siguen en el plan de la
            semana (esas están en "Faltan por cerrar") y las que sí se cerraron aquí. */}
        {(() => {
          const noTermino = all.filter(x => {
            const t = x.t
            if (t.doneAt && t.doneAt < mon) return false                 // se terminó antes de la semana
            if (inWeek(t.doneAt)) return false                           // se terminó DENTRO de la semana → cumplida
            const pendingHere = inWeek(t.plan) && t.status !== 'Terminada'  // sigue en el plan de la semana → ya está en "Faltan por cerrar"
            if (pendingHere) return false
            // Se tenía que terminar esta semana: entrega (Vence) en la semana, o estuvo planeada aquí
            return inWeek(t.due) || (t.planHist || []).some(d => d >= mon && d <= sun)
          }).sort((a, b) => (a.t.due || a.t.plan || '9999').localeCompare(b.t.due || b.t.plan || '9999'))
          if (noTermino.length === 0) return null   // no ocupa espacio si no hay nada
          return (
            <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 20, border: '1px solid rgba(176,82,46,0.28)' }}>
              <button onClick={() => setMovidasOpen(v => !v)} aria-expanded={movidasOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, marginBottom: movidasOpen ? 9 : 0 }}>
                <span style={{ height: 7, width: 7, borderRadius: 99, background: '#B0522E' }} />
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>No se terminaron esta semana</span>
                <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: '#B0522E' }}>{noTermino.length}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: movidasOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {movidasOpen && (
                <>
                  <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginBottom: 8 }}>Se tenían que terminar esta semana (por su entrega o porque estaban planeadas aquí) y quedaron sin cerrar: se movieron a otra semana, se quitaron del plan o siguen abiertas.</div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {noTermino.map(x => {
                      const { e, t } = x
                      const done = t.status === 'Terminada'                       // terminada, pero DESPUÉS de la semana
                      const destWeek = t.plan ? mondayISO(t.plan) : ''
                      const destSame = destWeek && destWeek === mondayISO(today)
                      return (
                        <div key={planKey(e.id, t)} {...clickable(() => setTaskView({ eId: e.id, tid: t.id! }), `Ver ${t.t}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                          <span style={{ flexShrink: 0, width: 22, textAlign: 'center', color: done ? '#2E6E6E' : '#B0522E', fontSize: 14 }}>{done ? '✓' : '↪'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}</span>
                              {/* Por qué se esperaba esta semana */}
                              {inWeek(t.due) && <span style={{ font: '700 10px var(--font-ui)', color: '#B0522E' }}>vencía {fmtDue(t.due)}</span>}
                              {/* Qué pasó */}
                              {done
                                ? <span style={{ font: '700 10px var(--font-ui)', color: '#2E6E6E' }}>terminada {t.doneAt ? fmtDue(t.doneAt) : 'después'}</span>
                                : t.plan
                                  ? <span style={{ font: '700 10px var(--font-ui)', color: '#A87A2C', background: 'rgba(194,147,58,0.12)', border: '1px solid rgba(194,147,58,0.3)', borderRadius: 99, padding: '1px 8px' }}>→ {destSame ? 'esta semana' : weekRangeLabel(destWeek)}</span>
                                  : <span style={{ font: '700 10px var(--font-ui)', color: 'rgba(20,35,61,0.5)', background: 'rgba(15,35,64,0.05)', borderRadius: 99, padding: '1px 8px' }}>sin plan</span>}
                              {t.difficulty && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '700 10px var(--font-ui)', color: difStyle(t.difficulty).c }}><DifDots d={t.difficulty} size={9} />{difStyle(t.difficulty).label}</span>}
                            </div>
                          </div>
                          {typeof t.progress === 'number' && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* PASTELES + COMPARACIÓN — composición del trabajo y tendencia semanal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginBottom: 20 }}>
          {/* Composición del pipeline */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Composición del plan', `${committed.length} tareas de la semana`)}
            {committed.length === 0
              ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '10px 0' }}>No planeaste tareas esta semana.</div>
              : <Donut segments={estSegs} centerTop={String(committed.length)} centerBottom="tareas" />}
          </div>

          {/* Tipo de trabajo cerrado (dificultad) */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Trabajo cerrado', `${completed.length} completadas · por dificultad`)}
            {completed.length === 0
              ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '10px 0' }}>Aún no cierras nada esta semana.</div>
              : <Donut segments={difSegs} centerTop={String(points)} centerBottom="puntos" />}
          </div>

          {/* Vs. semana pasada */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Vs. semana pasada', weekRangeLabel(lastMon))}
            {[
              { l: 'Completadas', cur: completed.length, prev: lastCompleted.length },
              { l: 'Puntos de esfuerzo', cur: points, prev: lastPoints },
            ].map(row => {
              const d = delta(row.cur, row.prev)
              const max = Math.max(row.cur, row.prev, 1)
              return (
                <div key={row.l} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span className="serif" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: '#10233F' }}>{row.cur}</span>
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>{row.l}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ font: '800 12px var(--font-ui)', color: d.c }}>{d.txt === '=' ? '=' : (d.txt.startsWith('+') ? '▲ ' : '▼ ') + d.txt.replace('+', '').replace('-', '')}</span>
                  </div>
                  {/* dos barras: esta semana (color) vs pasada (gris) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.06)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${(row.cur / max) * 100}%`, height: '100%', background: '#C2933A' }} /></span>
                    <span style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.06)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${(row.prev / max) * 100}%`, height: '100%', background: 'rgba(20,35,61,0.3)' }} /></span>
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: 'rgba(20,35,61,0.5)', marginTop: 2 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 5, borderRadius: 99, background: '#C2933A' }} /> esta semana</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 5, borderRadius: 99, background: 'rgba(20,35,61,0.3)' }} /> pasada</span>
            </div>
          </div>
        </div>

        {/* Tareas diarias (rutinas) de la semana */}
        {rut.length > 0 && (
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 20 }}>
            {secTitle('Tareas diarias', `${rutTotal} de ${rutMax} marcas`)}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 380 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.4fr) repeat(7,1fr) 46px', gap: 4, alignItems: 'center', paddingBottom: 5 }}>
                  <span />
                  {days.map((d, k) => (
                    <div key={d} style={{ textAlign: 'center' }}>
                      <div style={{ font: '700 9px/1 var(--font-ui)', color: d === today ? '#A87A2C' : 'rgba(20,35,61,0.42)' }}>{DAYS[k]}</div>
                      <div className="serif" style={{ fontSize: 12, fontWeight: 600, color: d === today ? '#A87A2C' : '#10233F' }}>{dayNum(d)}</div>
                    </div>
                  ))}
                  <span />
                </div>
                {activeEpics.flatMap(e => (e.routines || []).map((r, ri) => ({ e, r, ri }))).map(({ e, r, ri }) => {
                  const wk = getRoutineWeek(r, mon); const n = wk.filter(Boolean).length
                  const nc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.42)'
                  return (
                    <div key={e.id + ':' + ri} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.4fr) repeat(7,1fr) 46px', gap: 4, alignItems: 'center', padding: '3px 0', borderTop: '1px solid rgba(15,35,64,0.05)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
                      </span>
                      {days.map((d, di) => {
                        const on = wk[di]
                        return (
                          <button key={d} onClick={() => toggleRoutineWeekDay(e, ri, mon, di)} title={`${r.t} · ${DAYNAMES[di]} ${dayNum(d)}`}
                            style={{ height: 22, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: on ? 'none' : d === today ? '1.5px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: on ? e.color : '#fff', color: '#fff' }}>
                            {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                          </button>
                        )
                      })}
                      <span style={{ textAlign: 'right', font: '800 10px var(--font-ui)', color: nc }}>{n}/7</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          {/* Logros */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Logros de la semana', completed.length ? 'lo más difícil primero' : undefined)}
            {(() => {
              // Deduplica por tarea (una recurrente puede cerrar varios ciclos en la semana);
              // la fecha mostrada usa doneAt o el último ciclo cumplido en la semana.
              const logros = Array.from(new Map(completed.map(x => [planKey(x.e.id, x.t), x])).values())
              if (logros.length === 0) return <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)' }}>Aún no cierras nada esta semana.</div>
              return logros.sort((a, b) => taskWeight(b.t) - taskWeight(a.t)).slice(0, 8).map(x => {
                const doneD = x.t.doneAt || (x.t.repeatDone || []).filter(d => d >= mon && d <= sun).slice(-1)[0] || ''
                return (
                  <div key={planKey(x.e.id, x.t)} {...clickable(() => setTaskView({ eId: x.e.id, tid: x.t.id! }), `Ver ${x.t.t}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                    <span style={{ flexShrink: 0, height: 17, width: 17, borderRadius: 99, background: '#2E6E6E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.t.t}{x.t.repeat && <span title="Recurrente" style={{ marginLeft: 6, font: '700 9.5px var(--font-ui)', color: REPEAT_TONE.c }}>↻</span>}</span>
                    {x.t.difficulty && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '700 9.5px var(--font-ui)', color: difStyle(x.t.difficulty).c }}><DifDots d={x.t.difficulty} size={9} />{difStyle(x.t.difficulty).label}</span>}
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: 'rgba(20,35,61,0.45)' }}>{fmtDue(doneD)}</span>
                  </div>
                )
              })
            })()}
          </div>

          {/* En qué trabajaste */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('En qué trabajaste', worked.length ? `${worked.length} tareas con avance` : undefined)}
            {worked.length === 0
              ? <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)' }}>Sin avances registrados esta semana.</div>
              : [...worked].sort((a, b) => diasTrabajados(b.t) - diasTrabajados(a.t)).slice(0, 8).map(x => {
                const dw = (x.t.progressLog || []).filter(l => inWeek(l.d)).length
                return (
                  <div key={planKey(x.e.id, x.t)} {...clickable(() => setTaskView({ eId: x.e.id, tid: x.t.id! }), `Ver ${x.t.t}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: x.e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: x.t.status === 'Terminada' ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: x.t.status === 'Terminada' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.t.t}</span>
                    {typeof x.t.progress === 'number' && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{x.t.progress}%</span>}
                    <span title={`${dw} día(s) de trabajo esta semana`} style={{ flexShrink: 0, font: '700 9.5px var(--font-ui)', color: MULTIDIA_TONE.c, background: MULTIDIA_TONE.bg, border: `1px solid ${MULTIDIA_TONE.border}`, borderRadius: 99, padding: '1px 7px' }}>⧗ {dw}d</span>
                  </div>
                )
              })}
          </div>

          {/* Se están arrastrando */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Se están arrastrando', arrastran.length ? 'sin terminar, de esta semana y anteriores' : undefined)}
            {arrastran.length === 0
              ? <div style={{ fontSize: 12.5, color: '#2E6E6E', fontWeight: 600 }}>Nada se está atorando ✦</div>
              : [...arrastran].sort((a, b) => arrastraDias(b.t) - arrastraDias(a.t)).slice(0, 12).map(x => {
                const t = x.t
                const worked = new Set((t.progressLog || []).map(l => l.d)).size
                // Etiqueta: días trabajados, o "movida" (su plan cambió), o "atrasada" (ya venció)
                const tag = worked >= 2 ? { txt: `⧗ ${worked} días`, c: MULTIDIA_TONE.c }
                  : (t.planHist || []).length > 0 ? { txt: '↪ movida', c: '#A87A2C' }
                  : (t.plan && t.plan < today) ? { txt: '⏳ atrasada', c: '#B0522E' }
                  : { txt: `⧗ ${arrastraDias(t)} días`, c: MULTIDIA_TONE.c }
                return (
                  <div key={planKey(x.e.id, t)} {...clickable(() => setTaskView({ eId: x.e.id, tid: t.id! }), `Ver ${t.t}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: x.e.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                    <span style={{ flexShrink: 0, font: '700 9.5px var(--font-ui)', color: tag.c }}>{tag.txt}</span>
                  </div>
                )
              })}
          </div>

          {/* Por épica */}
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px' }}>
            {secTitle('Por épica', 'cerradas esta semana')}
            {(() => {
              const byEpic = activeEpics.map(e => ({
                e,
                done: completed.filter(x => x.e.id === e.id).length,
                plan: committed.filter(x => x.e.id === e.id).length,
              })).filter(g => g.plan > 0 || g.done > 0).sort((a, b) => b.done - a.done)
              if (!byEpic.length) return <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)' }}>Sin actividad por épica esta semana.</div>
              const max = Math.max(...byEpic.map(g => g.plan || g.done), 1)
              return byEpic.map(g => (
                <div key={g.e.id} {...clickable(() => setEpicPeek(g.e.id), `Ver ${g.e.name}`)} className="ep-venc-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: g.e.color, flexShrink: 0 }} />
                  <span style={{ flex: '0 0 120px', fontSize: 12, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.e.name}</span>
                  <span style={{ flex: 1, height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.07)', overflow: 'hidden', minWidth: 40 }}>
                    <span style={{ display: 'block', width: `${(g.done / max) * 100}%`, height: '100%', background: g.e.color }} />
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>{g.done}/{g.plan}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      </div>
    )
  }

  const renderPlanToday = () => {
    const week = planMode === 'semana'
    const ajuste = planMode === 'ajuste'
    const multi = planMode === '2sem' || planMode === '3sem' || planMode === 'mes'
    const sprintLanes = planMode === '2sem' || planMode === '3sem'   // multi-semana con carriles (estilo Ajuste)
    const cal = planMode === 'calendario'
    const timeline = planMode === 'timeline'
    const resumen = planMode === 'resumen'
    const agenda = planMode === 'agenda'     // Vista A: calendario + panel (sin fecha / agendadas)
    const detalle = planMode === 'detalle'   // Vista B: maestro/detalle (lista + detalle sin popup)
    const monthy = planMode === 'mes' || cal || timeline   // navegación/etiqueta por mes
    const board = week || ajuste || multi || cal || timeline || resumen || agenda || detalle
    const weekMonday = mondayISO(viewDate)
    const todayMonday = mondayISO(today)
    // Semanas del horizonte según el modo
    const weekMondays = monthy ? monthWeekMondays(viewDate)
      : Array.from({ length: planMode === '3sem' ? 3 : planMode === '2sem' ? 2 : 1 }, (_, k) => addDays(weekMonday, k * 7))
    const hStart = weekMondays[0]
    const hEnd = addDays(weekMondays[weekMondays.length - 1], 6)
    const horizonHasToday = today >= hStart && today <= hEnd
    const weekRel = weekMonday === todayMonday ? 'Esta semana'
      : weekMonday === addDays(todayMonday, 7) ? 'Próxima semana'
      : weekMonday === addDays(todayMonday, -7) ? 'Semana pasada'
      : weekRangeLabel(weekMonday)
    const monthName = cap(new Date(viewDate + 'T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
    // Etiquetas del masthead
    const bigLabel = detalle ? 'Detalle' : agenda ? 'Agenda' : monthy ? monthName : (week || ajuste || resumen) ? weekRangeLabel(weekMonday) : spanLabel(hStart, hEnd)
    const eyebrow = detalle ? 'Lista + detalle' : agenda ? 'Calendario + actividades' : week ? 'Enfoque de la semana' : ajuste ? 'Ajuste de la semana' : resumen ? 'Resumen de la semana' : cal ? 'Calendario' : timeline ? 'Línea de tiempo' : planMode === 'mes' ? 'Plan del mes' : `Sprint · ${weekMondays.length} semanas`
    const topLabel = detalle ? 'Todas las actividades' : agenda ? 'Arrastra al día' : (week || ajuste || resumen) ? weekRel
      : monthy ? (viewDate.slice(0, 7) === today.slice(0, 7) ? 'Este mes' : 'Otro mes')
      // "Próximas N semanas" sólo si la ventana arranca en la semana actual; si la
      // deslizaste hacia atrás (para ver semanas pasadas) muestra el rango real.
      : (hStart === todayMonday ? `Próximas ${weekMondays.length} semanas` : spanLabel(hStart, hEnd))
    // Progreso del horizonte
    let wTot = 0, wDone = 0
    if (board) activeEpics.forEach(e => (e.tasks || []).forEach(t => {
      if (t.plan && t.status !== ARCHIVED && t.plan >= hStart && t.plan <= hEnd) { wTot++; if (t.status === 'Terminada') wDone++ }
    }))
    // Semana/2 sem/3 sem: las flechas deslizan UNA semana (así puedes traer las
    // semanas pasadas al lado de la actual). Mes: navega mes a mes.
    const stepDays = multi ? 7 : weekMondays.length * 7
    const goPrev = () => setViewDate(monthy ? addMonths(viewDate, -1) : addDays(viewDate, -stepDays))
    const goNext = () => setViewDate(monthy ? addMonths(viewDate, 1) : addDays(viewDate, stepDays))
    const empty = planTotal === 0
    const suggestions: { e: Epica; i: number; t: EpicaTask }[] = []
    if (empty) {
      activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
        if (t.status === 'Terminada' || t.plan === viewDate) return
        if (!t.due) return
        const ok = isToday ? (daysUntil(t.due) ?? 1e9) <= 7 : t.due <= viewDate
        if (ok) suggestions.push({ e, i, t })
      }))
      suggestions.sort((a, b) => (a.t.due || '').localeCompare(b.t.due || ''))
    }
    return (
      <div className="ep-pop" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 20, boxShadow: '0 24px 50px -34px rgba(15,35,64,0.5)', overflow: 'hidden', marginBottom: 26 }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#10233F 0%,#C2933A 55%,#E7C56B 100%)' }} />
        <div className="plan-body" style={{ padding: '26px 28px' }}>
          <div className="plan-mast" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontSize: 14, color: '#A87A2C' }}>{board ? topLabel : isToday ? greeting() : relLong(viewDate)}</span>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.22em', textTransform: 'uppercase', color: '#A87A2C' }}>{board ? eyebrow : isToday ? 'Enfoque de hoy' : 'Plan del día'}</span>
              {board
                ? <span className="serif plan-date" style={{ fontWeight: 600, fontSize: 30, lineHeight: 1, color: '#10233F' }}>{bigLabel}</span>
                : isToday && planAllDone
                  ? <span className="serif plan-date" style={{ fontStyle: 'italic', fontSize: 26, lineHeight: 1, color: '#A87A2C' }}>Enfoque cumplido ✦</span>
                  : <span className="serif plan-date" style={{ fontWeight: 600, fontSize: 30, lineHeight: 1, color: '#10233F' }}>{dateLabel(viewDate)}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Interruptor de horizonte: Día · Semana · 2 sem · 3 sem · Mes */}
              <div role="group" aria-label="Vista del enfoque" className="ep-modes" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 10, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)', flexWrap: 'wrap' }}>
                {([['dia', 'Día'], ['detalle', 'Detalle'], ['ajuste', 'Ajuste'], ['semana', 'Semana'], ['3sem', '3 sem'], ['agenda', 'Agenda'], ['calendario', 'Calendario'], ['timeline', 'Timeline'], ['resumen', 'Resumen']] as const).map(([m, label]) => {
                  const on = planMode === m
                  return <button key={m} aria-pressed={on} onClick={() => setPlanMode(m)} style={{ cursor: 'pointer', border: 'none', borderRadius: 8, padding: '6px 11px', font: '700 12px var(--font-ui)', background: on ? '#10233F' : 'transparent', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.55)', transition: 'background .15s', whiteSpace: 'nowrap' }}>{label}</button>
                })}
              </div>
              {/* Navegación por horizonte, o "‹ Hoy" en modo día */}
              {board ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={goPrev} aria-label={multi ? 'Una semana atrás' : 'Período anterior'} title={multi ? 'Una semana atrás (para ver semanas pasadas)' : undefined} style={{ height: 33, width: 33, borderRadius: 9, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 15 }}>‹</button>
                  {!horizonHasToday && <button onClick={() => setViewDate(today)} style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '8px 12px', font: '700 12px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>{monthy ? 'Este mes' : (week || ajuste || resumen) ? 'Esta semana' : 'Ahora'}</button>}
                  <button onClick={goNext} aria-label={multi ? 'Una semana adelante' : 'Período siguiente'} title={multi ? 'Una semana adelante' : undefined} style={{ height: 33, width: 33, borderRadius: 9, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 15 }}>›</button>
                </div>
              ) : !isToday && (
                <button onClick={() => setViewDate(today)} style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 10, padding: '9px 14px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>‹ Hoy</button>
              )}
              {/* Presupuesto del día: suma de pesos por dificultad de lo pendiente */}
              {!board && planPend.length > 0 && (() => {
                const load = planPend.reduce((n, x) => n + taskWeight(x.t), 0)
                // Horas estimadas del día (por dificultad), AJUSTADAS con tu calibración si hay datos.
                const calMin = planPend.reduce((n, x) => { const base = estMinOf(x.t); if (!base) return n; const d = x.t.difficulty; const custom = typeof x.t.estMin === 'number' && x.t.estMin > 0; const f = (!custom && d && calibration.totalN >= 3 && calibration.factor(d) > 0) ? calibration.factor(d) : 1; return n + base * f }, 0)
                const asH = (m: number) => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${Math.round(m)}m`
                const pctLoad = dayCapacity > 0 ? load / dayCapacity : 0
                const c = pctLoad > 1 ? '#B0522E' : pctLoad > 0.85 ? '#A87A2C' : '#2E6E6E'
                const bg = pctLoad > 1 ? 'rgba(176,82,46,0.10)' : pctLoad > 0.85 ? 'rgba(194,147,58,0.12)' : 'rgba(62,142,142,0.10)'
                return (
                  <div title={`Carga del día: fácil 1 · media 2 · difícil 3. ${load} de ${dayCapacity} puntos.${pctLoad > 1 ? ' Vas sobrecargado.' : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 99, padding: '5px 10px', background: bg, border: `1px solid ${c}44` }}>
                    <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: c }}>Carga</span>
                    <span style={{ width: 46, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.10)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${Math.min(100, pctLoad * 100)}%`, height: '100%', background: c }} />
                    </span>
                    <span style={{ font: '800 11px var(--font-ui)', color: c, whiteSpace: 'nowrap' }}>{load}/{dayCapacity}</span>
                    {calMin > 0 && <span title={`≈ tiempo estimado del día por dificultad${calibration.totalN >= 3 ? ' · ajustado con tu calibración' : ''}`} style={{ font: '800 10.5px var(--font-ui)', color: c, whiteSpace: 'nowrap', opacity: .85 }}>· ≈{asH(calMin)}</span>}
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      <button onClick={() => setDayCapacity(v => Math.max(1, v - 1))} aria-label="Bajar presupuesto" style={{ height: 16, width: 16, borderRadius: 4, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', color: c, fontSize: 11, lineHeight: 1 }}>−</button>
                      <button onClick={() => setDayCapacity(v => Math.min(40, v + 1))} aria-label="Subir presupuesto" style={{ height: 16, width: 16, borderRadius: 4, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', color: c, fontSize: 11, lineHeight: 1 }}>+</button>
                    </span>
                  </div>
                )
              })()}
              {(board ? wTot > 0 : planTotal > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <ProgressRing pct={board ? (wTot ? Math.round((wDone / wTot) * 100) : 0) : planPct} done={board ? wTot > 0 && wDone === wTot : planAllDone} />
                  <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', whiteSpace: 'nowrap' }}><span className="serif" style={{ fontSize: 18, color: '#10233F' }}>{board ? wDone : planDone.length}</span> de {board ? wTot : planTotal} hechas</span>
                </div>
              )}
              {/* Dos caminos distintos: traer algo que ya existe, o crear algo nuevo. */}
              {!board && planPend.length > 0 && !focus.active && (
                <button onClick={pickNextNow} title="Elige la mejor siguiente tarea de hoy y arranca el cronómetro" style={{ border: 'none', background: 'linear-gradient(135deg,#3E8E8E,#2E6E6E)', color: '#fff', borderRadius: 10, padding: '9px 15px', font: '800 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>⚡ ¿Qué ahora?</button>
              )}
              {!board && ((isToday && (planItems.length > 0 || arrastradas.length > 0)) || (viewDate < today && planPend.length > 0)) && (() => {
                const pastPend = viewDate < today && planPend.length > 0
                const warn = arrastradas.length > 0 || pastPend
                return (
                <button onClick={() => setDayCloseOpen(true)} title={pastPend ? 'Este día quedó sin cerrar — mueve sus pendientes a hoy u otro día' : 'Resumen del día, mover pendientes y arrastre a otros días'} style={{ border: warn ? '1px solid rgba(176,82,46,0.4)' : '1px solid rgba(15,35,64,0.16)', background: warn ? 'rgba(176,82,46,0.06)' : '#fff', color: warn ? '#B0522E' : '#16365F', borderRadius: 10, padding: '9px 15px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>🌙 Cerrar día{pastPend ? ` · ${planPend.length} sin cerrar` : arrastradas.length > 0 ? ` · ${arrastradas.length} arrastre` : ''}</button>
                )
              })()}
              <button onClick={() => setPickerOpen(true)} title="Traer al plan una tarea que ya existe" style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 10, padding: '9px 15px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Del backlog</button>
              <button onClick={() => newTaskForDay(board ? (horizonHasToday ? today : hStart) : viewDate)} title="Crear una tarea nueva" style={{ ...goldBtn, padding: '9px 15px', font: '700 12.5px var(--font-ui)', whiteSpace: 'nowrap' }}>+ Nueva tarea</button>
            </div>
          </div>

          {/* Filtros por estado de trabajo del día — presentes en las vistas board (salvo Resumen,
              que es un digest semanal y filtrarlo por "trabajo de hoy" vaciaría sus KPIs). */}
          {board && !resumen && renderWorkFilters(today)}

          {detalle || agenda ? (() => {
            // Vistas Detalle / Agenda en el Enfoque: operan sobre TODAS las tareas activas,
            // con el filtro de épica (chips), dificultad, "ocultar completadas" y un rango
            // de fecha (esta semana / 2 sem / mes) por su día "Hacer".
            const enfEpics = activeEpics.filter(e => (e.tasks || []).some(t => t.status !== ARCHIVED))
            const effEnf = enfEpics.some(e => e.id === weekEpica) ? weekEpica : 'todas'
            const rStart = mondayISO(today)
            const [ry, rm] = today.split('-').map(Number)
            const monthEnd = `${today.slice(0, 7)}-${String(new Date(ry, rm, 0).getDate()).padStart(2, '0')}`
            const rEnd = mdRange === 'semana' ? addDays(rStart, 6) : mdRange === '2sem' ? addDays(rStart, 13) : mdRange === 'mes' ? monthEnd : ''
            const rStartUse = mdRange === 'mes' ? today.slice(0, 7) + '-01' : rStart
            const inRange = (t: EpicaTask) => mdRange === 'todas' ? true : (!!t.plan && t.plan >= rStartUse && t.plan <= rEnd)
            const weekDays = Array.from({ length: 7 }, (_, k) => addDays(rStart, k))   // L-D de esta semana
            const enfRows = activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i })))
              .filter(x => x.t.status !== ARCHIVED && (effEnf === 'todas' || x.e.id === effEnf) && (weekDif === 'todas' || (x.t.difficulty || '') === weekDif) && !(boardHideDone && x.t.status === 'Terminada') && (mdDay ? x.t.plan === mdDay : inRange(x.t)) && passWork(x.t, mdDay || today))
            const rangeChips = (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                  <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>📅 Rango</span>
                  {([['todas', 'Todas'], ['semana', 'Esta semana'], ['2sem', 'Próx. 2 sem'], ['mes', 'Este mes']] as const).map(([k, label]) => {
                    const on = mdRange === k && !mdDay
                    return <button key={k} onClick={() => { setMdRange(k); setMdDay('') }} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}</button>
                  })}
                </div>
                {/* Filtro por día concreto (L-D de esta semana) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
                  <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>Día</span>
                  {weekDays.map(d => {
                    const on = mdDay === d; const isTd = d === today
                    const lbl = cap(new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')) + ' ' + dayNum(d)
                    return <button key={d} onClick={() => setMdDay(on ? '' : d)} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 11px', fontSize: 11, fontWeight: 700, border: on ? '1.5px solid #C2933A' : isTd ? '1px solid rgba(194,147,58,0.45)' : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(194,147,58,0.14)' : '#fff', color: on ? '#A87A2C' : isTd ? '#A87A2C' : 'rgba(20,35,61,0.6)' }}>{lbl}</button>
                  })}
                  {mdDay && <button onClick={() => setMdDay('')} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Todos</button>}
                </div>
              </>
            )
            return <>{renderBoardFilters(enfEpics, effEnf)}{rangeChips}{detalle ? renderMasterDetail(enfRows) : renderCalendarPanel(enfRows)}</>
          })()
          : week ? renderPlanWeek() : ajuste ? renderPlanAjuste() : sprintLanes ? renderSprintAjuste(weekMondays) : resumen ? renderPlanResumen() : cal ? renderPlanCalendar() : timeline ? renderPlanTimeline() : multi ? renderPlanSprint(weekMondays) : (<>

          {renderDayStrip()}

          {/* Próximos recordatorios (los remindAt sólo suenan con la app abierta; aquí se VEN). */}
          {isToday && remindReady.current && (() => {
            const nowMs = Date.now()
            const rem = activeEpics.flatMap(e => (e.tasks || []).map((t, i) => ({ e, t, i })))
              .filter(x => x.t.remindAt && x.t.status !== ARCHIVED && x.t.status !== 'Terminada' && !isNaN(Date.parse(x.t.remindAt!)))
              .map(x => ({ ...x, ms: Date.parse(x.t.remindAt!) }))
              .filter(x => x.ms >= nowMs - 12 * 3600000)   // futuros + los de las últimas 12h (por si no sonaron)
              .sort((a, b) => a.ms - b.ms).slice(0, 5)
            if (!rem.length) return null
            return (
              <div style={{ marginTop: 16, borderRadius: 13, background: 'rgba(122,111,176,0.06)', border: '1px solid rgba(122,111,176,0.28)', padding: '9px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ font: '800 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#5E5490' }}>🔔 Próximos recordatorios</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {rem.map(({ e, t }) => { const d = new Date(t.remindAt!); const past = Date.parse(t.remindAt!) < nowMs
                    return (
                      <div key={planKey(e.id, t)} onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 2px', cursor: 'pointer' }}>
                        <span style={{ flexShrink: 0, font: '800 11px var(--font-ui)', color: past ? '#B0522E' : '#5E5490', width: 88 }}>{cap(d.toLocaleString('es-MX', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ''))}</span>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                        {past && <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: '#B0522E' }}>vencido</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {isToday && (() => {
            const monday = mondayISO(today)
            const todayIdx = (new Date(today + 'T00:00:00').getDay() + 6) % 7
            const all = activeEpics.flatMap(e => (e.routines || []).map((r, ri) => ({ e, r, ri })))
            if (all.length === 0) return null
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 8 }}>Rutinas de hoy</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {all.map(({ e, r, ri }) => {
                    const wk = getRoutineWeek(r, monday)
                    const on = wk[todayIdx]; const n = wk.filter(Boolean).length
                    const nc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.4)'
                    return (
                      <span key={e.id + ':' + ri} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 99, padding: '5px 6px 5px 9px', border: on ? `1px solid ${e.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(15,35,64,0.02)' : '#fff' }}>
                        <button onClick={() => toggleRoutineToday(e, ri)} title={on ? 'Hecha hoy' : 'Marcar hoy'} style={{ height: 18, width: 18, borderRadius: 5, cursor: 'pointer', border: on ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: on ? e.color : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</button>
                        <button onClick={() => setRoutineStat({ eId: e.id, ri })} aria-label="Ver estadísticas" title="Ver estadísticas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#16365F' }}>{r.t}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: nc }}>{n}/7</span>
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {isToday && arrastradas.length > 0 && !hideYesterday && (
            <div style={{ marginTop: 16, borderRadius: 13, background: 'rgba(176,82,46,0.06)', border: '1px solid rgba(176,82,46,0.28)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', background: 'rgba(176,82,46,0.08)' }}>
                <span style={{ fontSize: 14 }}>⏳</span>
                <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#B0522E' }}>De días anteriores</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(176,82,46,0.6)' }}>{arrastradas.length}</span>
                <span style={{ flex: 1 }} />
                <button onClick={bringOverdue} aria-label="Reprogramar todas para hoy" title="Reprogramar todas para hoy" style={{ border: 'none', background: 'transparent', color: '#B0522E', font: '800 11.5px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Traer todas a hoy →</button>
                <button onClick={() => setHideYesterday(true)} aria-label="Ocultar por ahora" title="Ocultar por ahora" style={{ border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.55)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: '2px 6px 4px' }}>
                {arrastradas.map(({ e, t, i }) => {
                  const dc = diasCon(t)
                  const late = Math.round((new Date(today + 'T00:00:00').getTime() - new Date((t.plan || today) + 'T00:00:00').getTime()) / 86400000)
                  const dt = dueTone(t.due, false)
                  return (
                    <div key={planKey(e.id, t)} onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 9, cursor: 'pointer' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(176,82,46,0.05)')} onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                      <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: e.color }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#B0522E' }}>· se planeó hace {late}{late === 1 ? ' día' : ' días'}</span>
                          {dc >= 1 && <span title="Desde que empezaste con esta tarea" style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>· 🕐 {dc}{dc === 1 ? ' día' : ' días'} en esto</span>}
                          {t.due && <span style={{ fontSize: 10, fontWeight: 700, color: dt.c }}>· {fmtDue(t.due)}</span>}
                        </div>
                      </div>
                      <button onClick={ev => { ev.stopPropagation(); planTaskToDay(e, i, today) }} aria-label="Traer solo esta a hoy" title="Traer solo esta a hoy" style={{ flexShrink: 0, border: '1px solid rgba(176,82,46,0.4)', background: '#fff', color: '#B0522E', borderRadius: 8, padding: '4px 9px', font: '800 11px var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}>Hoy →</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {empty ? (
            <div style={{ padding: '28px 12px 12px', textAlign: 'center' }}>
              <div className="serif" style={{ fontSize: 27, color: '#10233F', margin: '4px 0 6px', lineHeight: 1.1 }}>{isToday ? 'Aún no defines tu enfoque de hoy.' : `Nada planeado para ${daysUntil(viewDate) === 1 ? 'mañana' : 'el ' + weekdayAbbr(viewDate).toLowerCase()}.`}</div>
              <div style={{ fontSize: 13.5, color: 'rgba(20,35,61,0.55)', maxWidth: 380, margin: '0 auto 18px' }}>{isToday ? 'Elige las pocas cosas que de verdad moverán la aguja hoy.' : 'Adelántate: agenda lo que quieras avanzar ese día.'}</div>
              <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => setPickerOpen(true)} style={{ ...goldBtn, padding: '11px 22px' }}>Elegir del backlog</button>
                <button onClick={() => newTaskForDay(viewDate)} style={{ border: '1px solid rgba(15,35,64,0.16)', background: '#fff', color: '#16365F', borderRadius: 11, padding: '11px 20px', font: '700 13px var(--font-ui)', cursor: 'pointer' }}>+ Nueva tarea</button>
              </div>
              {suggestions.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 9 }}>{isToday ? 'Sugerencias para hoy' : 'Para ese día'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
                    {suggestions.slice(0, 4).map(s => {
                      const dt = dueTone(s.t.due, false)
                      return (
                        <button key={planKey(s.e.id, s.t)} onClick={() => addToPlan(s.e, s.i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#16365F' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: s.e.color }} />{s.t.t}
                          <span style={{ fontSize: 10, fontWeight: 700, color: dt.c }}>{fmtDue(s.t.due)}</span>
                          <span style={{ color: '#A87A2C', fontWeight: 800 }}>+</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {isToday && arrastradas.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={bringOverdue} style={{ border: 'none', background: 'transparent', color: '#B0522E', font: '700 12.5px var(--font-ui)', cursor: 'pointer' }}>Traer {arrastradas.length} {arrastradas.length === 1 ? 'pendiente' : 'pendientes'} de días anteriores →</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ height: 1, background: 'rgba(15,35,64,0.08)', margin: '18px 0 8px' }} />
              {(() => {
                const passF = (t: EpicaTask) => planFilter === 'alta' ? t.priority === 'alta' : planFilter === 'vencidas' ? (() => { const dl = daysUntil(t.due); return dl != null && dl < 0 })() : planFilter === 'avance' ? (t.progressLog || []).some(x => x.d === viewDate) : planFilter === 'estancada' ? isStuck(t) : planFilter === 'multidia' ? isMultiDay(t) : planFilter === 'arrastre' ? isCarried(t) : true
                // Épicas presentes en el plan de hoy (para los chips de filtro por épica)
                const dayEpics = Array.from(new Map(planItems.map(x => [x.e.id, x.e])).values())
                const effDayEpica = dayEpics.some(e => e.id === dayEpica) ? dayEpica : 'todas'
                const passE = (ep: Epica) => effDayEpica === 'todas' || ep.id === effDayEpica
                const filtered = planPend.filter(x => passF(x.t) && passE(x.e) && passWork(x.t, viewDate))
                const cmp = (a: typeof planPend[number], b: typeof planPend[number]) => {
                  if (planSort === 'prioridad') return (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) || ((daysUntil(a.t.due) ?? 1e9) - (daysUntil(b.t.due) ?? 1e9))
                  if (planSort === 'entrega') return (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
                  if (planSort === 'avance') return (b.t.progress || 0) - (a.t.progress || 0)
                  if (planSort === 'epica') return a.e.name.localeCompare(b.e.name, 'es')
                  return 0
                }
                const manual = planSort === 'plan'
                const list = manual ? filtered : [...filtered].sort(cmp)
                const table = dayView === 'tabla'
                const tableRows = planItems.filter(x => passF(x.t) && passE(x.e) && passWork(x.t, viewDate))   // pend + hechas, para la tabla
                const visibleKeys = (table ? tableRows : list).map(x => planKey(x.e.id, x.t))
                return (
                  <>
                    {planItems.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {/* Vista Lista | Tabla del enfoque de día */}
                        <div role="group" aria-label="Vista del enfoque de día" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
                          {([['lista', 'Lista'], ['tabla', 'Tabla']] as const).map(([v, label]) => {
                            const onv = dayView === v
                            return <button key={v} aria-pressed={onv} onClick={() => setDayView(v)} style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '5px 11px', font: '700 11px var(--font-ui)', background: onv ? '#10233F' : 'transparent', color: onv ? '#F3EFE6' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                          })}
                        </div>
                        {!table && (
                          <select value={planSort} onChange={e => setPlanSort(e.target.value as typeof planSort)} title="Ordenar el enfoque" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
                            <option value="plan">Orden manual</option>
                            <option value="prioridad">Prioridad</option>
                            <option value="entrega">Entrega</option>
                            <option value="avance">Avance</option>
                            <option value="epica">Épica</option>
                          </select>
                        )}
                        {([['todas', 'Todas'], ['alta', 'Alta'], ['vencidas', 'Vencidas'], ['avance', 'Con avance'], ['estancada', '🐌 Estancadas'], ['multidia', '⧗ Varios días'], ['arrastre', '⏳ Anteriores']] as [typeof planFilter, string][]).map(([k, label]) => {
                          const on = planFilter === k
                          return <button key={k} onClick={() => setPlanFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                        })}
                        {/* Chips de épica: filtran el enfoque del día por épica (una a la vez) */}
                        {dayEpics.length > 1 && <span style={{ width: 1, height: 16, background: 'rgba(15,35,64,0.12)' }} />}
                        {dayEpics.length > 1 && dayEpics.map(ep => {
                          const on = effDayEpica === ep.id
                          return (
                            <button key={ep.id} onClick={() => setDayEpica(on ? 'todas' : ep.id)} title={`Sólo ${ep.name}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, transition: 'background .12s, border-color .12s',
                                border: on ? `1.5px solid ${ep.color}` : '1px solid rgba(15,35,64,0.12)',
                                background: on ? hexA(ep.color, 0.12) : '#fff',
                                color: on ? ep.color : 'rgba(20,35,61,0.6)' }}>
                              <span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color, flexShrink: 0 }} />{ep.name}
                            </button>
                          )
                        })}
                        {effDayEpica !== 'todas' && <button onClick={() => setDayEpica('todas')} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11, fontWeight: 700 }}>Limpiar</button>}
                        <span style={{ flex: 1 }} />
                        {table && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>{dayTableEdit ? 'Edita las celdas · las fechas abren calendario' : 'Clic en fila = ver/editar · flechas = mover · encabezado = ordenar'}</span>}
                        {table && <button onClick={() => setDayTableEdit(v => !v)} title="Editar la tabla como hoja de cálculo" style={{ cursor: 'pointer', borderRadius: 9, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: dayTableEdit ? 'none' : '1px solid rgba(15,35,64,0.14)', ...(dayTableEdit ? { background: '#10233F', color: '#fff' } : { background: '#fff', color: 'rgba(20,35,61,0.65)' }) }}>{dayTableEdit ? '✓ Listo' : '✎ Editar tabla'}</button>}
                        {!table && !manual && planFilter === 'todas' && list.length > 1 && <button onClick={() => commitPlanOrder(list)} aria-label="Guardar este orden como el orden manual" title="Guardar este orden como el orden manual" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', font: '700 11px var(--font-ui)' }}>Fijar este orden</button>}
                      </div>
                    )}
                    {planItems.length > 0 && renderWorkFilters(viewDate)}
                    {manual && planFilter === 'todas' && filtered.length > 1 && planSel.size === 0 && (
                      <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginBottom: 4 }}>En orden de arriba hacia abajo · el 01 es por dónde empiezas · arrastra para reordenar.</div>
                    )}
                    {!table && list.length > 1 && planSel.size === 0 && (
                      <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)', marginBottom: 6 }}>Selecciona varias con la casilla ☐ (izquierda) para editarlas en lote: mover de día, prioridad, dificultad, avance, épica…</div>
                    )}

                    {/* ACCIONES EN LOTE — aparece al seleccionar filas del enfoque */}
                    {planSel.size > 0 && (() => {
                      const listKeys = visibleKeys
                      const allSel = listKeys.length > 0 && listKeys.every(k => planSel.has(k))
                      const btn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.10)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }
                      return (
                        <div className="animate-fade" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#10233F', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
                          <span style={{ font: '800 11.5px var(--font-ui)', color: '#E7C56B', whiteSpace: 'nowrap' }}>{planSel.size} {planSel.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
                          <button onClick={() => setPlanSel(allSel ? new Set() : new Set(listKeys))} style={btn}>{allSel ? 'Ninguna' : 'Todas'}</button>
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <button onClick={() => planBulkMove(addDays(viewDate, 1))} style={btn}>→ Mañana</button>
                          {viewDate !== today && <button onClick={() => planBulkMove(today)} style={btn}>Hoy</button>}
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Mover a</span>
                            <input type="date" value={planMoveDay} aria-label="Mover la selección a una fecha"
                              onChange={ev => { const v = ev.target.value; setPlanMoveDay(''); planBulkMove(v) }}
                              style={{ ...btn, cursor: 'pointer', colorScheme: 'dark' }} />
                          </label>
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Prioridad</span>
                          {(['alta', 'media', 'baja'] as Prio[]).map(p => (
                            <button key={p} onClick={() => planBulkPrio(p)} style={btn}>{prioStyle(p).label}</button>
                          ))}
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Dificultad</span>
                          {(['facil', 'media', 'dificil'] as Dif[]).map(d => (
                            <button key={d} onClick={() => planBulkDif(d)} style={btn}>{difStyle(d).label}</button>
                          ))}
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Avance</span>
                          {[0, 25, 50, 75, 100].map(p => (
                            <button key={p} onClick={() => planBulkProgress(p)} style={btn}>{p}%</button>
                          ))}
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>Épica</span>
                            <select value="" aria-label="Mover la selección a otra épica" onChange={ev => { if (ev.target.value) planBulkEpica(ev.target.value) }} style={{ ...btn, cursor: 'pointer', colorScheme: 'dark' }}>
                              <option value="">Mover a…</option>
                              {activeEpics.map(ep => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                            </select>
                          </label>
                          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.16)' }} />

                          <button onClick={planBulkDone} style={{ ...btn, border: '1px solid rgba(62,142,142,0.5)', background: 'rgba(62,142,142,0.25)' }}>✓ Terminar</button>
                          <button onClick={() => planBulkStatus(ARCHIVED)} style={btn}>🗄 Archivar</button>
                          <button onClick={planBulkRemove} style={{ ...btn, border: '1px solid rgba(176,82,46,0.5)', background: 'rgba(176,82,46,0.22)' }}>Quitar del plan</button>
                          <span style={{ flex: 1 }} />
                          <button onClick={() => setPlanSel(new Set())} aria-label="Limpiar selección" style={{ ...btn, padding: '6px 9px' }}>✕</button>
                        </div>
                      )
                    })()}
                    {table ? renderDayTable(tableRows) : (
                      <div ref={planListRef}>
                        {list.map((x, pos) => (
                          <div key={planKey(x.e.id, x.t)}>
                            {manual && draggingKey && dropIndex === pos && insLine}
                            {renderPlanRow(x, pos, !manual)}
                          </div>
                        ))}
                        {manual && draggingKey && dropIndex === list.length && insLine}
                      </div>
                    )}
                    {!table && filtered.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', padding: '6px 0' }}>Ninguna tarea del plan coincide con el filtro.</div>}
                  </>
                )
              })()}
              {dayView !== 'tabla' && planPend.length === 0 && planDone.length > 0 && (
                <div style={{ fontSize: 13, color: '#2E6E6E', fontWeight: 600, padding: '10px 6px' }}>{isToday ? 'Todo hecho por hoy ✦' : 'Todo hecho este día ✦'}</div>
              )}

              {/* TRABAJADAS — TODAS las tareas con avance/tiempo registrado este día (incl. las del plan) */}
              {(() => {
                const worked: { e: Epica; t: EpicaTask; i: number }[] = []
                activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
                  if (t.status !== ARCHIVED && (t.progressLog || []).some(x => x.d === viewDate)) worked.push({ e, t, i })
                }))
                if (worked.length === 0) return null
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ height: 7, width: 7, borderRadius: 99, background: '#A87A2C' }} />
                      <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#A87A2C' }}>{isToday ? 'Trabajadas hoy' : 'Trabajadas ese día'}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{worked.length}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>a lo que le pusiste avance o tiempo</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {worked.map(({ e, t, i }) => {
                        const done = t.status === 'Terminada'; const st = taskStyle(t.status)
                        return (
                          <div key={planKey(e.id, t)} onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                            <span style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(194,147,58,0.14)', color: '#A87A2C', fontSize: 11 }}>✎</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />
                                <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{e.name}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: st.bg, color: st.c }}>{st.label}</span>
                                {(() => { const m = (t.progressLog || []).filter(x => x.d === viewDate).reduce((s, x) => s + (typeof (x as { min?: number }).min === 'number' ? (x as { min?: number }).min! : 0), 0); if (m <= 0) return null; const hh = Math.floor(m / 60), mm = m % 60; return <span title="Tiempo puesto este día" style={{ fontSize: 10, fontWeight: 800, color: '#2E6E6E', background: 'rgba(62,142,142,0.12)', border: '1px solid rgba(62,142,142,0.3)', borderRadius: 99, padding: '1px 7px' }}>⏱ {hh ? hh + 'h ' : ''}{mm}m</span> })()}
                                {t.plan && <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>· para {relShort(t.plan)}</span>}
                              </div>
                            </div>
                            {typeof t.progress === 'number' && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* SUBTAREAS COMPLETADAS este día (con su hora) — de cualquier tarea/épica */}
              {(() => {
                const rows: { e: Epica; t: EpicaTask; sub: string; at: number }[] = []
                activeEpics.forEach(e => (e.tasks || []).forEach(t => { if (t.status === ARCHIVED) return; (t.subtasks || []).forEach(s => {
                  if (!s.done || !s.doneAt) return
                  const d = new Date(s.doneAt); const ld = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                  if (ld === viewDate) rows.push({ e, t, sub: s.t, at: d.getHours() * 60 + d.getMinutes() })
                }) }))
                if (!rows.length) return null
                rows.sort((a, b) => a.at - b.at)
                const clk = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ height: 7, width: 7, borderRadius: 99, background: '#2E6E6E' }} />
                      <span style={{ font: '800 10.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#2E6E6E' }}>{isToday ? 'Subtareas completadas hoy' : 'Subtareas completadas ese día'}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{rows.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {rows.map(({ e, t, sub, at }, ri) => (
                        <div key={ri} onClick={() => setTaskView({ eId: e.id, tid: t.id! })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
                          <span style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(62,142,142,0.14)', color: '#2E6E6E', fontSize: 11 }}>✓</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub || 'subtarea'}</div>
                            <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: e.color, marginRight: 5 }} />subtarea de {t.t} · {e.name}</div>
                          </div>
                          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)', fontVariantNumeric: 'tabular-nums' }}>{clk(at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {dayView !== 'tabla' && planDone.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => setDoneOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.08)', background: '#fff', borderRadius: 10, padding: '9px 12px', font: '800 10.5px var(--font-ui)', letterSpacing: '.06em', color: '#2E6E6E', textTransform: 'uppercase' }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: '#2E6E6E' }} />
                    {isToday ? 'Hechas hoy' : 'Hechas este día'} <span style={{ color: 'rgba(20,35,61,0.55)' }}>{planDone.length}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: doneOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                  </button>
                  {doneOpen && <div style={{ marginTop: 4 }}>{planDone.map(renderDoneRow)}</div>}
                </div>
              )}
            </>
          )}
          </>)}
        </div>
      </div>
    )
  }

  const renderPicker = () => {
    const q = norm(pickerQ)
    const pool: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => { if (t.status !== 'Terminada') pool.push({ e, t, i }) }))
    const match = (x: { e: Epica; t: EpicaTask }) => {
      if (pickerEpica !== 'todas' && x.e.id !== pickerEpica) return false
      if (!q) return true
      return norm(x.t.t).includes(q) || norm(x.e.name).includes(q)
    }
    const filtered = pool.filter(match)
    const inPlan = (x: { t: EpicaTask }) => x.t.plan === viewDate
    const parV = filtered.filter(x => !inPlan(x)).filter(x => x.t.due && (isToday ? (daysUntil(x.t.due) ?? 1e9) <= 7 : x.t.due <= viewDate)).sort((a, b) => (a.t.due || '').localeCompare(b.t.due || ''))
    const groups = new Map<string, { e: Epica; items: typeof pool }>()
    filtered.forEach(x => { if (!groups.has(x.e.id)) groups.set(x.e.id, { e: x.e, items: [] }); groups.get(x.e.id)!.items.push(x) })
    const row = (x: { e: Epica; t: EpicaTask; i: number }) => {
      const on = inPlan(x); const dt = dueTone(x.t.due, false)
      const otherDay = !!x.t.plan && x.t.plan !== viewDate
      return (
        <button key={planKey(x.e.id, x.t)} onClick={ev => { if (ev.detail > 1) return; on ? removeFromPlan(x.e, x.i, false) : planTaskToDay(x.e, x.i, viewDate) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '10px 11px', borderRadius: 10, cursor: 'pointer', border: on ? '1px solid rgba(194,147,58,0.35)' : '1px solid transparent', background: on ? 'rgba(194,147,58,0.08)' : 'transparent', borderLeft: on ? '2px solid #C2933A' : '2px solid transparent' }}>
          <span style={{ flexShrink: 0, height: 20, width: 20, borderRadius: 99, border: on ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: on ? '#C2933A' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.t.t}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: x.e.color }} />
              <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{x.e.name}</span>
              {x.t.due && <span style={{ padding: '1px 6px', borderRadius: 99, font: '700 9.5px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}` }}>{fmtDue(x.t.due)}</span>}
              {otherDay && <span title={`Planeada para ${dateLabel(x.t.plan!)}`} style={{ padding: '1px 7px', borderRadius: 99, font: '700 10px var(--font-ui)', color: '#5A6B82', background: 'rgba(90,107,130,0.10)', border: '1px solid rgba(90,107,130,0.22)' }}>{relShort(x.t.plan!)}</span>}
            </span>
          </span>
        </button>
      )
    }
    return (
      <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 75, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
        <div role="dialog" aria-modal="true" aria-label="Buscar tarea" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
          <div style={{ height: 4, background: 'linear-gradient(90deg,#E7C56B,#C2933A)' }} />
          <div style={{ padding: '18px 22px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>Agregar al plan</div>
                <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>{isToday ? `Hoy · ${fmtDue(today)}` : dateLabel(viewDate)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A87A2C', whiteSpace: 'nowrap' }}>{planTotal} en el plan</span>
                <button aria-label="Cerrar buscador" onClick={() => setPickerOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
              </div>
            </div>
            <input autoFocus value={pickerQ} onChange={e => setPickerQ(e.target.value)} placeholder="Buscar tarea o épica…" style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, border: '1px solid rgba(15,35,64,0.15)', borderRadius: 10, padding: '10px 12px', fontSize: 16, color: '#14233D', background: '#fff', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, marginTop: 10 }}>
              <button onClick={() => setPickerEpica('todas')} style={{ flexShrink: 0, cursor: 'pointer', borderRadius: 99, padding: '6px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: pickerEpica === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: pickerEpica === 'todas' ? '#10233F' : '#fff', color: pickerEpica === 'todas' ? '#fff' : 'rgba(20,35,61,0.6)' }}>Todas</button>
              {activeEpics.map(e => {
                const on = pickerEpica === e.id
                return <button key={e.id} onClick={() => setPickerEpica(e.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 99, padding: '6px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</button>
              })}
            </div>
          </div>
          <div className="ep-modal-body" style={{ padding: '4px 14px 8px', maxHeight: '56vh', overflow: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '26px 10px', textAlign: 'center', fontSize: 13, color: 'rgba(20,35,61,0.5)' }}>{pickerQ ? <>Nada coincide con «{pickerQ}»</> : 'No hay tareas activas'}</div>}
            {!pickerQ && parV.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#B0522E', padding: '8px 11px 4px' }}>{isToday ? 'Para hoy · urgentes' : 'Vencen para esta fecha'}</div>
                {parV.slice(0, 6).map(row)}
                <div style={{ height: 1, background: 'rgba(15,35,64,0.07)', margin: '8px 8px 2px' }} />
              </div>
            )}
            {Array.from(groups.values()).map(g => (
              <div key={g.e.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px 4px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: g.e.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>{g.e.name}</span>
                  <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>{g.items.length}</span>
                </div>
                {g.items.map(row)}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid rgba(15,35,64,0.08)' }}>
            <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>{planTotal} en el plan</span>
            <button onClick={() => setPickerOpen(false)} style={{ ...goldBtn, padding: '10px 20px' }}>Listo</button>
          </div>
        </div>
      </div>
    )
  }

  /** Tablero tipo Trello: una columna por estado, tarjetas arrastrables entre ellas.
   *  Comparte los filtros y la búsqueda del backlog; el filtro de estado se ignora
   *  aquí porque las columnas SON los estados. */
  const renderBoard = (rows: { e: Epica; t: EpicaTask; i: number }[]) => {
    const DONE_CAP = 12
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 17px 18px', alignItems: 'flex-start' }}>
        {TASK_STATUSES.map(status => {
          const ts = taskStyle(status)
          const all = rows.filter(x => x.t.status === status)
          const isDone = status === 'Terminada'
          // Las terminadas se acumulan sin fin: se muestran las más recientes.
          const sorted = isDone
            ? [...all].sort((a, b) => (b.t.doneAt || '').localeCompare(a.t.doneAt || ''))
            : [...all].sort((a, b) =>
                (PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']) ||
                ((a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')))
          const shown = isDone ? sorted.slice(0, DONE_CAP) : sorted
          const over = boardOverCol === status && !!boardDrag

          return (
            <div key={status} data-col={status}
              style={{ flex: '1 1 250px', minWidth: 250, maxWidth: 420, borderRadius: 15, background: over ? 'rgba(194,147,58,0.07)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : '1px solid rgba(15,35,64,0.08)', overflow: 'hidden', transition: 'background .15s, border-color .15s' }}>
              <div style={{ height: 3, background: ts.c }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px 9px' }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: ts.c }}>{ts.label}</span>
                <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: 'rgba(20,35,61,0.5)' }}>{all.length}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => { const target = defaultEpicId(); if (target) openTaskEdit(target, null, { status }) }}
                  aria-label={`Nueva tarea en ${ts.label}`} title={`Nueva tarea en ${ts.label}`}
                  style={{ height: 24, width: 24, borderRadius: 7, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 9px 11px', minHeight: 76 }}>
                {shown.length === 0 && (
                  <div style={{ borderRadius: 11, border: '1px dashed rgba(15,35,64,0.14)', padding: '18px 10px', textAlign: 'center', fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>
                    {over ? 'Suelta aquí' : 'Sin tareas'}
                  </div>
                )}
                {shown.map(x => {
                  const { e, t, i } = x
                  const k = e.id + ':' + i
                  const dragging = boardDrag === k
                  const dt = dueTone(t.due, t.status === 'Terminada')
                  const ps = prioStyle(t.priority)
                  const subs = t.subtasks || []
                  return (
                    <div key={k}
                      onPointerDown={ev => onCardDown(ev, k)} onPointerMove={onCardMove}
                      onPointerUp={ev => onCardUp(ev, x)} onPointerCancel={onCardCancel}
                      title={`${t.t} — arrastra para cambiar de estado`}
                      style={{ position: 'relative', background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${ps.accent}`, borderRadius: 11, padding: '10px 11px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 18px 30px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: boardDrag && !dragging ? 0.55 : 1, transform: dragging ? 'rotate(-1.2deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', lineHeight: 1.3 }}>{t.t}</div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}
                        </span>
                        {t.due && <span style={{ font: '700 10px var(--font-ui)', color: dt.c, background: dt.bg, border: `1px solid ${dt.border}`, borderRadius: 99, padding: '1px 7px' }}>{fmtDue(t.due)}</span>}
                        {t.plan && <span title={`Planeada para ${fmtDue(t.plan)}`} style={{ font: '700 10px var(--font-ui)', color: '#2E5A9E', background: 'rgba(46,90,158,0.08)', border: '1px solid rgba(46,90,158,0.28)', borderRadius: 99, padding: '1px 7px' }}>◷ {fmtDue(t.plan)}</span>}
                        {t.repeat && <span title={`Se repite ${repeatLabel(t.repeat)}`} style={{ font: '700 10px var(--font-ui)', color: REPEAT_TONE.c, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 99, padding: '1px 7px' }}>↻ {repeatLabel(t.repeat)}</span>}
                        <button onClick={ev => { ev.stopPropagation(); cycleDifficulty(e, i) }} onPointerDown={ev => ev.stopPropagation()}
                          title={t.difficulty ? `Dificultad: ${difStyle(t.difficulty).label} · clic para cambiar` : 'Poner dificultad'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', font: '700 10px var(--font-ui)', color: t.difficulty ? difStyle(t.difficulty).c : 'rgba(20,35,61,0.4)', background: t.difficulty ? difStyle(t.difficulty).bg : 'transparent', border: t.difficulty ? `1px solid ${difStyle(t.difficulty).border}` : '1px solid transparent', borderRadius: 99, padding: '1px 7px' }}><DifDots d={t.difficulty} size={9} />{t.difficulty && difStyle(t.difficulty).label}</button>
                        {subs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: subs.every(s => s.done) ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>☑ {subs.filter(s => s.done).length}/{subs.length}</span>}
                      </div>

                      {typeof t.progress === 'number' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                          <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} />
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                {isDone && all.length > DONE_CAP && (
                  <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', padding: '2px 4px' }}>+ {all.length - DONE_CAP} más terminadas · véelas en la tabla</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderBacklog = () => {
    const bq = norm(backlogQ.trim())
    const isBoard = backlogView === 'tablero'
    const rows: { e: Epica; t: EpicaTask; i: number }[] = []
    activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
      // Las archivadas sólo salen si se filtra explícitamente por ese estado
      // (nunca en el tablero, que es de trabajo activo).
      if (t.status === ARCHIVED && (isBoard || backlogFStatus !== ARCHIVED)) return
      // En el tablero las terminadas son una columna, así que siempre entran;
      // y el filtro de estado se ignora porque las columnas SON los estados.
      if (!backlogDone && !isBoard && t.status === 'Terminada') return
      if (backlogFEpica !== 'todas' && e.id !== backlogFEpica) return
      if (!isBoard && backlogFStatus !== 'todas' && t.status !== backlogFStatus) return
      if (backlogFPrio !== 'todas' && (t.priority || '') !== backlogFPrio) return
      if (bq && !(norm(t.t).includes(bq) || norm(e.name).includes(bq)
        || norm(t.note || '').includes(bq)
        || (t.subtasks || []).some(s => norm(s.t).includes(bq)))) return
      if (!passWork(t, today)) return   // filtro por estado de trabajo de hoy
      rows.push({ e, t, i })
    }))
    const dirMul = backlogSort.dir === 'asc' ? 1 : -1
    const cmp = (a: typeof rows[number], b: typeof rows[number]) => {
      const k = backlogSort.key; let r = 0
      if (k === 't') r = a.t.t.localeCompare(b.t.t, 'es')
      else if (k === 'epica') r = a.e.name.localeCompare(b.e.name, 'es')
      else if (k === 'status') r = TASK_STATUSES.indexOf(a.t.status) - TASK_STATUSES.indexOf(b.t.status)
      else if (k === 'priority') r = PRIO_RANK[a.t.priority || 'media'] - PRIO_RANK[b.t.priority || 'media']
      else if (k === 'progress') r = (a.t.progress || 0) - (b.t.progress || 0)
      else if (k === 'plan') r = (a.t.plan || '9999-99').localeCompare(b.t.plan || '9999-99')
      else r = (a.t.due || '9999-99').localeCompare(b.t.due || '9999-99')
      return r * dirMul || a.t.t.localeCompare(b.t.t, 'es')
    }
    const sorted = [...rows].sort(cmp)
    const setSort = (key: string) => setBacklogSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    const th = (key: string, label: string) => (
      <th onClick={() => setSort(key)} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: backlogSort.key === key ? '#A87A2C' : 'rgba(15,35,64,0.5)', whiteSpace: 'nowrap', userSelect: 'none' }}>{label}{backlogSort.key === key ? (backlogSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
    )
    const keyOf = (x: { e: Epica; t: EpicaTask }) => planKey(x.e.id, x.t)
    const allKeys = sorted.map(keyOf)
    const allSel = allKeys.length > 0 && allKeys.every(k => backlogSel.has(k))
    const someSel = backlogSel.size > 0
    const toggleAll = () => setBacklogSel(() => allSel ? new Set() : new Set(allKeys))
    const toggleOne = (k: string) => setBacklogSel(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

    // Edición masiva: agrupa la selección por épica y aplica en un patch por épica
    const bulkGroup = () => {
      const m = new Map<string, number[]>()
      backlogSel.forEach(key => { const f = keyToTask(key); if (!f) return; if (!m.has(f.e.id)) m.set(f.e.id, []); m.get(f.e.id)!.push(f.i) })
      return m
    }
    const bulkField = (mutate: (t: EpicaTask) => void, msg: string) => {
      const count = backlogSel.size
      const g = bulkGroup(); const snaps = snapshot([...g.keys()])
      g.forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.forEach(i => { if (tasks[i]) mutate(tasks[i]) })
        patchEpic(eId, { tasks })
      })
      undoToast(`${count} ${msg}`, snaps); setBacklogSel(new Set())
    }
    const bulkStatus = (v: string) => bulkField(t => { if (v === 'Terminada') { applyComplete(t); return } t.status = v; delete t.doneAt; delete t.planPrev }, `→ ${v}`)
    const bulkPrio = (v: Prio) => bulkField(t => { t.priority = v }, `· prioridad ${v}`)
    const bulkDue = (v: string) => bulkField(t => { t.due = v }, '· entrega')
    const bulkPlan = (v: string) => {
      const count = backlogSel.size
      let base = v ? maxPlanOrderFor(v) : 0
      const g = bulkGroup(); const snaps = snapshot([...g.keys()])
      g.forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.forEach(i => { const t = tasks[i]; if (!t) return; if (v) { base += 1000; t.plan = v; if (!t.priority) t.priority = prioFromDue(t.due); t.planOrder = base } else { delete t.plan; delete t.planOrder }; applyPlanStatus(t, v) })
        patchEpic(eId, { tasks })
      })
      undoToast(`${count} · ${v ? 'planeadas' : 'sin planear'}`, snaps); setBacklogSel(new Set())
    }
    const bulkDelete = () => {
      const count = backlogSel.size
      if (!window.confirm(`¿Eliminar ${count} ${count === 1 ? 'tarea' : 'tareas'}?`)) return
      const g = bulkGroup(); const snaps = snapshot([...g.keys()])
      g.forEach((idxs, eId) => {
        const ep = epicsRef.current.find(e => e.id === eId); if (!ep) return
        const tasks = clone(ep.tasks)
        idxs.sort((a, b) => b - a).forEach(i => { if (tasks[i]) tasks.splice(i, 1) })
        patchEpic(eId, { tasks })
      })
      undoToast(`${count} tareas eliminadas`, snaps); setBacklogSel(new Set())
    }
    const bulkSelStyle: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.10)', color: '#fff', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, fontWeight: 600, outline: 'none' }
    const filterSel: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '5px 8px', fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.65)', background: '#fff', outline: 'none' }
    const editInp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.16)', borderRadius: 7, padding: '5px 7px', fontSize: 12, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }

    // Vista SEMANA del backlog: calendario L-D arrastrable con las tareas ya filtradas.
    const renderBacklogWeek = () => {
      const monday = backlogWeek || mondayISO(today)
      const sunday = addDays(monday, 6)
      const days = Array.from({ length: 7 }, (_, di) => addDays(monday, di))
      const hasToday = today >= monday && today <= sunday
      const unsch = sorted.filter(x => !x.t.plan && x.t.status !== 'Terminada')
      const byDay = new Map<string, typeof sorted>()
      days.forEach(d => byDay.set(d, []))
      sorted.forEach(x => { const p = x.t.plan; if (p && byDay.has(p)) byDay.get(p)!.push(x) })
      const navBtn: CSSProperties = { height: 30, width: 30, borderRadius: 9, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 15 }
      const newForDay = (d: string) => { const target = backlogFEpica !== 'todas' ? backlogFEpica : defaultEpicId(); if (!target) { showToast('Crea una épica primero', true); return } openTaskEdit(target, null, { plan: d }) }
      const card = (x: typeof sorted[number]) => {
        const { e, t } = x; const k = planKey(e.id, t); const dragging = weekDrag === k; const tdone = t.status === 'Terminada'; const ps = prioStyle(t.priority); const dt = dueTone(t.due, tdone)
        return (
          <div key={k} onPointerDown={ev => onWeekDown(ev, k)} onPointerMove={onWeekMove} onPointerUp={() => onWeekUp(x)} onPointerCancel={onWeekCancel}
            title={`${t.t} — arrastra a otro día`}
            style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.09)', borderLeft: `3px solid ${tdone ? '#2E6E6E' : ps.accent}`, borderRadius: 9, padding: '7px 9px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', boxShadow: dragging ? '0 16px 26px -16px rgba(15,35,64,0.5)' : '0 1px 2px rgba(15,35,64,0.04)', opacity: weekDrag && !dragging ? 0.5 : 1, transform: dragging ? 'rotate(-1.5deg)' : 'none', transition: 'opacity .15s, box-shadow .15s' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: tdone ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: tdone ? 'line-through' : 'none', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.t}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
              {t.due && <span style={{ font: '700 9.5px var(--font-ui)', color: dt.c }}>{fmtDue(t.due)}</span>}
              {t.difficulty && <DifDots d={t.difficulty} size={9} />}
            </div>
          </div>
        )
      }
      return (
        <div style={{ padding: '4px 12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setBacklogWeek(addDays(monday, -7))} aria-label="Semana anterior" style={navBtn}>‹</button>
            <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 15, color: hasToday ? '#A87A2C' : '#10233F' }}>{weekRangeLabel(monday)}</span>
            <button onClick={() => setBacklogWeek(addDays(monday, 7))} aria-label="Semana siguiente" style={navBtn}>›</button>
            {!hasToday && <button onClick={() => setBacklogWeek('')} style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '6px 11px', font: '700 12px var(--font-ui)', cursor: 'pointer' }}>Esta semana</button>}
            <span style={{ flex: 1 }} />
            <span className="ep-hide-sm" style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)' }}>Arrastra entre días · desde “Sin fecha” para agendar</span>
          </div>
          {unsch.length > 0 && (
            <div style={{ marginBottom: 10, border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12, background: '#FBFAF6', padding: '8px 11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <span style={{ height: 6, width: 6, borderRadius: 99, background: '#5B6B86' }} />
                <span style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Sin fecha</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(20,35,61,0.45)' }}>{unsch.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {unsch.map(x => <div key={planKey(x.e.id, x.t)} style={{ flexShrink: 0, width: 178 }}>{card(x)}</div>)}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
            {days.map(d => {
              const list = byDay.get(d)!; const wd = (new Date(d + 'T00:00:00').getDay() + 6) % 7; const isTd = d === today; const over = weekOverDay === d && !!weekDrag
              return (
                <div key={d} data-weekday={d} style={{ flex: '1 1 150px', minWidth: 150, maxWidth: 320, boxSizing: 'border-box', borderRadius: 14, background: over ? 'rgba(194,147,58,0.08)' : isTd ? 'rgba(194,147,58,0.05)' : '#FBFAF6', border: over ? '1.5px dashed #C2933A' : isTd ? '1.5px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.08)', overflow: 'hidden', transition: 'background .15s, border-color .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 10px', borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: isTd ? '#A87A2C' : 'rgba(20,35,61,0.55)' }}>{DAYNAMES[wd].slice(0, 3)}</span>
                    <span className="serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: isTd ? '#A87A2C' : '#10233F', fontVariantNumeric: 'tabular-nums' }}>{dayNum(d)}</span>
                    {list.length > 0 && <span style={{ height: 15, padding: '0 6px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', font: '700 9.5px/1 var(--font-ui)', background: 'rgba(194,147,58,0.14)', color: '#A87A2C' }}>{list.length}</span>}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => newForDay(d)} title="Nueva tarea este día" style={{ height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 8, minHeight: 64 }}>
                    {list.length === 0 && <button onClick={() => newForDay(d)} style={{ borderRadius: 10, border: '1px dashed rgba(15,35,64,0.14)', background: 'transparent', padding: '14px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: over ? '#A87A2C' : 'rgba(20,35,61,0.4)', cursor: 'pointer' }}>{over ? 'Soltar aquí' : '+ Agregar'}</button>}
                    {list.map(card)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div id="backlog" className="glass" style={{ borderRadius: 16, overflow: 'hidden', marginTop: 34, scrollMarginTop: 16 }}>
        {/* El interruptor de vista es interactivo, así que no puede ir DENTRO del
            botón que pliega: el encabezado es un contenedor con dos controles. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 17px' }}>
          <button onClick={() => setBacklogOpen(v => !v)} aria-expanded={backlogOpen} aria-controls="backlog-body"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}>
            <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: '#B58B35' }}>{rows.length}</span>
            <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Backlog · todas las tareas</span>
          </button>
          {backlogOpen && (
            <div role="group" aria-label="Vista del backlog" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
              {([['tabla', 'Tabla'], ['tablero', 'Tablero'], ['tarjetas', 'Tarjetas'], ['calendario', 'Calendario'], ['semana', 'Semana'], ['detalle', 'Detalle']] as const).map(([v, label]) => {
                const on = backlogView === v
                return (
                  <button key={v} aria-pressed={on} onClick={() => setBacklogView(v)}
                    style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '5px 12px', font: '700 11px var(--font-ui)', background: on ? '#10233F' : 'transparent', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.55)', transition: 'background .15s' }}>{label}</button>
                )
              })}
            </div>
          )}
          <button onClick={() => setBacklogOpen(v => !v)} aria-label={backlogOpen ? 'Plegar backlog' : 'Desplegar backlog'}
            style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 4, fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: backlogOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</button>
        </div>
        {backlogOpen && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 17px 10px', flexWrap: 'wrap' }}>
              <input value={backlogQ} onChange={e => setBacklogQ(e.target.value)} aria-label="Buscar en el backlog"
                placeholder="Buscar tarea, épica, nota…"
                style={{ ...filterSel, cursor: 'text', minWidth: 190, flex: '1 1 190px', fontWeight: 500 }} />
              {backlogQ && (
                <button onClick={() => setBacklogQ('')} aria-label="Limpiar búsqueda"
                  style={{ ...filterSel, cursor: 'pointer', padding: '5px 9px' }}>✕</button>
              )}
              {/* El filtro por épica ahora son chips (fila de abajo) */}
              {/* En el tablero las columnas son los estados: el filtro sobraría */}
              {!isBoard && (
                <select value={backlogFStatus} onChange={e => setBacklogFStatus(e.target.value)} title="Filtrar por estado" style={filterSel}>
                  <option value="todas">Todo estado</option>
                  {PICK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <select value={backlogFPrio} onChange={e => setBacklogFPrio(e.target.value)} title="Filtrar por prioridad" style={filterSel}>
                <option value="todas">Toda prioridad</option>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }}>
                <input type="checkbox" checked={backlogDone} onChange={e => setBacklogDone(e.target.checked)} /> Terminadas
              </label>
              {(backlogFEpica !== 'todas' || backlogFStatus !== 'todas' || backlogFPrio !== 'todas') && (
                <button onClick={() => { setBacklogFEpica('todas'); setBacklogFStatus('todas'); setBacklogFPrio('todas') }} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11.5, fontWeight: 700 }}>Limpiar filtros</button>
              )}
              {/* La edición tipo hoja de cálculo sólo aplica a la tabla */}
              {!isBoard && (
                <button onClick={() => setBacklogEdit(v => !v)} aria-label="Editar la tabla como hoja de cálculo" title="Editar la tabla como hoja de cálculo" style={{ cursor: 'pointer', borderRadius: 9, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, border: backlogEdit ? 'none' : '1px solid rgba(15,35,64,0.14)', ...(backlogEdit ? { background: '#10233F', color: '#fff' } : { background: '#fff', color: 'rgba(20,35,61,0.65)' }) }}>{backlogEdit ? '✓ Listo' : '✎ Editar tabla'}</button>
              )}
              <span style={{ flex: 1 }} />
              <span className="ep-hide-sm" style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>{isBoard ? 'Arrastra una tarjeta a otra columna para cambiar su estado · clic para abrirla' : backlogEdit ? 'Edita cualquier celda · las fechas abren calendario' : 'Clic en encabezado = ordenar · en fila = ver/editar · casilla = seleccionar'}</span>
              {/* Crear tarea desde el backlog: usa la épica del filtro si hay una */}
              <button onClick={() => { const target = defaultEpicId(); if (target) openTaskEdit(target, null); else showToast('Crea una épica primero', true) }}
                title={backlogFEpica !== 'todas' ? `Nueva tarea en ${activeEpics.find(e => e.id === backlogFEpica)?.name || 'esta épica'}` : 'Nueva tarea'}
                style={{ ...goldBtn, padding: '7px 13px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>+ Nueva tarea</button>
            </div>

            {/* Chips de épica: filtran el backlog por épica (una a la vez) */}
            {activeEpics.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 17px 10px', flexWrap: 'wrap' }}>
                <button onClick={() => setBacklogFEpica('todas')} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, border: backlogFEpica === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: backlogFEpica === 'todas' ? '#10233F' : '#fff', color: backlogFEpica === 'todas' ? '#fff' : 'rgba(20,35,61,0.55)' }}>Todas</button>
                {activeEpics.map(ep => {
                  const on = backlogFEpica === ep.id
                  return (
                    <button key={ep.id} onClick={() => setBacklogFEpica(on ? 'todas' : ep.id)} title={`Sólo ${ep.name}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, transition: 'background .12s, border-color .12s',
                        border: on ? `1.5px solid ${ep.color}` : '1px solid rgba(15,35,64,0.12)',
                        background: on ? hexA(ep.color, 0.12) : '#fff',
                        color: on ? ep.color : 'rgba(20,35,61,0.6)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color, flexShrink: 0 }} />{ep.name}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Filtros por estado de trabajo de hoy — también en el backlog */}
            <div style={{ padding: '0 17px 6px' }}>{renderWorkFilters(today)}</div>

            {someSel && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 12px 10px', padding: '9px 12px', borderRadius: 12, background: '#16365F', color: '#fff' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{backlogSel.size} seleccionada{backlogSel.size === 1 ? '' : 's'}</span>
                <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }} />
                <select value="" onChange={e => e.target.value && bulkStatus(e.target.value)} style={bulkSelStyle}>
                  <option value="" disabled>Estado…</option>
                  {PICK_STATUSES.map(s => <option key={s} value={s} style={{ color: '#14233D' }}>{s}</option>)}
                </select>
                <select value="" onChange={e => e.target.value && bulkPrio(e.target.value as Prio)} style={bulkSelStyle}>
                  <option value="" disabled>Prioridad…</option>
                  <option value="alta" style={{ color: '#14233D' }}>Alta</option><option value="media" style={{ color: '#14233D' }}>Media</option><option value="baja" style={{ color: '#14233D' }}>Baja</option>
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>Hacer <input type="date" value="" onChange={e => bulkPlan(e.target.value)} style={{ ...bulkSelStyle, colorScheme: 'dark' }} /></label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>Vence <input type="date" value="" onChange={e => e.target.value && bulkDue(e.target.value)} style={{ ...bulkSelStyle, colorScheme: 'dark' }} /></label>
                <button onClick={() => bulkPlan('')} style={{ ...bulkSelStyle }}>Quitar plan</button>
                <button onClick={bulkDelete} style={{ cursor: 'pointer', border: '1px solid rgba(255,150,120,0.4)', background: 'rgba(255,120,90,0.18)', color: '#FFD9CC', borderRadius: 8, padding: '6px 11px', fontSize: 11.5, fontWeight: 700 }}>Eliminar</button>
                <span style={{ flex: 1 }} />
                <button onClick={() => setBacklogSel(new Set())} style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: 700 }}>Limpiar</button>
              </div>
            )}

            {isBoard ? renderBoard(rows) : backlogView === 'detalle' ? renderMasterDetail(sorted) : backlogView === 'calendario' ? renderCalendarPanel(sorted) : backlogView === 'semana' ? renderBacklogWeek() : backlogView === 'tarjetas' ? (
            <div style={{ padding: '4px 12px 12px' }}>
              {sorted.length === 0
                ? <div style={{ padding: '26px 10px', textAlign: 'center', fontSize: 13, color: 'rgba(20,35,61,0.5)' }}>Nada coincide con los filtros.</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(238px,1fr))', gap: 12 }}>
                    {sorted.map(({ e, t }) => {
                      const ts = taskStyle(t.status); const dt = dueTone(t.due, t.status === 'Terminada'); const ps = prioStyle(t.priority)
                      const k = keyOf({ e, t }); const sel = backlogSel.has(k); const done = t.status === 'Terminada'
                      return (
                        <div key={k} onClick={ev => { if ((ev.target as HTMLElement).closest('input,button,a')) return; setTaskView({ eId: e.id, tid: t.id! }) }}
                          className="glass glass-hover" style={{ position: 'relative', borderRadius: 14, padding: '13px 14px', cursor: 'pointer', borderLeft: `3px solid ${done ? '#2E6E6E' : ps.accent}`, background: sel ? 'rgba(194,147,58,0.06)' : undefined }}>
                          <input type="checkbox" checked={sel} onClick={ev => ev.stopPropagation()} onChange={() => toggleOne(k)} title="Seleccionar" style={{ position: 'absolute', top: 12, right: 12, cursor: 'pointer' }} />
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'rgba(20,35,61,0.55)', marginBottom: 6 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}</div>
                          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', marginBottom: 9, paddingRight: 20 }}>{t.t}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ font: '700 10px var(--font-ui)', color: ts.c, background: ts.bg, borderRadius: 99, padding: '2px 8px' }}>{ts.label}</span>
                            {t.priority && <span title={`Prioridad ${prioStyle(t.priority).label}`}><PrioBars p={t.priority} size={11} /></span>}
                            {t.difficulty && <span title={`Dificultad ${difStyle(t.difficulty).label}`}><DifDots d={t.difficulty} size={9} /></span>}
                            {t.plan && <span style={{ font: '700 9.5px var(--font-ui)', color: '#2E5A9E' }}>📅 {fmtDue(t.plan)}</span>}
                            {t.due && <span style={{ font: '700 9.5px var(--font-ui)', color: dt.c }}>vence {fmtDue(t.due)}</span>}
                            {(t.subtasks?.length ?? 0) > 0 && <span style={{ font: '700 9.5px var(--font-ui)', color: 'rgba(20,35,61,0.5)' }}>☑ {t.subtasks!.filter(s => s.done).length}/{t.subtasks!.length}</span>}
                          </div>
                          {typeof t.progress === 'number' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
                              <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.42)', marginTop: 11 }}>Clic en una tarjeta para abrir y editar todos sus campos.</div>
            </div>
            ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ borderTop: '1px solid rgba(15,35,64,0.08)', borderBottom: '1px solid rgba(15,35,64,0.08)', background: 'rgba(15,35,64,0.02)' }}>
                    <th style={{ width: 34, padding: '8px 0 8px 12px' }}><input type="checkbox" checked={allSel} onChange={toggleAll} title="Seleccionar todo" style={{ cursor: 'pointer' }} /></th>
                    {th('t', 'Tarea')}{th('epica', 'Épica')}{th('status', 'Estado')}{th('priority', 'Prioridad')}{th('progress', 'Avance')}{th('plan', 'Hacer')}{th('due', 'Vence')}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ e, t, i }) => {
                    const ts = taskStyle(t.status); const dt = dueTone(t.due, t.status === 'Terminada'); const ps = prioStyle(t.priority)
                    const k = keyOf({ e, t }); const sel = backlogSel.has(k)
                    return (
                      <tr key={k} {...(backlogEdit ? {} : clickable(() => setTaskView({ eId: e.id, tid: t.id! }), `Ver tarea: ${t.t}`, true))} className="backlog-row" style={{ cursor: backlogEdit ? 'default' : 'pointer', borderBottom: '1px solid rgba(15,35,64,0.05)', background: sel ? 'rgba(194,147,58,0.10)' : undefined }}>
                        <td onClick={ev => ev.stopPropagation()} style={{ padding: '9px 0 9px 12px' }}><input type="checkbox" checked={sel} onChange={() => toggleOne(k)} style={{ cursor: 'pointer' }} /></td>
                        {backlogEdit ? (<>
                          <td style={{ padding: '6px 8px', minWidth: 200 }}>{(() => { const act = editCell?.key === k && editCell.field === 'title'; return <input value={act ? editCell!.val : t.t} onFocus={() => setEditCell({ key: k, field: 'title', val: t.t })} onChange={ev => setEditCell({ key: k, field: 'title', val: ev.target.value })} onBlur={() => { if (act) setTaskTitle(e, i, editCell!.val); setEditCell(null) }} style={editInp} /> })()}</td>
                          <td style={{ padding: '6px 8px' }}><select value={e.id} onChange={ev => moveTaskToEpica(e, i, ev.target.value)} title="Mover a otra épica" style={{ ...editInp, cursor: 'pointer' }}>{activeEpics.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                          <td style={{ padding: '6px 8px' }}><select value={t.status} onChange={ev => setTaskStatus(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }}>{PICK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                          <td style={{ padding: '6px 8px' }}><select value={t.priority || ''} onChange={ev => setPriorityVal(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }}><option value="">—</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></td>
                          <td style={{ padding: '6px 8px' }}>{(() => { const act = editCell?.key === k && editCell.field === 'progress'; return <input type="number" min={0} max={100} step={5} value={act ? editCell!.val : String(t.progress ?? 0)} onFocus={() => setEditCell({ key: k, field: 'progress', val: String(t.progress ?? 0) })} onChange={ev => setEditCell({ key: k, field: 'progress', val: ev.target.value })} onBlur={() => { if (act) setTaskProgress(e, i, Math.max(0, Math.min(100, Number(editCell!.val) || 0))); setEditCell(null) }} style={{ ...editInp, width: 66 }} /> })()}</td>
                          <td style={{ padding: '6px 8px' }}><input type="date" value={t.plan || ''} onChange={ev => setTaskPlan(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }} /></td>
                          <td style={{ padding: '6px 8px' }}><input type="date" value={t.due} onChange={ev => setTaskDue(e, i, ev.target.value)} style={{ ...editInp, cursor: 'pointer' }} /></td>
                        </>) : (<>
                          <td style={{ padding: '9px 10px', fontSize: 12.5, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.4)' : '#16365F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</td>
                          <td style={{ padding: '9px 10px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.7)', whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: e.color }} />{e.name}</span></td>
                          <td style={{ padding: '9px 10px' }}><span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: ts.bg, color: ts.c, whiteSpace: 'nowrap' }}>{ts.label}</span></td>
                          <td style={{ padding: '9px 10px' }}>{t.priority ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PrioBars p={t.priority} size={12} /><span style={{ fontSize: 11, fontWeight: 600, color: ps.c }}>{ps.label}</span></span> : <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>—</span>}</td>
                          <td style={{ padding: '9px 10px' }}>{typeof t.progress === 'number' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 44, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden', display: 'inline-block' }}><span style={{ display: 'block', width: `${t.progress}%`, height: '100%', background: e.color }} /></span><span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{t.progress}%</span></span> : <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>—</span>}</td>
                          <td style={{ padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.3)', whiteSpace: 'nowrap' }}>{t.plan ? fmtDue(t.plan) : '—'}</td>
                          <td style={{ padding: '9px 10px', fontSize: 11.5, fontWeight: 600, color: t.due ? dt.c : 'rgba(20,35,61,0.3)', whiteSpace: 'nowrap' }}>{t.due ? fmtDue(t.due) : '—'}</td>
                        </>)}
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && <tr><td colSpan={8} style={{ padding: '20px', textAlign: 'center', fontSize: 12.5, color: 'rgba(20,35,61,0.55)' }}>No hay tareas que coincidan.</td></tr>}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}
      </div>
    )
  }

  /** Tabla editable de "Todas las épicas": celdas inline, encabezados ordenables
   *  y flechas para mover una épica arriba/abajo (orden manual = epic_order). */
  const renderEpicTable = (epicsIn: Epica[]) => {
    const manual = epicTableSort.key === 'manual'
    const dir = epicTableSort.dir === 'asc' ? 1 : -1
    const cmp = (a: Epica, b: Epica) => {
      const k = epicTableSort.key; let r = 0
      if (k === 't') r = a.name.localeCompare(b.name, 'es')
      else if (k === 'status') r = EPIC_STATUSES.indexOf(a.status) - EPIC_STATUSES.indexOf(b.status)
      else if (k === 'cat') r = (a.categoria || '~').localeCompare(b.categoria || '~', 'es')
      else if (k === 'tasks') r = pendCount(a) - pendCount(b)
      else if (k === 'progress') r = pctOf(a) - pctOf(b)
      else r = (a.epic_order ?? 1e9) - (b.epic_order ?? 1e9) || a.name.localeCompare(b.name, 'es')
      return manual ? r : (r * dir || a.name.localeCompare(b.name, 'es'))
    }
    const rows = [...epicsIn].sort(cmp)
    const setSort = (key: string) => setEpicTableSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
    const th = (key: string, label: string) => (
      <th onClick={() => setSort(key)} style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: epicTableSort.key === key ? '#A87A2C' : 'rgba(15,35,64,0.5)', whiteSpace: 'nowrap', userSelect: 'none' }}>{label}{epicTableSort.key === key ? (epicTableSort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
    )
    const cellInp: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid transparent', borderRadius: 6, padding: '5px 7px', fontSize: 13, fontWeight: 600, color: '#14233D', background: 'transparent', outline: 'none' }
    const selSt: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 700, background: '#fff', outline: 'none' }
    const arrow: CSSProperties = { height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    return (
      <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)' }}>
              <th style={{ width: 62, padding: '8px 6px 8px 12px', font: '700 10px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: manual ? '#A87A2C' : 'rgba(15,35,64,0.4)' }}>{manual ? 'Orden' : <button onClick={() => setSort('manual')} title="Volver al orden manual" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(15,35,64,0.5)', font: 'inherit', textTransform: 'uppercase' }}>Manual</button>}</th>
              {th('t', 'Épica')}{th('status', 'Estado')}{th('cat', 'Categoría')}{th('tasks', 'Tareas')}{th('progress', 'Progreso')}
              <th style={{ width: 54 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((e, idx) => {
              const pct = pctOf(e); const pend = epicDay ? scopedPend(e) : pendCount(e); const st = statusStyle(e.status)
              return (
                <tr key={e.id} className="backlog-row" style={{ borderBottom: '1px solid rgba(15,35,64,0.06)' }}>
                  <td style={{ padding: '4px 6px 4px 12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={() => reorderEpicList(rows, idx, 'up')} disabled={!manual || idx === 0} aria-label="Subir" title={manual ? 'Subir' : 'Ordena en "Manual" para mover'} style={{ ...arrow, opacity: (!manual || idx === 0) ? 0.35 : 1 }}>↑</button>
                      <button onClick={() => reorderEpicList(rows, idx, 'down')} disabled={!manual || idx === rows.length - 1} aria-label="Bajar" title={manual ? 'Bajar' : 'Ordena en "Manual" para mover'} style={{ ...arrow, opacity: (!manual || idx === rows.length - 1) ? 0.35 : 1 }}>↓</button>
                    </div>
                  </td>
                  <td style={{ padding: '4px 6px', minWidth: 200 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                      <input defaultValue={e.name} onBlur={ev => { const v = ev.target.value.trim(); if (v && v !== e.name) patchEpicField(e.id, { name: v }) }} style={cellInp} />
                    </span>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <select value={e.status} onChange={ev => patchEpicField(e.id, { status: ev.target.value })} style={{ ...selSt, color: st.color }}>{EPIC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input defaultValue={e.categoria || ''} placeholder="—" onBlur={ev => { const v = ev.target.value.trim(); if (v !== (e.categoria || '')) patchEpicField(e.id, { categoria: v || null }) }} style={{ ...cellInp, width: 130 }} />
                  </td>
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', fontSize: 12, color: 'rgba(20,35,61,0.6)' }}>{pend > 0 ? `${pend} activas` : 'Al corriente'}</td>
                  <td style={{ padding: '4px 10px', minWidth: 130 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${pct}%`, height: '100%', background: e.color }} /></span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#10233F', minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '4px 10px 4px 6px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => openEdit(e.id)} aria-label="Editar" title="Editar" style={arrow}><PencilIcon /></button>
                      <button onClick={() => setFeaturedId(e.id)} aria-label="Ver épica" title="Ver épica" style={{ ...arrow, background: 'rgba(194,147,58,0.12)', color: '#A87A2C', border: 'none' }}><ArrowIcon /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={7} style={{ padding: '18px', textAlign: 'center', fontSize: 12.5, color: 'rgba(20,35,61,0.55)' }}>No hay épicas.</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  /** El editor de épica se usa en dos lugares con el MISMO contenido:
   *  como modal (alta, tabla de épicas) o embebido en el panel de la destacada. */
  function renderEditor(inline = false) {
    if (!editing) return null
    const d = editing
    const isEdit = editMode === 'edit'
    // OJO: nada de definir un componente aquí adentro. Antes envolvíamos en un
    // <Shell> declarado en el render y su identidad cambiaba en cada tecla, así
    // que React remontaba TODO el editor y el input perdía el foco (se "trababa").
    // Ahora el contenido se arma una vez y se envuelve con condicionales planos.
    const content = (
      <>
          <div style={{ height: 5, background: d.color }} />
          <div className="ep-modal-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid rgba(15,35,64,0.08)' }}>
            <div>
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>{isEdit ? 'Editar frente' : 'Nuevo frente'}</div>
              <h3 className="serif" style={{ fontWeight: 600, fontSize: 30, margin: 0, lineHeight: 1, color: '#10233F' }}>{d.name || 'Nueva épica'}</h3>
            </div>
            <button aria-label="Cerrar editor de épica" onClick={closeEdit} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 10, height: 36, width: 36, color: 'rgba(20,35,61,0.55)', fontSize: 17 }}>✕</button>
          </div>

          <div className="ep-modal-body ep-editor-body" style={{ padding: '10px 28px 22px', maxHeight: inline ? 'none' : '72vh', overflow: inline ? 'visible' : 'auto' }}>
            <label style={lbl}>Nombre de la épica</label>
            <input value={d.name} onChange={e => patchDraft(x => ({ ...x, name: e.target.value }))} placeholder="Ej. Inmuebles" style={inpBig} />

            <label style={lbl}>Descripción</label>
            <RichText value={d.description || ''} onChange={v => patchDraft(x => ({ ...x, description: v }))} placeholder="Qué abarca esta épica… (negritas, cursiva, viñetas)" />

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Color</label>
                <div style={{ display: 'flex', gap: 9, marginTop: 2 }}>
                  {SWATCHES.map(c => (
                    <button key={c} onClick={() => patchDraft(x => ({ ...x, color: c }))} style={{ cursor: 'pointer', height: 30, width: 30, borderRadius: 8, background: c, border: d.color === c ? '2px solid #10233F' : '2px solid transparent', boxShadow: d.color === c ? '0 0 0 2px #fff inset' : 'none' }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 240px' }}>
                <label style={lbl}>Estado de la épica</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  {EPIC_STATUSES.map(s => {
                    const on = d.status === s
                    return <button key={s} onClick={() => patchDraft(x => ({ ...x, status: s }))} style={{ cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 700, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{s}</button>
                  })}
                </div>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={lbl}>Categoría</label>
                <input list="ep-cats" value={d.categoria || ''} onChange={e => patchDraft(x => ({ ...x, categoria: e.target.value }))} placeholder="Ej. Finanzas, Patrimonio…" style={inpBig} />
                <datalist id="ep-cats">{Object.keys(categorias).map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            {/* Fuente de datos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 4px', padding: '12px 14px', borderRadius: 12, background: 'rgba(62,142,142,0.06)', border: '1px solid rgba(62,142,142,0.2)' }}>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 38, width: 38, borderRadius: 10, background: 'rgba(62,142,142,0.12)', color: '#2E6E6E' }}><DbIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#2E6E6E', marginBottom: 6 }}>Fuente de datos · tabla Supabase</div>
                <input value={d.source_table || ''} onChange={e => patchDraft(x => ({ ...x, source_table: e.target.value }))} placeholder="nombre_de_tabla" style={{ ...monoInp, width: '100%' }} />
              </div>
            </div>

            <div className={inline ? 'ep-editor-cards' : undefined}>
            {/* OBJETIVOS (milestones medibles) */}
            <div style={cardEd}>
              <div style={secHead}>
                <label style={{ ...lbl, marginTop: 0 }}>Objetivos</label>
                <button onClick={() => patchDraft(x => ({ ...x, kpis: [...x.kpis, { id: uid(), t: '' }] }))} style={addBtn}>+ Objetivo</button>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)', marginTop: 6 }}>Qué quieres lograr y cómo se mide. Se resalta solo al alcanzar la meta.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {d.kpis.map((k, i) => {
                  const set = (patch: Partial<EpicaMilestone>) => patchDraft(x => { x.kpis[i] = { ...x.kpis[i], ...patch }; return x })
                  const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
                  return (
                    <div key={k.id || i} style={{ border: '1px solid rgba(15,35,64,0.10)', borderRadius: 11, padding: '10px 11px', background: '#fff' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input value={k.t} onChange={e => set({ t: e.target.value })} placeholder="Llegar a 80 kg" style={inpSmall} />
                        <button aria-label="Eliminar objetivo" onClick={() => patchDraft(x => ({ ...x, kpis: x.kpis.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>
                          Actual
                          <input type="number" value={k.auto ? '' : (k.current ?? '')} disabled={!!k.auto} onChange={e => set({ current: num(e.target.value) })}
                            placeholder={k.auto ? 'auto' : '85'} style={{ ...inpNarrow, flex: '0 0 70px', width: 70, opacity: k.auto ? .5 : 1 }} />
                        </label>
                        {k.lowerIsBetter && !k.auto && (
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.55)' }} title="Valor de partida: desde dónde empezaste (para medir el avance)">
                            Inicio
                            <input type="number" value={k.start ?? ''} onChange={e => set({ start: num(e.target.value) })} placeholder="85" style={{ ...inpNarrow, flex: '0 0 66px', width: 66 }} />
                          </label>
                        )}
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>
                          Meta
                          <input type="number" value={k.target ?? ''} onChange={e => set({ target: num(e.target.value) })} placeholder="80" style={{ ...inpNarrow, flex: '0 0 70px', width: 70 }} />
                        </label>
                        <input value={k.unit || ''} onChange={e => set({ unit: e.target.value || undefined })} placeholder="kg" style={{ ...inpNarrow, flex: '0 0 62px', width: 62 }} />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>
                          Para
                          <input type="date" value={k.due || ''} onChange={e => set({ due: e.target.value || undefined })} style={dateInp} />
                        </label>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }} title="El avance se calcula con las tareas cerradas de esta épica">
                          <input type="checkbox" checked={k.auto === 'tareas'} onChange={e => set({ auto: e.target.checked ? 'tareas' : undefined })} /> Medir con tareas cerradas
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.6)', cursor: 'pointer' }} title="Para metas que bajan: peso, deuda, gastos…">
                          <input type="checkbox" checked={!!k.lowerIsBetter} onChange={e => set({ lowerIsBetter: e.target.checked || undefined, ...(e.target.checked && k.start == null && k.current != null ? { start: k.current } : {}) })} /> Menos es mejor
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#2E6E6E', cursor: 'pointer', fontWeight: 600 }}>
                          <input type="checkbox" checked={!!k.done} onChange={e => set({ done: e.target.checked || undefined, doneAt: e.target.checked ? todayISO() : undefined })} /> Cumplido
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Rutinas */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Rutinas diarias</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 3 }}>Tareas repetitivas que marcas cada día. Se cuentan por semana.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, routines: [...x.routines, { t: '', days: [false, false, false, false, false, false, false] }] }))} style={addBtn}>+ Rutina</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {d.routines.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 9, background: 'rgba(62,142,142,0.1)', color: '#2E6E6E' }}><RefreshIcon /></span>
                    <input value={r.t} onChange={e => patchDraft(x => { x.routines[i].t = e.target.value; return x })} placeholder="Ej. Revisar mensajes" style={inpSmall} />
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.55)', whiteSpace: 'nowrap' }} title="Esta semana">{getRoutineWeek(r, mondayISO(todayISO())).filter(Boolean).length}/7</span>
                    <button aria-label="Eliminar rutina" onClick={() => patchDraft(x => ({ ...x, routines: x.routines.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tareas — plegadas por defecto; cada fila se expande sola */}
            <div style={cardEd}>
              <div style={secHead}>
                <button onClick={() => setEdTasksOpen(v => !v)} aria-expanded={edTasksOpen}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                  <label style={{ ...lbl, marginTop: 0, marginBottom: 0, cursor: 'pointer' }}>Tareas</label>
                  <span style={{ font: '700 11px var(--font-ui)', color: 'rgba(20,35,61,0.5)' }}>{d.tasks.length}</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: edTasksOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button onClick={() => { setEdTasksOpen(true); setEdTaskRow(d.tasks.length); patchDraft(x => ({ ...x, tasks: [...x.tasks, { id: uid(), t: '', status: 'Por hacer', due: '', note: '', createdAt: todayISO() }] })) }} style={addBtn}>+ Tarea</button>
              </div>
              {edTasksOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {d.tasks.length === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>Sin tareas todavía.</div>}
                  {d.tasks.map((t, i) => {
                    const abierta = edTaskRow === i
                    const ts = taskStyle(t.status)
                    return (
                      <div key={t.id || i} style={{ background: '#fff', border: `1px solid ${abierta ? 'rgba(194,147,58,0.45)' : 'rgba(15,35,64,0.10)'}`, borderRadius: 11, overflow: 'hidden' }}>
                        {/* Renglón compacto: siempre visible */}
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '8px 9px' }}>
                          <button onClick={() => setEdTaskRow(abierta ? null : i)} aria-label={abierta ? 'Plegar' : 'Expandir'}
                            style={{ flexShrink: 0, height: 24, width: 24, borderRadius: 6, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.05)', color: 'rgba(20,35,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" style={{ transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                          <input value={t.t} onChange={e => patchDraft(x => { x.tasks[i].t = e.target.value; return x })} placeholder="Nombre de la tarea"
                            style={{ flex: 1, minWidth: 0, border: '1px solid transparent', borderRadius: 7, padding: '5px 7px', fontSize: 13, fontWeight: 600, color: '#14233D', background: 'transparent', outline: 'none' }} />
                          <span style={{ flexShrink: 0, font: '700 10px var(--font-ui)', color: ts.c, background: ts.bg, borderRadius: 99, padding: '3px 8px', whiteSpace: 'nowrap' }}>{ts.label}</span>
                          {t.due && <span style={{ flexShrink: 0, font: '700 10px var(--font-ui)', color: dueTone(t.due, t.status === 'Terminada').c }}>{fmtDue(t.due)}</span>}
                          <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button aria-label="Subir" title="Subir" disabled={i === 0}
                              onClick={() => patchDraft(x => { const a2 = [...x.tasks]; const [mv] = a2.splice(i, 1); a2.splice(i - 1, 0, mv); setEdTaskRow(abierta ? i - 1 : null); return { ...x, tasks: a2 } })}
                              style={{ height: 22, width: 20, borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 10, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                            <button aria-label="Bajar" title="Bajar" disabled={i === d.tasks.length - 1}
                              onClick={() => patchDraft(x => { const a2 = [...x.tasks]; const [mv] = a2.splice(i, 1); a2.splice(i + 1, 0, mv); setEdTaskRow(abierta ? i + 1 : null); return { ...x, tasks: a2 } })}
                              style={{ height: 22, width: 20, borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 10, opacity: i === d.tasks.length - 1 ? 0.35 : 1 }}>↓</button>
                          </span>
                          <button aria-label="Eliminar tarea" onClick={() => { setEdTaskRow(null); patchDraft(x => ({ ...x, tasks: x.tasks.filter((_, j) => j !== i) })) }} style={{ ...delBtn, height: 26, width: 26 }}>✕</button>
                        </div>
                        {/* Detalle: sólo de la fila abierta */}
                        {abierta && (
                          <div style={{ borderTop: '1px solid rgba(15,35,64,0.07)', padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 9, background: '#FBFAF6' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {PICK_STATUSES.map(sx => {
                                const on = t.status === sx; const t2 = taskStyle(sx)
                                return <button key={sx} onClick={() => patchDraft(x => { x.tasks[i].status = sx; return x })} style={{ cursor: 'pointer', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, border: on ? `1px solid ${t2.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? t2.bg : '#fff', color: on ? t2.c : 'rgba(20,35,61,0.55)' }}>{t2.label}</button>
                              })}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>Entrega</span>
                              <input type="date" value={t.due} onChange={e => patchDraft(x => { x.tasks[i].due = e.target.value; return x })} style={dateInp} />
                            </div>
                            <RichText value={t.note || ''} onChange={v => patchDraft(x => { x.tasks[i].note = v; return x })} placeholder="Nota (negritas, cursiva, viñetas)…" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Conexiones */}
            <div style={cardEd}>
              <div style={secHead}>
                <div><label style={{ ...lbl, marginTop: 0 }}>Conexiones</label><div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: 3 }}>Otras bases y dashboards. La ★ es el dashboard principal.</div></div>
                <button onClick={() => patchDraft(x => ({ ...x, links: [...x.links, { l: '', url: '', type: 'Otro', primary: false }] }))} style={addBtn}>+ Conexión</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                {d.links.map((l, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <button onClick={() => patchDraft(x => ({ ...x, links: x.links.map((y, j) => ({ ...y, primary: j === i })) }))} aria-label="Dashboard principal" title="Dashboard principal" style={{ cursor: 'pointer', flexShrink: 0, height: 32, width: 32, borderRadius: 8, border: l.primary ? '1px solid #C2933A' : '1px solid rgba(15,35,64,0.12)', background: l.primary ? 'rgba(194,147,58,0.14)' : '#fff', color: l.primary ? '#C2933A' : 'rgba(20,35,61,0.3)', fontSize: 14 }}>★</button>
                      <select value={l.type} onChange={e => patchDraft(x => { x.links[i].type = e.target.value; return x })} style={{ ...inpSmall, flex: '0 0 116px', cursor: 'pointer' }}>
                        {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input value={l.l} onChange={e => patchDraft(x => { x.links[i].l = e.target.value; return x })} placeholder="Nombre" style={inpSmall} />
                      <button aria-label="Eliminar enlace" onClick={() => patchDraft(x => ({ ...x, links: x.links.filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                    <input value={l.url} onChange={e => patchDraft(x => { x.links[i].url = e.target.value; return x })} placeholder="https://…" style={{ ...monoInp, width: '100%' }} />
                  </div>
                ))}
              </div>
            </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(15,35,64,0.08)' }}>
              {isEdit && <button onClick={deleteEpic} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.08)', color: '#B0522E', borderRadius: 11, padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>Eliminar</button>}
              <span style={{ flex: 1 }} />
              <button onClick={closeEdit} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 11, padding: '12px 18px', fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cancelar</button>
              <button onClick={save} style={{ ...goldBtn, padding: '12px 24px' }}>Guardar</button>
            </div>
          </div>
      </>
    )
    // Embebido en el panel (usa todo el ancho) o como modal centrado
    if (inline) return <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden' }}>{content}</div>
    return (
      <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 20px', overflow: 'auto' }}>
        <div role="dialog" aria-modal="true" aria-label="Editar épica" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 660, background: '#fff', borderRadius: 22, boxShadow: '0 50px 90px -30px rgba(8,18,36,.75)', overflow: 'hidden' }}>{content}</div>
      </div>
    )
  }

  const renderTaskDetail = (view: { eId: string; tid: string }, opts: { onClose: () => void; docked?: boolean }) => {
        const found = findTask(view.eId, view.tid)   // se resuelve en cada render: nunca apunta a otra tarea
        if (!found) return null
        const { e: ep, t, i } = found
        const dt = dueTone(t.due, t.status === 'Terminada')
        const eb: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 9 }
        const openEditFromView = () => { opts.onClose(); openTaskEdit(view.eId, t.id!) }
        // Cambiar de épica sin abrir "Editar": mueve la tarea y reapunta el detalle a su nueva épica
        // (si no, findTask con la épica vieja daría null y el modal quedaría vacío).
        const changeEpica = (newEId: string) => {
          if (!newEId || newEId === ep.id) return
          moveTaskToEpica(ep, i, newEId)
          if (opts.docked) setMdSel({ eId: newEId, tid: t.id! }); else setTaskView({ eId: newEId, tid: t.id! })
        }
    const card = (
            <div role="dialog" aria-modal="true" aria-label="Detalle de la tarea" onClick={e => e.stopPropagation()} className="ep-modal" style={opts.docked ? { width: '100%', maxWidth: 'none', height: '100%', background: '#fff', borderRadius: 14, border: '1px solid rgba(15,35,64,0.10)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : { width: '100%', maxWidth: 920, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' }}>
              <div style={{ height: 4, background: ep.color, flexShrink: 0 }} />
              <div className="ep-modal-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 26px 14px', borderBottom: '1px solid rgba(15,35,64,0.08)', flexShrink: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(20,35,61,0.55)', marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color, flexShrink: 0 }} />
                      {activeEpics.length > 1
                        ? <select value={ep.id} onChange={e => changeEpica(e.target.value)} title="Mover esta actividad a otra épica" aria-label="Épica" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '3px 22px 3px 7px', fontSize: 12, fontWeight: 700, color: ep.color, background: '#fff', outline: 'none', maxWidth: 240 }}>{activeEpics.map(x => <option key={x.id} value={x.id} style={{ color: '#16365F' }}>{x.name}</option>)}</select>
                        : <span>{ep.name}</span>}
                    </div>
                    <input key={`title:${t.id}`} defaultValue={t.t} aria-label="Título de la tarea"
                      onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); (ev.currentTarget as HTMLInputElement).blur() } }}
                      onFocus={ev => { ev.currentTarget.style.background = '#fff'; ev.currentTarget.style.borderColor = 'rgba(15,35,64,0.18)' }}
                      onBlur={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.borderColor = 'transparent'; const v = ev.currentTarget.value.trim(); if (v && v !== t.t) setTaskTitle(ep, i, v); else ev.currentTarget.value = t.t }}
                      className="serif" style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: '1px solid transparent', borderRadius: 8, padding: '3px 7px', margin: '-3px -7px', fontWeight: 600, fontSize: 27, lineHeight: 1.1, color: '#10233F', background: 'transparent', outline: 'none', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                      {t.createdAt && <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>Creada · {cap(new Date(t.createdAt + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }))}</span>}
                      {t.status !== 'Terminada' && diasCon(t) >= 1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#A87A2C' }}>🕐 llevas {diasCon(t)} {diasCon(t) === 1 ? 'día' : 'días'} en esto</span>}
                      {t.plan && t.plan < today && t.status !== 'Terminada' && <span style={{ fontSize: 11, fontWeight: 700, color: '#B0522E' }}>⏳ pendiente de días anteriores</span>}
                      {diasTrabajados(t) >= 2 && <span title="Días distintos en que le has metido mano" style={{ fontSize: 11, fontWeight: 700, color: MULTIDIA_TONE.c }}>⧗ trabajada en {diasTrabajados(t)} días</span>}
                    </div>
                    {t.repeat && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9, padding: '6px 11px', borderRadius: 99, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}` }}>
                        <span style={{ font: '700 11.5px var(--font-ui)', color: REPEAT_TONE.c }}>↻ Se repite {repeatLabel(t.repeat)}</span>
                        {(t.repeatDone?.length ?? 0) > 0 && <span style={{ fontSize: 11, color: REPEAT_TONE.c }}>· {t.repeatDone!.length} {t.repeatDone!.length === 1 ? 'ciclo cumplido' : 'ciclos cumplidos'}</span>}
                        {t.repeatUntil && <span style={{ fontSize: 11, color: REPEAT_TONE.c }}>· hasta {fmtDue(t.repeatUntil)}</span>}
                      </div>
                    )}
                  </div>
                  <button aria-label="Cerrar detalle de tarea" onClick={() => opts.onClose()} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 34, width: 34, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                <div className="ep-modal-body" style={{ padding: '16px 26px 8px', overflowY: 'auto', flex: 1 }}>

                {/* RESUMEN — editable aquí mismo (si existe la columna) */}
                {(resumenReady.current || t.resumen) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={eb}>Resumen</div>
                    {resumenReady.current
                      ? <textarea key={`res:${t.id}`} defaultValue={t.resumen || ''} onBlur={ev => { const v = ev.target.value; if (v.trim() !== (t.resumen || '')) setTaskResumen(ep, i, v) }} placeholder="¿Qué es esta actividad y qué quieres lograr?" rows={3}
                          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13.5, lineHeight: 1.5, color: '#14233D', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
                      : <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#14233D', whiteSpace: 'pre-wrap' }}>{t.resumen}</div>}
                  </div>
                )}

                {/* ENLACES DE LA ÉPICA — dropdown plegado por defecto con las conexiones de la épica */}
                {(() => {
                  const links = (ep.links || []).filter(l => l.url && l.url !== '#')
                  if (links.length === 0) return null
                  return (
                    <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid rgba(15,35,64,0.10)', overflow: 'hidden' }}>
                      <button onClick={() => setTaskLinksOpen(o => !o)} aria-expanded={taskLinksOpen}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: 'none', background: '#FBFAF6', padding: '10px 12px' }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: ep.color, flexShrink: 0 }} />
                        <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.6)' }}>Enlaces de {ep.name}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(20,35,61,0.45)' }}>{links.length}</span>
                        <span style={{ flex: 1 }} />
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: taskLinksOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      {taskLinksOpen && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', borderTop: '1px solid rgba(15,35,64,0.08)' }}>
                          {links.map((l, li) => {
                            const c = typeColor(l.type)
                            return (
                              <a key={li} href={safeUrl(l.url)} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 12, fontWeight: 600, color: '#16365F', background: '#fff', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 99, padding: '5px 11px' }}>
                                <span style={{ width: 7, height: 7, borderRadius: 99, background: c, flexShrink: 0 }} />
                                {l.l}
                              </a>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Cuerpo en dos columnas (como el detalle de Tiempo); se colapsa a una en pantallas angostas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '0 26px', alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                {/* Estado (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Estado</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PICK_STATUSES.map(s => { const on = t.status === s; const st2 = taskStyle(s); return <button key={s} onClick={() => setTaskStatus(ep, i, s)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${st2.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? st2.bg : '#fff', color: on ? st2.c : 'rgba(20,35,61,0.55)' }}>{st2.label}</button> })}
                  </div>
                </div>

                {/* Objetivo al que contribuye */}
                {(ep.kpis || []).length > 0 && (() => {
                  const actual = milestoneOfTask(ep, t.id)
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={eb}>Contribuye a</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <select value={actual?.id || ''} onChange={ev => setTaskMilestone(ep, t.id!, ev.target.value || null)}
                          style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '7px 9px', fontSize: 12.5, fontWeight: 600, color: actual ? '#16365F' : 'rgba(20,35,61,0.5)', background: '#fff', outline: 'none', maxWidth: '100%' }}>
                          <option value="">— Ningún objetivo —</option>
                          {ep.kpis.map(m => <option key={m.id} value={m.id}>{m.t}</option>)}
                        </select>
                        {actual && (() => {
                          const mp = milestoneProgress(actual, ep); const hecho = milestoneDone(actual, ep)
                          return mp.hasMeta ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: hecho ? '#2E6E6E' : '#A87A2C' }}>
                              <span style={{ width: 54, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.10)', overflow: 'hidden', display: 'inline-block' }}>
                                <span style={{ display: 'block', width: `${mp.pct * 100}%`, height: '100%', background: hecho ? '#2E6E6E' : ep.color }} />
                              </span>
                              {mp.cur}/{mp.target}{hecho ? ' ✦' : ''}
                            </span>
                          ) : null
                        })()}
                      </div>
                    </div>
                  )
                })()}

                {/* Prioridad (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Prioridad</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['alta', 'media', 'baja'] as Prio[]).map(p => { const on = t.priority === p; const ps2 = prioStyle(p); return <button key={p} onClick={() => setPriority(ep, i, p)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${ps2.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(194,147,58,0.08)' : '#fff' }}><PrioBars p={p} /><span style={{ font: '700 10px var(--font-ui)', color: on ? ps2.c : 'rgba(20,35,61,0.5)' }}>{ps2.label}</span></button> })}
                  </div>
                </div>

                {/* Dificultad (editable) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Dificultad</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['facil', 'media', 'dificil'] as Dif[]).map(dd => { const on = t.difficulty === dd; const dsy = difStyle(dd); return <button key={dd} onClick={() => setDifficulty(ep, i, dd)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '8px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${dsy.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? dsy.bg : '#fff' }}><DifDots d={dd} /><span style={{ font: '700 10px var(--font-ui)', color: on ? dsy.c : 'rgba(20,35,61,0.5)' }}>{dsy.label}</span></button> })}
                  </div>
                </div>

                {/* Estimado propio de tiempo: cuánto crees que te tomará. Dropdown de presets + campo
                    "Personalizado…" (acepta 90, 1h30, 1:30, 2h, 45m). Alimenta la carga del día ("~Xh"). */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Estimado <span style={{ color: 'rgba(20,35,61,0.4)', fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>· cuánto crees que te tomará</span></div>
                  {estMinReady.current ? (() => {
                    const has = typeof t.estMin === 'number' && t.estMin > 0
                    const cur = has ? t.estMin! : 0
                    const defMin = WEEK_EST_MIN(t.difficulty)
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {renderEstControl(t.id!, t.estMin, defMin, m => setTaskEstMin(ep, i, m))}
                        {has && <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2E6E6E' }}>= {fmtEst(cur)}</span>}
                        {has
                          ? <button onClick={() => { setEstCustomId(null); setTaskEstMin(ep, i, null) }} title="Volver al estimado por dificultad" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11.5, fontWeight: 700 }}>usar dificultad</button>
                          : <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>{defMin ? `usando ~${fmtEst(defMin)}` : 'elige un tiempo o pon dificultad'}</span>}
                      </div>
                    )
                  })() : (
                    <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>Corre <code>sql/epicas-09-est-min.sql</code> en Supabase para poner tu estimado propio.</div>
                  )}
                </div>

                {/* Avance (editable) — commit al soltar (no re-renderiza en cada escalón) */}
                <ProgressSlider value={t.progress ?? 0} color={ep.color} labelStyle={eb}
                  onCommit={v => setTaskProgress(ep, i, v)} onHundred={() => setTaskProgress(ep, i, 100)} />

                {/* Bitácora de avance (días trabajados + nota) */}
                {(() => {
                  const log = t.progressLog || []
                  const deltas = progressDeltas(log)
                  const todayLogged = log.some(x => x.d === todayISO())
                  // Tiempo invertido: suma de los minutos registrados desde la sección Tiempo (campo `min`).
                  const investedMin = log.reduce((s, x) => s + (typeof (x as { min?: number }).min === 'number' ? (x as { min?: number }).min! : 0), 0)
                  const fmtMin = (m: number) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m` }
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                        <span style={eb}>Bitácora de avance{log.length > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}> {log.length} {log.length === 1 ? 'día' : 'días'}</span>}{investedMin > 0 && <span style={{ color: '#2E6E6E', fontWeight: 800 }}> · ⏱ {fmtMin(investedMin)} invertidas</span>}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <input type="date" value="" onChange={e => addProgressDay(ep, i, e.target.value)} title="Registrar otro día" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '6px 8px', fontSize: 11.5, fontWeight: 600, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }} />
                          <button onClick={() => addProgressDay(ep, i, todayISO())} disabled={todayLogged} style={{ cursor: todayLogged ? 'default' : 'pointer', borderRadius: 9, padding: '7px 13px', fontSize: 12, fontWeight: 800, border: todayLogged ? '1px solid rgba(62,142,142,0.35)' : 'none', ...(todayLogged ? { background: 'rgba(62,142,142,0.12)', color: '#2E6E6E' } : { background: 'linear-gradient(135deg,#E7C56B,#C2933A)', color: '#1B1305' }) }}>{todayLogged ? '✓ Avancé hoy' : 'Avancé hoy'}</button>
                        </div>
                      </div>
                      {log.length === 0
                        ? <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)' }}>Marca los días en que avanzaste en esta tarea, con una nota si quieres.</div>
                        : (() => {
                            const CAP = 4
                            const collapsed = log.length > CAP && !logExpanded
                            const shown = collapsed ? log.slice(0, CAP) : log
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: logExpanded ? 260 : undefined, overflowY: logExpanded ? 'auto' : 'visible' }}>
                                {shown.map(entry => {
                                  const isTd = entry.d === todayISO()
                                  const dlt = deltas[entry.d]
                                  return (
                                    <div key={entry.d} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 9, background: isTd ? 'rgba(194,147,58,0.09)' : 'rgba(15,35,64,0.03)' }}>
                                      {/* Fecha editable del avance */}
                                      <input type="date" defaultValue={entry.d} onChange={e => setProgressDate(ep, i, entry.d, e.target.value)} title="Cambiar la fecha de este avance" aria-label="Fecha del avance"
                                        style={{ flexShrink: 0, width: 132, border: `1px solid ${isTd ? 'rgba(194,147,58,0.4)' : 'rgba(15,35,64,0.12)'}`, borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 700, color: isTd ? '#A87A2C' : '#16365F', background: '#fff', outline: 'none' }} />
                                      {/* % total al final de ese día (editable) + delta derivado */}
                                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <input type="number" min={0} max={100} defaultValue={typeof entry.pct === 'number' ? entry.pct : ''} placeholder="—"
                                          onBlur={e => { const v = e.target.value.trim(); setProgressPct(ep, i, entry.d, v === '' ? null : Number(v)) }}
                                          title="% total al final de ese día" aria-label="Porcentaje ese día"
                                          style={{ width: 46, border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 4px', fontSize: 12, fontWeight: 700, color: '#14233D', background: '#fff', outline: 'none', textAlign: 'right' }} />
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.45)' }}>%</span>
                                        {typeof dlt === 'number' && (
                                          <span title="Avanzaste esto ese día (vs. el día anterior con %)" style={{ marginLeft: 2, fontSize: 11, fontWeight: 800, color: dlt > 0 ? '#2E6E6E' : dlt < 0 ? '#B0522E' : 'rgba(20,35,61,0.4)' }}>{dlt > 0 ? '+' : ''}{dlt}%</span>
                                        )}
                                      </span>
                                      <input defaultValue={entry.note || ''} onBlur={e => setProgressNote(ep, i, entry.d, e.target.value)} placeholder="Nota del día…" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 12.5, color: '#14233D', outline: 'none' }} />
                                      <button onClick={() => removeProgressDay(ep, i, entry.d)} aria-label="Quitar día" title="Quitar día" style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.55)', fontSize: 13, lineHeight: 1 }}>✕</button>
                                    </div>
                                  )
                                })}
                                {log.length > CAP && (
                                  <button onClick={() => setLogExpanded(v => !v)} style={{ alignSelf: 'flex-start', cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 11.5, fontWeight: 700, padding: '2px 0' }}>{collapsed ? `Ver ${log.length - CAP} días más ▾` : 'Ver menos ▴'}</button>
                                )}
                              </div>
                            )
                          })()
                      }
                    </div>
                  )
                })()}

                </div>
                <div style={{ minWidth: 0 }}>
                {/* Fechas (editables) */}
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
                  {t.status === 'Terminada' && <div><div style={eb}>Terminada el</div><input type="date" value={t.doneAt || ''} onChange={e => setTaskDoneAt(ep, i, e.target.value)} style={{ border: '1px solid rgba(62,142,142,0.4)', borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: t.doneAt ? '#2E6E6E' : 'rgba(20,35,61,0.4)', background: t.doneAt ? 'rgba(62,142,142,0.08)' : '#fff', outline: 'none' }} /></div>}
                  <div><div style={eb}>Hacer</div><input type="date" value={t.plan || ''} onChange={e => setTaskPlan(ep, i, e.target.value)} style={{ border: '1px solid rgba(46,90,158,0.35)', borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: t.plan ? '#2E5A9E' : 'rgba(20,35,61,0.4)', background: t.plan ? 'rgba(46,90,158,0.06)' : '#fff', outline: 'none' }} /></div>
                  <div><div style={eb}>Vence</div><input type="date" value={t.due} onChange={e => setTaskDue(ep, i, e.target.value)} style={{ border: `1px solid ${dt.border}`, borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: dt.c, background: dt.bg, outline: 'none' }} /></div>
                  {/* Recordatorio: dispara una notificación a esa hora (con la app abierta) */}
                  <div>
                    <div style={eb}>Recordarme 🔔</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="datetime-local" value={isoToLocalInput(t.remindAt)} onChange={e => setTaskRemind(ep, i, e.target.value)}
                        style={{ border: '1px solid rgba(122,111,176,0.4)', borderRadius: 9, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: t.remindAt ? '#7A6FB0' : 'rgba(20,35,61,0.4)', background: t.remindAt ? 'rgba(122,111,176,0.08)' : '#fff', outline: 'none' }} />
                      {t.remindAt && <button onClick={() => setTaskRemind(ep, i, '')} title="Quitar recordatorio" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.5)', fontSize: 14 }}>✕</button>}
                    </div>
                  </div>
                </div>

                {/* Repetición (editable inline) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Repetición</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([['No se repite', null], ['Cada día', { every: 1, unit: 'dia' }], ['Cada semana', { every: 1, unit: 'semana' }], ['Cada mes', { every: 1, unit: 'mes' }]] as [string, EpicaRepeat | null][]).map(([lbl, rp]) => {
                      const on = rp ? (!!t.repeat && t.repeat.unit === rp.unit) : !t.repeat
                      return <button key={lbl} onClick={() => setTaskRepeat(ep, i, rp)} style={{ cursor: 'pointer', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, border: on ? '1px solid #7A6FB0' : '1px solid rgba(15,35,64,0.14)', background: on ? 'rgba(122,111,176,0.10)' : '#fff', color: on ? '#5F5596' : 'rgba(20,35,61,0.55)' }}>{lbl}</button>
                    })}
                  </div>
                  {t.repeat && ((t.repeat.every ?? 1) > 1 || t.repeatUntil) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#7A6FB0', fontWeight: 600 }}>↻ {repeatLabel(t.repeat)}{t.repeatUntil ? ` · hasta ${fmtDue(t.repeatUntil)}` : ''} <span style={{ color: 'rgba(20,35,61,0.4)' }}>· frecuencia avanzada en “Editar”</span></div>
                  )}
                </div>

                {/* Días de trabajo (sesiones por día): la misma tarea agendada en varios días, cada uno
                    con SUS horas, SU dificultad y su propio "hecho ese día" (sin cerrar la tarea). */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Días de trabajo <span style={{ color: 'rgba(20,35,61,0.4)', fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>· agéndala en varios días</span></div>
                  {dayPlansReady.current ? (() => {
                    const dps = dayPlansOf(t)
                    const worked = (d: EpicaDayPlan) => !!d.done || (t.progressLog || []).some(x => x.d === d.day)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dps.length === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Un solo día por ahora. Agrega fechas abajo para trabajarla en varios días, cada uno con sus horas y dificultad.</div>}
                        {dps.map(dp => {
                          const w = worked(dp)
                          return (
                            <div key={dp.day} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '6px 8px', borderRadius: 9, background: w ? 'rgba(194,147,58,0.10)' : 'rgba(15,35,64,0.03)', border: `1px solid ${w ? 'rgba(194,147,58,0.4)' : 'rgba(15,35,64,0.08)'}` }}>
                              <button onClick={() => toggleDayPlanDone(ep, i, dp.day)} title={dp.done ? 'Marcar como no trabajado ese día' : 'Marcar: trabajé este día'} style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, cursor: 'pointer', border: dp.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: dp.done ? '#C2933A' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{dp.done ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg> : w ? <span style={{ color: '#C2933A', fontSize: 10, lineHeight: 1 }}>◐</span> : null}</button>
                              <input type="date" value={dp.day} onChange={ev => { const nd = ev.target.value; if (nd && nd !== dp.day) setDayPlanField(ep, i, dp.day, { day: nd }) }} aria-label="Día" style={{ flexShrink: 0, border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontWeight: 700, color: '#16365F', background: '#fff', outline: 'none' }} />
                              {renderEstControl(`${t.id}:${dp.day}`, dp.estMin, estMinOf(t), m => setDayPlanField(ep, i, dp.day, { estMin: m == null ? undefined : m }), true)}
                              <select value={dp.difficulty || ''} onChange={ev => setDayPlanField(ep, i, dp.day, { difficulty: (ev.target.value || undefined) as EpicaDayPlan['difficulty'] })} title="Dificultad ese día" aria-label="Dificultad ese día" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '4px 5px', fontSize: 11, fontWeight: 700, color: dp.difficulty ? '#16365F' : 'rgba(20,35,61,0.5)', background: '#fff', outline: 'none' }}>
                                <option value="">Dif ·</option><option value="facil">Fácil</option><option value="media">Media</option><option value="dificil">Difícil</option>
                              </select>
                              <span style={{ flex: 1 }} />
                              <button onClick={() => removeDayPlan(ep, i, dp.day)} aria-label="Quitar día" title="Quitar día" style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.45)', fontSize: 13, lineHeight: 1 }}>✕</button>
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                          <input type="date" value="" onChange={ev => { if (ev.target.value) addDayPlan(ep, i, ev.target.value) }} aria-label="Agregar día de trabajo" style={{ cursor: 'pointer', border: '1px dashed rgba(15,35,64,0.22)', borderRadius: 7, padding: '5px 7px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }} />
                          <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.45)' }}>+ agregar un día para trabajarla</span>
                        </div>
                      </div>
                    )
                  })() : <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}>Corre <code>sql/epicas-10-day-plans.sql</code> en Supabase para agendarla en varios días.</div>}
                </div>

                {/* Subtareas — editables aquí mismo, sin abrir "Editar" */}
                {(() => {
                  const subs = t.subtasks || []
                  const hechas = subs.filter(s => s.done).length
                  const pend = subs.map((s, si) => ({ s, si })).filter(x => !x.s.done)
                  const done = subs.map((s, si) => ({ s, si })).filter(x => x.s.done)
                  const difRank = (d?: string) => d === 'dificil' ? 3 : d === 'media' ? 2 : d === 'facil' ? 1 : 0
                  const subCmp = (a: { s: EpicaSubtask }, b: { s: EpicaSubtask }) =>
                    subSort === 'prioridad' ? PRIO_RANK[a.s.priority || 'media'] - PRIO_RANK[b.s.priority || 'media']
                    : subSort === 'dificultad' ? difRank(b.s.difficulty) - difRank(a.s.difficulty)   // difícil primero
                    : subSort === 'dia' ? (a.s.plan || '9999-99').localeCompare(b.s.plan || '9999-99')
                    : 0
                  const pendShown = subSort === 'manual' ? pend : [...pend].sort(subCmp)
                  const row = (s: EpicaSubtask, si: number, arrows?: { up?: number; down?: number }) => (
                    <div key={s.id || si} className="ep-sub-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                      <button onClick={() => toggleSubtask(ep, i, si)} aria-label={s.done ? 'Desmarcar' : 'Marcar'}
                        style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, cursor: 'pointer', background: s.done ? '#2E6E6E' : '#fff', border: s.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                      </button>
                      {/* El título abre el popup de la subtarea (nota, links, %) */}
                      <button onClick={() => s.id && setSubPop({ eId: ep.id, tid: t.id!, sid: s.id })} title="Abrir subtarea"
                        style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 6px', fontSize: 13, color: s.done ? 'rgba(20,35,61,0.45)' : '#16365F', textDecoration: s.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.t || <span style={{ color: 'rgba(20,35,61,0.4)' }}>(sin título)</span>}
                      </button>
                      {/* Indicadores: día · prioridad · dificultad · %, nota, links */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {s.plan && (() => { const over = !s.done && s.plan < today; return <span title={`Trabajar el ${fmtDue(s.plan)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: '700 9.5px var(--font-ui)', color: over ? '#B0522E' : '#2E5A9E', background: over ? 'rgba(176,82,46,0.10)' : 'rgba(46,90,158,0.08)', border: `1px solid ${over ? 'rgba(176,82,46,0.3)' : 'rgba(46,90,158,0.2)'}`, borderRadius: 99, padding: '1px 7px' }}>📅 {cap(new Date(s.plan + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }).replace('.', ''))}</span> })()}
                        {s.priority && <span title={`Prioridad ${prioStyle(s.priority).label}`}><PrioBars p={s.priority} size={11} /></span>}
                        {s.difficulty && <span title={`Dificultad ${difStyle(s.difficulty).label}`}><DifDots d={s.difficulty} size={9} /></span>}
                        {typeof s.progress === 'number' && s.progress > 0 && <span style={{ font: '700 10px var(--font-ui)', color: 'rgba(20,35,61,0.5)' }}>{s.progress}%</span>}
                        {s.note && <span title="Tiene nota" style={{ fontSize: 11, color: 'rgba(20,35,61,0.4)' }}>✎</span>}
                        {(s.links?.length ?? 0) > 0 && <span title={`${s.links!.length} links`} style={{ font: '700 10px var(--font-ui)', color: '#A87A2C' }}>🔗{s.links!.length}</span>}
                      </span>
                      {arrows && (
                        <span className="ep-sub-del" style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button onClick={() => arrows.up != null && moveSubtask(ep, i, si, arrows.up)} disabled={arrows.up == null} aria-label="Subir" style={{ height: 18, width: 18, borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 9, lineHeight: 1, opacity: arrows.up == null ? 0.3 : 1 }}>↑</button>
                          <button onClick={() => arrows.down != null && moveSubtask(ep, i, si, arrows.down)} disabled={arrows.down == null} aria-label="Bajar" style={{ height: 18, width: 18, borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 9, lineHeight: 1, opacity: arrows.down == null ? 0.3 : 1 }}>↓</button>
                        </span>
                      )}
                      <button className="ep-sub-del" onClick={() => removeSubtask(ep, i, si)} aria-label="Eliminar subtarea" title="Eliminar"
                        style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.4)', fontSize: 13 }}>✕</button>
                    </div>
                  )
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={eb}>Subtareas {subs.length > 0 && <span style={{ color: '#2E6E6E', fontWeight: 800 }}>{hechas}/{subs.length} · {Math.round((hechas / subs.length) * 100)}%</span>}</span>
                        <span style={{ flex: 1 }} />
                        {pend.length > 1 && (
                          <select value={subSort} onChange={e => setSubSort(e.target.value as typeof subSort)} title="Ordenar subtareas" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 7, padding: '3px 6px', fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
                            <option value="manual">Orden manual</option>
                            <option value="prioridad">Prioridad</option>
                            <option value="dificultad">Dificultad</option>
                            <option value="dia">Día</option>
                          </select>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {pendShown.map((x, k) => row(x.s, x.si, subSort === 'manual' ? { up: k > 0 ? pend[k - 1].si : undefined, down: k < pend.length - 1 ? pend[k + 1].si : undefined } : undefined))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
                          <span style={{ flexShrink: 0, height: 18, width: 18, borderRadius: 5, border: '1.5px dashed rgba(15,35,64,0.22)' }} />
                          <input value={newSubtask} onChange={ev => setNewSubtask(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === 'Enter' && newSubtask.trim()) { addSubtask(ep, i, newSubtask); setNewSubtask('') } }}
                            onBlur={() => { if (newSubtask.trim()) { addSubtask(ep, i, newSubtask); setNewSubtask('') } }}
                            placeholder="Agregar subtarea y Enter…"
                            style={{ flex: 1, minWidth: 0, border: '1px solid rgba(15,35,64,0.12)', borderRadius: 7, padding: '5px 8px', fontSize: 12.5, background: '#fff', outline: 'none', color: '#16365F' }} />
                        </div>
                      </div>
                      {done.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(15,35,64,0.07)' }}>
                          <div style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: '#2E6E6E', marginBottom: 4 }}>Completadas · {done.length}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {done.map(x => row(x.s, x.si))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {t.note && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={eb}>Nota</div>
                    <div className="ep-note" style={{ fontSize: 13.5, lineHeight: 1.55, color: '#14233D', maxHeight: 320, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(t.note) }} />
                  </div>
                )}

                {/* LINKS — editables aquí mismo (agregar / editar / ordenar / quitar) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={eb}>Links {(t.links?.length ?? 0) > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}>{t.links!.length}</span>}</span>
                    <button onClick={() => setTaskLinks(ep, i, [...(t.links || []), { label: '', url: '' }])} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>+ Link</button>
                  </div>
                  {/* La lista se re-monta cuando cambia (agregar/quitar/ordenar/editar) para que
                      los inputs uncontrolled muestren siempre el valor correcto. */}
                  <div key={`links:${t.id}:${JSON.stringify(t.links || [])}`} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {(t.links || []).length === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Sin links. Agrega con “+ Link”.</div>}
                    {(t.links || []).map((l, li) => {
                      const nn = (t.links || []).length
                      const arr: CSSProperties = { height: 30, width: 26, borderRadius: 7, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 11, lineHeight: 1, flexShrink: 0 }
                      const move = (dir: -1 | 1) => { const j = li + dir; if (j < 0 || j >= nn) return; const ls = [...(t.links || [])];[ls[li], ls[j]] = [ls[j], ls[li]]; setTaskLinks(ep, i, ls) }
                      return (
                        <div key={li} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                          {nn > 1 && (
                            <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              <button aria-label="Subir" title="Subir" disabled={li === 0} onClick={() => move(-1)} style={{ ...arr, cursor: li === 0 ? 'default' : 'pointer', opacity: li === 0 ? 0.35 : 1 }}>↑</button>
                              <button aria-label="Bajar" title="Bajar" disabled={li === nn - 1} onClick={() => move(1)} style={{ ...arr, cursor: li === nn - 1 ? 'default' : 'pointer', opacity: li === nn - 1 ? 0.35 : 1 }}>↓</button>
                            </span>
                          )}
                          <input defaultValue={l.label} onBlur={ev => { const v = ev.target.value; if (v !== l.label) setTaskLinks(ep, i, (t.links || []).map((x, j) => j === li ? { ...x, label: v } : x)) }} placeholder="Nombre" style={{ flex: '0 0 120px', width: 120, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#14233D', outline: 'none' }} />
                          <input defaultValue={l.url} onBlur={ev => { const v = ev.target.value; if (v !== l.url) setTaskLinks(ep, i, (t.links || []).map((x, j) => j === li ? { ...x, url: v } : x)) }} placeholder="https://…" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '7px 9px', fontSize: 12, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', color: '#14233D', outline: 'none' }} />
                          {l.url && <a href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noreferrer" title="Abrir" style={{ flexShrink: 0, textDecoration: 'none', color: '#A87A2C', fontSize: 14 }}>↗</a>}
                          <button aria-label="Quitar link" onClick={() => setTaskLinks(ep, i, (t.links || []).filter((_, j) => j !== li))} style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)' }}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* COMENTARIOS — se agregan aquí mismo, sin abrir "Editar" */}
                <div style={{ marginBottom: 16 }}>
                  <div style={eb}>Comentarios {(t.comentarios?.length ?? 0) > 0 && <span style={{ color: '#A87A2C', fontWeight: 800 }}>{t.comentarios!.length}</span>}</div>
                  {(t.comentarios?.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                      {[...t.comentarios!].sort((a, b) => b.at.localeCompare(a.at)).map(c => (
                        <div key={c.at} className="ep-sub-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(15,35,64,0.03)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: '#14233D', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</div>
                            <div style={{ fontSize: 10, color: 'rgba(20,35,61,0.45)', marginTop: 3 }}>{new Date(c.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          <button className="ep-sub-del" onClick={() => removeComment(ep, i, c.at)} aria-label="Borrar comentario" title="Borrar" style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(20,35,61,0.4)', fontSize: 13, lineHeight: 1 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
                    <textarea value={newComment} onChange={ev => setNewComment(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && newComment.trim()) { addComment(ep, i, newComment); setNewComment('') } }}
                      placeholder="Escribe un comentario… (⌘/Ctrl+Enter para agregar)" rows={2}
                      style={{ flex: 1, minWidth: 0, resize: 'vertical', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 9, padding: '8px 10px', fontSize: 13, color: '#16365F', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => { if (newComment.trim()) { addComment(ep, i, newComment); setNewComment('') } }} disabled={!newComment.trim()}
                      style={{ flexShrink: 0, cursor: newComment.trim() ? 'pointer' : 'default', borderRadius: 9, padding: '9px 14px', fontSize: 12.5, fontWeight: 800, border: 'none', background: newComment.trim() ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : 'rgba(15,35,64,0.08)', color: newComment.trim() ? '#1B1305' : 'rgba(20,35,61,0.4)' }}>Comentar</button>
                  </div>
                </div>
                </div>
                </div>

                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 26px', borderTop: '1px solid rgba(15,35,64,0.08)', flexWrap: 'wrap', flexShrink: 0, background: '#fff' }}>
                  <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>Todo se guarda solo ✓</span>
                  <span style={{ flex: 1 }} />
                  {/* Comenzar ahora: arranca el cronómetro ligado a esta tarea AQUÍ (widget de foco).
                      Es la misma sesión que /tiempo (estado compartido); el tiempo se registra en la tarea. */}
                  <button onClick={() => { if (focus.begin({ name: t.t, epicaId: ep.id, taskId: t.id!, dur: estMinOf(t) })) opts.onClose() }}
                    title="Empezar ahora con cronómetro (la misma sesión que en Tiempo; el tiempo se registra en esta tarea)"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 11, padding: '11px 18px', fontSize: 13, fontWeight: 800, border: '1px solid rgba(194,147,58,0.45)', background: 'rgba(194,147,58,0.12)', color: '#8a5a12' }}>▶ Comenzar</button>
                  {/* Marcar terminada (o reabrir) — acción principal, siempre a la vista */}
                  {(() => {
                    const done = t.status === 'Terminada'
                    return (
                      <button onClick={() => setTaskStatus(ep, i, done ? (t.planPrev || 'En curso') : 'Terminada')}
                        title={done ? 'Reabrir la actividad' : 'Marcar la actividad como terminada'}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 11, padding: '11px 20px', fontSize: 13, fontWeight: 800,
                          border: done ? '1px solid rgba(46,90,158,0.4)' : 'none',
                          background: done ? 'rgba(46,90,158,0.10)' : 'linear-gradient(135deg,#3E8E8E,#2E6E6E)',
                          color: done ? '#2E5A9E' : '#fff' }}>
                        {done
                          ? <>↩ Reabrir</>
                          : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg> Terminar</>}
                      </button>
                    )
                  })()}
                  {t.plan === today && t.status !== 'Terminada' && (
                    <button onClick={() => setTaskPlan(ep, i, '')} title="Quitar esta tarea del plan de hoy (no la borra ni la termina)" style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.06)', color: '#B0522E', borderRadius: 11, padding: '11px 16px', fontSize: 13, fontWeight: 700 }}>Quitar de hoy</button>
                  )}
                  <button onClick={() => opts.onClose()} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 11, padding: '11px 18px', fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cerrar</button>
                  <button onClick={openEditFromView} title="Editor completo: nota con formato, mover de épica, fin de la serie…" style={{ ...goldBtn, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 22px' }}><PencilIcon /> Editar</button>
                </div>
            </div>
    )
    return opts.docked ? card : (
      <div onClick={opts.onClose} style={{ position: 'fixed', inset: 0, zIndex: 72, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflow: 'auto' }}>
        {card}
      </div>
    )
  }

  // Vista MAESTRO/DETALLE: lista de tareas a la izquierda; al picar una, su detalle
  // completo editable al centro (SIN popup) reusando renderTaskDetail acoplado.
  const renderMasterDetail = (rows: { e: Epica; t: EpicaTask; i: number }[]) => {
    const valid = mdSel && rows.some(x => x.e.id === mdSel.eId && x.t.id === mdSel.tid) ? mdSel : (rows[0] ? { eId: rows[0].e.id, tid: rows[0].t.id! } : null)
    return (
      <div className="ep-md" style={{ display: 'flex', width: '100%', gap: 14, alignItems: 'stretch', minHeight: 420 }}>
        <div className="ep-md-list" style={{ flex: '0 0 320px', maxWidth: 360, maxHeight: 'calc(100dvh - 88px)', position: 'sticky', top: 12, alignSelf: 'flex-start', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, paddingRight: 4 }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'linear-gradient(#F6F1E7, #F6F1E7 70%, rgba(246,241,231,0))', padding: '1px 2px 6px', font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>{rows.length} tarea{rows.length === 1 ? '' : 's'}</div>
          {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '14px 6px' }}>Nada coincide con los filtros.</div>}
          {rows.map(({ e, t }) => {
            const on = !!valid && valid.eId === e.id && valid.tid === t.id
            const done = t.status === 'Terminada'; const ps = prioStyle(t.priority); const ts = taskStyle(t.status)
            return (
              <button key={planKey(e.id, t)} onClick={() => setMdSel({ eId: e.id, tid: t.id! })}
                style={{ flexShrink: 0, textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '8px 11px', border: on ? '1.5px solid #10233F' : '1px solid rgba(15,35,64,0.10)', background: on ? '#fff' : 'rgba(255,255,255,0.6)', borderLeft: `3px solid ${done ? '#2E6E6E' : ps.accent}`, boxShadow: on ? '0 6px 16px -12px rgba(15,35,64,0.5)' : 'none' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
                  <span style={{ font: '700 9px var(--font-ui)', color: ts.c, background: ts.bg, borderRadius: 99, padding: '1px 7px' }}>{ts.label}</span>
                  {t.plan && <span style={{ font: '700 9px var(--font-ui)', color: '#2E5A9E' }}>📅 {fmtDue(t.plan)}</span>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="ep-md-detail" style={{ flex: 1, minWidth: 0 }}>
          {valid
            ? renderTaskDetail(valid, { onClose: () => setMdSel(null), docked: true })
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 420, borderRadius: 14, border: '1px dashed rgba(15,35,64,0.14)', color: 'rgba(20,35,61,0.45)', fontSize: 13 }}>Elige una tarea de la izquierda para ver y editar su detalle.</div>}
        </div>
      </div>
    )
  }

  // Vista CALENDARIO + PANEL: calendario del mes al centro; a la derecha, la lista en
  // 2 drop-downs (Sin fecha / Agendadas). Arrastra una tarjeta del panel a un día para
  // agendarla; las agendadas también se ven en el calendario. Reusa el arrastre del cal.
  const renderCalendarPanel = (rows: { e: Epica; t: EpicaTask; i: number }[]) => {
    const monthStr = (calPanelMonth || todayISO()).slice(0, 7)
    const cells = monthGrid(monthStr)
    const byDay = new Map<string, typeof rows>()
    cells.forEach(c => byDay.set(c, []))
    rows.forEach(x => { const p = x.t.plan; if (p && byDay.has(p)) byDay.get(p)!.push(x) })
    const unsched = rows.filter(x => !x.t.plan && x.t.status !== 'Terminada')
    const agendadas = rows.filter(x => !!x.t.plan).sort((a, b) => (a.t.plan || '').localeCompare(b.t.plan || ''))
    const monthLbl = cap(new Date(monthStr + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }))
    const isThisMonth = monthStr === todayISO().slice(0, 7)
    const cellSt: CSSProperties = { minHeight: 100, boxSizing: 'border-box', padding: 5, borderRight: '1px solid rgba(15,35,64,0.06)', borderBottom: '1px solid rgba(15,35,64,0.06)', display: 'flex', flexDirection: 'column', gap: 3 }
    const navBtn: CSSProperties = { height: 30, width: 30, borderRadius: 9, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', cursor: 'pointer', color: '#10233F', fontSize: 15 }
    const pCard = (x: typeof rows[number], showDay: boolean) => {
      const { e, t } = x; const k = planKey(e.id, t); const dragging = calDrag === k; const ps = prioStyle(t.priority); const done = t.status === 'Terminada'
      return (
        <div key={k} onPointerDown={ev => onCalDown(ev, k)} onPointerMove={onCalMove} onPointerUp={() => onCalUp(x)} onPointerCancel={onCalCancel}
          title={`${t.t} — arrastra a un día`}
          style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.1)', borderLeft: `3px solid ${done ? '#2E6E6E' : ps.accent}`, borderRadius: 9, padding: '7px 9px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: calDrag && !dragging ? 0.5 : 1, boxShadow: dragging ? '0 16px 26px -16px rgba(15,35,64,0.5)' : 'none' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.t}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>
            {showDay && t.plan && <span style={{ font: '700 9.5px var(--font-ui)', color: '#2E5A9E' }}>📅 {fmtDue(t.plan)}</span>}
            {t.difficulty && <DifDots d={t.difficulty} size={9} />}
          </div>
        </div>
      )
    }
    const grpHeader = (label: string, n: number, open: boolean, toggle: () => void) => (
      <button onClick={toggle} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 2px' }}>
        <span style={{ height: 6, width: 6, borderRadius: 99, background: '#5B6B86' }} />
        <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{label}</span>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(20,35,61,0.45)' }}>{n}</span>
        <span style={{ flex: 1 }} />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'rgba(20,35,61,0.45)', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
    )
    return (
      <div className="ep-md" style={{ display: 'flex', width: '100%', gap: 14, alignItems: 'flex-start' }}>
        {/* Calendario del mes */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setCalPanelMonth(addMonths((calPanelMonth || todayISO().slice(0, 7) + '-01'), -1))} aria-label="Mes anterior" style={navBtn}>‹</button>
            <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 16, color: isThisMonth ? '#A87A2C' : '#10233F' }}>{monthLbl}</span>
            <button onClick={() => setCalPanelMonth(addMonths((calPanelMonth || todayISO().slice(0, 7) + '-01'), 1))} aria-label="Mes siguiente" style={navBtn}>›</button>
            {!isThisMonth && <button onClick={() => setCalPanelMonth('')} style={{ border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '6px 11px', font: '700 12px var(--font-ui)', cursor: 'pointer' }}>Este mes</button>}
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid rgba(15,35,64,0.08)', borderRadius: 12 }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(15,35,64,0.10)', background: 'rgba(15,35,64,0.02)' }}>
                {DAYNAMES.map((d, k) => <div key={d} style={{ padding: '7px 8px', font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: k >= 5 ? 'rgba(20,35,61,0.4)' : 'rgba(15,35,64,0.5)', textAlign: 'center' }}>{d.slice(0, 3)}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {cells.map(cd => {
                  const inMonth = cd.slice(0, 7) === monthStr; const isTd = cd === today; const items = byDay.get(cd)!; const over = calOverDay === cd && !!calDrag
                  return (
                    <div key={cd} data-calday={cd} style={{ ...cellSt, background: over ? 'rgba(194,147,58,0.10)' : isTd ? 'rgba(194,147,58,0.05)' : inMonth ? '#fff' : 'rgba(15,35,64,0.02)', outline: over ? '1.5px dashed #C2933A' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span className="serif" style={{ fontSize: 13, fontWeight: 600, color: isTd ? '#A87A2C' : inMonth ? '#10233F' : 'rgba(20,35,61,0.35)' }}>{dayNum(cd)}</span>
                        {isTd && <span style={{ font: '700 8px var(--font-ui)', color: '#A87A2C' }}>HOY</span>}
                        <span style={{ flex: 1 }} />
                        {over && <span style={{ font: '700 8px var(--font-ui)', color: '#A87A2C' }}>SOLTAR</span>}
                      </div>
                      {items.map(x => {
                        const { e, t } = x; const k = planKey(e.id, t); const dragging = calDrag === k; const done = t.status === 'Terminada'
                        return (
                          <div key={k} onPointerDown={ev => onCalDown(ev, k)} onPointerMove={onCalMove} onPointerUp={() => onCalUp(x)} onPointerCancel={onCalCancel}
                            title={`${t.t} — arrastra a otro día`}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: `3px solid ${done ? '#2E6E6E' : e.color}`, background: done ? 'rgba(62,142,142,0.08)' : 'rgba(15,35,64,0.03)', borderRadius: 5, padding: '2px 5px', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', opacity: calDrag && !dragging ? 0.5 : 1 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: done ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Panel derecho: 2 drop-downs */}
        <div style={{ flex: '0 0 288px', maxWidth: 320, maxHeight: 700, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginBottom: 6 }}>Arrastra una actividad a un día del calendario para agendarla.</div>
          <div style={{ borderBottom: '1px solid rgba(15,35,64,0.08)' }} />
          {grpHeader('Sin fecha', unsched.length, cpSinOpen, () => setCpSinOpen(o => !o))}
          {cpSinOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {unsched.length === 0 ? <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', padding: '2px 2px 8px' }}>Nada sin fecha.</div> : unsched.map(x => pCard(x, false))}
            </div>
          )}
          <div style={{ borderBottom: '1px solid rgba(15,35,64,0.08)' }} />
          {grpHeader('Agendadas', agendadas.length, cpAgOpen, () => setCpAgOpen(o => !o))}
          {cpAgOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agendadas.length === 0 ? <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.4)', padding: '2px 2px 8px' }}>Nada agendado.</div> : agendadas.map(x => pCard(x, true))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%' }}>
      {focus.card}
      <TopBar sourceCount={sourceCount} onNew={openNew} />
      <BirthdayCelebration />

      <div className="ep-shell" style={{ maxWidth: 1360, margin: '0 auto', padding: '22px 18px 60px' }}>
        {/* Aviso de carga fallida: antes el error se tragaba y se veían datos rancios del SSR */}
        {loadError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, borderRadius: 13, padding: '12px 15px', background: 'rgba(176,82,46,0.08)', border: '1px solid rgba(176,82,46,0.32)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#B0522E' }}>{loadError}</span>
            <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)' }}>Lo que ves puede estar desactualizado.</span>
            <button onClick={loadEpics} disabled={loading} style={{ marginLeft: 'auto', cursor: loading ? 'default' : 'pointer', border: '1px solid rgba(176,82,46,0.4)', background: '#fff', color: '#B0522E', borderRadius: 9, padding: '7px 14px', fontSize: 12, fontWeight: 700 }}>
              {loading ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {/* ACCESOS RÁPIDOS — favoritos del home, plegables para no robar espacio */}
        <FavoritosStrip />

        {/* PLAN DE HOY — enfoque del día, lo primero de la página */}
        {renderPlanToday()}

        {/* BACKLOG — justo después del enfoque de hoy */}
        {renderBacklog()}

        {/* OVERVIEW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
          {overview.map((t, i) => (
            <div key={i} className="glass" style={{ borderRadius: 15, padding: '15px 17px' }}>
              <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
                <span className="serif" style={{ fontWeight: 600, fontSize: 34, lineHeight: .9, color: '#10233F' }}>{t.value}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.hintColor }}>{t.hint}</span>
              </div>
            </div>
          ))}
        </div>

        {/* PRÓXIMOS VENCIMIENTOS */}
        {vencimientos.length > 0 && (
          <div className="glass" style={{ borderRadius: 16, padding: '15px 17px', marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Próximos vencimientos</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {([['#B0522E', 'Vencida'], ['#C2410C', 'Esta semana'], ['#A87A2C', '≤3 sem'], ['#6F7F3E', 'Este mes'], ['#2E6E6E', 'Al día']] as const).map(([c, l]) => (
                  <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(20,35,61,0.5)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {vencimientos.slice(0, 8).map((v, i) => {
                const dt = dueTone(v.due, false)
                return (
                  <div key={i} {...clickable(() => setFeaturedId(v.id), `${v.epica}: ${v.task}`)} className="ep-venc-row" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 2px', borderBottom: '1px solid rgba(15,35,64,0.06)', cursor: 'pointer', fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, flexShrink: 0, background: dt.c }} />
                    <span className="ep-venc-epica" style={{ width: 150, flexShrink: 0, fontWeight: 600, color: '#16365F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.epica}</span>
                    <span className="ep-venc-task" style={{ flex: 1, minWidth: 0, color: 'rgba(20,35,61,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.task}</span>
                    <span className="ep-venc-date" style={{ flexShrink: 0, fontWeight: 700, color: dt.c }}>{v.dl < 0 ? `Vencida · ${fmtDue(v.due)}` : v.dl === 0 ? 'Hoy' : `En ${v.dl} d · ${fmtDue(v.due)}`}</span>
                  </div>
                )
              })}
            </div>
            {vencimientos.length > 8 && (
              // Antes era un texto muerto: ahora lleva al backlog ordenado por entrega.
              <button
                onClick={() => {
                  setBacklogOpen(true); setBacklogSort({ key: 'due', dir: 'asc' })
                  setBacklogFEpica('todas'); setBacklogFStatus('todas'); setBacklogFPrio('todas'); setBacklogQ('')
                  requestAnimationFrame(() => document.getElementById('backlog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                }}
                style={{ marginTop: 9, cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, fontSize: 12, fontWeight: 700, color: '#A87A2C', textDecoration: 'underline' }}>
                Ver las {vencimientos.length - 8} restantes en el backlog →
              </button>
            )}
          </div>
        )}

        {/* SELECTOR DE ÉPICA — elige el frente a ver (justo arriba de la destacada) */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Elige una épica</div>
            <button onClick={openNew} style={{ cursor: 'pointer', border: '1px dashed rgba(15,35,64,0.22)', background: 'transparent', borderRadius: 10, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>+ Nueva épica</button>
          </div>

          {/* FILTRO GLOBAL POR FECHA — filtra TODAS las épicas por día o semana (por fecha "Hacer") */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', margin: '0 0 12px' }}>
            <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.42)' }}>📅 Ver</span>
            {(() => {
              const m0 = mondayISO(today)
              const chip = (label: string, active: boolean, onClick: () => void) => (
                <button onClick={onClick} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: active ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: active ? '#10233F' : '#fff', color: active ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}</button>
              )
              return (
                <>
                  {chip('Todas', !epicDay, () => setEpicDay(''))}
                  {chip('Hoy', epicDay === today && epicSpan === 'dia', () => { setEpicDay(today); setEpicSpan('dia') })}
                  {chip('Mañana', epicDay === addDays(today, 1) && epicSpan === 'dia', () => { setEpicDay(addDays(today, 1)); setEpicSpan('dia') })}
                  {chip('Esta semana', !!epicDay && epicSpan === 'semana' && mondayISO(epicDay) === m0, () => { setEpicDay(today); setEpicSpan('semana') })}
                  {chip('Próxima semana', !!epicDay && epicSpan === 'semana' && mondayISO(epicDay) === addDays(m0, 7), () => { setEpicDay(addDays(today, 7)); setEpicSpan('semana') })}
                  <input type="date" value={epicDay} onChange={e => setEpicDay(e.target.value)} title="Elegir un día"
                    style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 7px', fontSize: 11.5, fontWeight: 600, color: epicDay ? '#A87A2C' : 'rgba(20,35,61,0.5)', background: '#fff', outline: 'none' }} />
                  {epicDay && (
                    <span role="group" aria-label="Alcance" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
                      {(['dia', 'semana'] as const).map(s => (
                        <button key={s} onClick={() => setEpicSpan(s)} style={{ cursor: 'pointer', border: 'none', borderRadius: 6, padding: '4px 9px', font: '700 10.5px var(--font-ui)', background: epicSpan === s ? '#C2933A' : 'transparent', color: epicSpan === s ? '#fff' : 'rgba(20,35,61,0.55)' }}>{s === 'dia' ? 'Día' : 'Semana'}</button>
                      ))}
                    </span>
                  )}
                  {epicDay && (() => {
                    const total = activeEpics.reduce((n, e) => n + scopedPend(e), 0)
                    const lbl = epicSpan === 'semana' ? weekRangeLabel(mondayISO(epicDay)) : cap(new Date(epicDay + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))
                    return <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A87A2C' }}>{lbl} · {total} {total === 1 ? 'tarea' : 'tareas'}</span>
                  })()}
                  {epicDay && <button onClick={() => setEpicDay('')} title="Quitar filtro" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 12, fontWeight: 800 }}>✕</button>}
                </>
              )
            })()}
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {visibleEpics.map(e => {
              const on = !!featured && e.id === featured.id
              const pend = epicDay ? scopedPend(e) : pendCount(e)   // conteo dentro del alcance cuando el filtro está activo
              return (
                <button key={e.id} onClick={() => setFeaturedId(e.id)} title={epicDay ? `${e.name} · ${pend} en el rango` : e.name} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: on ? `1.5px solid ${e.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? '#fff' : 'rgba(255,255,255,0.55)', color: on ? '#10233F' : 'rgba(20,35,61,0.6)', boxShadow: on ? '0 6px 16px -10px rgba(15,35,64,0.5)' : 'none', opacity: epicDay && pend === 0 && !on ? 0.45 : 1 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  {e.name}
                  {pend > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: on ? e.color : 'rgba(20,35,61,0.4)' }}>{pend}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* DESTACADA */}
        <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.20em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 10 }}>Épica destacada</div>
        <div className="ep-pop" style={{ background: '#fff', border: '1px solid rgba(15,35,64,0.10)', borderRadius: 20, boxShadow: '0 24px 50px -34px rgba(15,35,64,0.5)', overflow: 'hidden', marginBottom: 34 }}>
          <div style={{ height: 4, background: featured.color }} />
          {editing && editInline && editing.id === featured.id ? renderEditor(true) : (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {/* LEFT */}
            <div className="ep-featured-panel" style={{ flex: '1 1 360px', minWidth: 300, padding: '26px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ height: 11, width: 11, borderRadius: 99, background: featured.color }} />
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Épica</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: fSt.bg, color: fSt.color }}>{featured.status}</span>
                {featured.categoria && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.6)' }}>{featured.categoria}</span>}
                {featured.archived && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.5)' }}>Archivada</span>}
                <button onClick={() => openEdit(featured.id, true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}><PencilIcon /> Editar</button>
                <button onClick={() => toggleArchive(featured)} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.55)', borderRadius: 9, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>{featured.archived ? 'Desarchivar' : 'Archivar'}</button>
              </div>
              <h1 className="serif ep-featured-title" style={{ fontWeight: 600, fontSize: 46, lineHeight: 1, margin: '0 0 8px', color: '#10233F' }}>{featured.name}</h1>
              {featured.description && <div className="ep-note" style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(20,35,61,0.6)', margin: '0 0 22px', maxWidth: 440 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(featured.description) }} />}

              {/* Presupuesto semanal de horas: invertido esta semana (bitácora) vs meta editable. */}
              {(() => {
                const goalH = budgetOf(featured)
                const invMin = investedThisWeek(featured)
                const invH = invMin / 60
                const pct = goalH > 0 ? Math.min(100, (invH / goalH) * 100) : 0
                const over = goalH > 0 && invH > goalH
                const hmm = (m: number) => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m}m`
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 20px', padding: '11px 14px', borderRadius: 13, background: '#FBFAF6', border: '1px solid rgba(15,35,64,0.08)', maxWidth: 440 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 }}>
                      <span style={{ font: '700 9.5px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)' }}>Esta semana</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: over ? '#B0522E' : '#16365F' }}>{hmm(invMin)}{goalH > 0 ? <span style={{ color: 'rgba(20,35,61,0.5)', fontWeight: 600 }}> de {goalH}h</span> : ''}</span>
                      {goalH > 0 && <span style={{ height: 6, borderRadius: 99, background: 'rgba(15,35,64,0.1)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.max(3, pct)}%`, height: '100%', background: over ? '#B0522E' : featured.color }} /></span>}
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(20,35,61,0.55)' }}>Meta h/sem
                      <input type="number" min={0} max={80} value={goalH || ''} placeholder="—" onChange={ev => setEpicBudget(featured.id, Math.max(0, Number(ev.target.value) || 0))} style={{ width: 56, border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontWeight: 700, color: '#16365F', outline: 'none' }} />
                    </label>
                  </div>
                )
              })()}

              {featured.kpis.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 11, marginBottom: 22 }}>
                  {featured.kpis.map((k, i) => {
                    const { cur, target, pct, hasMeta } = milestoneProgress(k, featured)
                    const hecho = milestoneDone(k, featured)
                    const vencido = !hecho && k.due && k.due < today
                    const c = hecho ? '#2E6E6E' : vencido ? '#B0522E' : '#A87A2C'
                    return (
                      <div key={k.id || i} title={k.auto ? 'Se mide con las tareas cerradas de la épica' : undefined}
                        style={{ borderRadius: 12, padding: '11px 13px', background: hecho ? 'rgba(62,142,142,0.08)' : 'rgba(15,35,64,0.02)', border: hecho ? '1px solid rgba(62,142,142,0.38)' : '1px solid rgba(15,35,64,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                          <span style={{ font: '700 11.5px var(--font-ui)', color: hecho ? '#2E6E6E' : '#16365F', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.t}</span>
                          {hecho && <span style={{ font: '700 9.5px var(--font-ui)', color: '#2E6E6E', background: 'rgba(62,142,142,0.16)', borderRadius: 99, padding: '2px 8px', whiteSpace: 'nowrap' }}>✦ Cumplido</span>}
                          {!hecho && k.auto && <span style={{ font: '700 9px var(--font-ui)', color: 'rgba(20,35,61,0.45)' }}>auto</span>}
                        </div>
                        {hasMeta ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                              {/* Avance editable al vuelo (los medidos con tareas se calculan solos) */}
                              {k.auto ? (
                                <span className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1, color: '#10233F' }}>{cur}</span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  <button onClick={() => setMilestoneCurrent(featured, i, (k.current ?? 0) - 1)} aria-label="Bajar avance" title="−1"
                                    style={{ height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 13, lineHeight: 1 }}>−</button>
                                  <input type="number" defaultValue={cur} key={`${k.id}-${cur}`}
                                    onBlur={ev => { const v = Number(ev.target.value); if (v !== cur) setMilestoneCurrent(featured, i, v) }}
                                    onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                                    aria-label={`Avance de ${k.t}`}
                                    className="serif" style={{ width: 62, textAlign: 'center', fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F', border: '1px solid transparent', borderRadius: 7, padding: '2px 4px', background: 'transparent', outline: 'none' }} />
                                  <button onClick={() => setMilestoneCurrent(featured, i, (k.current ?? 0) + 1)} aria-label="Subir avance" title="+1"
                                    style={{ height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.6)', fontSize: 13, lineHeight: 1 }}>+</button>
                                </span>
                              )}
                              <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.5)' }}>/ {target}{k.unit ? ' ' + k.unit : ''}</span>
                              <span style={{ flex: 1 }} />
                              <span style={{ font: '800 11px var(--font-ui)', color: c }}>{Math.round(pct * 100)}%</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct * 100}%`, height: '100%', background: hecho ? '#2E6E6E' : featured.color, transition: 'width .4s' }} />
                            </div>
                          </>
                        ) : (
                          <div className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1, color: '#10233F' }}>{cur || '—'}{k.unit ? <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.5)' }}> {k.unit}</span> : null}</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          {k.due && <span style={{ fontSize: 10.5, fontWeight: 600, color: vencido ? '#B0522E' : 'rgba(20,35,61,0.5)' }}>{hecho ? '✓ logrado' : vencido ? 'Vencido · ' : 'Para '}{!hecho && fmtDue(k.due)}</span>}
                          <button onClick={() => setMilestonePick({ eId: featured.id, mId: k.id })}
                            title="Elegir qué tareas cuentan para este objetivo"
                            style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, fontSize: 10.5, fontWeight: 700, color: (k.taskIds?.length ?? 0) > 0 ? 'rgba(20,35,61,0.55)' : '#A87A2C', textDecoration: 'underline' }}>
                            🔗 {(k.taskIds?.length ?? 0) > 0 ? `${k.taskIds!.length} tareas` : 'Ligar tareas'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {fStateCounts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                  {fStateCounts.map(({ s, n }) => {
                    const ts = taskStyle(s)
                    return <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, padding: '5px 10px', background: ts.bg, color: ts.c, fontSize: 11.5, fontWeight: 600 }}><span style={{ height: 6, width: 6, borderRadius: 99, background: ts.c }} />{ts.label} <b>{n}</b></span>
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{fDone} / {fTotal} tareas terminadas</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#10233F' }}>{fPct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden', marginBottom: 22 }}>
                <div style={{ width: `${fPct}%`, height: '100%', background: featured.color, transition: 'width .4s' }} />
              </div>

              {featured.source_table && (
                <div style={{ border: '1px solid rgba(62,142,142,0.28)', background: 'rgba(62,142,142,0.06)', borderRadius: 12, padding: '11px 13px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ep-live" style={{ height: 8, width: 8, borderRadius: 99, background: '#3E8E8E' }} />
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.16em', textTransform: 'uppercase', color: '#2E6E6E' }}>Fuente de datos</span>
                    {featured.source_sync && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>sync {featured.source_sync}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                    <DbIcon stroke="#2E6E6E" />
                    <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12.5, fontWeight: 600, color: '#16365F' }}>{featured.source_table}</span>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>· {featured.links.length} conexiones</span>
                  </div>
                </div>
              )}

              <a href={safeUrl(primaryDash(featured))} target={safeUrl(primaryDash(featured)).startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ ...goldBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, fontSize: 13.5 }}>
                Abrir dashboard <ArrowIcon />
              </a>
              {featured.links.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
                  {featured.links.map((ln, i) => {
                    const c = typeColor(ln.type); const u = safeUrl(ln.url)
                    return (
                      <a key={i} href={u} target={u.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${c}55`, borderRadius: 99, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, color: '#14233D' }}>
                        <span style={{ height: 6, width: 6, borderRadius: 99, background: c }} />{ln.l || ln.type}
                        {ln.primary && <span style={{ color: '#C2933A', fontSize: 11 }}>★</span>}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>

            {/* RIGHT */}
            <div className="ep-featured-panel ep-featured-right" style={{ flex: '1 1 360px', minWidth: 300, padding: '24px 26px', background: '#FBFAF6', borderLeft: '1px solid rgba(15,35,64,0.08)' }}>
              {featured.routines.length > 0 && (() => {
                const curMon = mondayISO(todayISO())
                const isCurWeek = routineWeek === curMon
                const todayIdx = isCurWeek ? (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7 : -1
                const weekArrow: CSSProperties = { cursor: 'pointer', height: 32, width: 32, borderRadius: 8, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: '#10233F', fontSize: 15, lineHeight: 1 }
                return (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
                    <RefreshIcon stroke="rgba(15,35,64,0.42)" />
                    <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Rutinas diarias</span>
                    <span style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <button onClick={() => setRoutineWeek(w => addDays(w, -7))} aria-label="Semana anterior" title="Semana anterior" style={weekArrow}>‹</button>
                      <button onClick={() => setRoutineWeek(curMon)} title={isCurWeek ? 'Semana actual' : 'Volver a esta semana'} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 11px', font: '700 11px var(--font-ui)', whiteSpace: 'nowrap', border: isCurWeek ? '1px solid rgba(194,147,58,0.5)' : '1px solid rgba(15,35,64,0.12)', background: isCurWeek ? 'rgba(194,147,58,0.10)' : '#fff', color: isCurWeek ? '#A87A2C' : 'rgba(20,35,61,0.6)' }}>{isCurWeek ? 'Esta semana' : weekRangeLabel(routineWeek)}</button>
                      <button onClick={() => setRoutineWeek(w => addDays(w, 7))} aria-label="Semana siguiente" title="Semana siguiente" style={weekArrow}>›</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {featured.routines.map((r, ri) => {
                      const wk = getRoutineWeek(r, routineWeek)
                      const n = wk.filter(Boolean).length
                      const cc = n >= 5 ? '#2E6E6E' : n >= 3 ? '#A87A2C' : 'rgba(20,35,61,0.4)'
                      return (
                        <div key={ri} className="glass" style={{ borderRadius: 12, padding: '11px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <button onClick={() => setRoutineStat({ eId: featured.id, ri })} aria-label="Ver estadísticas de la rutina" title="Ver estadísticas de la rutina" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(20,35,61,0.35)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
                            </button>
                            <span style={{ fontSize: 11, fontWeight: 800, color: cc, flexShrink: 0 }}>{n}/7</span>
                          </div>
                          <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
                            {wk.map((on, di) => (
                              <button key={di} onClick={() => toggleRoutineDay(featured, ri, di)} title={`${DAYNAMES[di]} ${dayNum(addDays(routineWeek, di))}`} style={{ flex: 1, height: 34, borderRadius: 7, border: di === todayIdx ? '1.5px solid rgba(194,147,58,0.7)' : '1px solid transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: on ? featured.color : 'rgba(15,35,64,0.06)', color: on ? '#fff' : 'rgba(20,35,61,0.4)' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>{DAYS[di]}</span>
                                <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, opacity: on ? 0.85 : 0.6 }}>{dayNum(addDays(routineWeek, di))}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })()}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>Tareas</span>
                <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.55)' }}>{pendCount(featured)} activas · {fDone} terminadas</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => openTaskEdit(featured.id, null)} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700 }}>+ Tarea</button>
              </div>

              {pendCount(featured) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
                  <select value={epicSort} onChange={e => setEpicSort(e.target.value as typeof epicSort)} title="Ordenar tareas" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none' }}>
                    <option value="grupo">Por estado</option>
                    <option value="manual">Orden manual</option>
                    <option value="prioridad">Prioridad</option>
                    <option value="entrega">Entrega</option>
                    <option value="hacer">Cuándo hacer</option>
                    <option value="progreso">Avance</option>
                    <option value="nombre">Nombre</option>
                  </select>
                  {([['todas', 'Todas'], ['planeadas', 'Planeadas'], ['sinplan', 'Sin plan'], ['vencidas', 'Vencidas'], ['alta', 'Alta'], ['estancada', '🐌 Estancadas'], ['multidia', '⧗ Varios días'], ['arrastre', '⏳ Anteriores']] as [typeof epicFilter, string][]).map(([k, label]) => {
                    const on = epicFilter === k
                    return <button key={k} onClick={() => setEpicFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.55)' }}>{label}</button>
                  })}
                  {/* (El filtro por día/semana ahora es GLOBAL: vive arriba, sobre "Elige una épica") */}
                  {/* Filtro por objetivo — sólo lista objetivos con tareas bajo el chip activo (cascada) */}
                  {(objOptions.length > 0 || (epicObjFilter !== 'todas')) && (
                    <select value={objOptions.some(m => m.id === epicObjFilter) || epicObjFilter === 'sin' ? epicObjFilter : 'todas'} onChange={e => setEpicObjFilter(e.target.value)}
                      title="Filtrar por objetivo" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 600, color: epicObjFilter !== 'todas' ? '#10233F' : 'rgba(20,35,61,0.6)', background: '#fff', outline: 'none', maxWidth: 180 }}>
                      <option value="todas">Todo objetivo</option>
                      {objOptions.map(m => <option key={m.id} value={m.id}>🎯 {m.t}</option>)}
                      {hasSinObj && <option value="sin">Sin objetivo</option>}
                    </select>
                  )}
                </div>
              )}

              {(() => {
                const CAP = 5
                const collapsed = totalActiveShown > CAP && !tasksExpanded
                const toggleBtn = totalActiveShown > CAP ? (
                  <button onClick={() => setTasksExpanded(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'rgba(20,35,61,0.55)', marginBottom: 6 }}>
                    {collapsed ? `Ver ${totalActiveShown - CAP} tareas más` : 'Ver menos'}
                    <span style={{ fontSize: 12, transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform .15s' }}>▾</span>
                  </button>
                ) : null
                const emptyMsg = totalActiveShown === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.55)', padding: '4px 0 8px' }}>{pendCount(featured) === 0 && doneItems.length === 0 ? 'Sin tareas aún. Usa “+ Tarea”.' : 'Ninguna tarea activa coincide con el filtro.'}</div>
                ) : null
                if (epicSort === 'grupo') {
                  let budget = collapsed ? CAP : Infinity
                  return (
                    <>
                      {filteredGroups.map(g => {
                        if (budget <= 0) return null
                        const show = g.items.slice(0, budget)
                        budget -= show.length
                        return (
                          <div key={g.key} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                              <span style={{ height: 7, width: 7, borderRadius: 99, background: g.color }} />
                              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: g.color, textTransform: 'uppercase' }}>{g.label}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)' }}>{g.items.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>{show.map(t => renderTaskRow(t))}</div>
                          </div>
                        )
                      })}
                      {emptyMsg}{toggleBtn}
                    </>
                  )
                }
                const show = collapsed ? flatActive.slice(0, CAP) : flatActive
                const dragEnabled = epicSort === 'manual' && flatActive.length > 1 && !collapsed
                const insLine2 = <div style={{ height: 2, background: '#C2933A', borderRadius: 99, margin: '2px 0' }} />
                return (
                  <>
                    {dragEnabled && flatActive.length > 1 && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)', marginBottom: 6 }}>Arrastra la manija para reordenar.</div>}
                    <div ref={epicListRef} style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>
                      {show.map((t, pos) => (
                        <div key={t._i}>
                          {dragEnabled && epicDrag && epicDropTo === pos && insLine2}
                          {renderTaskRow(t, dragEnabled ? { ordered: show } : undefined)}
                        </div>
                      ))}
                      {dragEnabled && epicDrag && epicDropTo === show.length && insLine2}
                    </div>
                    {emptyMsg}{toggleBtn}
                  </>
                )
              })()}

              {/* TERMINADAS — colapsable, por mes */}
              {doneItems.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={() => setShowDone(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.08)', background: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#2E6E6E', textTransform: 'uppercase' }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: '#2E6E6E' }} />
                    Terminadas <span style={{ color: 'rgba(20,35,61,0.55)' }}>{doneItems.length}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: showDone ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                  </button>
                  {showDone && (
                    <div style={{ marginTop: 8 }}>
                      {doneMonths.map(mg => (
                        <div key={mg.label} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(20,35,61,0.55)', margin: '4px 0 2px' }}>{mg.label} · {mg.items.length}</div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {mg.items.map(t => renderTaskRow(t))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ARCHIVADAS — colapsable: las tareas archivadas de esta épica siguen visibles aquí */}
              {archivedItems.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={() => setShowArchivedEpic(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.08)', background: '#fff', borderRadius: 10, padding: '9px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(20,35,61,0.55)', textTransform: 'uppercase' }}>
                    <span style={{ height: 7, width: 7, borderRadius: 99, background: 'rgba(20,35,61,0.4)' }} />
                    🗄 Archivadas <span style={{ color: 'rgba(20,35,61,0.5)' }}>{archivedItems.length}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', transform: showArchivedEpic ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                  </button>
                  {showArchivedEpic && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
                      {archivedItems.map(t => renderTaskRow(t))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* LISTA */}
        {/* filtros: estado (activas/archivadas) + categoría */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', background: 'rgba(15,35,64,0.05)', borderRadius: 11, padding: 3 }}>
            {([['activas', 'Activas', activeEpics.length], ['archivadas', 'Archivadas', archivedCount], ['todas', 'Todas', epics.length]] as const).map(([k, label, n]) => (
              <button key={k} onClick={() => setEstadoFilter(k)} style={{ border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, background: estadoFilter === k ? '#fff' : 'transparent', color: estadoFilter === k ? '#10233F' : 'rgba(20,35,61,0.5)', boxShadow: estadoFilter === k ? '0 1px 2px rgba(15,35,64,0.1)' : 'none' }}>{label} <span style={{ opacity: .55, fontWeight: 500 }}>{n}</span></button>
            ))}
          </div>
          {Object.keys(categorias).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
              {([['todas', 'Todas']] as [string, string][]).concat(Object.keys(categorias).sort().map(c => [c, c] as [string, string])).map(([k, label]) => {
                const on = catFilter === k; const n = k === 'todas' ? null : categorias[k]
                return <button key={k} onClick={() => setCatFilter(k)} style={{ cursor: 'pointer', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}{n != null ? ' · ' + n : ''}</button>
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 14, color: '#B58B35' }}>{rest.length}</span>
          <h2 style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', margin: 0 }}>Todas las épicas</h2>
          {/* Calibración de estimados: cuánto sueles tardar vs lo estimado, por dificultad. */}
          {calibration.totalN >= 3 && (() => {
            const parts = ([['dificil', 'D'], ['media', 'M'], ['facil', 'F']] as const).filter(([d]) => calibration.n(d) >= 1 && calibration.factor(d) > 0)
            if (!parts.length) return null
            return (
              <span title="Real ÷ estimado sobre tus tareas terminadas. >1 = sueles tardar más." style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '3px 10px', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.28)' }}>
                <span style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#A87A2C' }}>Calibración</span>
                {parts.map(([d, lbl]) => { const f = calibration.factor(d); return <span key={d} style={{ fontSize: 10.5, fontWeight: 800, color: f > 1.15 ? '#B0522E' : f < 0.85 ? '#2E6E6E' : 'rgba(20,35,61,0.6)' }}>{lbl} {Math.round(f * 10) / 10}×</span> })}
              </span>
            )
          })()}
          {objetivosAll.length > 0 && <button onClick={() => setObjsOpen(true)} title="Objetivos de todas las épicas ordenados por riesgo" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F', borderRadius: 9, padding: '6px 12px', font: '700 11.5px var(--font-ui)', whiteSpace: 'nowrap' }}>🎯 Objetivos{objetivosAll.some(o => o.days != null && o.days < 0) ? <span style={{ color: '#B0522E' }}> ●</span> : ''}</button>}
          <button onClick={() => setWeekCloseOpen(true)} title="Cerrar la semana: resumen y mover el arrastre a la próxima" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F', borderRadius: 9, padding: '6px 12px', font: '700 11.5px var(--font-ui)', whiteSpace: 'nowrap' }}>🗓 Cerrar semana</button>
          {sinFechaTasks.length > 0 && <button onClick={() => setTriageOpen(true)} title="Tareas sin fecha (para no dejarlas pudrirse)" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F', borderRadius: 9, padding: '6px 12px', font: '700 11.5px var(--font-ui)', whiteSpace: 'nowrap' }}>📥 Sin fecha {sinFechaTasks.length}</button>}
          <button onClick={() => setDiaryOpen(true)} title="Diario de trabajo: tus notas de avance y comentarios en orden" style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F', borderRadius: 9, padding: '6px 12px', font: '700 11.5px var(--font-ui)', whiteSpace: 'nowrap' }}>📖 Diario</button>
          <span style={{ height: 1, flex: 1, minWidth: 40, background: 'rgba(15,35,64,0.09)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Vista Lista | Tabla de las épicas */}
            <div role="group" aria-label="Vista de épicas" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9, background: 'rgba(15,35,64,0.05)', border: '1px solid rgba(15,35,64,0.08)' }}>
              {([['lista', 'Lista'], ['tabla', 'Tabla']] as const).map(([v, label]) => {
                const onv = epicView === v
                return <button key={v} aria-pressed={onv} onClick={() => setEpicView(v)} style={{ cursor: 'pointer', border: 'none', borderRadius: 7, padding: '5px 11px', font: '700 11px var(--font-ui)', background: onv ? '#10233F' : 'transparent', color: onv ? '#F3EFE6' : 'rgba(20,35,61,0.55)' }}>{label}</button>
              })}
            </div>
            {epicView === 'lista' && <>
              <span style={{ width: 1, height: 14, background: 'rgba(15,35,64,0.12)' }} />
              {(['Pendientes', 'Progreso', 'Nombre'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: sortBy === s ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>{s}</button>
              ))}
              <span style={{ width: 1, height: 14, background: 'rgba(15,35,64,0.12)' }} />
              <button onClick={() => setCompact(v => !v)} aria-label="Compacto" title="Compacto" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: compact ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>Compacto</button>
              <button onClick={() => setShowRowKpi(v => !v)} aria-label="Mostrar KPI" title="Mostrar KPI" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700, color: showRowKpi ? '#A87A2C' : 'rgba(20,35,61,0.4)' }}>KPI</button>
            </>}
          </div>
        </div>

        {epicView === 'tabla' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderEpicTable(visibleEpics)}
            <button onClick={openNew} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1.5px dashed rgba(15,35,64,0.18)', background: 'transparent', borderRadius: 12, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}><span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nueva épica</button>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
          {rest.map(e => {
            const st = statusStyle(e.status); const pct = pctOf(e); const pend = epicDay ? scopedPend(e) : pendCount(e)
            const k0 = e.kpis[0]
            // Salud: días sin tocar el frente + horas de la semana vs presupuesto.
            const lastDays = daysSinceISO(epicLastActivity(e))
            const stale = pend > 0 && e.status !== 'En pausa' && (lastDays == null || lastDays >= 10)
            const weekMin = investedThisWeek(e); const budgetH = budgetOf(e)
            const wk = (m: number) => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m}m`
            return (
              <div key={e.id} {...clickable(() => setFeaturedId(e.id), `Ver épica ${e.name}`)} className="glass glass-hover ep-row" style={{ display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, padding: compact ? '11px 16px' : '15px 18px', cursor: 'pointer' }}>
                <span className="ep-row-bar" style={{ width: 4, alignSelf: 'stretch', borderRadius: 99, background: e.color, flexShrink: 0 }} />
                <div className="ep-row-name" style={{ flex: '0 0 210px', minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="serif" style={{ fontWeight: 600, fontSize: 18, color: '#10233F', lineHeight: 1 }}>{e.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{e.status}</span>
                    {e.categoria && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.55)' }}>{e.categoria}</span>}
                    {e.archived && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(20,35,61,0.08)', color: 'rgba(20,35,61,0.5)' }}>Archivada</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)' }}>{pend > 0 ? `${pend} ${epicDay ? 'en el rango' : 'tareas activas'}` : (epicDay ? 'nada en el rango' : 'Al corriente')}</span>
                    {stale && <span title={lastDays == null ? 'Sin actividad registrada' : `Último avance hace ${lastDays} días`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#B0522E', background: 'rgba(176,82,46,0.10)', border: '1px solid rgba(176,82,46,0.35)', borderRadius: 99, padding: '1px 8px' }}>🕸 {lastDays == null ? 'sin tocar' : `${lastDays}d sin tocar`}</span>}
                    {weekMin > 0 && <span title={`Invertido esta semana${budgetH > 0 ? ` · meta ${budgetH}h` : ''}`} style={{ fontSize: 10, fontWeight: 700, color: (budgetH > 0 && weekMin >= budgetH * 60) ? '#2E6E6E' : 'rgba(20,35,61,0.5)' }}>⏱ {wk(weekMin)}{budgetH > 0 ? `/${budgetH}h` : ''}</span>}
                    {e.routines.length > 0 && <span style={{ fontSize: 10.5, color: '#2E6E6E', fontWeight: 600 }}>↻ {e.routines.length} rutinas</span>}
                    {e.source_table && <><span style={{ height: 5, width: 5, borderRadius: 99, background: '#3E8E8E' }} /><span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 10.5, color: 'rgba(20,35,61,0.55)' }}>{e.source_table}</span></>}
                  </div>
                </div>

                {showRowKpi && k0 && (() => {
                  const mp = milestoneProgress(k0, e); const hecho = milestoneDone(k0, e)
                  return (
                    <div className="ep-row-kpi" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 96, maxWidth: 150 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span className="serif" style={{ fontWeight: 600, fontSize: 20, color: hecho ? '#2E6E6E' : '#10233F', lineHeight: 1 }}>{mp.hasMeta ? `${mp.cur}/${mp.target}` : (mp.cur || '—')}</span>
                        {hecho && <span style={{ font: '700 9px var(--font-ui)', color: '#2E6E6E' }}>✦</span>}
                      </span>
                      <span style={{ font: '600 10px/1.2 var(--font-ui)', letterSpacing: '.04em', color: 'rgba(15,35,61,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k0.t}</span>
                      {mp.hasMeta && (
                        <span style={{ height: 4, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${mp.pct * 100}%`, height: '100%', background: hecho ? '#2E6E6E' : e.color }} />
                        </span>
                      )}
                    </div>
                  )
                })()}

                <div className="ep-row-progress" style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{doneCount(e)} / {taskCount(e)}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#10233F' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: e.color, transition: 'width .4s' }} />
                  </div>
                </div>

                <button onClick={ev => { ev.stopPropagation(); openEdit(e.id) }} aria-label="Editar" title="Editar" className="ep-row-edit" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.10)', background: '#fff', borderRadius: 10, color: 'rgba(20,35,61,0.5)' }}><PencilIcon /></button>
                <span className="ep-row-arrow" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, width: 34, borderRadius: 10, background: 'rgba(194,147,58,0.12)', color: '#A87A2C' }}><ArrowIcon /></span>
              </div>
            )
          })}

          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', border: '1.5px dashed rgba(15,35,64,0.18)', background: 'transparent', borderRadius: 14, padding: 16, fontSize: 13, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nueva épica
          </button>
        </div>
        )}
      </div>

      {editing && !editInline && renderEditor()}

      {pickerOpen && renderPicker()}

      {movePick && (() => {
        const found = findTask(movePick.eId, movePick.tid)
        const cur = found?.t.plan || viewDate
        return (
          <div onClick={() => setMovePick(null)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
            <div data-pop onClick={e => e.stopPropagation()}>
              {renderMonthPopover(cur, iso => { if (found) planTaskToDay(found.e, found.i, iso, { toast: true }); setMovePick(null) })}
            </div>
          </div>
        )
      })()}

      {/* Elegir qué tareas cuentan para un objetivo */}
      {milestonePick && (() => {
        const e = epics.find(x => x.id === milestonePick.eId)
        const m = e?.kpis.find(x => x.id === milestonePick.mId)
        if (!e || !m) return null
        const ligadas = new Set(m.taskIds || [])
        const otros = (id: string) => e.kpis.some(o => o.id !== m.id && (o.taskIds || []).includes(id))
        return (
          <div onClick={() => setMilestonePick(null)} style={{ position: 'fixed', inset: 0, zIndex: 77, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Ligar tareas al objetivo" onClick={ev => ev.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: e.color }} />
              <div style={{ padding: '18px 24px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 5 }}>Tareas del objetivo</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1.05, color: '#10233F' }}>{m.t}</div>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setMilestonePick(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.55)', marginBottom: 12 }}>
                  Marca las tareas que cuentan para este objetivo. Si además lo pones en “medir con tareas cerradas”, el avance saldrá de estas.
                </div>
                <div style={{ maxHeight: '46vh', overflowY: 'auto' }}>
                  {(e.tasks || []).filter(t => t.status !== ARCHIVED).map(t => {
                    const on = ligadas.has(t.id!)
                    const enOtro = !on && otros(t.id!)
                    return (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 2px', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer', opacity: enOtro ? 0.55 : 1 }}>
                        <input type="checkbox" checked={on} onChange={() => setTaskMilestone(e, t.id!, on ? null : m.id)} style={{ cursor: 'pointer' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.status === 'Terminada' ? 'rgba(20,35,61,0.5)' : '#16365F', textDecoration: t.status === 'Terminada' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</span>
                        <span style={{ flexShrink: 0, font: '700 10px var(--font-ui)', color: taskStyle(t.status).c, background: taskStyle(t.status).bg, borderRadius: 99, padding: '2px 8px' }}>{taskStyle(t.status).label}</span>
                        {enOtro && <span title="Ya cuenta para otro objetivo" style={{ flexShrink: 0, fontSize: 10, color: '#A87A2C' }}>en otro</span>}
                      </label>
                    )
                  })}
                  {(e.tasks || []).filter(t => t.status !== ARCHIVED).length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(20,35,61,0.5)', padding: '10px 0' }}>Esta épica no tiene tareas.</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => setMilestonePick(null)} style={{ ...goldBtn, padding: '10px 20px' }}>Listo</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Detalle de un día del burndown: qué se cerró y en qué se avanzó */}
      {resumenDay && (() => {
        const d = resumenDay
        type R = { e: Epica; t: EpicaTask; i: number }
        const cerradas: R[] = [], avances: R[] = []
        activeEpics.forEach(e => (e.tasks || []).forEach((t, i) => {
          if (t.status === ARCHIVED) return
          if (t.doneAt === d) cerradas.push({ e, t, i })
          else if ((t.progressLog || []).some(l => l.d === d)) avances.push({ e, t, i })
        }))
        const rutinasHechas = activeEpics.flatMap(e => (e.routines || []).map((r, ri) => ({ e, r, ri })))
          .filter(({ r }) => getRoutineWeek(r, mondayISO(d))[(new Date(d + 'T00:00:00').getDay() + 6) % 7])
        const fila = (x: R, done: boolean) => {
          const nota = (x.t.progressLog || []).find(l => l.d === d)?.note
          return (
            <div key={planKey(x.e.id, x.t)} {...clickable(() => { setResumenDay(null); setTaskView({ eId: x.e.id, tid: x.t.id! }) }, `Ver ${x.t.t}`)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 0', borderBottom: '1px solid rgba(15,35,64,0.05)', cursor: 'pointer' }}>
              <span style={{ flexShrink: 0, marginTop: 2, height: 16, width: 16, borderRadius: 99, background: done ? '#2E6E6E' : 'rgba(194,147,58,0.16)', color: done ? '#fff' : '#A87A2C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                {done ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg> : '✎'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'rgba(20,35,61,0.55)' : '#16365F', textDecoration: done ? 'line-through' : 'none' }}>{x.t.t}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: x.e.color }} />
                  <span style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>{x.e.name}</span>
                  {typeof x.t.progress === 'number' && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{x.t.progress}%</span>}
                </div>
                {nota && <div style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.6)', marginTop: 4, fontStyle: 'italic' }}>{nota}</div>}
              </div>
            </div>
          )
        }
        return (
          <div onClick={() => setResumenDay(null)} style={{ position: 'fixed', inset: 0, zIndex: 74, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Detalle del día" onClick={ev => ev.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#10233F,#C2933A)' }} />
              <div style={{ padding: '18px 24px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: '#A87A2C', marginBottom: 5 }}>{d === today ? 'Hoy' : relLong(d)}</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1.05, color: '#10233F' }}>{dateLabel(d)}</div>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setResumenDay(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                {cerradas.length === 0 && avances.length === 0 && rutinasHechas.length === 0 && (
                  <div style={{ fontSize: 13, color: 'rgba(20,35,61,0.5)', padding: '8px 0' }}>No hay actividad registrada este día.</div>
                )}
                {cerradas.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#2E6E6E', marginBottom: 6 }}>Cerradas · {cerradas.length}</div>
                    {cerradas.map(x => fila(x, true))}
                  </div>
                )}
                {avances.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: '#A87A2C', marginBottom: 6 }}>Con avance · {avances.length}</div>
                    {avances.map(x => fila(x, false))}
                  </div>
                )}
                {rutinasHechas.length > 0 && (
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 6 }}>Rutinas cumplidas · {rutinasHechas.length}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {rutinasHechas.map(({ e, r, ri }) => (
                        <span key={e.id + ':' + ri} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 99, padding: '4px 10px', background: 'rgba(62,142,142,0.10)', border: '1px solid rgba(62,142,142,0.28)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#16365F' }}>{r.t}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Vistazo rápido a una épica, con acceso directo a editarla */}
      {epicPeek && (() => {
        const e = epics.find(x => x.id === epicPeek)
        if (!e) return null
        const pct = pctOf(e), pend = pendCount(e)
        return (
          <div onClick={() => setEpicPeek(null)} style={{ position: 'fixed', inset: 0, zIndex: 76, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label={`Épica ${e.name}`} onClick={ev => ev.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: e.color }} />
              <div style={{ padding: '18px 24px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 25, lineHeight: 1.05, color: '#10233F' }}>{e.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: statusStyle(e.status).bg, color: statusStyle(e.status).color }}>{e.status}</span>
                      {e.categoria && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(15,35,64,0.06)', color: 'rgba(20,35,61,0.55)' }}>{e.categoria}</span>}
                      <span style={{ fontSize: 11.5, color: 'rgba(20,35,61,0.55)' }}>{pend > 0 ? `${pend} activas` : 'Al corriente'}</span>
                    </div>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setEpicPeek(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ margin: '16px 0 6px', display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                  <span style={{ color: 'rgba(20,35,61,0.55)' }}>{doneCount(e)} de {taskCount(e)} tareas</span>
                  <span style={{ fontWeight: 800, color: '#10233F' }}>{pct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: e.color }} />
                </div>

                {e.kpis.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 8 }}>Objetivos</div>
                    {e.kpis.map((k, i) => {
                      const mp = milestoneProgress(k, e); const hecho = milestoneDone(k, e)
                      return (
                        <div key={k.id || i} style={{ marginBottom: 9 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: hecho ? '#2E6E6E' : '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.t}</span>
                            {hecho && <span style={{ font: '700 9.5px var(--font-ui)', color: '#2E6E6E' }}>✦ Cumplido</span>}
                            {mp.hasMeta && <span style={{ font: '700 10.5px var(--font-ui)', color: 'rgba(20,35,61,0.55)' }}>{mp.cur}/{mp.target}{k.unit ? ' ' + k.unit : ''}</span>}
                          </div>
                          {mp.hasMeta && (
                            <div style={{ height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}>
                              <div style={{ width: `${mp.pct * 100}%`, height: '100%', background: hecho ? '#2E6E6E' : e.color }} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                  <button onClick={() => { setEpicPeek(null); setFeaturedId(e.id); setPlanMode('dia') }} style={{ border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: '#16365F', borderRadius: 10, padding: '9px 15px', font: '700 12.5px var(--font-ui)', cursor: 'pointer' }}>Ver épica</button>
                  <button onClick={() => { setEpicPeek(null); openEdit(e.id) }} style={{ ...goldBtn, padding: '9px 16px', font: '700 12.5px var(--font-ui)' }}>Editar épica</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Popup de una subtarea: título, avance, nota y links */}
      {subPop && (() => {
        const found = findTask(subPop.eId, subPop.tid)
        const si = found ? (found.t.subtasks || []).findIndex(x => x.id === subPop.sid) : -1
        if (!found || si < 0) return null
        const { e: ep, i: ti } = found
        const s = found.t.subtasks![si]
        const patch = (p: Partial<EpicaSubtask>) => patchSubtask(ep, ti, subPop.sid, p)
        const eb2: CSSProperties = { font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }
        const links = s.links || []
        const setLink = (li: number, k: 'label' | 'url', v: string) => patch({ links: links.map((l, j) => j === li ? { ...l, [k]: v } : l) })
        return (
          <div onClick={() => setSubPop(null)} style={{ position: 'fixed', inset: 0, zIndex: 79, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Subtarea" onClick={ev => ev.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: s.done ? '#2E6E6E' : ep.color }} />
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <button onClick={() => { toggleSubtask(ep, ti, si) }} aria-label={s.done ? 'Desmarcar' : 'Marcar hecha'} title={s.done ? 'Desmarcar' : 'Marcar hecha'}
                    style={{ flexShrink: 0, height: 24, width: 24, borderRadius: 6, cursor: 'pointer', background: s.done ? '#2E6E6E' : '#fff', border: s.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '700 9px/1 var(--font-ui)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 3 }}>Subtarea de {found.t.t}</div>
                    <input defaultValue={s.t} key={s.id + s.t} onBlur={ev => patch({ t: ev.target.value.trim() || s.t })} onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.12)', borderRadius: 9, padding: '8px 10px', fontSize: 16, fontWeight: 600, color: '#10233F', outline: 'none' }} />
                  </div>
                  <button aria-label="Cerrar" onClick={() => setSubPop(null)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                {/* Avance — commit al soltar (evita red por cada escalón) */}
                <ProgressSlider value={s.progress ?? 0} color={ep.color} labelStyle={eb2}
                  onCommit={v => patch({ progress: v || undefined })} onHundred={() => patch({ progress: 100, done: true })} />

                {/* Prioridad · Dificultad · Día (como en las tareas) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ ...eb2, marginBottom: 6 }}>Prioridad</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['alta', 'media', 'baja'] as Prio[]).map(p => {
                        const on = s.priority === p; const ps = prioStyle(p)
                        return <button key={p} onClick={() => patch({ priority: on ? undefined : p })} title={ps.label} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', fontSize: 11, fontWeight: 700, border: on ? `1px solid ${ps.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? 'rgba(194,147,58,0.08)' : '#fff', color: on ? ps.c : 'rgba(20,35,61,0.55)' }}><PrioBars p={p} size={11} />{ps.label}</button>
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ ...eb2, marginBottom: 6 }}>Dificultad</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['facil', 'media', 'dificil'] as Dif[]).map(d => {
                        const on = s.difficulty === d; const ds = difStyle(d)
                        return <button key={d} onClick={() => patch({ difficulty: on ? undefined : d })} title={ds.label} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', fontSize: 11, fontWeight: 700, border: on ? `1px solid ${ds.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ds.bg : '#fff', color: on ? ds.c : 'rgba(20,35,61,0.55)' }}><DifDots d={d} size={9} />{ds.label}</button>
                      })}
                    </div>
                  </div>
                </div>
                {/* Día en que se trabajará la subtarea */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...eb2, marginBottom: 6 }}>Trabajar el día</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    {([['Hoy', today], ['Mañana', addDays(today, 1)]] as [string, string][]).map(([lbl, iso]) => {
                      const on = s.plan === iso
                      return <button key={lbl} onClick={() => patch({ plan: on ? undefined : iso })} style={{ cursor: 'pointer', borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, border: on ? '1px solid #2E5A9E' : '1px solid rgba(15,35,64,0.14)', background: on ? 'rgba(46,90,158,0.10)' : '#fff', color: on ? '#2E5A9E' : 'rgba(20,35,61,0.6)' }}>{lbl}</button>
                    })}
                    <input type="date" value={s.plan || ''} onChange={ev => patch({ plan: ev.target.value || undefined })} title="Elegir un día"
                      style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '5px 8px', fontSize: 12, fontWeight: 600, color: s.plan ? '#2E5A9E' : 'rgba(20,35,61,0.5)', background: '#fff', outline: 'none' }} />
                    {s.plan && <button onClick={() => patch({ plan: undefined })} title="Quitar día" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: '#A87A2C', fontSize: 12, fontWeight: 800 }}>✕</button>}
                  </div>
                </div>

                {/* Nota */}
                <div style={{ ...eb2, marginBottom: 6 }}>Nota</div>
                <div style={{ marginBottom: 16 }}>
                  <RichText key={s.id || subPop.sid} value={s.note || ''} onChange={v => { if (subNoteTimer.current) clearTimeout(subNoteTimer.current); subNoteTimer.current = setTimeout(() => patch({ note: sanitizeHtml(v) || undefined }), 450) }} placeholder="Nota de la subtarea (negritas, viñetas)…" />
                </div>

                {/* Links */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={eb2}>Links</span>
                  <button onClick={() => patch({ links: [...links, { label: '', url: '' }] })} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>+ Link</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {links.length === 0 && <div style={{ fontSize: 12, color: 'rgba(20,35,61,0.45)' }}>Sin links.</div>}
                  {links.map((l, li) => (
                    <div key={li} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <input defaultValue={l.label} onBlur={ev => setLink(li, 'label', ev.target.value)} placeholder="Etiqueta" style={{ flex: '0 0 110px', width: 110, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#14233D', outline: 'none' }} />
                      <input defaultValue={l.url} onBlur={ev => setLink(li, 'url', ev.target.value)} placeholder="https://…" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid rgba(15,35,64,0.14)', borderRadius: 8, padding: '7px 9px', fontSize: 12.5, color: '#14233D', outline: 'none' }} />
                      {l.url && <a href={safeUrl(l.url)} target="_blank" rel="noreferrer" title="Abrir" style={{ flexShrink: 0, textDecoration: 'none', color: '#A87A2C', fontSize: 14 }}>↗</a>}
                      <button aria-label="Quitar link" onClick={() => patch({ links: links.filter((_, j) => j !== li) })} style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.1)', background: '#fff', borderRadius: 8, height: 30, width: 30, color: 'rgba(20,35,61,0.5)' }}>✕</button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(15,35,64,0.08)' }}>
                  <button onClick={() => { removeSubtask(ep, ti, si); setSubPop(null) }} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.08)', color: '#B0522E', borderRadius: 10, padding: '9px 14px', fontSize: 12.5, fontWeight: 700 }}>Eliminar</button>
                  <button onClick={() => setSubPop(null)} style={{ ...goldBtn, padding: '9px 20px', fontSize: 12.5 }}>Listo</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {taskView && renderTaskDetail(taskView, { onClose: () => setTaskView(null) })}

      {taskEdit && (() => {
        const ep = epics.find(e => e.id === taskEdit.epicId)        // épica de origen
        const target = epics.find(e => e.id === taskEditTarget) || ep // épica destino (editable)
        const isNew = taskEdit.tid == null
        const willMove = !isNew && !!target && !!ep && target.id !== ep.id
        const dt = dueTone(taskDraft.due, taskDraft.status === 'Terminada')
        return (
          <div onClick={() => closeTaskEdit()} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Editar tarea" onClick={e => e.stopPropagation()} className="ep-modal ep-task-modal" style={{ width: '100%', maxWidth: 1160, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 32px)' }}>
              <div style={{ height: 4, background: target?.color || ep?.color || '#2E5A9E', flexShrink: 0 }} />
              <div className="ep-modal-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 26px 12px', borderBottom: '1px solid rgba(15,35,64,0.08)', flexShrink: 0 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>{isNew ? 'Nueva tarea' : 'Editar tarea'}</div>
                    {/* La épica es editable en ambos casos: al crear porque el enfoque cruza
                        todas, y al editar porque una tarea puede haber caído en la equivocada. */}
                    {activeEpics.length > 1
                      ? (
                        <div>
                          {/* Elegir épica con chips de un clic (color de cada épica), en vez del dropdown */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 118, overflowY: 'auto', padding: 1 }}>
                            {activeEpics.map(x => {
                              const on = x.id === taskEditTarget
                              return (
                                <button key={x.id} type="button" onClick={() => setTaskEditTarget(x.id)} aria-pressed={on} title={x.name}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 99, padding: '6px 11px', font: '700 12px var(--font-ui)', transition: 'background .12s, border-color .12s',
                                    border: on ? `1.5px solid ${x.color}` : '1px solid rgba(15,35,64,0.14)',
                                    background: on ? hexA(x.color, 0.12) : '#fff',
                                    color: on ? x.color : 'rgba(20,35,61,0.62)' }}>
                                  <span style={{ width: 9, height: 9, borderRadius: 99, background: x.color, flexShrink: 0, boxShadow: on ? `0 0 0 2px ${hexA(x.color, 0.25)}` : 'none' }} />
                                  <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                                </button>
                              )
                            })}
                          </div>
                          {willMove && (
                            <span style={{ display: 'inline-block', marginTop: 7, font: '700 10.5px var(--font-ui)', color: '#A87A2C', background: 'rgba(194,147,58,0.10)', border: '1px solid rgba(194,147,58,0.32)', borderRadius: 99, padding: '2px 9px' }}>
                              se moverá desde {ep?.name}
                            </span>
                          )}
                        </div>
                      )
                      : <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{ep?.name}</div>}
                  </div>
                  <button aria-label="Cerrar editor de tarea" onClick={() => closeTaskEdit()} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>

                <div className="ep-modal-body" style={{ padding: '14px 26px 8px', overflowY: 'auto', flex: 1 }}>

                <label style={lbl}>Tarea</label>
                <input autoFocus value={taskDraft.t} onChange={e => setTaskDraft(d => ({ ...d, t: e.target.value }))} placeholder="¿Qué hay que hacer?" style={inpBig} />

                <label style={lbl}>Resumen</label>
                {resumenReady.current
                  ? <textarea value={taskDraft.resumen || ''} onChange={e => setTaskDraft(d => ({ ...d, resumen: e.target.value }))} rows={3} placeholder="¿Qué es esta actividad y qué quieres lograr?" style={{ ...inpSmall, width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
                  : <div style={{ ...inpSmall, width: '100%', color: 'rgba(20,35,61,0.5)', fontSize: 12 }}>Corre <code>sql/tareas-resumen.sql</code> en Supabase para activar este campo.</div>}

                <div className="td-grid" style={{ marginTop: 4 }}>
                <div className="td-col">
                <label style={lbl}>Estado</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PICK_STATUSES.map(s => {
                    const on = taskDraft.status === s; const ts = taskStyle(s)
                    return <button key={s} onClick={() => setTaskDraft(d => ({ ...d, status: s }))} style={{ cursor: 'pointer', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 700, border: on ? `1px solid ${ts.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? ts.bg : '#fff', color: on ? ts.c : 'rgba(20,35,61,0.55)' }}>{ts.label}</button>
                  })}
                </div>

                <label style={lbl}>Avance</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 9 }}>Qué tan completa la sientes. Arrastra la barra o fíjala al 100%.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <input type="range" min={0} max={100} step={5} value={taskDraft.progress ?? 0}
                    onChange={e => setTaskDraft(d => ({ ...d, progress: Number(e.target.value) }))}
                    style={{ flex: 1, height: 6, cursor: 'pointer', accentColor: target?.color || ep?.color || '#C2933A' }} />
                  <span className="serif" style={{ fontSize: 22, fontWeight: 600, color: '#10233F', minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{taskDraft.progress ?? 0}%</span>
                  <button onClick={() => setTaskDraft(d => ({ ...d, progress: 100 }))} style={{ cursor: 'pointer', border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>100%</button>
                </div>

                <label style={lbl}>Planear para</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>El día en que aparecerá en tu enfoque.</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  {([['Sin planear', ''], ['Hoy', todayISO()], ['Mañana', addDays(todayISO(), 1)]] as [string, string][]).map(([label, iso]) => {
                    const on = (taskDraft.plan || '') === iso
                    return <button key={label} onClick={() => setTaskDraft(d => ({ ...d, plan: iso }))} style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: on ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.14)', background: on ? '#10233F' : '#fff', color: on ? '#F3EFE6' : 'rgba(20,35,61,0.6)' }}>{label}</button>
                  })}
                  {(() => {
                    const custom = !!taskDraft.plan && taskDraft.plan !== todayISO() && taskDraft.plan !== addDays(todayISO(), 1)
                    return <input type="date" value={taskDraft.plan || ''} onChange={e => setTaskDraft(d => ({ ...d, plan: e.target.value }))} style={{ borderRadius: 99, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', border: custom ? '1px solid rgba(194,147,58,0.55)' : '1px solid rgba(15,35,64,0.14)', background: custom ? 'rgba(194,147,58,0.10)' : '#fff', color: custom ? '#A87A2C' : 'rgba(20,35,61,0.6)' }} />
                  })()}
                </div>

                {/* REPETIR — presets para lo común, personalizado para el resto */}
                <label style={lbl}>Repetir</label>
                <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>
                  Al marcarla como hecha no se termina: vuelve sola a tu enfoque en la siguiente fecha.
                </div>
                {(() => {
                  const r = taskDraft.repeat
                  const presets: [string, EpicaRepeat | null][] = [
                    ['No se repite', null],
                    ['Cada día', { every: 1, unit: 'dia' }],
                    ['Cada semana', { every: 1, unit: 'semana' }],
                    ['Cada mes', { every: 1, unit: 'mes' }],
                  ]
                  const isPreset = (x: EpicaRepeat | null) =>
                    x === null ? !r : !!r && r.every === x.every && r.unit === x.unit
                  const custom = !!r && !presets.some(([, x]) => x !== null && isPreset(x))
                  return (
                    <>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                        {presets.map(([label, x]) => {
                          const on = isPreset(x)
                          return (
                            <button key={label} onClick={() => setTaskDraft(d => {
                              const n = { ...d }
                              if (x) n.repeat = { ...x }; else { delete n.repeat; delete n.repeatUntil }
                              return n
                            })} style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: on ? `1px solid ${REPEAT_TONE.c}` : '1px solid rgba(15,35,64,0.14)', background: on ? REPEAT_TONE.c : '#fff', color: on ? '#fff' : 'rgba(20,35,61,0.6)' }}>{label}</button>
                          )
                        })}
                        <button onClick={() => setTaskDraft(d => ({ ...d, repeat: d.repeat ? { ...d.repeat, every: Math.max(2, d.repeat.every) } : { every: 2, unit: 'semana' } }))}
                          style={{ borderRadius: 99, padding: '8px 13px', font: '700 12.5px var(--font-ui)', cursor: 'pointer', border: custom ? `1px solid ${REPEAT_TONE.c}` : '1px solid rgba(15,35,64,0.14)', background: custom ? REPEAT_TONE.bg : '#fff', color: custom ? REPEAT_TONE.c : 'rgba(20,35,61,0.6)' }}>Personalizado…</button>
                      </div>

                      {r && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 11, padding: '11px 13px', borderRadius: 12, background: REPEAT_TONE.bg, border: `1px solid ${REPEAT_TONE.border}` }}>
                          <span style={{ font: '700 12.5px var(--font-ui)', color: REPEAT_TONE.c }}>Cada</span>
                          <input type="number" min={1} max={99} value={r.every} aria-label="Cada cuántos"
                            onChange={ev => { const v = Math.max(1, Math.min(99, Number(ev.target.value) || 1)); setTaskDraft(d => (d.repeat ? { ...d, repeat: { ...d.repeat, every: v } } : d)) }}
                            style={{ width: 62, boxSizing: 'border-box', border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '7px 9px', fontSize: 13, fontWeight: 700, color: '#14233D', background: '#fff', outline: 'none' }} />
                          <select value={r.unit} aria-label="Unidad de repetición"
                            onChange={ev => { const u = ev.target.value as EpicaRepeat['unit']; setTaskDraft(d => (d.repeat ? { ...d, repeat: { ...d.repeat, unit: u } } : d)) }}
                            style={{ cursor: 'pointer', border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '7px 9px', fontSize: 13, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }}>
                            <option value="dia">{r.every === 1 ? 'día' : 'días'}</option>
                            <option value="semana">{r.every === 1 ? 'semana' : 'semanas'}</option>
                            <option value="mes">{r.every === 1 ? 'mes' : 'meses'}</option>
                          </select>
                          <span style={{ width: 1, alignSelf: 'stretch', background: REPEAT_TONE.border }} />
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ font: '700 10px var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: REPEAT_TONE.c }}>Hasta</span>
                            <input type="date" value={taskDraft.repeatUntil || ''} aria-label="Fin de la serie (opcional)"
                              onChange={ev => setTaskDraft(d => { const v = ev.target.value; const n = { ...d }; if (v) n.repeatUntil = v; else delete n.repeatUntil; return n })}
                              style={{ border: `1px solid ${REPEAT_TONE.border}`, borderRadius: 9, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: '#14233D', background: '#fff', outline: 'none' }} />
                          </label>
                          {taskDraft.plan && (
                            <span style={{ flexBasis: '100%', fontSize: 11.5, color: REPEAT_TONE.c }}>
                              Se repite <strong>{repeatLabel(r)}</strong> · la siguiente sería el {fmtDue(nextOccurrence(taskDraft.plan, r, taskDraft.plan))}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}

                </div>
                <div className="td-col">
                <label style={lbl}>Prioridad</label>
                {!taskDraft.priority && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.5)', marginTop: -4, marginBottom: 8 }}>Sugerida por la fecha — toca para fijarla.</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['alta', 'media', 'baja'] as Prio[]).map(p => {
                    const ps = prioStyle(p)
                    const on = taskDraft.priority === p
                    const suggested = !taskDraft.priority && prioFromDue(taskDraft.due) === p
                    return <button key={p} onClick={() => setTaskDraft(d => ({ ...d, priority: p }))} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${ps.c}` : suggested ? `1.5px dashed ${ps.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? 'rgba(194,147,58,0.08)' : '#fff' }}><PrioBars p={p} /><span style={{ font: '700 10px var(--font-ui)', color: on || suggested ? ps.c : 'rgba(20,35,61,0.5)' }}>{ps.label}</span></button>
                  })}
                </div>

                <label style={lbl}>Dificultad</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['facil', 'media', 'dificil'] as Dif[]).map(dd => {
                    const dsy = difStyle(dd); const on = taskDraft.difficulty === dd
                    return <button key={dd} onClick={() => setTaskDraft(d => ({ ...d, difficulty: d.difficulty === dd ? undefined : dd }))} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 0', borderRadius: 9, cursor: 'pointer', border: on ? `1px solid ${dsy.c}` : '1px solid rgba(15,35,64,0.12)', background: on ? dsy.bg : '#fff' }}><DifDots d={dd} /><span style={{ font: '700 10px var(--font-ui)', color: on ? dsy.c : 'rgba(20,35,61,0.5)' }}>{dsy.label}</span></button>
                  })}
                </div>

                <label style={lbl}>Fecha de entrega</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="date" value={taskDraft.due} onChange={e => setTaskDraft(d => ({ ...d, due: e.target.value }))} style={{ ...inpBig, flex: 1, fontWeight: 600, border: `1px solid ${dt.border}`, color: dt.c, background: dt.bg }} />
                  {taskDraft.due && <button onClick={() => setTaskDraft(d => ({ ...d, due: '' }))} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 700, color: 'rgba(20,35,61,0.5)', whiteSpace: 'nowrap' }}>Quitar</button>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={lbl}>Links</label>
                  <button onClick={() => setTaskDraft(d => ({ ...d, links: [...(d.links || []), { label: '', url: '' }] }))} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, marginTop: 16 }}>+ Link</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(taskDraft.links || []).map((l, i) => {
                    const nLinks = (taskDraft.links || []).length
                    const arr: CSSProperties = { height: 26, width: 24, borderRadius: 6, border: '1px solid rgba(15,35,64,0.12)', background: '#fff', color: 'rgba(20,35,61,0.55)', fontSize: 11, lineHeight: 1 }
                    return (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      {nLinks > 1 && (
                        <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button aria-label="Subir link" title="Subir" disabled={i === 0} onClick={() => setTaskDraft(d => { const links = [...(d.links || [])]; if (i <= 0) return d;[links[i - 1], links[i]] = [links[i], links[i - 1]]; return { ...d, links } })} style={{ ...arr, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                          <button aria-label="Bajar link" title="Bajar" disabled={i >= nLinks - 1} onClick={() => setTaskDraft(d => { const links = [...(d.links || [])]; if (i >= links.length - 1) return d;[links[i + 1], links[i]] = [links[i], links[i + 1]]; return { ...d, links } })} style={{ ...arr, cursor: i >= nLinks - 1 ? 'default' : 'pointer', opacity: i >= nLinks - 1 ? 0.35 : 1 }}>↓</button>
                        </span>
                      )}
                      <input value={l.label} onChange={e => setTaskDraft(d => { const links = [...(d.links || [])]; links[i] = { ...links[i], label: e.target.value }; return { ...d, links } })} placeholder="Nombre" style={{ ...inpSmall, flex: '0 0 120px' }} />
                      <input value={l.url} onChange={e => setTaskDraft(d => { const links = [...(d.links || [])]; links[i] = { ...links[i], url: e.target.value }; return { ...d, links } })} placeholder="https://…" style={{ ...inpSmall, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 12 }} />
                      <button aria-label="Eliminar enlace" onClick={() => setTaskDraft(d => ({ ...d, links: (d.links || []).filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                    )
                  })}
                </div>

                {(() => { const st = taskDraft.subtasks || []; const done = st.filter(s => s.done).length; return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={lbl}>Subtareas{st.length > 0 && <span style={{ marginLeft: 7, color: '#2E6E6E', fontWeight: 800 }}>{done}/{st.length} · {Math.round((done / st.length) * 100)}%</span>}</label>
                    <button onClick={() => setTaskDraft(d => ({ ...d, subtasks: [...(d.subtasks || []), { t: '', done: false }] }))} style={{ cursor: 'pointer', border: '1px solid rgba(194,147,58,0.35)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, marginTop: 16 }}>+ Subtarea</button>
                  </div>
                ) })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(taskDraft.subtasks || []).map((s, i) => ({ s, i })).sort((a, b) => (a.s.done ? 1 : 0) - (b.s.done ? 1 : 0)).map(({ s, i }) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => setTaskDraft(d => { const st = [...(d.subtasks || [])]; st[i] = { ...st[i], done: !st[i].done }; return { ...d, subtasks: st } })} title={s.done ? 'Hecha' : 'Marcar hecha'} style={{ flexShrink: 0, height: 22, width: 22, borderRadius: 6, cursor: 'pointer', border: s.done ? 'none' : '1.5px solid rgba(15,35,64,0.25)', background: s.done ? '#2E6E6E' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}</button>
                      <input value={s.t} onChange={e => setTaskDraft(d => { const st = [...(d.subtasks || [])]; st[i] = { ...st[i], t: e.target.value }; return { ...d, subtasks: st } })} placeholder="Paso o subtarea…" style={{ ...inpSmall, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'rgba(20,35,61,0.4)' : '#14233D' }} />
                      <button aria-label="Eliminar subtarea" onClick={() => setTaskDraft(d => ({ ...d, subtasks: (d.subtasks || []).filter((_, j) => j !== i) }))} style={delBtn}>✕</button>
                    </div>
                  ))}
                </div>

                <label style={lbl}>Nota</label>
                <RichText value={taskDraft.note || ''} onChange={v => setTaskDraft(d => ({ ...d, note: v }))} placeholder="Negritas (B), cursiva (I) y viñetas (• Lista)…" minHeight={170} />
                </div>
                </div>

                </div>

                <div style={{ display: 'flex', gap: 10, padding: '13px 26px', borderTop: '1px solid rgba(15,35,64,0.08)', flexShrink: 0, background: '#fff', flexWrap: 'wrap' }}>
                  {!isNew && <button onClick={deleteTask} style={{ cursor: 'pointer', border: '1px solid rgba(176,82,46,0.3)', background: 'rgba(176,82,46,0.08)', color: '#B0522E', borderRadius: 10, padding: '11px 14px', fontSize: 12.5, fontWeight: 700 }}>Eliminar</button>}
                  <span style={{ flex: 1 }} />
                  <button onClick={() => closeTaskEdit()} style={{ cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 10, padding: '11px 16px', fontSize: 12.5, fontWeight: 700, color: 'rgba(20,35,61,0.6)' }}>Cancelar</button>
                  <button onClick={saveTask} style={{ ...goldBtn, padding: '11px 20px', fontSize: 12.5 }}>Guardar</button>
                </div>
            </div>
          </div>
        )
      })()}

      {triageOpen && (() => {
        return (
          <div onClick={() => setTriageOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Tareas sin fecha" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 80px)' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#8b8379,#C2933A)' }} />
              <div style={{ padding: '18px 22px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>📥 Sin fecha</div>
                  <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>Ponles un día antes de que se pudran</div>
                </div>
                <button aria-label="Cerrar" onClick={() => setTriageOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 22px 20px' }}>
                {sinFechaTasks.map(({ e, t, i }) => { const dc = diasCon(t); const ps = prioStyle(t.priority)
                  return (
                    <div key={planKey(e.id, t)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 4px', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
                      <span style={{ flexShrink: 0, width: 3, height: 28, borderRadius: 99, background: ps.accent }} />
                      <div onClick={() => { setTriageOpen(false); setTaskView({ eId: e.id, tid: t.id! }) }} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.t}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(20,35,61,0.5)', marginTop: 2 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 99, background: e.color }} />{e.name}</span>{dc >= 1 ? ` · creada hace ${dc}d` : ''}</div>
                      </div>
                      <button onClick={() => planTaskToDay(e, i, today)} style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(194,147,58,0.4)', background: 'rgba(194,147,58,0.10)', color: '#A87A2C', borderRadius: 8, padding: '5px 10px', font: '700 11px var(--font-ui)' }}>Hoy</button>
                      <button onClick={() => planTaskToDay(e, i, addDays(today, 1))} style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', color: 'rgba(20,35,61,0.6)', borderRadius: 8, padding: '5px 10px', font: '700 11px var(--font-ui)' }}>Mañana</button>
                    </div>
                  )
                })}
                {sinFechaTasks.length === 0 && <div style={{ padding: '24px 4px', textAlign: 'center', fontSize: 13, color: '#2E6E6E', fontWeight: 600 }}>Todo tiene fecha ✦</div>}
              </div>
            </div>
          </div>
        )
      })()}
      {objsOpen && (() => {
        const riskTag = (o: typeof objetivosAll[number]) => o.days != null && o.days < 0 ? { t: `venció hace ${-o.days}d`, c: '#B0522E', bg: 'rgba(176,82,46,0.1)' } : o.days != null && o.days <= 14 ? { t: `en ${o.days}d`, c: '#A87A2C', bg: 'rgba(194,147,58,0.12)' } : o.days != null ? { t: fmtDue(o.k.due!), c: 'rgba(20,35,61,0.55)', bg: 'rgba(15,35,64,0.05)' } : { t: 'sin fecha', c: 'rgba(20,35,61,0.45)', bg: 'rgba(15,35,64,0.04)' }
        return (
          <div onClick={() => setObjsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Objetivos en riesgo" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 80px)' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#B0522E,#C2933A)' }} />
              <div style={{ padding: '18px 22px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>🎯 Objetivos</div>
                  <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>Ordenados por riesgo</div>
                </div>
                <button aria-label="Cerrar" onClick={() => setObjsOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 22px 20px' }}>
                {objetivosAll.map((o, i) => { const rt = riskTag(o)
                  return (
                    <div key={i} onClick={() => { setObjsOpen(false); setFeaturedId(o.e.id) }} style={{ display: 'flex', gap: 10, padding: '10px 4px', cursor: 'pointer', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
                      <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: o.e.color, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#16365F' }}>{o.k.t}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: rt.c, background: rt.bg, borderRadius: 99, padding: '1px 8px' }}>{rt.t}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <span style={{ flex: 1, height: 5, borderRadius: 99, background: 'rgba(15,35,64,0.08)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${o.pct * 100}%`, height: '100%', background: o.e.color }} /></span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(20,35,61,0.55)', whiteSpace: 'nowrap' }}>{o.hasMeta ? `${o.cur}/${o.target}` : `${Math.round(o.pct * 100)}%`}</span>
                          <span style={{ fontSize: 10, color: 'rgba(20,35,61,0.4)' }}>{o.e.name}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
      {weekCloseOpen && (() => {
        const pend = weekSummary.committed.length
        const staleEps = activeEpics.filter(e => pendCount(e) > 0 && e.status !== 'En pausa' && (() => { const d = daysSinceISO(epicLastActivity(e)); return d == null || d >= 10 })())
        return (
          <div onClick={() => setWeekCloseOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Cerrar la semana" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#3E8E8E,#C2933A)' }} />
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>🗓 Cerrar la semana</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>{weekRangeLabel(weekSummary.mon)}</div>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setWeekCloseOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  <div className="glass" style={{ borderRadius: 13, padding: '12px 13px' }}><span className="serif" style={{ fontSize: 26, color: '#2E6E6E' }}>✓ {weekSummary.closedN}</span><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>cerradas esta semana</div></div>
                  <div className="glass" style={{ borderRadius: 13, padding: '12px 13px' }}><span className="serif" style={{ fontSize: 26, color: pend ? '#A87A2C' : '#2E6E6E' }}>↻ {pend}</span><div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>comprometidas sin cerrar</div></div>
                </div>
                {staleEps.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: '#B0522E', marginBottom: 6 }}>Frentes desatendidos</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {staleEps.map(e => { const d = daysSinceISO(epicLastActivity(e)); return <button key={e.id} onClick={() => { setWeekCloseOpen(false); setFeaturedId(e.id) }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: `1px solid ${hexA(e.color, 0.4)}`, background: hexA(e.color, 0.08), color: '#16365F' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: e.color }} />{e.name}<span style={{ color: '#B0522E' }}>{d == null ? '·—' : `·${d}d`}</span></button> })}
                    </div>
                  </div>
                )}
                {pend > 0
                  ? <button onClick={moveWeekPendingToNext} style={{ ...goldBtn, width: '100%', marginTop: 18, padding: '12px' }}>Mover {pend} a la próxima semana →</button>
                  : <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5, color: '#2E6E6E', fontWeight: 600 }}>Cerraste todo lo comprometido ✦</div>}
              </div>
            </div>
          </div>
        )
      })()}
      {diaryOpen && (() => {
        const eps = Array.from(new Map(diaryEntries.map(d => [d.eId, { id: d.eId, name: d.eName, color: d.color }])).values())
        const rows = diaryEntries.filter(d => diaryEpica === 'todas' || d.eId === diaryEpica)
        const fmtDay = (day: string) => { const dd = daysSinceISO(day); return dd === 0 ? 'Hoy' : dd === 1 ? 'Ayer' : cap(new Date(day + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })) }
        let lastDay = ''
        return (
          <div onClick={() => setDiaryOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Diario de trabajo" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 80px)' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#C2933A,#3E8E8E)' }} />
              <div style={{ padding: '18px 22px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>📖 Diario de trabajo</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 22, lineHeight: 1, color: '#10233F' }}>Tus notas y comentarios</div>
                  </div>
                  <button aria-label="Cerrar" onClick={() => setDiaryOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                {eps.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => setDiaryEpica('todas')} style={{ cursor: 'pointer', borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, border: diaryEpica === 'todas' ? '1px solid #10233F' : '1px solid rgba(15,35,64,0.12)', background: diaryEpica === 'todas' ? '#10233F' : '#fff', color: diaryEpica === 'todas' ? '#fff' : 'rgba(20,35,61,0.55)' }}>Todas</button>
                    {eps.map(ep => { const on = diaryEpica === ep.id; return <button key={ep.id} onClick={() => setDiaryEpica(on ? 'todas' : ep.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: on ? `1.5px solid ${ep.color}` : '1px solid rgba(15,35,64,0.12)', background: on ? hexA(ep.color, 0.12) : '#fff', color: on ? ep.color : 'rgba(20,35,61,0.6)' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: ep.color }} />{ep.name}</button> })}
                  </div>
                )}
              </div>
              <div style={{ overflowY: 'auto', padding: '0 22px 20px' }}>
                {rows.length === 0 && <div style={{ padding: '24px 4px', textAlign: 'center', fontSize: 13, color: 'rgba(20,35,61,0.5)' }}>Aún no hay notas ni comentarios. Escríbelos al avanzar en una tarea o desde el Modo foco.</div>}
                {rows.map((d, i) => {
                  const showDay = d.day !== lastDay; lastDay = d.day
                  return (
                    <div key={i}>
                      {showDay && <div style={{ font: '800 10px/1 var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: '#A87A2C', margin: '14px 0 6px' }}>{fmtDay(d.day)}</div>}
                      <div onClick={() => { setDiaryOpen(false); setTaskView({ eId: d.eId, tid: d.tid }) }} style={{ display: 'flex', gap: 9, padding: '8px 4px', cursor: 'pointer', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
                        <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 99, background: d.color, marginTop: 5 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: '#14233D', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.text) }} />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 10.5, color: 'rgba(20,35,61,0.5)', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: d.kind === 'comentario' ? '#7A6FB0' : '#2E6E6E' }}>{d.kind === 'comentario' ? '💬 comentario' : '✎ avance'}</span>
                            <span>· {d.tName}</span>
                            <span style={{ color: 'rgba(20,35,61,0.4)' }}>· {d.eName}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}
      {dayCloseOpen && (() => {
        const refDay = viewDate                 // el día que se está cerrando (hoy o uno pasado)
        const refIsToday = refDay === today
        const workedToday = (t: EpicaTask) => (t.progressLog || []).some(x => x.d === refDay)
        const minToday = (t: EpicaTask) => (t.progressLog || []).filter(x => x.d === refDay).reduce((s, x) => s + (typeof (x as { min?: number }).min === 'number' ? (x as { min?: number }).min! : 0), 0)
        const open = planPend.filter(x => workedToday(x.t))
        const untouched = planPend.filter(x => !workedToday(x.t))
        const totalMin = planItems.reduce((s, x) => s + minToday(x.t), 0)
        const hmm = (m: number) => m >= 60 ? `${Math.round(m / 60 * 10) / 10}h` : `${m}m`
        const stat = (emoji: string, n: number, label: string, c: string) => (
          <div className="glass" style={{ borderRadius: 13, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="serif" style={{ fontSize: 26, lineHeight: .9, color: c }}>{emoji} {n}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{label}</span>
          </div>
        )
        const row = (x: { e: Epica; t: EpicaTask; i: number }, extra?: string) => (
          <div key={planKey(x.e.id, x.t)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid rgba(15,35,64,0.05)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: x.e.color, flexShrink: 0 }} />
            <span onClick={() => { setDayCloseOpen(false); setTaskView({ eId: x.e.id, tid: x.t.id! }) }} title="Abrir actividad" style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#16365F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{x.t.t}</span>
            {extra && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2E6E6E', flexShrink: 0 }}>{extra}</span>}
            {/* Calendario por-tarea: mueve SOLO esta actividad a otro día, sin abrirla */}
            <label onClick={ev => ev.stopPropagation()} title="Cambiar el día de esta actividad" style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(15,35,64,0.14)', background: '#fff', fontSize: 14 }}>
              📅
              <input type="date" defaultValue={x.t.plan || refDay} aria-label="Cambiar día de la actividad"
                onChange={e => { const d = e.target.value; if (d && d !== x.t.plan) planTaskToDay(x.e, x.i, d, { toast: true }) }}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', border: 'none', padding: 0 }} />
            </label>
          </div>
        )
        return (
          <div onClick={() => setDayCloseOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Cierre del día" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#3E8E8E,#C2933A)' }} />
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>Cierre del día</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1, color: '#10233F' }}>{cap(new Date(refDay + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
                    {!refIsToday && <div style={{ marginTop: 6, fontSize: 11.5, color: '#B0522E', fontWeight: 700 }}>Este día quedó sin cerrar</div>}
                    {totalMin > 0 && <div style={{ marginTop: 6, fontSize: 12.5, color: '#2E6E6E', fontWeight: 700 }}>⏱ {hmm(totalMin)} de trabajo registrado {refIsToday ? 'hoy' : 'ese día'}</div>}
                  </div>
                  <button aria-label="Cerrar" onClick={() => setDayCloseOpen(false)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {stat('✓', planDone.length, 'terminadas', '#2E6E6E')}
                  {stat('◐', open.length, 'sin terminar', '#A87A2C')}
                  {stat('○', untouched.length, 'sin tocar', 'rgba(20,35,61,0.55)')}
                </div>
                {open.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: '#A87A2C', marginBottom: 4 }}>Avanzaste pero no cerraste</div>
                    {open.map(x => row(x, minToday(x.t) > 0 ? `⏱ ${hmm(minToday(x.t))}` : '✎ avancé'))}
                  </div>
                )}
                {untouched.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 4 }}>No las tocaste hoy</div>
                    {untouched.slice(0, 8).map(x => row(x))}
                    {untouched.length > 8 && <div style={{ fontSize: 11, color: 'rgba(20,35,61,0.45)', padding: '4px 4px 0' }}>+{untouched.length - 8} más</div>}
                  </div>
                )}
                {/* ARRASTRE: pendientes de días anteriores que no cerraste. Reasígnalas de un toque. */}
                {arrastradas.length > 0 && (
                  <div style={{ marginTop: 18, borderRadius: 12, background: 'rgba(176,82,46,0.05)', border: '1px solid rgba(176,82,46,0.25)', padding: '11px 13px' }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0522E', marginBottom: 8 }}>⏳ Arrastre de días anteriores · mover {arrastradas.length} a…</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Array.from({ length: 8 }, (_, k) => addDays(today, k)).map(d => {
                        const isTd = d === today
                        const lbl = isTd ? 'Hoy' : d === addDays(today, 1) ? 'Mañana' : cap(new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')) + ' ' + dayNum(d)
                        return <button key={d} onClick={() => moveArrastradasTo(d)} style={{ cursor: 'pointer', borderRadius: 9, padding: '8px 12px', font: '700 12px var(--font-ui)', border: isTd ? 'none' : '1px solid rgba(176,82,46,0.3)', background: isTd ? 'linear-gradient(135deg,#c9713f,#B0522E)' : '#fff', color: isTd ? '#fff' : '#B0522E' }}>{lbl}</button>
                      })}
                    </div>
                  </div>
                )}
                {planPend.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.5)', marginBottom: 8 }}>Mover {planPend.length} {planPend.length === 1 ? 'pendiente' : 'pendientes'} de {refIsToday ? 'hoy' : 'este día'} a…</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Array.from({ length: 8 }, (_, k) => addDays(today, k + (refIsToday ? 1 : 0))).map(d => {
                        const first = d === addDays(today, refIsToday ? 1 : 0)
                        const lbl = d === today ? 'Hoy' : d === addDays(today, 1) ? 'Mañana' : cap(new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')) + ' ' + dayNum(d)
                        return <button key={d} onClick={() => moveTodayPendingTo(d)} style={{ cursor: 'pointer', borderRadius: 9, padding: '8px 12px', font: '700 12px var(--font-ui)', border: first ? 'none' : '1px solid rgba(15,35,64,0.14)', background: first ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#fff', color: first ? '#1B1305' : 'rgba(20,35,61,0.65)' }}>{lbl}</button>
                      })}
                    </div>
                  </div>
                )}
                {planPend.length === 0 && arrastradas.length === 0 && <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5, color: '#2E6E6E', fontWeight: 600 }}>Cerraste todo ✦</div>}
              </div>
            </div>
          </div>
        )
      })()}
      {routineStat && (() => {
        const ep = epicsRef.current.find(x => x.id === routineStat.eId) || epics.find(x => x.id === routineStat.eId)
        const r = ep?.routines[routineStat.ri]
        if (!ep || !r) return null
        const s = routineStats(r)
        // Racha actual: días consecutivos con la rutina hecha, hasta hoy (o ayer si hoy aún no).
        const doneOn = (d: string) => { const mon = mondayISO(d); const di = (new Date(d + 'T00:00:00').getDay() + 6) % 7; return !!(r.weeks?.[mon]?.[di]) }
        let streak = 0
        for (let k = doneOn(today) ? 0 : 1; k < 400; k++) { if (doneOn(addDays(today, -k))) streak++; else break }
        // Heatmap tipo GitHub: últimas 10 semanas (columnas) × L-D (filas).
        const heatWeeks = Array.from({ length: 10 }, (_, i) => addDays(mondayISO(today), (i - 9) * 7))
        const tile = (label: string, value: string, sub?: string, hi?: boolean) => (
          <div className="glass" style={{ borderRadius: 13, padding: '13px 14px' }}>
            <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)' }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <span className="serif" style={{ fontWeight: 600, fontSize: 28, lineHeight: .9, color: hi ? '#A87A2C' : '#10233F' }}>{value}</span>
              {sub && <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(20,35,61,0.5)' }}>{sub}</span>}
            </div>
          </div>
        )
        return (
          <div onClick={() => setRoutineStat(null)} style={{ position: 'fixed', inset: 0, zIndex: 78, background: 'rgba(10,22,42,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflow: 'auto' }}>
            <div role="dialog" aria-modal="true" aria-label="Estadísticas de la rutina" onClick={e => e.stopPropagation()} className="ep-modal" style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, boxShadow: '0 40px 80px -30px rgba(8,18,36,.7)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: ep.color }} />
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 5 }}>Rutina diaria</div>
                    <div className="serif" style={{ fontWeight: 600, fontSize: 24, lineHeight: 1, color: '#10233F' }}>{r.t}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'rgba(20,35,61,0.55)' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: ep.color }} />{ep.name}</div>
                    {streak > 0 && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, borderRadius: 99, padding: '4px 11px', background: streak >= 7 ? 'rgba(176,82,46,0.12)' : 'rgba(194,147,58,0.14)', border: `1px solid ${streak >= 7 ? 'rgba(176,82,46,0.35)' : 'rgba(194,147,58,0.35)'}`, font: '800 12px var(--font-ui)', color: streak >= 7 ? '#B0522E' : '#A87A2C' }}>🔥 Racha: {streak} {streak === 1 ? 'día' : 'días'}</div>}
                  </div>
                  <button aria-label="Cerrar estadísticas" onClick={() => setRoutineStat(null)} style={{ cursor: 'pointer', border: 'none', background: 'rgba(15,35,64,0.06)', borderRadius: 9, height: 32, width: 32, color: 'rgba(20,35,61,0.55)', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {tile('Esta semana', `${s.week}/7`, undefined, true)}
                  {tile('Este mes', String(s.month), 'veces')}
                  {tile('Trimestre', String(s.quarter), 'veces')}
                  {tile('Este año', String(s.year), 'veces')}
                  {tile('Mejor semana', `${s.best}/7`)}
                  {tile('Total', String(s.total), `${s.activeWeeks} sem`)}
                </div>
                {s.recent.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 10 }}>Últimas semanas</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 72 }}>
                      {[...s.recent].reverse().map(w => {
                        const h = 8 + (w.count / 7) * 56
                        return (
                          <div key={w.monday} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }} title={`${weekRangeLabel(w.monday)} · ${w.count}/7`}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,35,61,0.5)' }}>{w.count}</span>
                            <div style={{ width: '100%', maxWidth: 26, height: h, borderRadius: 6, background: w.count >= 5 ? '#2E6E6E' : w.count >= 3 ? '#C2933A' : 'rgba(15,35,64,0.18)' }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(20,35,61,0.55)' }}>{dayNum(w.monday)}/{cap(new Date(w.monday + 'T00:00:00').toLocaleDateString('es-MX', { month: 'short' }).replace('.', ''))}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Heatmap tipo GitHub: últimas 10 semanas × L-D */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(15,35,64,0.55)', marginBottom: 10 }}>Mapa de constancia</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {heatWeeks.map(mon => (
                      <div key={mon} style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                        {[0, 1, 2, 3, 4, 5, 6].map(di => {
                          const d = addDays(mon, di); const on = doneOn(d); const future = d > today
                          return <div key={di} title={`${cap(new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))}${on ? ' · hecha ✓' : future ? '' : ' · no'}`}
                            style={{ aspectRatio: '1', borderRadius: 3, background: on ? ep.color : future ? 'rgba(15,35,64,0.04)' : 'rgba(15,35,64,0.09)', opacity: on ? 1 : 1 }} />
                        })}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10.5, color: 'rgba(20,35,61,0.5)' }}>
                    <span>menos</span>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(15,35,64,0.09)' }} />
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: hexA(ep.color, 0.5) }} />
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: ep.color }} />
                    <span>más · 10 semanas</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {toast && (
        <div className="ep-abovenav" style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: toast.error ? '#B0522E' : '#16365F', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 16px 30px -14px rgba(8,18,36,.6)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>{toast.msg}</span>
          {toast.action && (
            <button onClick={() => { toast.action!.fn(); setToast(null) }} style={{ border: 'none', background: 'transparent', color: '#E7C56B', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Header ─────────────────────────────────────────────────── */
function TopBar({ sourceCount, onNew }: { sourceCount: number; onNew: () => void }) {
  return (
    <>
      <div className="brand-rule" />
      <header className="band" style={{ margin: '14px 14px 0', borderRadius: 18, padding: '16px 22px', color: '#fff' }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ADVL" style={{ height: 40, width: 'auto', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.4))' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="serif" style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 26, lineHeight: 1, color: '#F3EFE6' }}>Épicas</span>
              <span style={{ font: '700 10px/1 var(--font-ui)', letterSpacing: '.24em', textTransform: 'uppercase', color: '#C8A24C' }}>Grandes frentes · ADVL</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="hdr-extra">
              <HeaderStats />
              <CumplesWidget />
              <ExcepcionalesWidget />
              <span className="ep-hide-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, background: 'rgba(62,142,142,0.16)', border: '1px solid rgba(120,200,190,0.25)', padding: '8px 12px', fontSize: 11.5, fontWeight: 700, color: '#B9E2DA' }}>
                <span className="ep-live" style={{ height: 7, width: 7, borderRadius: 99, background: '#5FD0BE' }} />Supabase · {sourceCount} fuentes
              </span>
            </span>
            <WidgetsDropdown />
            <SpecialsDropdown />
            <SectionNav current="epicas" />
            <button onClick={onNew} style={{ ...goldBtn, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', fontSize: 12 }}>
              <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1 }}>+</span> <span className="ep-hide-xs">Nueva</span> épica
            </button>
          </div>
        </div>
      </header>
    </>
  )
}

// Minutos estimados de una tarea por su dificultad (para el resumen/carga de la semana).
// Estimación de tiempo SÓLO a partir de la dificultad (fácil 45m · media 2h · difícil 4h).
// Sin dificultad = 0: no hay base para estimar, así que esas tareas no inventan horas.
const WEEK_EST_MIN = (d?: string) => d === 'facil' ? 45 : d === 'media' ? 120 : d === 'dificil' ? 240 : 0
// Estimado EFECTIVO de una tarea en minutos: tu estimado propio (estMin) si lo pusiste; si no,
// el default por dificultad. Es lo que alimenta la carga estimada del día ("~Xh") para planear.
const estMinOf = (t: { estMin?: number; difficulty?: string }): number => (typeof t.estMin === 'number' && t.estMin > 0) ? t.estMin : WEEK_EST_MIN(t.difficulty)
// Presets del estimado (minutos) para el dropdown, con etiqueta bonita.
const EST_PRESETS: [number, string][] = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [150, '2 h 30'], [180, '3 h'], [240, '4 h'], [360, '6 h'], [480, '8 h']]
// Minutos → etiqueta legible: 90 → "1 h 30", 45 → "45 min", 120 → "2 h".
const fmtEst = (m: number): string => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h} h ${r}` : h ? `${h} h` : `${r} min` }
// Minutos → forma compacta editable para el input personalizado: 90 → "1h30", 45 → "45m", 120 → "2h".
const fmtCustom = (m: number): string => { m = Math.round(m); if (m % 60 === 0) return `${m / 60}h`; if (m < 60) return `${m}m`; return `${Math.floor(m / 60)}h${m % 60}` }
// Texto flexible → minutos. "1h30"/"1:30"→90, "2h"/"1.5h"→horas, "45m"/"45min"→minutos.
// Un número SUELTO chico se toma como HORAS (1→1h, 2→2h) y uno grande como minutos (90→90m, 45→45m).
const parseEst = (s: string): number | null => {
  s = (s || '').trim().toLowerCase().replace(',', '.'); if (!s) return null
  let m = s.match(/^(\d+)\s*[:h]\s*(\d+)\s*m?$/); if (m) return (+m[1]) * 60 + (+m[2])       // 1:30 · 1h30
  m = s.match(/^(\d+(?:\.\d+)?)\s*h$/); if (m) return Math.round(+m[1] * 60)                  // 2h · 1.5h
  m = s.match(/^(\d+)\s*m(?:in)?$/); if (m) return +m[1]                                       // 45m · 45min
  const n = Number(s); if (isNaN(n) || n <= 0) return null
  if (!Number.isInteger(n)) return Math.round(n * 60)                                          // 1.5 = 1h30
  return n <= 12 ? n * 60 : Math.round(n)                                                       // 1→1h · 8→8h · 45→45m · 90→90m
}

const goldBtn: CSSProperties = {
  border: 'none', cursor: 'pointer', borderRadius: 12, fontWeight: 800, color: '#1B1305',
  background: 'linear-gradient(135deg,#E7C56B,#C2933A)', boxShadow: '0 10px 20px -10px rgba(194,147,58,.9)',
  fontFamily: 'inherit', padding: '10px 16px', fontSize: 13,
}

/* ─── Slider de avance con estado LOCAL: pinta en vivo al arrastrar y sólo hace
      commit (setEpics + red) al soltar/teclear-fin, para no re-renderizar el
      dashboard entero en cada escalón. ─────────────────────────────────────── */
function ProgressSlider({ value, color, onCommit, labelStyle, onHundred }: { value: number; color: string; onCommit: (v: number) => void; labelStyle?: CSSProperties; onHundred?: () => void }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  const commit = (nv: number) => { if (nv !== value) onCommit(nv) }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={labelStyle}>Avance</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#10233F' }}>{v}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="range" min={0} max={100} step={5} value={v} aria-label="Avance"
          onChange={e => setV(Number(e.target.value))}
          onPointerUp={e => commit(Number((e.currentTarget as HTMLInputElement).value))}
          onKeyUp={e => commit(Number((e.currentTarget as HTMLInputElement).value))}
          onBlur={e => commit(Number((e.currentTarget as HTMLInputElement).value))}
          style={{ flex: 1, height: 6, cursor: 'pointer', accentColor: color }} />
        <button onClick={() => { setV(100); if (onHundred) onHundred(); else commit(100) }} style={{ cursor: 'pointer', border: '1px solid rgba(62,142,142,0.35)', background: 'rgba(62,142,142,0.10)', color: '#2E6E6E', borderRadius: 9, padding: '6px 11px', fontSize: 11.5, fontWeight: 700 }}>100%</button>
      </div>
    </div>
  )
}

/* ─── Editor de notas: negritas + viñetas (contenteditable) ─────── */
function RichText({ value, onChange, placeholder, minHeight = 74 }: { value: string; onChange: (v: string) => void; placeholder?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // No reescribir el HTML mientras el usuario está escribiendo aquí: reinyectar
    // innerHTML mueve el cursor al inicio (salto de caret al teclear/pegar). Sólo se
    // sincroniza desde `value` cuando el editor NO tiene el foco.
    if (document.activeElement === el) return
    if (el.innerHTML !== (value || '')) el.innerHTML = value || ''
  }, [value])
  const exec = (cmd: string) => {
    const el = ref.current; if (!el) return
    el.focus()
    document.execCommand(cmd, false)
    onChange(el.innerHTML)
  }
  const rtBtn: CSSProperties = { cursor: 'pointer', border: '1px solid rgba(15,35,64,0.14)', background: '#fff', borderRadius: 7, padding: '4px 9px', fontSize: 12, color: 'rgba(20,35,61,0.7)', lineHeight: 1 }
  return (
    <div style={{ border: '1px solid rgba(15,35,64,0.14)', borderRadius: 11, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex', gap: 5, padding: 6, borderBottom: '1px solid rgba(15,35,64,0.08)', background: '#FBFAF6' }}>
        <button type="button" aria-label="Negrita" title="Negrita" onMouseDown={e => { e.preventDefault(); exec('bold') }} style={{ ...rtBtn, fontWeight: 800 }}>B</button>
        <button type="button" aria-label="Cursiva" title="Cursiva" onMouseDown={e => { e.preventDefault(); exec('italic') }} style={{ ...rtBtn, fontStyle: 'italic' }}>I</button>
        <button type="button" aria-label="Viñetas" title="Viñetas" onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} style={rtBtn}>• Lista</button>
      </div>
      <div
        ref={ref}
        className="ep-rt"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={e => onChange((e.target as HTMLDivElement).innerHTML)}
        style={{ minHeight, maxHeight: 360, overflowY: 'auto', padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5, color: '#14233D', outline: 'none' }}
      />
    </div>
  )
}

/* ─── Íconos ─────────────────────────────────────────────────── */
function PencilIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
}
function ArrowIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M7 17 17 7M7 7h10v10" /></svg>
}
function RefreshIcon({ stroke = 'currentColor' }: { stroke?: string }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
}
function DbIcon({ stroke = 'currentColor' }: { stroke?: string }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></svg>
}
