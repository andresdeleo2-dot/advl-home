// Rutina de fábrica (la de tu «Plan para bajar de peso — Oct 2026»). Es el punto de partida: lo que edites en la
// página se guarda aparte y gana sobre esto; «Restaurar original» vuelve aquí.

import type { DocRutina, DiaRutina, EjercicioLib } from './peso-contenido'

const ejercicios: EjercicioLib[] = [
  { id: 'press-piso', nombre: 'Press en piso con mancuernas, agarre neutro' },
  { id: 'press-inclinado', nombre: 'Press inclinado bajo (~30°) con mancuernas, agarre neutro' },
  { id: 'cruce-poleas', nombre: 'Cruce de poleas a la altura del pecho' },
  { id: 'elevacion-lateral', nombre: 'Elevación lateral con polea baja' },
  { id: 'triceps-cuerda', nombre: 'Extensión de tríceps con cuerda en polea alta', clave: 'Codos fijos a los lados' },
  { id: 'face-pull', nombre: 'Face pull' },
  { id: 'rotacion-externa', nombre: 'Rotación externa en polea' },
  { id: 'dead-bug', nombre: 'Dead bug', clave: 'Mantén la espalda baja pegada al suelo' },
  { id: 'pallof-press', nombre: 'Pallof press en polea', clave: 'Mantén el core firme y evita la rotación' },
  { id: 'plancha-antebrazos', nombre: 'Plancha en antebrazos' },
  { id: 'paseo-granjero', nombre: 'Paseo de granjero con kettlebell', clave: 'Mantén los hombros alineados y evita inclinarte' },
  { id: 'remo-mancuernas', nombre: 'Remo con mancuernas pecho apoyado en banco inclinado', clave: 'Mantén el pecho pegado al banco en todo momento' },
  { id: 'jalon-polea-alta', nombre: 'Jalón en polea alta, agarre neutro o supino' },
  { id: 'remo-polea-baja', nombre: 'Remo sentado en polea baja', clave: 'Mantén la espalda recta y jala con los codos' },
  { id: 'curl-mancuernas', nombre: 'Curl con mancuernas', clave: 'Mantén los codos fijos a los lados y evita balancearte' },
  { id: 'plancha-lateral', nombre: 'Plancha lateral' },
  { id: 'sentadilla-barra', nombre: 'Sentadilla con barra, agarre ancho' },
  { id: 'peso-muerto-rumano', nombre: 'Peso muerto rumano con barra', clave: 'Mantén la espalda recta y empuja las caderas hacia atrás' },
  { id: 'sentadilla-bulgara', nombre: 'Sentadilla búlgara con mancuernas', clave: 'Mantén el equilibrio y baja la rodilla trasera de manera controlada' },
  { id: 'hip-thrust', nombre: 'Hip thrust con barra', clave: 'Apoya la espalda en el banco y empuja con los glúteos hasta la extensión completa' },
  { id: 'pull-through', nombre: 'Pull-through en polea baja', clave: 'Empuja las caderas hacia adelante y aprieta los glúteos al subir' },
  { id: 'pantorrilla-pie', nombre: 'Pantorrilla de pie con mancuernas', clave: 'Mantén las rodillas casi extendidas y aprieta arriba' },
  { id: 'sentadilla-goblet', nombre: 'Sentadilla goblet', clave: 'Mantén el peso pegado al pecho y la espalda erguida' },
  { id: 'swing-kettlebell', nombre: 'Swing con kettlebell', clave: 'Usa la fuerza de las caderas y los glúteos para elevar la pesa' },
]

const dias: DiaRutina[] = [
  {
    id: 'lun', nombre: 'Lunes', foco: 'Push', tipo: 'pesas', resumen: '7 ejercicios de fuerza + bici zona 2 · 15 min',
    filas: [
      { ej: 'press-piso', nombre: 'Press en piso con mancuernas, agarre neutro', series: '4 × 8–10', nota: 'El piso limita el rango; protege el hombro' },
      { ej: 'press-inclinado', nombre: 'Press inclinado bajo (~30°) con mancuernas, agarre neutro', series: '3 × 10', nota: 'Solo si no molesta; si no, otra serie de press en piso' },
      { ej: 'cruce-poleas', nombre: 'Cruce de poleas a la altura del pecho', series: '3 × 12–15', nota: 'Rango corto, sin estirar de más' },
      { ej: 'elevacion-lateral', nombre: 'Elevación lateral con polea baja', series: '3 × 12–15', nota: 'Hasta abajo de la altura del hombro' },
      { ej: 'triceps-cuerda', nombre: 'Extensión de tríceps con cuerda en polea alta', series: '3 × 12' },
      { ej: 'face-pull', nombre: 'Face pull', series: '3 × 15', nota: 'Obligatorio' },
      { ej: 'rotacion-externa', nombre: 'Rotación externa en polea', series: '2 × 15', nota: 'Ligero, es rehabilitación' },
      { nombre: 'Bici zona 2', series: '15 min', cardio: true },
    ],
    nota: 'Fase 2 (semanas 5–10): +1 serie al primer ejercicio, el press en piso: 4 → 5 series. Fase 3: si el hombro lleva 4 semanas sin molestar, el press inclinado sube a 4 series (3 → 4).',
  },
  {
    id: 'mar', nombre: 'Martes', foco: 'Cardio + core', tipo: 'cardio', resumen: 'Bici zona 2 · 40 min + dead bug, Pallof press, plancha en antebrazos y paseo de granjero',
    filas: [
      { nombre: 'Bici zona 2', series: '40 min', nota: 'Puedes hablar, pero no cantar', cardio: true },
      { ej: 'dead-bug', nombre: 'Dead bug', series: '3 × 10 por lado' },
      { ej: 'pallof-press', nombre: 'Pallof press en polea', series: '3 × 10 por lado' },
      { ej: 'plancha-antebrazos', nombre: 'Plancha en antebrazos', series: '3 × 30–45 s', nota: 'Si molesta el hombro, cambia por más dead bug' },
      { ej: 'paseo-granjero', nombre: 'Paseo de granjero con kettlebell', series: '3 × 30 m por mano' },
    ],
    nota: 'Fase 2 (semanas 5–10): martes bici zona 2 a 50 min (hoy son 40 min).',
  },
  {
    id: 'mie', nombre: 'Miércoles', foco: 'Pull', tipo: 'pesas', resumen: '6 ejercicios de fuerza + bici zona 2 · 15 min',
    filas: [
      { ej: 'remo-mancuernas', nombre: 'Remo con mancuernas pecho apoyado en banco inclinado', series: '4 × 8–10' },
      { ej: 'jalon-polea-alta', nombre: 'Jalón en polea alta, agarre neutro o supino', series: '3 × 10–12', nota: 'Al pecho, nunca detrás de la nuca; sin dominadas por ahora' },
      { ej: 'remo-polea-baja', nombre: 'Remo sentado en polea baja', series: '3 × 12' },
      { ej: 'face-pull', nombre: 'Face pull', series: '3 × 15', nota: 'Obligatorio' },
      { ej: 'curl-mancuernas', nombre: 'Curl con mancuernas', series: '3 × 10–12' },
      { ej: 'rotacion-externa', nombre: 'Rotación externa en polea', series: '2 × 15' },
      { nombre: 'Bici zona 2', series: '15 min', cardio: true },
    ],
    nota: 'Fase 2 (semanas 5–10): +1 serie al primer ejercicio, el remo con mancuernas: 4 → 5 series.',
  },
  {
    id: 'jue', nombre: 'Jueves', foco: 'Cardio + core', tipo: 'cardio', resumen: 'Bici intervalos · 30 min + plancha lateral, dead bug y paseo de granjero',
    filas: [
      { nombre: 'Bici intervalos', series: '30 min', nota: '10 min suave + 8 × (30 s fuerte / 90 s suave) + 4 min suave', cardio: true },
      { ej: 'plancha-lateral', nombre: 'Plancha lateral', series: '3 × 30 s por lado', nota: 'Si molesta, Pallof press' },
      { ej: 'dead-bug', nombre: 'Dead bug', series: '3 × 10 por lado' },
      { ej: 'paseo-granjero', nombre: 'Paseo de granjero', series: '3 × 30 m por mano' },
    ],
    nota: 'Fase 2 (semanas 5–10): jueves 10 intervalos en vez de 8. Verificación de la fase 1: 10 + 8 × (30 s + 90 s) + 4 = 10 + 16 + 4 = 30 min.',
  },
  {
    id: 'vie', nombre: 'Viernes', foco: 'Pierna', tipo: 'pesas', resumen: '6 ejercicios de fuerza + bici zona 2 · 10 min',
    filas: [
      { ej: 'sentadilla-barra', nombre: 'Sentadilla con barra, agarre ancho', series: '4 × 6–8', nota: 'Si sostener la barra molesta: sentadilla goblet con kettlebell 4 × 12' },
      { ej: 'peso-muerto-rumano', nombre: 'Peso muerto rumano con barra', series: '3 × 8–10' },
      { ej: 'sentadilla-bulgara', nombre: 'Sentadilla búlgara con mancuernas', series: '3 × 10 por pierna' },
      { ej: 'hip-thrust', nombre: 'Hip thrust con barra', series: '3 × 10–12' },
      { ej: 'pull-through', nombre: 'Pull-through en polea baja', series: '3 × 12' },
      { ej: 'pantorrilla-pie', nombre: 'Pantorrilla de pie con mancuernas', series: '3 × 15' },
      { nombre: 'Bici zona 2', series: '10 min', cardio: true },
    ],
    nota: 'Fase 2 (semanas 5–10): +1 serie al primer ejercicio, la sentadilla con barra: 4 → 5 series.',
  },
  {
    id: 'sab', nombre: 'Sábado', foco: 'Full body express', tipo: 'circuito', resumen: 'Full body express · 40 min: 3 vueltas de 6 ejercicios, descanso 90 s entre vueltas y 15 min de bici',
    circuito: '3 vueltas de estos 6 ejercicios · descanso 90 s entre vueltas · cierra con 15 min de bici',
    filas: [
      { ej: 'sentadilla-goblet', nombre: 'Sentadilla goblet', series: '12' },
      { ej: 'remo-polea-baja', nombre: 'Remo en polea baja', series: '12' },
      { ej: 'press-piso', nombre: 'Press en piso con mancuernas', series: '10' },
      { ej: 'swing-kettlebell', nombre: 'Swing con kettlebell', series: '15' },
      { ej: 'face-pull', nombre: 'Face pull', series: '15' },
      { ej: 'dead-bug', nombre: 'Dead bug', series: '10 por lado' },
      { nombre: 'Bici', series: '15 min', cardio: true },
    ],
  },
  {
    id: 'dom', nombre: 'Domingo', foco: 'Descanso activo', tipo: 'descanso', resumen: 'Caminar 45–60 min + batch cooking',
    filas: [
      { nombre: 'Caminar', series: '45–60 min', cardio: true },
      { nombre: 'Batch cooking', series: 'preparar la semana', cardio: true },
    ],
  },
]

export const RUTINA_DEFAULT: DocRutina = {
  id: 'rutina',
  etiqueta: 'Rutina',
  titulo: 'Pesas y cardio · 7 pm',
  cifras: [
    { v: '7 pm', l: 'Pesas siempre antes del cardio' },
    { v: '3 + 2', l: 'Días de pesas + días de cardio y core' },
    { v: 'Sáb + Dom', l: 'Sábado full body · domingo de descanso activo' },
    { v: '8,000', l: 'Pasos al día' },
  ],
  dias,
  ejercicios,
  secciones: [
    {
      id: 'idea', kicker: 'La idea central', titulo: 'En déficit se sigue pesado', tipo: 'bloques',
      bloques: [
        { k: 'texto', grande: true, t: 'Mismo split que ya te funciona; cambian los ejercicios que más cargan el hombro. En déficit la idea es seguir pesado (dejar 1–2 repeticiones en reserva) para que el cuerpo no suelte músculo: lo que baja es el volumen, no el peso de la barra.' },
        { k: 'lista', chips: true, items: ['1–2 repeticiones en reserva', 'Baja el volumen', 'No baja el peso de la barra'] },
      ],
    },
    {
      id: 'hombro', kicker: 'Seguridad', titulo: 'Regla del hombro', tipo: 'bloques',
      bloques: [
        { k: 'texto', t: 'Dolor del hombro, de 0 a 10. Sigue con 0–3; cambia con más de 3. Rojo también: dolor de noche o pérdida de fuerza.' },
        {
          k: 'tarjetas', cols: 2, items: [
            { tono: 'verde', etiqueta: 'Verde', titulo: 'Sigue', texto: 'Dolor de 0–3 de 10 mientras entrenas y que al día siguiente no esté peor = sigue.', lista: ['Dolor de 0–3 de 10 mientras entrenas', 'Al día siguiente no está peor'] },
            { tono: 'rojo', etiqueta: 'Rojo', titulo: 'Cambia', texto: 'Más de 3, dolor de noche o pérdida de fuerza = cambia el ejercicio por su alternativa y, si se repite, ve con un fisioterapeuta.', lista: ['Más de 3 de 10', 'Dolor de noche', 'Pérdida de fuerza'] },
          ],
        },
        { k: 'lista', titulo: 'Por ahora fuera', chips: true, items: ['Press militar con barra', 'Fondos', 'Press detrás de nuca', 'Remo al mentón', 'Battle ropes'] },
      ],
    },
    {
      id: 'semana', kicker: 'Resumen', titulo: 'Tu semana', tipo: 'dias',
      intro: 'Toca un día para ver sus ejercicios. Las series y los minutos de bici se suman solos con lo que escribas.', bloques: [],
    },
    {
      id: 'diario', kicker: 'Cada día', titulo: 'Todos los días', tipo: 'bloques',
      bloques: [
        { k: 'cifras', items: [{ v: '8,000', l: 'pasos al día' }, { v: '~3,000', l: 'los 3 descansos del trabajo (3 × 10 min)' }, { v: '~5,000', l: 'lo que falta fuera de esas caminatas' }] },
        { k: 'texto', t: 'Con 10–12 h sentado, los 3 descansos del trabajo son 3 caminatas de 10 min; eso solo son ~3,000 pasos. 8,000 × 7 días = 56,000 pasos por semana.' },
      ],
    },
    {
      id: 'progresion', kicker: 'Cómo subir la carga', titulo: 'Progresión', tipo: 'bloques',
      bloques: [
        { k: 'texto', grande: true, t: 'Cuando completes todas las series en el tope del rango de reps, sube el peso la siguiente semana.' },
        { k: 'aviso', tono: 'tip', titulo: 'Tip · ejemplo con tu plan', t: 'Press en piso con mancuernas, 4 × 8–10: cuando hagas las 4 series de 10 repeticiones, la semana siguiente sube el peso.' },
      ],
    },
    {
      id: 'fases', kicker: 'Las 16 semanas', titulo: 'Fases', tipo: 'bloques',
      intro: 'Sin alcohol vas a recuperar mejor, así que a partir del segundo mes se puede subir un poco el trabajo.',
      bloques: [
        {
          k: 'tarjetas', cols: 3, items: [
            { n: '1', etiqueta: 'Semanas 1–4 (hasta 20 nov)', titulo: 'Fase 1 · Adaptación', tono: 'azul', lista: ['La rutina tal cual.', 'Prioridad: no faltar y cuidar el hombro'] },
            { n: '2', etiqueta: 'Semanas 5–10 (hasta 1 ene)', titulo: 'Fase 2 · Empuje', tono: 'oro', lista: ['+1 serie al primer ejercicio de cada día de pesas', 'Martes bici zona 2 a 50 min', 'Jueves 10 intervalos en vez de 8', '10,000 pasos'] },
            { n: '3', etiqueta: 'Semanas 11–16 (hasta 12 feb)', titulo: 'Fase 3 · Cierre', tono: 'verde', lista: ['Igual que fase 2.', 'Si el hombro lleva 4 semanas sin molestar, sube el press inclinado a 4 series'] },
          ],
        },
        { k: 'aviso', tono: 'atencion', titulo: 'Atención · regla de retroceso', t: 'Si en alguna fase la fuerza cae 2 semanas seguidas o duermes mal, regresa a la fase anterior una semana.' },
        {
          k: 'tabla', titulo: 'Tus números en cada fase', cols: ['Qué', 'Fase 1', 'Fase 2', 'Fase 3'], filas: [
            ['Lunes · series de fuerza', '21', '22', '22 → 23*'],
            ['Miércoles · series de fuerza', '18', '19', '19'],
            ['Viernes · series de fuerza', '19', '20', '20'],
            ['Semana · series de fuerza', '58', '61', '61 → 62*'],
            ['Martes · bici zona 2 (min)', '40', '50', '50'],
            ['Jueves · intervalos de la bici (n.º)', '8', '10', '10'],
            ['Bici sin contar el jueves (min)', '95', '105', '105'],
            ['Pasos al día', '8,000', '10,000', '10,000'],
            ['Pasos por semana', '56,000', '70,000', '70,000'],
          ],
          nota: '* Si el hombro lleva 4 semanas sin molestar y el press inclinado sube a 4 series (3 → 4): lunes 23 series y semana 62. Tu plan no dice cuánto duran los 10 intervalos del jueves, así que no se calcula la bici total de las fases 2 y 3.',
        },
      ],
    },
    { id: 'ejercicios', kicker: 'Ilustraciones', titulo: 'Cómo se hace cada ejercicio', tipo: 'galeria', intro: 'Toca una ilustración para verla grande, con su clave técnica y los días en que aparece.', bloques: [] },
  ],
}
