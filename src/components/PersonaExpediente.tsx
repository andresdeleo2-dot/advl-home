'use client'

// Réplica de SOLO LECTURA de la "ficha de persona" de mi-vida
// (src/app/vida/personas-view.tsx, bloque detailP, líneas 1117-1356), para
// mostrarla como popup dentro de advl-home sin salir a mi-vida.
// Se omite todo lo de dueño (registrar/editar/eliminar, compartir, mover…).

import { useState, CSSProperties } from 'react'
import {
  type Persona, type Vida, type Estudio,
  IMP_PERSONA, FACILIDAD_VER, TIPO_COLORES,
  hoyISO, diffFechas, formatDiff, memoriaDe, conocidosInfo, signoZodiacal,
  etapaTexto, fmtCumple, faltaCumpleLabel, diasParaCumple, fotoSrc, comoHtml,
  sanitizeNota, añoDe, relTime, fmtFechaLarga, colorAHex, catLabel, esFechaRec,
} from '@/lib/persona-card'

const SERIF = 'Georgia, serif'
const VIDA_URL = 'https://mi-vida-neon.vercel.app/vida'

type Props = {
  persona: Persona
  recuerdos: Vida[]
  catName?: Record<string, string>   // opcional: mapa id→nombre de categorías
  onClose?: () => void               // opcional: si se pasa, aparece la ✕ y "Cerrar"
}

export default function PersonaExpediente({ persona, recuerdos, catName, onClose }: Props) {
  const [verMasImp, setVerMasImp] = useState(false)
  const [verOtros, setVerOtros] = useState(false)

  const p = persona
  const hoy = hoyISO()
  const memDet = p.fallecio ? memoriaDe(p, hoy) : null
  const exactoDesde = (iso: string | null) => (iso ? formatDiff(diffFechas(iso, hoy)) : '')

  // Momentos vividos con la persona (ya vienen filtrados por la API).
  const momentos = [...recuerdos].sort((a, b) =>
    (Number(b.outstanding) - Number(a.outstanding)) ||
    ((b.importancia ?? 0) - (a.importancia ?? 0)) ||
    (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  const momentosDest = momentos.filter(m => m.outstanding).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  const momentosOtros = momentos.filter(m => !m.outstanding)

  const abrirRecuerdo = (r: Vida) => window.open(`${VIDA_URL}?r=${r.id}`, '_blank', 'noopener,noreferrer')
  const cat = catLabel(p.categoria, catName)

  const infoGeneralVisible = !!(p.cumple || (p.musica_favorita || []).length > 0 || p.etapa_union || p.etapa_convivencia ||
    p.tipo_sangre || p.profesion || p.color_favorito || (p.estudios || []).length > 0 || p.celular || p.email ||
    p.direccion_actual || p.restaurante_favorito || p.lugar_favorito || p.comida_favorita || p.bebida_favorita ||
    (p.direcciones_previas || []).some(x => x?.trim()))

  const encuentros = (p.encuentros ?? []).filter(e => e?.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <div style={sheet}>
      {/* ===== Encabezado navy ===== */}
      <div style={{ position: 'relative', padding: '26px 32px 24px', background: '#0B1A33', color: '#F5F1E8', overflow: 'hidden', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lion.png" alt="" onError={e => (e.currentTarget.style.display = 'none')}
          style={{ position: 'absolute', right: -24, top: -30, height: 180, opacity: .07, pointerEvents: 'none' }} />
        {onClose && (
          <button type="button" aria-label="Cerrar" onClick={onClose}
            style={{ position: 'absolute', top: 18, right: 20, zIndex: 5, width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(245,241,232,.3)', background: 'rgba(11,26,51,.55)', color: '#F5F1E8', fontSize: 18, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        )}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', position: 'relative' }}>
          <Avatar foto={p.foto} nombre={p.nombre} size={64} bg="#F5F1E8" color="#0B1A33" ring="rgba(199,154,58,.5)" fontSize={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'rgba(245,241,232,.55)', marginBottom: 5 }}>{cat}</div>
            <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, lineHeight: 1.02 }}>{p.apodo?.trim() || p.nombre}</div>
            {p.apodo?.trim() && <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(245,241,232,.6)', marginTop: 4 }}>{p.nombre}</div>}
          </div>
        </div>
        <div style={{ marginTop: 16, position: 'relative' }}><Dots lvl={p.importancia || 3} big /></div>
        {p.excepcional && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 13, background: 'linear-gradient(#E7BE63,#C79A3A)', color: '#3A2A08', fontSize: 11, fontWeight: 700, letterSpacing: '.5px', padding: '5px 12px', borderRadius: 999 }}>✦ Persona excepcional</div>
        )}
      </div>

      {/* ===== Cuerpo ===== */}
      <div style={{ padding: '24px 30px 30px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Meta a todo lo ancho */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          <MetaBox label="Última vez que la vi" value={relTime(p.ultima_vez)}
            sub={p.ultima_vez ? `Hace exactamente ${exactoDesde(p.ultima_vez)}` : 'Sin registro'} />

          {fmtCumple(p.cumple) && (
            <div style={{ background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 6, fontWeight: 600 }}>Cumpleaños</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0B1A33' }}>{fmtCumple(p.cumple)}</div>
                  {memDet ? (
                    <div style={{ fontSize: 11.5, color: 'rgba(11,26,51,.5)', marginTop: 3 }}>{memDet.edadHoy != null ? `hoy cumpliría ${memDet.edadHoy}` : ''}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11.5, color: 'rgba(11,26,51,.5)', marginTop: 3 }}>cumple {diffFechas(p.cumple!, hoy).años + (diasParaCumple(p.cumple) === 0 ? 0 : 1)} {faltaCumpleLabel(p.cumple)}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8A6417', marginTop: 2 }}>hoy: {formatDiff(diffFechas(p.cumple!, hoy))}</div>
                    </>
                  )}
                </div>
                <div style={{ flex: 'none', textAlign: 'center', background: 'rgba(199,154,58,.1)', border: '1px solid rgba(199,154,58,.35)', borderRadius: 12, padding: '7px 16px' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, lineHeight: 1, color: '#8A6417', fontVariantNumeric: 'tabular-nums' }}>{memDet?.edadAlFallecer ?? diffFechas(p.cumple!, hoy).años}</div>
                  <div style={{ fontSize: 9, letterSpacing: '1.4px', textTransform: 'uppercase', color: 'rgba(11,26,51,.45)', marginTop: 2, fontWeight: 700 }}>{memDet ? 'años tenía' : 'años hoy'}</div>
                </div>
              </div>
              {/* Tarjeta de cumpleaños → por ahora, enlace a mi-vida */}
              {!memDet && (
                <a href={`${VIDA_URL}?vista=personas&persona=${p.id}`} target="_blank" rel="noreferrer"
                  style={{ display: 'block', textAlign: 'center', marginTop: 12, width: '100%', boxSizing: 'border-box', fontSize: 13, fontWeight: 800, padding: '10px 16px', borderRadius: 999, textDecoration: 'none',
                    border: '1px solid ' + (diasParaCumple(p.cumple) === 0 ? 'transparent' : 'rgba(199,154,58,.5)'),
                    background: diasParaCumple(p.cumple) === 0 ? 'linear-gradient(#E7BE63,#C79A3A)' : 'transparent',
                    color: diasParaCumple(p.cumple) === 0 ? '#3A2A08' : '#8A6417' }}>
                  🎂 {diasParaCumple(p.cumple) === 0 ? '¡Felicitar hoy!' : 'Tarjeta de cumpleaños'}
                </a>
              )}
            </div>
          )}

          {/* En memoria */}
          {memDet && (
            <div style={{ background: '#FBF7EF', border: '1px solid rgba(11,26,51,.14)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 6, fontWeight: 700 }}>🕯️ En memoria</div>
              {(memDet.añoNac || memDet.añoMuerte) && <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: '#0B1A33', fontVariantNumeric: 'tabular-nums' }}>{memDet.añoNac ?? '¿?'} – {memDet.añoMuerte ?? '¿?'}</div>}
              {p.fecha_fallecimiento && <div style={{ fontSize: 12, color: 'rgba(11,26,51,.6)', marginTop: 2 }}>Falleció el {fmtFechaLarga(p.fecha_fallecimiento)}</div>}
              <div style={{ fontSize: 12, color: 'rgba(11,26,51,.55)', marginTop: 2 }}>{[memDet.edadAlFallecer != null ? `Tenía ${memDet.edadAlFallecer} años` : null, memDet.edadHoy != null ? `hoy cumpliría ${memDet.edadHoy}` : null].filter(Boolean).join(' · ')}</div>
            </div>
          )}

          {p.facilidad_ver && !memDet ? <FacilidadBox nivel={p.facilidad_ver} motivo={p.motivo_ver} /> : null}
        </div>

        {/* Dos columnas: perfil (izq) · momentos (der) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 26, alignItems: 'start' }}>
          {/* Columna izquierda */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {infoGeneralVisible && (
              <div style={{ marginBottom: 22, background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 4, fontWeight: 600 }}>Información general</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <InfoRow icon="💼" label="Profesión" value={p.profesion} />
                  {(() => { const c = conocidosInfo(p, hoy); return c ? (
                    <InfoRow icon="🤝" label="Nos conocemos desde" value={`${fmtCumple(p.conocidos_desde) ? `${fmtCumple(p.conocidos_desde)} de ${(p.conocidos_desde || '').slice(0, 4)} · ` : ''}hace ${formatDiff(c.hace)} · lo conocí a mis ${c.miEdad}${c.suEdad != null ? ` (tenía ${c.suEdad})` : ''}`} />
                  ) : null })()}
                  <ColorFavorito valor={p.color_favorito} />
                  {(() => { const z = signoZodiacal(p.cumple); return z ? <InfoRow icon={z.simbolo} label="Signo zodiacal" value={`${z.nombre} (${z.rango}) — ${z.desc}`} /> : null })()}
                  <InfoRow icon="🤝" label="Más nos unimos" value={etapaTexto(p.etapa_union)} />
                  <InfoRow icon="🫶" label="Más nos llevamos" value={etapaTexto(p.etapa_convivencia)} />
                  <InfoRow icon="🩸" label="Tipo de sangre" value={p.tipo_sangre} />
                  <InfoRow icon="📱" label="Celular" value={p.celular} href={p.celular ? `tel:${p.celular.replace(/[^0-9+]/g, '')}` : undefined} />
                  <InfoRow icon="✉️" label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
                  <InfoRow icon="🏠" label="Dirección" value={p.direccion_actual} />
                  <InfoRow icon="🧳" label="Ha vivido en" value={(p.direcciones_previas || []).filter(x => x?.trim()).join(' · ') || null} />
                  {(p.restaurantes_top || []).length > 0
                    ? <div style={{ padding: '9px 0' }}><TopListaSimple titulo="Top restaurantes" icono="🍽️" items={p.restaurantes_top} /></div>
                    : <InfoRow icon="🍽️" label="Restaurante favorito" value={p.restaurante_favorito} />}
                  {(p.lugares_top || []).length > 0
                    ? <div style={{ padding: '9px 0' }}><TopListaSimple titulo="Top lugares" icono="📍" items={p.lugares_top} /></div>
                    : <InfoRow icon="📍" label="Lugar favorito" value={p.lugar_favorito} />}
                  <InfoRow icon="🍕" label="Comida favorita" value={p.comida_favorita} />
                  <InfoRow icon="🍷" label="Bebida favorita" value={p.bebida_favorita} />
                  {(p.musica_favorita || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 10, padding: '7px 0', alignItems: 'flex-start' }}>
                      <span style={{ flex: 'none', fontSize: 14, width: 22, textAlign: 'center' }}>🎵</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, letterSpacing: '.8px', textTransform: 'uppercase', color: 'rgba(11,26,51,.42)', fontWeight: 700, marginBottom: 5 }}>Música favorita</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {(p.musica_favorita || []).map((m, i) => (
                            <span key={i} style={{ fontSize: 12, fontWeight: 600, background: 'rgba(135,109,160,.1)', border: '1px solid rgba(135,109,160,.3)', color: '#5d4a73', padding: '3px 10px', borderRadius: 999 }}>{m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {(p.estudios || []).length > 0 && (
                    <div style={{ padding: '11px 0 2px', borderTop: '1px solid rgba(11,26,51,.08)', marginTop: 8 }}>
                      <EstudiosSimple items={p.estudios || []} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <DetailBlock title="Qué significa para mí" text={p.significado} italic />
            <DetailBlock title="Cómo nos conocimos" text={p.conocimos} />
            <DetailBlock title="Qué me gusta hacer" text={p.gusta} />
            <DetailBlock title="Información de la persona" text={p.notas} />
            {p.notas_rich?.trim() && <NotasRichBlock html={p.notas_rich} />}

            {(p.links || []).filter(l => l?.url).length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 10, fontWeight: 600 }}>Enlaces</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(p.links || []).filter(l => l?.url).map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: '#1F4F86', wordBreak: 'break-all' }}>{l.label || l.url}</a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: encuentros (solo lectura) + momentos */}
          <div>
            {encuentros.length > 0 && (
              <div style={{ marginBottom: 22, background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', fontWeight: 600 }}>Cuándo lo/la he visto</div>
                  <span style={{ fontSize: 11, color: 'rgba(11,26,51,.4)', fontWeight: 600 }}>{encuentros.length}</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(11,26,51,.65)', marginBottom: 12 }}>
                  Última vez: <b style={{ color: '#0B1A33' }}>{relTime(encuentros[0].fecha)}</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {encuentros.slice(0, 6).map((e, i) => (
                    <div key={e.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(11,26,51,.06)' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C79A3A', flex: 'none', marginTop: 5, boxShadow: '0 0 0 3px rgba(199,154,58,.15)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1A33' }}>{relTime(e.fecha)}</div>
                        <div style={{ fontSize: 12, color: 'rgba(11,26,51,.5)' }}>{fmtFechaLarga(e.fecha)}</div>
                        {e.nota && <div style={{ fontSize: 12.5, color: '#0B1A33', marginTop: 3, whiteSpace: 'pre-wrap', background: 'rgba(199,154,58,.09)', border: '1px solid rgba(199,154,58,.2)', borderRadius: 8, padding: '6px 9px' }}>{e.nota}</div>}
                      </div>
                    </div>
                  ))}
                  {encuentros.length > 6 && <div style={{ fontSize: 12, color: 'rgba(11,26,51,.45)', marginTop: 8 }}>+{encuentros.length - 6} más en Mi Vida</div>}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', fontWeight: 600 }}>Momentos juntos</span>
              <span style={{ fontSize: 12, color: 'rgba(11,26,51,.4)', fontWeight: 600 }}>{momentos.length}</span>
              {momentosDest.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', color: '#8A6417', textTransform: 'uppercase' }}>✦ {momentosDest.length} destacado{momentosDest.length === 1 ? '' : 's'}</span>
              )}
              {momentos.length > 0 && (
                <a href={`${VIDA_URL}?vista=personas&persona=${p.id}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#1F4F86', textDecoration: 'none' }}>Ver todos en Mi Vida →</a>
              )}
            </div>

            {momentos.length === 0 ? (
              <div style={{ fontSize: 13, color: 'rgba(11,26,51,.45)', border: '1px dashed rgba(11,26,51,.18)', borderRadius: 12, padding: '18px 16px', textAlign: 'center' }}>
                Aún no hay recuerdos registrados con {p.nombre}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(verMasImp ? momentosDest : momentosDest.slice(0, 3)).map(m => <MomentoRow key={m.id} m={m} rec={esFechaRec(m)} onOpen={() => abrirRecuerdo(m)} />)}
                {momentosDest.length > 3 && (
                  verMasImp
                    ? <button onClick={() => setVerMasImp(false)} style={momLink}>Mostrar menos importantes ▴</button>
                    : <button onClick={() => setVerMasImp(true)} style={momDash}>Ver los {momentosDest.length - 3} importantes restantes ▾</button>
                )}
                {momentosOtros.length > 0 && (
                  !verOtros
                    ? <button onClick={() => setVerOtros(true)} style={{ ...momDash, marginTop: momentosDest.length ? 4 : 0 }}>Ver {momentosOtros.length} momento{momentosOtros.length === 1 ? '' : 's'} normal{momentosOtros.length === 1 ? '' : 'es'} ▾</button>
                    : <>
                        {momentosOtros.map(m => <MomentoRow key={m.id} m={m} rec={esFechaRec(m)} onOpen={() => abrirRecuerdo(m)} />)}
                        <button onClick={() => setVerOtros(false)} style={momLink}>Ocultar ▴</button>
                      </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pie: ir a Mi Vida */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 26, alignItems: 'center' }}>
          <a href={`${VIDA_URL}?vista=personas&persona=${p.id}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 13, fontWeight: 700, padding: '10px 18px', border: 'none', borderRadius: 999, background: '#0B1A33', color: '#F5F1E8', textDecoration: 'none' }}>Ver expediente completo / editar en Mi Vida →</a>
          {onClose && (
            <button type="button" onClick={onClose} style={{ fontSize: 13, fontWeight: 600, padding: '10px 18px', border: '1px solid rgba(11,26,51,.2)', borderRadius: 999, background: 'transparent', color: '#0B1A33', cursor: 'pointer' }}>Cerrar</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── Sub-componentes ─────────────────────────

const sheet: CSSProperties = {
  display: 'flex', flexDirection: 'column', background: '#F5F1E8', color: '#0B1A33',
  borderRadius: 18, overflow: 'hidden', width: '100%', maxHeight: '92vh',
  boxShadow: '0 30px 75px rgba(11,26,51,.32)',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const momDash: CSSProperties = { fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: '1px dashed rgba(11,26,51,.22)', background: '#FBF7EF', color: '#0B1A33', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }
const momLink: CSSProperties = { marginTop: 2, fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', border: 'none', background: 'transparent', color: 'rgba(11,26,51,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }

function Avatar({ foto, nombre, size, bg, color, ring, fontSize }: { foto?: string | null; nombre: string; size: number; bg: string; color: string; ring?: string; fontSize: number }) {
  const parts = (nombre || '').trim().split(/\s+/).filter(Boolean)
  const ini = !parts.length ? '·' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase()
  const common: CSSProperties = { width: size, height: size, borderRadius: '50%', flex: 'none', boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }
  if (foto && foto.trim()) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoSrc(foto, size)} alt={nombre} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ ...common, objectFit: 'cover', background: bg }} onError={e => (e.currentTarget.style.visibility = 'hidden')} />
  }
  return <div style={{ ...common, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize, fontWeight: 600, letterSpacing: '.5px' }}>{ini}</div>
}

function Dots({ lvl, big }: { lvl: number; big?: boolean }) {
  const size = big ? 8 : 6
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: big ? 4 : 3, alignItems: 'center' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ width: size, height: size, borderRadius: '50%', background: i < lvl ? '#C79A3A' : 'rgba(245,241,232,.2)' }} />
        ))}
      </div>
      <span style={{ fontSize: big ? 11 : 10, fontWeight: 600, letterSpacing: big ? '1px' : '.8px', color: '#D9B45E', textTransform: 'uppercase' }}>{IMP_PERSONA[lvl] || ''}</span>
    </div>
  )
}

function MetaBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 150, background: '#FBF7EF', border: '1px solid rgba(11,26,51,.09)', borderRadius: 11, padding: '13px 15px' }}>
      <div style={{ fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(11,26,51,.45)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1A33' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8A6417', fontWeight: 600, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function FacilidadBox({ nivel, motivo }: { nivel: number; motivo: string | null }) {
  const f = FACILIDAD_VER[nivel]
  if (!f) return null
  return (
    <div style={{ flex: 1, minWidth: 190, background: f.bg, border: '1px solid ' + f.color + '55', borderRadius: 11, padding: '13px 15px' }}>
      <div style={{ fontSize: 10, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(11,26,51,.45)', marginBottom: 6 }}>Qué tan fácil es verlo/a</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: f.color }}>{f.label}</div>
      <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
        {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= nivel ? f.color : 'rgba(11,26,51,.1)' }} />)}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(11,26,51,.6)', marginTop: 8 }}>{motivo?.trim() || f.desc}</div>
    </div>
  )
}

function InfoRow({ icon, label, value, href }: { icon: string; label: string; value?: string | null; href?: string }) {
  if (!value || !String(value).trim()) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: '1px solid rgba(11,26,51,.07)' }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(199,154,58,.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flex: 'none' }}>{icon}</span>
      <span style={{ fontSize: 12, color: 'rgba(11,26,51,.5)', flex: 'none' }}>{label}</span>
      {href
        ? <a href={href} style={{ fontSize: 14, fontWeight: 700, color: '#1F4F86', marginLeft: 'auto', textAlign: 'right', wordBreak: 'break-word' }}>{value}</a>
        : <span style={{ fontSize: 14, fontWeight: 700, color: '#0B1A33', marginLeft: 'auto', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>}
    </div>
  )
}

function ColorFavorito({ valor }: { valor?: string | null }) {
  const v = (valor || '').trim()
  if (!v) return null
  const hex = colorAHex(v)
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', alignItems: 'flex-start' }}>
      <span style={{ flex: 'none', fontSize: 14, width: 22, textAlign: 'center' }}>🎨</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: '.8px', textTransform: 'uppercase', color: 'rgba(11,26,51,.42)', fontWeight: 700 }}>Color favorito</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 600, color: '#0B1A33' }}>
          {hex && <span aria-hidden style={{ width: 15, height: 15, borderRadius: 5, background: hex, border: '1px solid rgba(11,26,51,.2)', flex: 'none' }} />}
          {v}
        </div>
      </div>
    </div>
  )
}

// Top ranking (restaurantes/lugares) — versión de solo lectura.
function TopListaSimple({ titulo, icono, items }: { titulo: string; icono: string; items?: string[] | null }) {
  const lista = (items || []).filter(Boolean)
  if (!lista.length) return null
  const medalla = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`)
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 8, fontWeight: 600 }}>{icono} {titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {lista.map((it, i) => (
          <div key={it + i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 9, background: i === 0 ? 'rgba(199,154,58,.12)' : 'transparent', border: '1px solid ' + (i === 0 ? 'rgba(199,154,58,.35)' : 'transparent') }}>
            <span style={{ flex: 'none', width: 22, textAlign: 'center', fontSize: i < 3 ? 14 : 11.5, fontWeight: 800, color: '#8A6417' }}>{medalla(i)}</span>
            <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: '#0B1A33' }}>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Estudios — versión SIMPLE: título + institución + años (sin editor).
function EstudiosSimple({ items }: { items: Estudio[] }) {
  const list = (items || []).filter(e => e && (e.nivel?.trim() || e.institucion?.trim() || e.carrera?.trim() || e.inicio?.trim() || e.fin?.trim() || e.nota?.trim()))
  if (list.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 8, fontWeight: 600 }}>🎓 Qué estudió</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C79A3A', flex: 'none', marginTop: 7 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0B1A33' }}>
                {[e.nivel?.trim(), e.carrera?.trim() ? `en ${e.carrera.trim()}` : ''].filter(Boolean).join(' ')}
                {!e.fin?.trim() && e.inicio?.trim() && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: '#8A6417', background: 'rgba(199,154,58,.16)', padding: '2px 7px', borderRadius: 999 }}>en curso</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(11,26,51,.55)' }}>
                {[e.institucion?.trim(), (e.inicio?.trim() || e.fin?.trim()) ? `${e.inicio?.trim() || '?'}–${e.fin?.trim() || 'hoy'}` : ''].filter(Boolean).join(' · ')}
              </div>
              {e.nota?.trim() && <div style={{ fontSize: 12.5, color: 'rgba(11,26,51,.7)', fontStyle: 'italic', marginTop: 2 }}>{e.nota}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailBlock({ title, text, italic }: { title: string; text: string | null; italic?: boolean }) {
  if (!text?.trim()) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 8, fontWeight: 600 }}>{title}</div>
      <div className="pc-nota-rich" style={italic
        ? { fontFamily: SERIF, fontSize: 21, fontStyle: 'italic', lineHeight: 1.45, color: '#0B1A33' }
        : { fontSize: 14, lineHeight: 1.65, color: 'rgba(11,26,51,.8)' }}
        dangerouslySetInnerHTML={{ __html: comoHtml(text) }} />
    </div>
  )
}

function NotasRichBlock({ html }: { html: string }) {
  const [abierto, setAbierto] = useState(false)
  const contenido = (() => { const c = sanitizeNota(html); return c.startsWith('<') ? c : `<p>${c}</p>` })()
  return (
    <div style={{ marginBottom: 22 }}>
      <style>{`.pc-nota-rich a{color:#1F4F86;text-decoration:underline;font-weight:600}.pc-nota-rich ul{list-style:disc outside;padding-left:1.35em;margin:8px 0}.pc-nota-rich ol{list-style:decimal outside;padding-left:1.35em;margin:8px 0}.pc-nota-rich li{margin:4px 0;padding-left:2px}.pc-nota-rich li::marker{color:#8A6417}.pc-nota-rich strong,.pc-nota-rich b{font-weight:700;color:#0B1A33}.pc-nota-rich em,.pc-nota-rich i{font-style:italic}.pc-nota-rich p{margin:0 0 9px}.pc-nota-rich p:last-child{margin-bottom:0}.pc-nota-rich div{margin:0 0 4px}`}</style>
      <div style={{ fontSize: 10, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#8A6417', marginBottom: 8, fontWeight: 600 }}>📝 Notas</div>
      <div style={{ position: 'relative' }}>
        <div className="pc-nota-rich" style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(11,26,51,.85)', maxHeight: abierto ? 'none' : 190, overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: contenido }} />
        {!abierto && contenido.length > 420 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 54, background: 'linear-gradient(transparent, #F5F1E8)', pointerEvents: 'none' }} />
        )}
      </div>
      {contenido.length > 420 && (
        <button onClick={() => setAbierto(a => !a)} style={{ marginTop: 6, fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 999, border: '1px dashed rgba(11,26,51,.25)', background: 'transparent', color: 'rgba(11,26,51,.65)', cursor: 'pointer' }}>
          {abierto ? 'Ver menos ▴' : 'Ver todo ▾'}
        </button>
      )}
    </div>
  )
}

function MomentoRow({ m, onOpen, rec }: { m: Vida; onOpen: () => void; rec?: boolean }) {
  const color = TIPO_COLORES[m.tipo] || '#5C6577'
  const dest = !!m.outstanding
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
        padding: dest ? '12px 14px' : '10px 14px', borderRadius: 11, cursor: 'pointer',
        background: dest ? 'linear-gradient(90deg,#FFF7E8,#FBF7EF)' : '#FBF7EF',
        border: '1px solid ' + (dest ? 'rgba(199,154,58,.55)' : 'rgba(11,26,51,.09)'),
        borderLeft: `4px solid ${dest ? '#C79A3A' : color}`,
        boxShadow: dest ? '0 4px 14px rgba(199,154,58,.22)' : 'none',
        boxSizing: 'border-box',
      }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: 'none', boxShadow: `0 0 0 3px ${color}22` }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {dest && <span style={{ color: '#C79A3A', fontSize: 12 }}>✦</span>}
          <span style={{ fontFamily: SERIF, fontSize: dest ? 18 : 16, fontWeight: 600, color: '#0B1A33', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titulo}</span>
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'rgba(11,26,51,.5)', marginTop: 2, letterSpacing: '.3px' }}>
          {m.tipo}{m.fecha ? ` · ${añoDe(m.fecha)}` : ''}{dest ? ' · Momento importante' : ''}{rec ? ' · 🔔 fecha a recordar' : ''}
        </span>
      </span>
      <span style={{ color: 'rgba(11,26,51,.3)', fontSize: 18, flex: 'none' }}>›</span>
    </div>
  )
}
