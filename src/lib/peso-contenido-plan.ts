// Plan maestro de fábrica («Plan para bajar de peso — Oct 2026»). Punto de partida: lo que edites en la página se
// guarda aparte y gana sobre esto; «Restaurar original» vuelve aquí. Los viernes de `semanas` alimentan la tabla de
// metas (con tu peso real de la báscula) y la gráfica.

import type { DocPlan, SemanaPlan } from './peso-contenido'

const semanas: SemanaPlan[] = [
  { n: 1, fecha: '2026-10-30', meta: 91.9 },
  { n: 2, fecha: '2026-11-06', meta: 91.0 },
  { n: 3, fecha: '2026-11-13', meta: 90.3 },
  { n: 4, fecha: '2026-11-20', meta: 89.5, nota: 'fin fase 1' },
  { n: 5, fecha: '2026-11-27', meta: 88.8 },
  { n: 6, fecha: '2026-12-04', meta: 88.0 },
  { n: 7, fecha: '2026-12-11', meta: 87.3 },
  { n: 8, fecha: '2026-12-18', meta: 86.5 },
  { n: 9, fecha: '2026-12-25', meta: 86.5, nota: 'fiestas, mantener' },
  { n: 10, fecha: '2027-01-01', meta: 86.5, nota: 'fiestas, mantener' },
  { n: 11, fecha: '2027-01-08', meta: 85.8 },
  { n: 12, fecha: '2027-01-15', meta: 85.0 },
  { n: 13, fecha: '2027-01-22', meta: 84.3 },
  { n: 14, fecha: '2027-01-29', meta: 83.5 },
  { n: 15, fecha: '2027-02-05', meta: 82.8 },
  { n: 16, fecha: '2027-02-12', meta: 82.0, nota: 'meta' },
]

export const PLAN_DEFAULT: DocPlan = {
  id: 'plan',
  etiqueta: 'Plan',
  titulo: 'Octubre 2026 → 12 de febrero de 2027',
  sub: 'Plan para bajar de peso · 23 de octubre de 2026',
  cifras: [
    { v: '92.9', u: 'kg', l: 'hoy' },
    { v: '82.0', u: 'kg', l: 'meta, IMC 25' },
    { v: '~0.75', u: 'kg', l: 'por semana' },
    { v: '16', l: 'semanas, contando las 2 de fiestas' },
  ],
  ref: { inicio: 92.9, meta: 82, tol: 0.5 },
  semanas,
  secciones: [
    {
      id: 'hoy', kicker: '1 · El punto de partida', titulo: 'Dónde estás hoy', tipo: 'bloques',
      bloques: [
        { k: 'texto', grande: true, t: 'Hoy pesas 92.9 kg con 32.2 % de grasa (29.9 kg de grasa, 63.0 kg de masa magra). Desde julio subiste 1.6 kg, pero la grasa subió 2.4 kg y la masa magra bajó 0.8 kg: lo que subió fue casi todo grasa.' },
        { k: 'cifras', items: [{ v: '92.9', u: 'kg', l: 'Peso' }, { v: '32.2', u: '%', l: 'Grasa corporal' }, { v: '29.9', u: 'kg', l: 'Grasa' }, { v: '63.0', u: 'kg', l: 'Masa magra' }] },
        { k: 'texto', t: 'Cuentas: 29.9 + 63.0 = 92.9 kg · 29.9 ÷ 92.9 = 32.2 % de grasa · 63.0 ÷ 92.9 = 67.8 % de masa magra.' },
        { k: 'cifras', items: [{ v: '+1.6', u: 'kg', l: 'Peso desde julio' }, { v: '+2.4', u: 'kg', l: 'Grasa desde julio' }, { v: '−0.8', u: 'kg', l: 'Masa magra desde julio' }] },
        { k: 'pasos', titulo: 'Lo que dicen tus datos, sin rodeos', items: [
          { t: 'El plan funciona cuando se sigue.', sub: 'Ene–abr 2024 con tu nutrióloga: −4.5 kg en 83 días (0.38 kg/sem) y el abdomen de 105 a 96 cm. Mar–jun 2025: de 89.1 a 83.4 kg, 5.7 kg en 84 días (0.47 kg/sem). Jun–jul 2026: −2 kg en 20 días (0.70 kg/sem). Este plan: ~0.75 kg/sem.' },
          { t: 'Lo que subes, lo subes en los huecos.', sub: 'Las tres subidas grandes pasan cuando dejas de medirte: jul→nov 2025 (+3.7 kg en 128 días), feb→jun 2026 (+1.7 kg) y jul→oct 2026 (+1.6 kg en 92 días).' },
          { t: 'Fines de semana y alcohol siguen siendo la variable que más te mueve la báscula.', sub: 'Tienen su propia sección: «Fin de semana y alcohol».' },
          { t: 'La dieta de ~2,300 kcal', sub: 'La que te di estaba pensada para bajar despacio cuidando músculo; con fines de semana libres eso queda en mantenimiento o superávit. Para bajar más rápido hay que apretar un poco entre semana y, sobre todo, cerrar el fin de semana. Tu día normal de ahora es de ~1,935 kcal: 2,300 − 1,935 = 365 kcal menos.' },
        ] },
        { k: 'texto', grande: true, t: 'Edad corporal y grasa visceral: tu edad corporal (61) y grasa visceral (11) son los números que más me interesa que bajen. En mayo 2025, pesando 83.9 kg, tu báscula marcó 51 y 9: esa es la referencia para febrero.' },
        { k: 'tabla', cols: ['', 'Hoy', 'Mayo 2025 (83.9 kg)', 'Diferencia'], filas: [['Edad corporal', '61', '51', '10'], ['Grasa visceral', '11', '9', '2 (meta de febrero: 9)']] },
        { k: 'aviso', tono: 'atencion', titulo: 'Atención · Ojo al comparar aparatos', t: 'El InBody de tu nutrióloga marcaba 43.6 % de grasa en feb 2024 con 94.3 kg, y tu báscula hoy marca 32.2 % con 92.9 kg. No es que hayas bajado 11 puntos; son aparatos distintos. Compara siempre contra tu misma báscula.' },
      ],
    },
    {
      id: 'meta', kicker: '2 · La meta', titulo: 'La meta y el ritmo', tipo: 'bloques',
      bloques: [
        { k: 'cifras', items: [{ v: '82', u: 'kg', l: 'Meta' }, { v: '25', l: 'IMC a 1.81 m' }, { v: '12 feb', l: 'Fecha · 2027' }, { v: '~0.75', u: 'kg/sem.', l: 'Ritmo' }, { v: '16', u: 'semanas', l: 'contando las 2 de fiestas' }] },
        { k: 'texto', t: 'Meta: 82 kg a ~0.75 kg por semana, 16 semanas, al 12 de febrero de 2027 (contando las 2 semanas de fiestas). A tu estatura (1.81 m), 82 kg es IMC 25: el tope del peso saludable, el mismo «peso máximo» que te marcó tu nutrióloga en 2024. Si conservas casi toda tu masa magra, quedarías alrededor de 25 % de grasa.' },
        {
          k: 'tabla', titulo: 'De hoy a la meta', cols: ['Medida', 'Hoy', 'Meta · 12 feb 2027', 'Diferencia'], filas: [
            ['Peso', '92.9 kg', '82.0 kg', '−10.9 kg'],
            ['Grasa corporal', '32.2 %', '~25 %', '—'],
            ['Grasa', '29.9 kg', '~20.5 kg', '−9.4 kg'],
            ['Masa magra', '63.0 kg', '61.5 kg', '−1.5 kg'],
            ['IMC (a 1.81 m)', '28.4', '25', '—'],
          ],
          nota: 'Cuentas: 92.9 − 82.0 = 10.9 kg en 16 semanas · 29.9 − 20.5 = 9.4 kg de grasa (86 % de lo que bajas) · 82.0 − 20.5 = 61.5 kg de masa magra · 92.9 ÷ 1.81² = 28.4 · 82 ÷ 1.81² = 25.0.',
        },
        {
          k: 'tarjetas', cols: 2, items: [
            { etiqueta: 'Agresivo', titulo: '1 kg por semana', texto: 'Tu propia calculadora marca 1 kg/semana como agresivo, y con ese ritmo pierdes más músculo, rindes peor en el gym con el hombro todavía sensible y el rebote es casi seguro (tu historial lo confirma).', tono: 'rojo' },
            { etiqueta: 'El ritmo del plan', titulo: '0.75 kg por semana', texto: '0.75 es lo más rápido que todavía se sostiene sin sufrir.', tono: 'verde' },
          ],
        },
        { k: 'aviso', tono: 'tip', titulo: 'Tip', t: 'Las primeras 2 semanas vas a ver casi 1 kg por semana, sobre todo agua; después se frena a 0.75 y es normal.' },
      ],
    },
    {
      id: 'dias', kicker: '3 · Las calorías', titulo: 'Día normal, día de comida libre y tu gasto', tipo: 'bloques',
      bloques: [
        {
          k: 'tabla', cols: ['Concepto', 'Día normal (lunes a viernes y un día del fin)', 'Día de comida libre (1 a la semana)'], filas: [
            ['Calorías', '~1,935 kcal', '~2,200 kcal'],
            ['Proteína', '~185 g', '170 g o más'],
            ['Carbohidratos', '~190 g', 'libre dentro de las kcal'],
            ['Grasa', '~50 g', 'libre dentro de las kcal'],
            ['Agua', '3 L', '3 L'],
            ['Pasos', '8,000 (10,000 desde la semana 5)', 'igual'],
          ],
        },
        { k: 'texto', t: 'Cómo se reparten las ~1,935 kcal de un día normal: proteína 185 g × 4 = 740 kcal (38 %) · carbohidratos 190 g × 4 = 760 kcal (39 %) · grasa 50 g × 9 = 450 kcal (23 %). Suman 1,950, cerca de las ~1,935 porque las cifras del plan son aproximadas (~).' },
        {
          k: 'pasos', titulo: 'Tu gasto y tu déficit', items: [
            { t: '~2,750 kcal/día de gasto', sub: 'El RMR de tu báscula (1,905) × 1.45 por entrenar 6 días y estar sentado 10–12 h (1,905 × 1.45 = 2,762; el plan redondea a ~2,750).' },
            { t: '~780 kcal/día de déficit', sub: 'Con 6 días de plan y uno de comida libre, el promedio de la semana queda en ~1,970 kcal: unos 0.7 kg por semana. (6 × 1,935 + 2,200 = 13,810 kcal por semana ÷ 7 = 1,973 al día.)' },
            { t: '~0.8 kg/semana desde la semana 5', sub: 'Con más pasos y más bici, sube a ~0.8.' },
            { t: '~825 kcal/día', sub: 'Tu calculadora pone 0.75 kg/semana en ~825 kcal/día de déficit, así que cuadra.' },
          ],
        },
        { k: 'aviso', tono: 'tip', titulo: 'Tip', t: 'Es estimación: con 3 semanas de pesajes vemos tu número real y ajustamos.' },
      ],
    },
    {
      id: 'meses', kicker: '4 · El mapa', titulo: 'Metas por mes', tipo: 'bloques',
      bloques: [
        { k: 'texto', t: 'Para la grasa asumo que ~85 % de lo que bajes es grasa. Con tus datos no es optimista: de marzo al 30 de mayo de 2025 bajaste 5.2 kg y 4.7 fueron grasa según tu báscula (90 %), y en 2024 el InBody marcó que todo lo que bajaste fue grasa.' },
        { k: 'aviso', tono: 'tip', titulo: 'Tip · Mídela hoy', t: 'La cintura mídela hoy con cinta a la altura del ombligo, para tener contra qué comparar.' },
        {
          k: 'tabla', cols: ['Fecha', 'Peso', 'Grasa corporal', 'Cintura vs hoy', 'Hábito a cumplir'], filas: [
            ['20 nov 2026 (fin fase 1)', '89.5 kg', '~27 kg', '−3 cm', '4 semanas sin faltar a entrenar y cero alcohol'],
            ['18 dic 2026', '86.5 kg', '~24.5 kg', '−6 cm', '10,000 pasos diarios desde la semana 5'],
            ['24 dic – 1 ene', 'mantener 86.5 kg', '—', '—', 'Solo 24 y 31 con tragos; el resto, el plan'],
            ['29 ene 2027', '83.5 kg', '~22 kg', '−9 cm', 'Peso de la barra igual o mayor que en octubre'],
            ['12 feb 2027 (meta)', '82.0 kg', '~20.5 kg (~25 %)', '−11 cm', 'Grasa visceral en 9 y pasar a mantenimiento'],
          ],
          nota: 'La columna «Cintura vs hoy» son cambios (−3, −6, −9 y −11 cm): el plan no trae tu cintura de hoy, así que no se pueden convertir en centímetros totales hasta que la midas.',
        },
        { k: 'texto', grande: true, t: 'La cintura, el número de salud más importante. En feb 2024 tu abdomen medía 105 cm; en hombres, arriba de 102 cm el riesgo cardiometabólico es alto y arriba de 94 cm ya está aumentado. Con el plan de 2024 bajó a 96 cm en 83 días, así que llegar abajo de 94 cm en febrero es realista.' },
      ],
    },
    {
      id: 'viernes', kicker: '5 · El semáforo semanal', titulo: 'Meta de cada viernes', tipo: 'semanas',
      intro: 'Cada viernes se compara tu peso de la báscula contra la meta. Los viernes, el peso real sale solo de tus registros.',
      bloques: [
        { k: 'aviso', tono: 'regla', titulo: 'Regla del viernes', t: 'La báscula sube y baja con agua y sal; cuenta como cumplido si quedas dentro de 0.5 kg de la meta.' },
        { k: 'aviso', tono: 'tip', titulo: 'Por qué las primeras semanas bajan más', t: 'Las semanas 1 y 2 bajan más porque al principio se va agua. De ahí en adelante son 0.75 kg por semana (9.0 kg en 12 semanas de bajada, descontando las 2 de fiestas).' },
      ],
    },
    {
      id: 'finde', kicker: '6 · Donde más se mueve la báscula', titulo: 'Fin de semana y alcohol', tipo: 'bloques',
      bloques: [
        { k: 'texto', grande: true, t: 'Aquí se gana o se pierde el plan. Un sábado de 3,500 kcal con alcohol borra unos 2 días de déficit (3,500 − 1,935 = 1,565 kcal más que un día normal; 2 días de déficit de ~780 kcal son 1,560).' },
        {
          k: 'tarjetas', cols: 2, items: [
            { n: '1', titulo: 'Comida libre · ~900 kcal', texto: 'Una comida libre a la semana, no un día libre. Sábado o domingo, una sola: sustituye la comida del plan y ronda las 900 kcal (por ejemplo, 4 tacos al pastor con refresco cero, o una hamburguesa sencilla sin papas). Empieza por la proteína y para cuando estés lleno, no cuando se acabe.', tono: 'oro' },
            { n: '2', titulo: 'El otro día del fin', texto: 'Es igual que entre semana: desayuno, comida y cena del plan.' },
            { n: '3', titulo: 'Alcohol · cero hasta llegar a 82 kg', texto: 'Cero hasta llegar a 82 kg (12 de febrero de 2027, 16 semanas). No 4 semanas ni 2 meses: todo el corte. Es la palanca más grande que tienes; además duermes mejor, recuperas mejor del entreno y el fin de semana deja de ser donde se pierde lo de la semana.', tono: 'rojo' },
            { n: '4', titulo: 'Única excepción planeada · 24 y 31 de dic', texto: 'Máximo 3 tragos cada noche (destilado con agua mineral o refresco cero). Planeado y contado, no «ya que estamos».', tono: 'rojo' },
            { n: '5', titulo: 'Reuniones', texto: 'Agua mineral con limón, refresco cero o cerveza sin alcohol. Llega comido (proteína) para no picar.' },
            { n: '6', titulo: 'Después de la meta', texto: 'Mantenimiento: una noche por semana, máximo 3 tragos, y esa cena es proteína + verdura.' },
            { n: '7', titulo: 'El día después', texto: 'No se compensa con ayuno ni se «regala»: se vuelve al plan desde el desayuno.' },
            { n: '8', titulo: 'El sábado se entrena', texto: 'Full body express. Entrenar el sábado en la mañana hace mucho más fácil cuidar el resto del día.', tono: 'verde' },
          ],
        },
      ],
    },
    {
      id: 'sueno', kicker: '7 · Dormir también es parte del plan', titulo: 'Sueño', tipo: 'bloques',
      bloques: [
        { k: 'texto', t: 'Tu proyecto también es dormir y rendir mejor, y el sueño mueve la báscula más de lo que parece. En un estudio (Nedeltcheva, 2010), con la misma dieta, quienes durmieron 5.5 h en vez de 8.5 h perdieron ~55 % menos grasa y ~60 % más masa magra.' },
        {
          k: 'tarjetas', cols: 2, items: [
            { etiqueta: '🛏️ Horario fijo', titulo: 'A la cama 11:30 pm, arriba 7:30 am', texto: 'También el fin de semana (±1 h): 8 h en cama.' },
            { etiqueta: '☕ Café', titulo: 'El último antes de las 4 pm' },
            { etiqueta: '🌙 Última hora del día', titulo: 'Nada de trabajo ni videojuegos competitivos', texto: 'Series o lectura sí. La cena a las 8:45 ya queda más de 2 h antes de dormir (2 h 45 min).' },
            { etiqueta: '📝 Anótalo', titulo: 'Horas de sueño junto con el peso', texto: 'Si duermes menos de 7 h varios días, la fuerza y el hambre te lo van a cobrar.' },
          ],
        },
      ],
    },
    {
      id: 'seguimiento', kicker: '8 · Medir y corregir', titulo: 'Seguimiento y cuándo ajustar', tipo: 'bloques',
      bloques: [
        { k: 'pasos', titulo: 'Cómo medirte cada viernes', items: [{ t: '📅 Viernes en la mañana' }, { t: '🍽️ En ayunas' }, { t: '🚿 Después del baño' }, { t: '⚖️ Báscula de composición corporal' }, { t: '📲 Súbelo a tu tracker' }] },
        { k: 'texto', t: 'Si puedes pesarte diario, mejor: compara promedios semanales, no días sueltos. Usa siempre la misma báscula para que los números se puedan comparar.' },
        { k: 'aviso', tono: 'atencion', titulo: 'Atención', t: 'Tus subidas más grandes pasaron cuando dejaste de medirte.' },
        { k: 'texto', grande: true, t: 'Cuándo ajustar: a partir de la semana 3, revisa el promedio de las últimas 2 semanas (sin contar la semana de fiestas).' },
        {
          k: 'tabla', cols: ['Si bajas…', 'Haz esto'], filas: [
            ['▼ Menos de 0.5 kg/semana', 'Quita ~130 kcal: 1 rebanada de pan de la cena y el 1/4 de aguacate. O sube a 10,000 pasos si aún no lo haces'],
            ['✓ 0.5–1.0 kg/semana', 'Nada, vas bien'],
            ['▲ Más de 1.0 kg/semana, o pierdes fuerza 2 semanas seguidas', 'Agrega ~100 kcal: 1/2 taza más de arroz en la comida'],
            ['! Masa magra baja más de 1.5 kg en un mes', 'Revisa que llegues a 185 g de proteína, que no estés bajando pesos en el gym y que duermas 7 h o más'],
          ],
        },
        { k: 'texto', t: 'Cintura con cinta métrica cada 2 semanas, a la altura del ombligo. Si la cintura baja y el peso no, vas bien: estás cambiando grasa por músculo.' },
        {
          k: 'tabla', titulo: 'Cintura: para llenar a mano', cols: ['Viernes', 'Meta contra hoy', 'Mi cintura'], filas: [
            ['Hoy · 23 oct', 'Punto de partida', ''],
            ['6 nov', '—', ''],
            ['20 nov', '−3 cm', ''],
            ['4 dic', '—', ''],
            ['18 dic', '−6 cm', ''],
            ['1 ene', '—', ''],
            ['15 ene', '—', ''],
            ['29 ene', '−9 cm', ''],
            ['12 feb', '−11 cm', ''],
          ],
        },
      ],
    },
  ],
}
