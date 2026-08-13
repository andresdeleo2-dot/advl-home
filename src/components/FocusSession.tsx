'use client'
/* Widget de SESIÓN DE FOCO reutilizable (el mismo temporizador flotante de /tiempo),
   para usarlo también dentro de Épicas. Comparte el estado `margen.v1` (localStorage +
   /api/tiempo-estado), así una sesión iniciada aquí se ve y controla igual en /tiempo y
   viceversa. No toca TiempoClient: lee/escribe el MISMO almacén.

   La escritura a Épicas (sumar tiempo a la bitácora / marcar terminada) se delega al
   contenedor por callbacks, para no duplicar la lógica de tareas. */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { KEY, hm, clock, parse, iso, defaults, type AppData, type Session, type Area, type HistoryRow } from '@/lib/tiempo'

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
  /** Estimado de cuánto durará la tarea (por dificultad), en minutos. 0 = sin estimar. */
  plannedMinFor?: (taskId: string) => number
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
      if (serverTs > localTs && !dataRef.current.session) {
        const merged = Object.assign(defaults(), j.data || {})
        dataRef.current = merged; setData(merged)
        try { localStorage.setItem(KEY, JSON.stringify(merged)); localStorage.setItem(TS_KEY, String(serverTs)) } catch {}
      }
    }).catch(() => {}).finally(() => { clearTimeout(readyFallback); markReady() })

    // Otra pestaña (p.ej. /tiempo) cambió el estado → recárgalo (mantiene ambas en sync).
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return
      try { const nd = Object.assign(defaults(), JSON.parse(e.newValue)); dataRef.current = nd; setData(nd) } catch {}
    }
    // Al enfocar, si aquí no hay sesión, adopta la del servidor (una iniciada en otro lado).
    const adopt = () => {
      if (document.visibilityState !== 'visible' || dataRef.current.session) return
      fetch('/api/tiempo-estado').then(r => r.json()).then(j => {
        if (!j?.ok || !j.ready || dataRef.current.session) return
        const serverTs = Number(j.ts) || 0
        const localTs = Number(localStorage.getItem(TS_KEY) || 0)
        if (serverTs > localTs) {
          const merged = Object.assign(defaults(), j.data || {})
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
  // de AppData (bloques, historial…) porque parte de dataRef ya cargado.
  const save = useCallback((patch: Partial<AppData>) => {
    const nd = { ...dataRef.current, ...patch }
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
  const logToEpica = useCallback((s: NonNullable<Session>, minutes: number, day: string, markDone: boolean) => {
    if (!s.taskId || !s.epicaId) return
    hooksRef.current.onFinishTask?.(s.epicaId, s.taskId, { minutes, day, logId: uid(), note: `⏱ ${hm(minutes)} trabajado`, markDone })
  }, [])

  const begin = useCallback((a: BeginArgs): boolean => {
    if (!readyRef.current) { hooksRef.current.onToast?.('Cargando tu estado… intenta de nuevo en un segundo'); return false }
    const t0 = Date.now()
    const ns: NonNullable<Session> = { name: a.name || 'Tarea', area: a.area || 'trabajo', start: Math.round(now), dur: a.dur || 0, epicaId: a.epicaId, taskId: a.taskId, origStart: Math.round(now), startedAt: t0, segAt: t0 }
    const s = dataRef.current.session
    if (s) {
      const el = Math.max(1, Math.round(sessionElapsed(s, now)))
      if (!window.confirm(`Tienes «${s.name}» en curso (${hm(el)}). ¿La guardo y empiezo «${ns.name}»?`)) return false
      const startD = s.startedAt != null ? new Date(s.startedAt) : null
      const histDay = startD ? iso(startD) : iso(new Date())
      const histStart = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
      const hist: HistoryRow = { date: histDay, name: s.name, area: s.area, start: histStart, dur: el, done: s.taskId ? false : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId: uid() } : {}) }
      save({ session: ns, history: dataRef.current.history.concat([hist]) })
      logToEpica(s, el, histDay, false)
    } else {
      save({ session: ns })
    }
    setSessionMin(false)
    return true
  }, [now, save, logToEpica])

  const pauseSession = useCallback(() => { const s = dataRef.current.session; if (!s || s.pausedAt != null) return; const seg = s.segAt != null ? (Date.now() - s.segAt) / 60000 : elapsedMin(s.start, now); save({ session: { ...s, pausedAccum: (s.pausedAccum || 0) + Math.max(0, seg), pausedAt: Math.round(now) } }) }, [now, save])
  const resumeSession = useCallback(() => { const s = dataRef.current.session; if (!s || s.pausedAt == null) return; save({ session: { ...s, start: Math.round(now), segAt: Date.now(), pausedAt: undefined } }) }, [now, save])
  const extend = useCallback(() => { const s = dataRef.current.session; if (s) save({ session: { ...s, dur: s.dur + 15 } }) }, [save])
  const setSessionStart = useCallback((startMin: number) => {
    const s = dataRef.current.session; if (!s) return
    const m = Math.max(0, Math.min(1439, Math.round(startMin)))
    const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0)
    if (d.getTime() > Date.now()) return
    save({ session: { ...s, origStart: m, start: m, startedAt: d.getTime(), segAt: d.getTime(), pausedAccum: 0, pausedAt: undefined } })
  }, [save])
  const cancel = useCallback(() => { const s = dataRef.current.session; save({ session: null }); setFocusOpen(false); if (s) hooksRef.current.onToast?.(`Descartada «${s.name}» sin registrar`) }, [save])
  const finish = useCallback((markDone = false) => {
    const s = dataRef.current.session; if (!s) return
    const elapsed = Math.max(1, Math.round(sessionElapsed(s, now)))
    if (elapsed > 480 && !window.confirm(`Llevas ${hm(elapsed)} en «${s.name}». Parece que el cronómetro se quedó corriendo. ¿Registrar TODO ese tiempo?\n\nAceptar = registrarlo · Cancelar = descartarlo sin registrar.`)) {
      save({ session: null }); setFocusOpen(false); hooksRef.current.onToast?.(`Descartada «${s.name}» sin registrar`); return
    }
    const startD = s.startedAt != null ? new Date(s.startedAt) : null
    const entryDay = startD ? iso(startD) : iso(new Date())
    const startMin = startD ? startD.getHours() * 60 + startD.getMinutes() : Math.min(Math.round(s.origStart ?? s.start), Math.round(now))
    const entry: HistoryRow = { date: entryDay, name: s.name, area: s.area, start: startMin, dur: elapsed, done: s.taskId ? markDone : true, ...(s.taskId ? { epicaId: s.epicaId, taskId: s.taskId, logId: uid() } : {}) }
    save({ session: null, history: dataRef.current.history.concat([entry]) })
    setFocusOpen(false)
    logToEpica(s, elapsed, entryDay, markDone)
    hooksRef.current.onToast?.(`✓ Registré ${hm(elapsed)} en «${s.name}»${markDone ? ' · marcada hecha' : ''}`)
  }, [now, save, logToEpica])

  // Pomodoro: avisa (beep + notificación) en cada cambio foco↔descanso.
  useEffect(() => {
    if (!pomoOn || !session || session.pausedAt != null) { phaseNotified.current = -1; return }
    const el = sessionElapsed(session, now)
    const phase = Math.floor(el / 25) + (el % 30 >= 25 ? 0.5 : 0)   // marca cambios cada bloque
    const pos = el % 30, inBreak = pos >= 25
    const marker = Math.floor(el / 30) * 2 + (inBreak ? 1 : 0)
    if (phaseNotified.current === -1) { phaseNotified.current = marker; return }
    if (marker !== phaseNotified.current) {
      phaseNotified.current = marker
      beep(); notify(inBreak ? '🌿 Descanso' : '🎯 A enfocar', inBreak ? '5 minutos de descanso.' : 'Nuevo bloque de foco.')
    }
    void phase
  }, [now, pomoOn, session])

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
            {priorMin > 0 && <span style={{ fontSize: 12, color: '#E7C56B' }}>+{hm(priorMin)} de antes · {hm(priorMin + elapsed)} en total en la tarea</span>}
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
        const pos = el % 30, inBreak = pos >= 25
        const phaseRemain = Math.max(0, inBreak ? 30 - pos : 25 - pos)
        const phasePct = inBreak ? ((pos - 25) / 5) * 100 : (pos / 25) * 100
        const cyc = Math.floor(el / 30) + 1
        const plannedTask = session.taskId ? (hooksRef.current.plannedMinFor?.(session.taskId) || 0) : 0
        const plannedEff = plannedTask || planned
        const totalTask = priorMin + Math.max(0, el)
        const plannedPct = plannedEff ? Math.min(100, Math.round((totalTask / plannedEff) * 100)) : 0
        const overPlan = plannedEff > 0 && totalTask > plannedEff
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
            {(priorMin > 0 || plannedEff > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, width: 'min(460px,90vw)', marginTop: -4 }}>
                <span style={{ fontSize: 14.5, color: '#cdc4b8', textAlign: 'center' }}>
                  {priorMin > 0
                    ? <>En total <b style={{ color: '#faf7f1' }}>{hm(totalTask)}</b> en la tarea · <span style={{ color: '#E7C56B' }}>{hm(priorMin)} antes</span> + {hm(Math.max(0, el))} ahora</>
                    : <>Llevas <b style={{ color: '#faf7f1' }}>{hm(totalTask)}</b> en la tarea</>}
                </span>
                {plannedEff > 0 && (
                  <>
                    <div style={{ width: '100%', height: 7, background: '#2a251f', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(3, plannedPct)}%`, height: '100%', background: overPlan ? 'linear-gradient(90deg,#C2933A,#d98a55)' : 'linear-gradient(90deg,#6f8256,#8fae74)', borderRadius: 999, transition: 'width .4s' }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: overPlan ? '#d98a55' : '#8b8379' }}>{overPlan ? `Planeado ${hm(plannedEff)} · te pasaste ${hm(totalTask - plannedEff)}` : `Planeado ${hm(plannedEff)} · quedan ${hm(plannedEff - totalTask)} (${plannedPct}%)`}</span>
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
              <button onClick={() => setPomoOn(v => !v)} title="Pomodoro: 25 min de foco + 5 de descanso, con aviso en cada cambio." style={{ border: `1px solid ${pomoOn ? '#C2933A' : '#3a352e'}`, background: pomoOn ? 'rgba(231,197,107,0.12)' : 'transparent', color: pomoOn ? '#E7C56B' : '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>🍅 Pomodoro {pomoOn ? 'activado' : 'apagado'}</button>
              <button onClick={paused ? resumeSession : pauseSession} style={{ border: 'none', background: paused ? 'linear-gradient(135deg,#E7C56B,#C2933A)' : '#35302a', color: paused ? '#1B1305' : '#faf7f1', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
              {!isOpen && <button onClick={extend} style={{ border: '1px solid #3a352e', background: 'transparent', color: '#cdc4b8', borderRadius: 999, padding: '13px 20px', fontSize: 14, cursor: 'pointer' }}>+15m</button>}
              <button onClick={() => finish(false)} style={{ border: 'none', background: '#faf7f1', color: '#1c1a17', borderRadius: 999, padding: '13px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Terminar</button>
              {session.taskId && <button onClick={() => finish(true)} style={{ border: '1px solid #6f8256', background: 'rgba(111,130,86,0.15)', color: '#a9c48c', borderRadius: 999, padding: '13px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✓ y hecha</button>}
              <button onClick={cancel} title="Descartar sin registrar" style={{ border: '1px solid #3a352e', background: 'transparent', color: '#a49b90', borderRadius: 999, padding: '13px 20px', fontSize: 14, cursor: 'pointer' }}>Descartar</button>
            </div>
          </div>
        )
      })()}
    </>
  )

  return { session, active: !!session, begin, card }
}

const LBL: CSSProperties = { fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#a49b90', fontWeight: 600 }
