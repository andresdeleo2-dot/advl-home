'use client'
/* Widget de SESIÓN DE FOCO reutilizable (el mismo temporizador flotante de /tiempo),
   para usarlo también dentro de Épicas. Comparte el estado `margen.v1` (localStorage +
   /api/tiempo-estado), así una sesión iniciada aquí se ve y controla igual en /tiempo y
   viceversa. No toca TiempoClient: lee/escribe el MISMO almacén.

   La escritura a Épicas (sumar tiempo a la bitácora / marcar terminada) se delega al
   contenedor por callbacks, para no duplicar la lógica de tareas. */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { KEY, hm, clock, parse, iso, defaults, type AppData, type Session, type Area, type HistoryRow } from '@/lib/tiempo'
import type { EpicaTask, EpicaSubtask, EpicaTaskLink, EpicaTaskComment } from '@/lib/supabase'
import { safeUrl, uid as coreUid } from '@/components/epicas/core'

const TS_KEY = KEY + '.ts'
const SERIF = 'var(--tiempo-serif), Georgia, serif'
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// Minutos transcurridos tolerando cruce de medianoche (now = minutos del día).
const elapsedMin = (start: number, nowMin: number) => { let d = nowMin - start; if (d < -1) d += 1440; return d }
// Transcurrido contando pausas. Con segAt (ms) se mide con reloj real (robusto a medianoche/olvidos).
const sessionElapsed = (s: { start: number; pausedAccum?: number; pausedAt?: number; segAt?: number }, nowMin: number) => {
  const banked = s.pausedAccum || 0
  if (s.pausedAt != null) return banked
  if (s.segAt != null) return banked + Math.max(0, (Date.now() - s.segAt) / 60000)
  return banked + Math.max(0, elapsedMin(s.start, nowMin))
}
// ¿La sesión local ya terminó en OTRA pestaña/dispositivo? (el tombstone entrante es más nuevo que
// el inicio de esta sesión). Si sí, NO la conserves al adoptar: evita doble registro y resurrección.
const localEnded = (localSess: Session, incomingEnd?: number) => !!localSess && (incomingEnd || 0) > (localSess.startedAt || 0)
// Elige QUÉ sesión conservar al mezclar con un blob entrante: si ambas traen sesión, gana la de `mod`
// más nuevo (así un pause/resume reciente no lo pisa una copia rancia de otra pestaña); si sólo la
// local, se conserva salvo tombstone; si sólo la entrante, se adopta.
const chooseSession = (local: Session, inc: AppData): Session => {
  if (local && inc.session) return (local.mod || 0) >= (inc.session.mod || 0) ? local : inc.session
  if (local && !inc.session) return localEnded(local, inc.sessionEnd) ? null : local
  return inc.session
}
function beep() {
  try {
    const AC: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC(); ctx.resume?.()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55)
    o.start(); o.stop(ctx.currentTime + 0.55); o.onended = () => ctx.close()
  } catch {}
}
function notify(title: string, body: string) {
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon.png' }) } catch {}
}

export type BeginArgs = { name: string; epicaId?: string; taskId?: string; area?: Area; dur?: number }
type FinishInfo = { minutes: number; day: string; logId: string; note: string; markDone: boolean }
export type FocusHooks = {
  /** Escribe a Épicas el tiempo de una sesión ligada a una tarea (bitácora) y, si markDone, la termina. */
  onFinishTask?: (epicaId: string, taskId: string, info: FinishInfo) => void
  /** Minutos ya registrados antes en esa tarea (para "…de antes / en total"). */
  priorMinFor?: (taskId: string) => number
  /** Minutos registrados HOY en esa tarea (sesiones previas de hoy, sin la actual). */
  todayMinFor?: (taskId: string) => number
  /** Estimado de cuánto durará la tarea (por dificultad), en minutos. 0 = sin estimar. */
  plannedMinFor?: (taskId: string) => number
  /** Tarea viva (subtareas/links/comentarios/fechas) para los paneles del Modo foco. */
  taskFor?: (taskId: string) => EpicaTask | null
  /** Aplica un parche a la tarea en foco (subtareas, fechas, links, comentarios…). Devuelve false si
   *  NO se aplicó (p.ej. columna gateada sin migración), para que el input no se limpie y no se pierda. */
  onPatchTask?: (taskId: string, patch: Partial<EpicaTask>) => boolean | void
  /** Si la sesión vino de una rutina diaria, marca su día como hecho al terminar. */
  onFinishRoutine?: (epicaId: string, rIdx: number, day: string) => void
  /** Aviso ligero al descartar. */
  onToast?: (msg: string) => void
}

export function useFocusSession(hooks: FocusHooks) {
  const hooksRef = useRef(hooks); useEffect(() => { hooksRef.current = hooks }, [hooks])
  const [data, setData] = useState<AppData>(() => defaults())
  const dataRef = useRef<AppData>(data); useEffect(() => { dataRef.current = data }, [data])
  const [now, setNow] = useState(0)
  const [pomoOn, setPomoOn] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [sessionMin, setSessionMin] = useState(false)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPush = useRef<AppData | null>(null)
  const readyRef = useRef(false)   // ya reconciliamos con el servidor: recién ahí se permite ARRANCAR una sesión (evita pisar los datos reales de /tiempo)
  const phaseNotified = useRef<number>(-1)
  const pomoStartElRef = useRef(0)   // minutos de sesión transcurridos cuando se PRENDIÓ el Pomodoro (los ciclos cuentan desde ahí, no desde el inicio de la sesión)

  const session = data.session

  // Reloj: cada 1s con sesión activa, cada 15s en reposo.
  useEffect(() => {
    const tick = () => { const x = new Date(); setNow(x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60) }
    tick()
    const id = setInterval(tick, session ? 1000 : 15000)
    return () => clearInterval(id)
  }, [!!session])

  // Carga inicial: localStorage (rápido) + reconciliación con el servidor (adopta si es más nuevo
  // y aquí no hay sesión activa). NO hace PUT: sólo lee, para no pisar los datos de /tiempo.
  useEffect(() => {
    let d = defaults()
    try { const raw = localStorage.getItem(KEY); if (raw) d = Object.assign(defaults(), JSON.parse(raw)) } catch {}
    dataRef.current = d; setData(d)
    const markReady = () => { readyRef.current = true }
    const readyFallback = setTimeout(markReady, 2500)   // no bloquear para siempre si el server cuelga
    fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
      if (!j?.ok || !j.ready) return
      const serverTs = Number(j.ts) || 0
      const localTs = Number(localStorage.getItem(TS_KEY) || 0)
      if (serverTs > localTs) {
        // Adopta lo del server, PERO conserva una sesión local viva (no la pises); así un blob
        // viejo de este equipo no borra history/blocks más nuevos de otro dispositivo.
        const sv = Object.assign(defaults(), j.data || {})
        const merged: AppData = { ...sv, session: chooseSession(dataRef.current.session, sv) }
        dataRef.current = merged; setData(merged)
        try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
      }
    }).catch(() => {}).finally(() => { clearTimeout(readyFallback); markReady() })

    // Otra pestaña (p.ej. /tiempo) cambió el estado → recárgalo (mantiene ambas en sync).
    // Si el blob entrante NO trae sesión pero aquí hay una VIVA que este tab controla, conserva
    // la local: evita que un save rancio de la pestaña /tiempo mate el cronómetro en curso.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        const inc = Object.assign(defaults(), JSON.parse(e.newValue)) as AppData
        const nd: AppData = { ...inc, session: chooseSession(dataRef.current.session, inc) }
        dataRef.current = nd; setData(nd)
      } catch {}
    }
    // Al enfocar, adopta lo del servidor si es más nuevo, conservando la sesión local viva.
    const adopt = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
        if (!j?.ok || !j.ready) return
        const serverTs = Number(j.ts) || 0
        const localTs = Number(localStorage.getItem(TS_KEY) || 0)
        if (serverTs > localTs) {
          const sv = Object.assign(defaults(), j.data || {})
          const merged: AppData = { ...sv, session: chooseSession(dataRef.current.session, sv) }
          dataRef.current = merged; setData(merged)
          try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
        }
      }).catch(() => {})
    }
    const flush = () => { if (!pendingPush.current) return; const body = pendingPush.current; pendingPush.current = null; fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }), keepalive: true }).catch(() => {}) }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', adopt)
    document.addEventListener('visibilitychange', adopt)
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', adopt); document.removeEventListener('visibilitychange', adopt); window.removeEventListener('pagehide', flush) }
  }, [])

  // Persiste un cambio: localStorage instantáneo + PUT al servidor (debounce). Preserva el resto
  // de AppData (bloques, historial…) porque parte de dataRef ya cargado. Normaliza igual que
  // /tiempo (poda history a 84 días si crece, descarta scheduled pasados y backToTasks viejos)
  // para no reinflar el blob cuando la sesión se controla sólo desde /epicas.
  const save = useCallback((patch: Partial<AppData>) => {
    const merged = { ...dataRef.current, ...patch }
    const today0 = iso(new Date())
    const cutoff = iso(new Date(Date.now() - 84 * 86400000))
    const nd: AppData = {
      ...merged,
      history: merged.history.length > 500 ? merged.history.filter(h => h.date >= cutoff) : merged.history,
      scheduled: (merged.scheduled || []).filter(s => !s.date || s.date >= today0),
      backToTasks: (merged.backToTasks || []).filter(k => k.startsWith(today0 + '·')),
    }
    dataRef.current = nd; setData(nd)
    try { localStorage.setItem(KEY, JSON.stringify(nd)); localStorage.setItem(TS_KEY, String(Date.now())) } catch {}
    pendingPush.current = nd
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      const body = pendingPush.current; if (!body) return; pendingPush.current = null
      fetch('/api/tiempo-estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })
        .then(r => r.json()).then(j => { if (j?.ts) try { localStorage.setItem(TS_KEY, String(j.ts)) } catch {} }).catch(() => {})
    }, 700)
  }, [])

  // Registra a Épicas el tiempo de una sesión ligada a una tarea (bitácora + opcional terminar).
  // El MISMO logId liga el registro de margen.v1 con la entrada de bitácora (para editar/borrar en sync).
  const logToEpica = useCallback((s: NonNullable<Session>, minutes: number, day: string, markDone: boolean, logId: string) => {
    if (!s.taskId || !s.epicaId) return
    hooksRef.current.onFinishTask?.(s.epicaId, s.taskId, { minutes, day, logId, note: `⏱ ${hm(minutes)} trabajado`, markDone })
  }, [])

  const begin = useCallback((a: BeginArgs): boolean => {
    if (!readyRef.current) { hooksRef.current.onToast?.('Cargando tu estado… intenta de nuevo en un segundo'); return false }
    pomoStartElRef.current = 0; setPomoOn(false)   // Pomodoro arranca limpio para la nueva sesión (no hereda el baseline de la anterior)
    const t0 = Date.now()
    const ns: NonNullable<Session> = { name: a.name || 'Tarea', area: a.area || 'trabajo', start: Math.round(now), dur: a.dur || 0, epicaId: a.epicaId, taskId: a.taskId, origStart: Math.round(now), startedAt: t0, segAt: t0, mod: t0, segs: [] }
    const s = dataRef.current.session
    if (s) {
      const el = Math.max(1, Math.round(sessionElapsed(s, now)))
      const msg = el > 480
        ? `«${s.name}» lleva ${hm(el)} — parece que el cronómetro se quedó corriendo. Si acepto GUARDO todo ese tiempo y empiezo «${ns.name}». Cancela si no trabajaste todo eso.`
        : `Tienes «${s.name}» en curso (${hm(el)}). ¿La guardo y empiezo «${ns.name}»?`
      if (!window.confirm(msg)) return false
      const logId = uid()
      const startD = s.startedAt != null ? new Date(s.startedAt) : null
      const histDay = startD ? iso(startD) : iso(new Date())
      const histStart = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
      const hist: HistoryRow = { date: histDay, name: s.name, area: s.area, start: histStart, dur: el, done: s.taskId ? false : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId } : {}) }
      save({ session: ns, history: dataRef.current.history.concat([hist]) })
      logToEpica(s, el, histDay, false, logId)
    } else {
      save({ session: ns })
    }
    setSessionMin(false)
    return true
  }, [now, save, logToEpica])

  const pauseSession = useCallback(() => { const s = dataRef.current.session; if (!s || s.pausedAt != null) return; const openStart = s.segAt ?? s.startedAt ?? Date.now(); const seg = s.segAt != null ? (Date.now() - s.segAt) / 60000 : elapsedMin(s.start, now); save({ session: { ...s, pausedAccum: (s.pausedAccum || 0) + Math.max(0, seg), pausedAt: Math.round(now), mod: Date.now(), segs: [...(s.segs || []), [openStart, Date.now()] as [number, number]] } }) }, [now, save])
  const resumeSession = useCallback(() => { const s = dataRef.current.session; if (!s || s.pausedAt == null) return; save({ session: { ...s, start: Math.round(now), segAt: Date.now(), pausedAt: undefined, mod: Date.now() } }) }, [now, save])
  const extend = useCallback(() => { const s = dataRef.current.session; if (s) save({ session: { ...s, dur: s.dur + 15, mod: Date.now() } }) }, [save])
  const setSessionStart = useCallback((startMin: number) => {
    const s = dataRef.current.session; if (!s) return
    const m = Math.max(0, Math.min(1439, Math.round(startMin)))
    const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0)
    if (d.getTime() > Date.now()) return
    if (s.pausedAt != null) {
      // Estaba EN PAUSA: no la reanudes. Ajusta lo BANCADO por el desplazamiento del inicio (no
      // recalcules ahora−inicio: eso contaría el hueco de la pausa como trabajado).
      const oldStartMs = s.startedAt ?? d.getTime()
      const banked = Math.max(0, (s.pausedAccum || 0) + (oldStartMs - d.getTime()) / 60000)
      save({ session: { ...s, origStart: m, start: m, startedAt: d.getTime(), pausedAccum: banked, mod: Date.now() } })
    } else {
      save({ session: { ...s, origStart: m, start: m, startedAt: d.getTime(), segAt: d.getTime(), pausedAccum: 0, pausedAt: undefined, mod: Date.now(), segs: [] } })
    }
  }, [save])
  const cancel = useCallback(() => { const s = dataRef.current.session; save({ session: null, sessionEnd: Date.now() }); setFocusOpen(false); setPomoOn(false); pomoStartElRef.current = 0; if (s) hooksRef.current.onToast?.(`Descartada «${s.name}» sin registrar`) }, [save])
  const finish = useCallback((markDone = false) => {
    const s = dataRef.current.session; if (!s) return
    const elapsed = Math.max(1, Math.round(sessionElapsed(s, now)))
    if (elapsed > 480 && !window.confirm(`Llevas ${hm(elapsed)} en «${s.name}». Parece que el cronómetro se quedó corriendo. ¿Registrar TODO ese tiempo?\n\nAceptar = registrarlo · Cancelar = descartarlo sin registrar.`)) {
      save({ session: null, sessionEnd: Date.now() }); setFocusOpen(false); setPomoOn(false); pomoStartElRef.current = 0; hooksRef.current.onToast?.(`Descartada «${s.name}» sin registrar`); return
    }
    const logId = uid()
    const startD = s.startedAt != null ? new Date(s.startedAt) : null
    const entryDay = startD ? iso(startD) : iso(new Date())
    const startMin = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
    // Segmentos trabajados (para dibujar el registro con huecos donde pausaste). Sólo si hubo pausa.
    const toMin = (ms: number) => { const dt = new Date(ms); return dt.getHours() * 60 + dt.getMinutes() }
    const openStart = s.segAt ?? s.startedAt
    const allSegs: [number, number][] = [...(s.segs || []), ...(s.pausedAt == null && openStart != null ? [[openStart, Date.now()] as [number, number]] : [])]
    const segments = (s.segs && s.segs.length) ? allSegs.map(([a, b]) => [toMin(a), toMin(b)] as [number, number]) : undefined
    const entry: HistoryRow = { date: entryDay, name: s.name, area: s.area, start: startMin, dur: elapsed, done: s.taskId ? markDone : true, ...(segments ? { segments } : {}), ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId } : {}) }
    save({ session: null, sessionEnd: Date.now(), history: dataRef.current.history.concat([entry]) })
    setFocusOpen(false); setPomoOn(false); pomoStartElRef.current = 0
    logToEpica(s, elapsed, entryDay, markDone, logId)
    // Si la sesión venía de una rutina, marca su día como hecho (llena el chip de hoy).
    if (s.routineRef) hooksRef.current.onFinishRoutine?.(s.routineRef.epicaId, s.routineRef.rIdx, iso(new Date()))
    hooksRef.current.onToast?.(`✓ Registré ${hm(elapsed)} en «${s.name}»${markDone ? ' · marcada hecha' : ''}`)
  }, [now, save, logToEpica])

  // Pomodoro: avisa (beep + notificación) en cada cambio foco↔descanso.
  useEffect(() => {
    if (!pomoOn || !session || session.pausedAt != null) { phaseNotified.current = -1; return }
    const pel = Math.max(0, sessionElapsed(session, now) - pomoStartElRef.current)   // tiempo DESDE que se prendió el Pomodoro
    const pos = pel % 30, inBreak = pos >= 25
    const marker = Math.floor(pel / 30) * 2 + (inBreak ? 1 : 0)
    if (phaseNotified.current === -1) { phaseNotified.current = marker; return }
    if (marker !== phaseNotified.current) {
      phaseNotified.current = marker
      beep(); notify(inBreak ? '🌿 Descanso' : '🎯 A enfocar', inBreak ? '5 minutos de descanso.' : 'Nuevo bloque de foco.')
    }
  }, [now, pomoOn, session])

  // Fin de bloque: cuando la sesión CON duración planeada cumple su dur, avisa una vez (beep+notif).
  const endNotified = useRef<number | null>(null)
  useEffect(() => {
    const s = session
    if (!s || !s.dur || s.pausedAt != null) return
    const key = s.origStart ?? s.start
    if (sessionElapsed(s, now) >= s.dur && endNotified.current !== key) {
      endNotified.current = key
      beep(); notify('⏱ Terminó tu bloque', `Planeaste ${hm(s.dur)} para «${s.name}».`)
    }
  }, [now, session])

  // ── Edición de la tarea en foco (subtareas/fechas/links/comentarios) vía hooks ──
  const focusTask = session?.taskId ? (hooksRef.current.taskFor?.(session.taskId) || null) : null
  const patchFocus = (patch: Partial<EpicaTask>): boolean => session?.taskId ? (hooksRef.current.onPatchTask?.(session.taskId, patch) !== false) : false
  const toggleSub = (key: string) => {
    if (!focusTask) return
    const subs = (focusTask.subtasks || []).map(s => ((s.id || s.t) === key ? { ...s, done: !s.done, doneAt: !s.done ? new Date().toISOString() : undefined } : s))
    patchFocus({ subtasks: subs })
  }
  const addSub = (text: string) => {
    const t = text.trim(); if (!t || !focusTask) return
    patchFocus({ subtasks: [...(focusTask.subtasks || []), { id: coreUid(), t, done: false }] })
  }
  const moveSub = (key: string, dir: -1 | 1) => {
    if (!focusTask) return
    const subs = [...(focusTask.subtasks || [])]
    const pend = subs.map((s, i) => ({ s, i })).filter(x => !x.s.done)
    const k = pend.findIndex(x => (x.s.id || x.s.t) === key); if (k < 0) return
    const j = k + dir; if (j < 0 || j >= pend.length) return
    const a = pend[k].i, b = pend[j].i; [subs[a], subs[b]] = [subs[b], subs[a]]
    patchFocus({ subtasks: subs })
  }
  const addLink = (label: string, url: string): boolean => {
    const u = url.trim(), l = label.trim(); if ((!u && !l) || !focusTask) return false
    return patchFocus({ links: [...(focusTask.links || []), { label: l, url: u }] })
  }
  const addComment = (text: string): boolean => {
    const t = text.trim(); if (!t || !focusTask) return false
    return patchFocus({ comentarios: [...(focusTask.comentarios || []), { at: new Date().toISOString(), text: t }] })
  }

  // ── View-model ──
  const paused = !!(session && session.pausedAt != null)
  const elapsed = session ? Math.max(0, sessionElapsed(session, now)) : 0
  const planned = session ? session.dur : 0
  const isOpen = !!session && !planned          // contador libre (sin duración fijada)
  const sEnd = session ? Math.round(now) + Math.max(0, planned - elapsed) : 0
  const elapsedLabel = session ? hm(elapsed) : ''
  const pct = session && planned ? Math.min(100, (elapsed / planned) * 100) : 0
  const note = session ? (paused ? 'En pausa. Reanuda cuando vuelvas.' : isOpen ? 'Contador libre. Termina cuando acabes.' : `Quedan ${hm(planned - elapsed)}. Terminarías a las ${clock(sEnd)}.`) : ''
  const startMin = session ? (session.startedAt != null ? (() => { const d = new Date(session.startedAt!); return d.getHours() * 60 + d.getMinutes() })() : Math.round(session.origStart ?? session.start)) : 0
  const priorMin = session?.taskId ? (hooksRef.current.priorMinFor?.(session.taskId) || 0) : 0

  const card: ReactNode = !session ? null : (
    <>
      {/* Pastilla minimizada */}
      {sessionMin && (
        <button onClick={() => setSessionMin(false)} title="Abrir la sesión en curso" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, display: 'flex', alignItems: 'center', gap: 10, background: '#1c1a17', color: '#faf7f1', border: 'none', borderRadius: 999, padding: '11px 16px 11px 14px', boxShadow: '0 14px 34px -12px rgba(0,0,0,.55)', cursor: 'pointer' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: paused ? '#d98a55' : '#6f8256', display: 'block', flexShrink: 0, boxShadow: paused ? 'none' : '0 0 0 3px rgba(111,130,86,.25)' }} />
          <span style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1 }}>{elapsedLabel}</span>
          <span style={{ fontSize: 13, color: '#cdc4b8', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
          <span style={{ fontSize: 15, color: '#a49b90', marginLeft: 2 }}>▴</span>
        </button>
      )}

      {/* Popup flotante */}
      {!sessionMin && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, width: 'min(340px, calc(100vw - 40px))', background: '#1c1a17', color: '#faf7f1', borderRadius: 22, padding: 20, boxShadow: '0 22px 55px -15px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ ...LBL, color: paused ? '#d98a55' : '#a49b90' }}>{paused ? '⏸ en pausa' : 'en curso'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#a49b90' }} title="Corrige la hora en que empezaste">empezó
                <input type="time" value={clock(startMin)} onChange={e => setSessionStart(parse(e.target.value))} style={{ background: 'transparent', border: '1px solid #4a443c', borderRadius: 8, color: '#faf7f1', padding: '2px 5px', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', colorScheme: 'dark' }} />
              </label>
              <button onClick={() => setSessionMin(true)} title="Minimizar" aria-label="Minimizar la sesión" style={{ border: '1px solid #4a443c', background: 'transparent', color: '#cdc4b8', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>–</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
            <span style={{ fontFamily: SERIF, fontSize: 48, lineHeight: .9, opacity: paused ? 0.55 : 1 }}>{elapsedLabel}</span>
            {(priorMin > 0 || elapsed > 0) && (() => { const tp = session.taskId ? (hooksRef.current.todayMinFor?.(session.taskId) || 0) : 0; return <span style={{ fontSize: 12, color: '#E7C56B' }}>Hoy {hm(tp + elapsed)}{priorMin - tp > 0 ? ` · ${hm(priorMin + elapsed)} en total` : ''}</span> })()}
            <span style={{ fontSize: 12.5, color: '#cdc4b8', lineHeight: 1.45 }}>{note}</span>
          </div>
          <button onClick={() => setFocusOpen(true)} style={{ border: '1px solid #4a443c', background: 'rgba(231,197,107,0.10)', color: '#E7C56B', borderRadius: 999, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🎯 Modo foco</button>
          {!isOpen && (
            <div style={{ height: 5, background: '#35302a', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: '#d98a55', borderRadius: 999, transition: 'width .3s' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div onClick={paused ? resumeSession : pauseSession} style={{ flex: 1, minWidth: 110, textAlign: 'center', background: paused ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#35302a', color: paused ? '#1B1305' : '#faf7f1', borderRadius: 999, padding: '11px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{paused ? '▶ Reanudar' : '⏸ Pausar'}</div>
            <div onClick={() => finish(false)} style={{ flex: 1, minWidth: 100, textAlign: 'center', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: '11px 12px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Terminar</div>
            {session.taskId && <div onClick={() => finish(true)} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, cursor: 'pointer' }}>✓ y hecha</div>}
            {!isOpen && <div onClick={extend} style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, cursor: 'pointer' }}>+15m</div>}
            <div onClick={cancel} title="Descartar" style={{ textAlign: 'center', border: '1px solid #4a443c', borderRadius: 999, padding: '11px 12px', fontSize: 12.5, color: '#a49b90', cursor: 'pointer' }}>Descartar</div>
          </div>
        </div>
      )}

      {/* Modo foco: overlay a pantalla completa */}
      {focusOpen && (() => {
        const el = elapsed
        // Pomodoro: cuenta desde que lo PRENDISTE (no desde el inicio de la sesión).
        const pomoEl = Math.max(0, el - pomoStartElRef.current)
        const pos = pomoEl % 30, inBreak = pos >= 25
        const phaseRemain = Math.max(0, inBreak ? 30 - pos : 25 - pos)
        const phasePct = inBreak ? ((pos - 25) / 5) * 100 : (pos / 25) * 100
        const cyc = Math.floor(pomoEl / 30) + 1
        const todayEl = Math.max(0, el)
        const totalTask = priorMin + todayEl
        // Planeado vs usado, con etiquetas COHERENTES (antes la barra decía "usado hoy" pero contaba
        // sólo la sesión, contradiciendo la línea "Hoy"):
        //  · Si fijaste una duración de sesión (session.dur) → el plan es de ESTA SESIÓN y se compara
        //    con lo de esta sesión (todayEl). Label "Esta sesión".
        //  · Si no (contador libre) pero la tarea tiene estimado por dificultad → el plan es de la
        //    TAREA y se compara con el TOTAL invertido. Label "Estimado".
        const estTask = session.taskId ? (hooksRef.current.plannedMinFor?.(session.taskId) || 0) : 0
        const usingSessionPlan = planned > 0
        const planBase = usingSessionPlan ? planned : estTask
        const usedForPlan = usingSessionPlan ? todayEl : totalTask
        const planPctRaw = planBase > 0 ? Math.round((usedForPlan / planBase) * 100) : 0
        const planPct = Math.min(100, planPctRaw)
        const overPlan = planBase > 0 && usedForPlan > planBase
        // HOY: sesiones previas de hoy (bitácora con d===hoy) + esta sesión. `priorMin` incluye TODOS
        // los días; para aislar hoy, resto lo de hoy previo. Así diferenciamos "hoy" de "días previos".
        const todayPrior = session.taskId ? (hooksRef.current.todayMinFor?.(session.taskId) || 0) : 0
        const todayTotal = todayPrior + todayEl
        const prevDays = Math.max(0, priorMin - todayPrior)
        // TOTAL trabajado en el DÍA (todas las tareas/actividades, no sólo ésta): lo ya registrado hoy
        // (área trabajo, incluye otras tareas) + esta sesión en curso.
        const day0 = iso(new Date())
        const dayWorkMin = (data.history || []).filter(h => h.date === day0 && h.area === 'trabajo').reduce((s, h) => s + h.dur, 0)
        const dayTotalNow = dayWorkMin + (session.area === 'trabajo' ? todayEl : 0)
        const nowClock = clock(Math.round(now))
        const sitRemain = Math.max(0, planned - Math.max(0, el))
        const endClock = clock(Math.round(now) + sitRemain)
        const overSit = planned > 0 && Math.max(0, el) >= planned
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'radial-gradient(120% 120% at 50% 0%, #26221d 0%, #17140f 60%, #0f0d0a 100%)', color: '#faf7f1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
            <button onClick={() => setFocusOpen(false)} title="Salir del modo foco" style={{ position: 'absolute', top: 20, right: 22, border: '1px solid #3a352e', background: 'transparent', color: '#a49b90', borderRadius: 999, padding: '9px 16px', fontSize: 13.5, cursor: 'pointer' }}>✕ Salir</button>
            <span style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: pomoOn ? (inBreak ? '#8fae74' : '#E7C56B') : '#a49b90' }}>{paused ? '⏸ en pausa' : pomoOn ? (inBreak ? '🌿 descanso' : '🎯 foco') : 'en curso'}</span>
            <span style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 500, textAlign: 'center', maxWidth: 700, lineHeight: 1.2 }}>{session.name}</span>
            <span style={{ fontSize: 14, color: '#a49b90' }}>🕐 son las {nowClock}{planned > 0 ? (overSit ? ` · pasaste tu plan de ${hm(planned)}` : ` · terminarías a las ${endClock}`) : ' · contador libre'}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a49b90' }} title="Corrige la hora en que empezaste">empezó
              <input type="time" value={clock(startMin)} onChange={e => setSessionStart(parse(e.target.value))} style={{ background: 'transparent', border: '1px solid #3a352e', borderRadius: 8, color: '#faf7f1', padding: '3px 7px', fontSize: 13, fontVariantNumeric: 'tabular-nums', colorScheme: 'dark' }} />
            </label>
            <span style={{ fontFamily: SERIF, fontSize: 'clamp(88px,20vw,190px)', lineHeight: .82, letterSpacing: '-.02em', opacity: paused ? 0.5 : 1 }}>{elapsedLabel || '0m'}</span>
            {(priorMin > 0 || todayTotal > 0 || planBase > 0 || dayTotalNow > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: 'min(460px,90vw)', marginTop: -4 }}>
                {/* TOTAL DEL DÍA primero: todo lo trabajado hoy (todas las tareas) + esta sesión. */}
                {dayTotalNow > 0 && (
                  <span style={{ fontSize: 15, color: '#faf7f1', textAlign: 'center' }}>
                    🗓 Hoy llevas <b>{hm(dayTotalNow)}</b> trabajadas en total{dayWorkMin > 0 && session.area === 'trabajo' ? <span style={{ fontSize: 12.5, color: '#8b8379' }}> ({hm(dayWorkMin)} antes + {hm(todayEl)} en esta sesión)</span> : ''}
                  </span>
                )}
                {/* Y aparte, lo de ESTA tarea (hoy y acumulado de todos los días). */}
                <span style={{ fontSize: 12.5, color: '#8b8379', textAlign: 'center' }}>
                  En esta tarea: <b style={{ color: '#cdc4b8' }}>{hm(todayTotal)}</b> hoy{prevDays > 0 ? <> · <b style={{ color: '#cdc4b8' }}>{hm(totalTask)}</b> acumulado (<span style={{ color: '#E7C56B' }}>{hm(prevDays)} de días previos</span>)</> : ''}
                </span>
                {/* Planeado vs usado (SÓLO del tiempo planeado), con % usado. */}
                {planBase > 0 && (
                  <>
                    <div style={{ width: '100%', height: 7, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(3, planPct)}%`, height: '100%', background: overPlan ? 'linear-gradient(90deg,#C2933A,#d98a55)' : 'linear-gradient(90deg,#6f8256,#8fae74)', borderRadius: 999, transition: 'width .4s' }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: overPlan ? '#d98a55' : '#8b8379' }}>
                      {usingSessionPlan ? 'Esta sesión' : 'Estimado'} <b style={{ color: '#cdc4b8' }}>{hm(planBase)}</b>{usingSessionPlan ? '' : ' (dif.)'} · usado <b style={{ color: '#cdc4b8' }}>{hm(usedForPlan)}</b>{usingSessionPlan ? '' : ' en total'} {overPlan ? `· te pasaste ${hm(usedForPlan - planBase)}` : ''}<b style={{ color: overPlan ? '#d98a55' : '#8fae74' }}> ({planPctRaw}%)</b>
                    </span>
                  </>
                )}
              </div>
            )}
            {pomoOn && !paused && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 'min(460px,90vw)' }}>
                <span style={{ fontSize: 15, color: inBreak ? '#8fae74' : '#E7C56B' }}>{inBreak ? `Descanso · quedan ${hm(phaseRemain)}` : `Bloque ${cyc} · quedan ${hm(phaseRemain)} de foco`}</span>
                <div style={{ width: '100%', height: 8, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${phasePct}%`, height: '100%', background: inBreak ? 'linear-gradient(90deg,#6f8256,#8fae74)' : 'linear-gradient(90deg,#C2933A,#E7C56B)', borderRadius: 999, transition: 'width .5s' }} />
                </div>
                <span style={{ fontSize: 12.5, color: '#8b8379' }}>25 min de foco · 5 de descanso · te aviso en cada cambio</span>
              </div>
            )}
            {!pomoOn && !isOpen && (
              <div style={{ width: 'min(460px,90vw)', height: 6, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: '#d98a55', borderRadius: 999, transition: 'width .3s' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
              <button onClick={() => { if (!pomoOn) { pomoStartElRef.current = elapsed; phaseNotified.current = -1 } setPomoOn(v => !v) }} title="Pomodoro: 25 min de foco + 5 de descanso, contando desde que lo prendes." style={{ border: `1px solid ${pomoOn ? '#C2933A' : '#3a352e'}`, background: pomoOn ? 'rgba(231,197,107,0.12)' : 'transparent', color: pomoOn ? '#E7C56B' : '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🍅 Pomodoro {pomoOn ? 'activado' : 'apagado'}</button>
              <button onClick={paused ? resumeSession : pauseSession} style={{ border: 'none', background: paused ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#35302a', color: paused ? '#1B1305' : '#faf7f1', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
              {!isOpen && <button onClick={extend} style={{ border: '1px solid #3a352e', background: 'transparent', color: '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, cursor: 'pointer' }}>+15m</button>}
              <button onClick={() => finish(false)} style={{ border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Terminar</button>
              {session.taskId && <button onClick={() => finish(true)} style={{ border: '1px solid #6f8256', background: 'rgba(111,130,86,0.15)', color: '#a9c48c', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✓ y hecha</button>}
              <button onClick={cancel} title="Descartar sin registrar" style={{ border: '1px solid #3a352e', background: 'transparent', color: '#a49b90', borderRadius: 999, padding: '13px 20px', fontSize: 14, cursor: 'pointer' }}>Descartar</button>
            </div>

            {/* Subtareas de la tarea en foco: márcalas conforme avanzas y agrega nuevas sin salir.
                Se muestra SIEMPRE que la sesión venga de una tarea (aunque aún no tenga subtareas). */}
            {focusTask && (
              <FocusSubtasks
                subs={focusTask.subtasks || []}
                done={(focusTask.subtasks || []).filter(x => x.done).length}
                onToggle={toggleSub}
                onAdd={addSub}
                onMove={moveSub}
              />
            )}
            {focusTask && (
              <FocusExtras
                due={focusTask.due || ''}
                plan={focusTask.plan || ''}
                links={focusTask.links || []}
                comentarios={focusTask.comentarios || []}
                onPatch={patchFocus}
                onAddLink={addLink}
                onAddComment={addComment}
              />
            )}
          </div>
        )
      })()}
    </>
  )

  // `busy` = el overlay de Modo foco está abierto (editando subtareas/extras): el contenedor
  // debe pausar sus refrescos (loadEpics) para no revertir esas ediciones en vuelo.
  // "Lo más importante hoy" (MIT) que fijaste en /tiempo — para estelarlo en Épicas (mismo margen.v1).
  const mitIds = data.mit?.date === iso(new Date()) ? (data.mit.ids || []) : []
  return { session, active: !!session, busy: focusOpen, mitIds, begin, card }
}

const LBL: CSSProperties = { fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90', fontWeight: 600 }

/* Panel de subtareas del Modo foco: marca las hechas y agrega nuevas sin salir del foco.
   (Mismo diseño que el de /tiempo; pendientes arriba —reordenables—, terminadas al fondo.) */
function FocusSubtasks({ subs, done, onToggle, onAdd, onMove }: { subs: EpicaSubtask[]; done: number; onToggle: (key: string) => void; onAdd: (text: string) => void; onMove?: (key: string, dir: -1 | 1) => void }) {
  const [txt, setTxt] = useState('')
  const add = () => { const t = txt.trim(); if (!t) return; onAdd(t); setTxt('') }
  const pend = subs.filter(s => !s.done)
  const doneL = subs.filter(s => s.done)
  const canMove = !!onMove && pend.length > 1
  const arrowBtn: CSSProperties = { border: 'none', background: 'transparent', color: '#a49b90', cursor: 'pointer', fontSize: 9, lineHeight: 1, padding: '1px 3px' }
  const row = (sub: EpicaSubtask, arrows: { up: boolean; down: boolean } | null) => { const key = sub.id || sub.t; return (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', width: '100%' }}>
      <button onClick={() => onToggle(key)} title={sub.done ? 'desmarcar' : 'marcar hecha'} style={{ flexShrink: 0, width: 21, height: 21, borderRadius: 6, border: sub.done ? 'none' : '1.5px solid #5a534a', background: sub.done ? '#6f8256' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f0d0a', cursor: 'pointer' }}>{sub.done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M20 6 9 17l-5-5" /></svg>}</button>
      <span onClick={() => onToggle(key)} style={{ flex: 1, fontSize: 15, color: sub.done ? '#7d766c' : '#faf7f1', textDecoration: sub.done ? 'line-through' : 'none', cursor: 'pointer' }}>{sub.t || 'Subtarea'}</span>
      {arrows && (
        <span style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <button onClick={() => onMove!(key, -1)} disabled={arrows.up} aria-label="Subir" title="Subir" style={{ ...arrowBtn, opacity: arrows.up ? 0.3 : 1, cursor: arrows.up ? 'default' : 'pointer' }}>▲</button>
          <button onClick={() => onMove!(key, 1)} disabled={arrows.down} aria-label="Bajar" title="Bajar" style={{ ...arrowBtn, opacity: arrows.down ? 0.3 : 1, cursor: arrows.down ? 'default' : 'pointer' }}>▼</button>
        </span>
      )}
    </div>
  ) }
  return (
    <div style={{ width: 'min(520px, 92vw)', maxHeight: '34vh', overflowY: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #33302a', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90' }}>subtareas</span>
        {subs.length > 0 && <span style={{ fontSize: 12, color: done === subs.length ? '#a9c48c' : '#cdc4b8' }}>{done}/{subs.length} hechas</span>}
      </div>
      {subs.length === 0 && <span style={{ fontSize: 13.5, color: '#8b8379', padding: '0 4px 8px', lineHeight: 1.4 }}>Divide esta tarea en pasos para ir marcando qué haces.</span>}
      {pend.map((sub, k) => row(sub, canMove ? { up: k === 0, down: k === pend.length - 1 } : null))}
      {doneL.map(sub => row(sub, null))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid #2a2620', paddingTop: 10 }}>
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="+ agregar subtarea" style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid #3a352e', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#faf7f1', outline: 'none' }} />
        {txt.trim() && <button onClick={add} style={{ border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Agregar</button>}
      </div>
    </div>
  )
}

/* Fechas, enlaces y comentarios de la tarea en foco: editar sin salir del foco. */
function FocusExtras({ due, plan, links, comentarios, onPatch, onAddLink, onAddComment }: { due: string; plan: string; links: EpicaTaskLink[]; comentarios: EpicaTaskComment[]; onPatch: (patch: Partial<EpicaTask>) => void; onAddLink: (label: string, url: string) => boolean; onAddComment: (text: string) => boolean }) {
  const [showLinkAdd, setShowLinkAdd] = useState(false)
  const [nlLabel, setNlLabel] = useState(''); const [nlUrl, setNlUrl] = useState('')
  const [comment, setComment] = useState('')
  const addLink = () => { if (!nlUrl.trim() && !nlLabel.trim()) return; if (onAddLink(nlLabel, nlUrl)) { setNlLabel(''); setNlUrl(''); setShowLinkAdd(false) } }
  const addComment = () => { const t = comment.trim(); if (!t) return; if (onAddComment(t)) setComment('') }   // no vaciar si el gate lo rechazó (no perder el texto)
  const field: CSSProperties = { minWidth: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid #3a352e', borderRadius: 10, padding: '9px 12px', fontSize: 14, color: '#faf7f1', outline: 'none' }
  const addBtn: CSSProperties = { border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }
  const secLbl: CSSProperties = { fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90' }
  return (
    <div style={{ width: 'min(520px, 92vw)', maxHeight: '38vh', overflowY: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid #33302a', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      {/* Fechas: cuándo se hace (plan) y cuándo se termina (vence) — editables aquí mismo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={secLbl}>fechas</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
            <span style={{ fontSize: 12, color: '#a49b90' }}>Hacer (plan)</span>
            <input type="date" value={plan} onChange={e => onPatch({ plan: e.target.value })} style={{ ...field, colorScheme: 'dark' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
            <span style={{ fontSize: 12, color: '#a49b90' }}>Vence (se termina)</span>
            <input type="date" value={due} onChange={e => onPatch({ due: e.target.value })} style={{ ...field, colorScheme: 'dark' }} />
          </label>
        </div>
      </div>

      {/* Enlaces */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={secLbl}>enlaces</span>
          <button onClick={() => setShowLinkAdd(v => !v)} style={{ border: '1px solid #4a443c', background: 'transparent', color: '#cdc4b8', borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'pointer' }}>{showLinkAdd ? 'cancelar' : '+ link'}</button>
        </div>
        {links.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {links.map((l, i) => (
              <a key={i} href={safeUrl(l.url)} target={(l.url || '').startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 13, fontWeight: 500, color: '#E7C56B', background: 'rgba(231,197,107,0.10)', border: '1px solid #4a443c', borderRadius: 999, padding: '6px 12px', maxWidth: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {l.label || l.url}</span>
              </a>
            ))}
          </div>
        )}
        {links.length === 0 && !showLinkAdd && <span style={{ fontSize: 13, color: '#8b8379' }}>Sin enlaces. Agrega uno con “+ link”.</span>}
        {showLinkAdd && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <input value={nlLabel} onChange={e => setNlLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="Etiqueta" style={{ ...field, flex: '0 0 120px', width: 120 }} />
            <input value={nlUrl} onChange={e => setNlUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink() }} placeholder="https://…" style={{ ...field, flex: 1 }} />
            <button onClick={addLink} style={addBtn}>Agregar</button>
          </div>
        )}
      </div>

      {/* Comentarios */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #2a2620', paddingTop: 12 }}>
        <span style={secLbl}>comentarios</span>
        {comentarios.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {comentarios.map((c, i) => (
              <div key={i} style={{ fontSize: 13.5, color: '#e4ddd2', lineHeight: 1.5 }}><span style={{ color: '#8b8379' }}>{new Date(c.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {new Date(c.at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })} · </span>{c.text}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment() } }} placeholder="Escribe un comentario…  (⌘/Ctrl + Enter para enviar)" rows={3} style={{ ...field, width: '100%', minHeight: 76, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }} />
          {comment.trim() && <button onClick={addComment} style={{ ...addBtn, alignSelf: 'flex-end' }}>Comentar</button>}
        </div>
      </div>
    </div>
  )
}
