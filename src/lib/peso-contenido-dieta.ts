// Dieta de fábrica (el «menú fijo» de tu «Plan para bajar de peso — Oct 2026»). Punto de partida: lo que edites en la
// página se guarda aparte y gana sobre esto; «Restaurar original» vuelve aquí.

import type { Comida, DocDieta, GrupoSuper } from './peso-contenido'

const comidas: Comida[] = [
  {
    id: 'desayuno', hora: '9:00', nombre: 'Desayuno', kcal: 595, prot: 48,
    items: [
      { t: '2 huevos' },
      { t: '150 g de claras' },
      { t: 'revueltos con 1 cdita de aceite y jitomate, cebolla o espinaca', k: 'nota' },
      { t: '1 taza de frijol de olla (no refritos)' },
      { t: '1 tortilla de maíz' },
      { t: 'Café americano' },
    ],
  },
  {
    id: 'comida', hora: '14:00', nombre: 'Comida', kcal: 655, prot: 60,
    items: [
      { t: 'Elige una proteína', k: 'elige', ops: ['220 g de res magra (bistec de bola o aguayón)', '220 g de pechuga de pollo', '250 g de pescado blanco'] },
      { t: '1 taza de arroz cocido' },
      { t: '2 tazas de verdura o ensalada' },
      { t: '1 cdita de aceite' },
      { t: '1/4 de aguacate' },
    ],
  },
  {
    id: 'pre', hora: '17:30', nombre: 'Pre-entreno', kcal: 215, prot: 21,
    items: [{ t: '200 g de yogurt griego natural 0 %' }, { t: '1 manzana' }],
  },
  {
    id: 'post', hora: '20:15', nombre: 'Post-entreno', kcal: 120, prot: 24,
    items: [{ t: '1 scoop de proteína whey en agua' }],
  },
  {
    id: 'cena', hora: '20:45', nombre: 'Cena', kcal: 350, prot: 32, intro: 'Sándwich:',
    items: [
      { t: '2 rebanadas de pan integral' },
      { t: 'Relleno: elige uno', k: 'elige', ops: ['120 g de pechuga de pavo', '100 g de salmón ahumado', '1 lata drenada de atún en agua', '90 g de pechuga de pollo cocida'] },
      { t: '30 g de queso panela' },
      { t: 'jitomate, lechuga y mostaza' },
    ],
  },
]

const superGrupos: GrupoSuper[] = [
  {
    nombre: 'Proteínas',
    items: [
      { n: 'Proteína de la comida', cant: '1.6 kg', sub: 'en total, combinando res magra (bola o aguayón) y pechuga de pollo. Si un día es pescado blanco, 250 g ese día', cuenta: '220 g × 7 = 1,540 g' },
      { n: 'Pechuga de pavo', cant: '480 g', sub: '(4 noches)', cuenta: '120 g × 4 = 480 g' },
      { n: 'Atún en agua', cant: '3 latas', sub: '(3 noches)', cuenta: '1 lata × 3 = 3 latas' },
    ],
  },
  {
    nombre: 'Huevo y lácteos',
    items: [
      { n: 'Huevos', cant: '14', cuenta: '2 × 7 = 14' },
      { n: 'Claras de huevo', cant: '1 L', cuenta: '150 g × 7 = 1,050 g' },
      { n: 'Yogurt griego natural 0 %', cant: '1.4 kg', cuenta: '200 g × 7 = 1,400 g' },
      { n: 'Queso panela', cant: '250 g', cuenta: '30 g × 7 = 210 g' },
    ],
  },
  {
    nombre: 'Despensa',
    items: [
      { n: 'Frijol', cant: '500 g crudo', sub: '(sale ~1.2 kg de olla)', cuenta: '1 taza × 7 = 7 tazas de olla' },
      { n: 'Proteína whey', cant: '1 bote de 2 lb', sub: '(dura ~1 mes)', cuenta: '1 scoop × 7 = 7 scoops' },
      { n: 'Pan integral', cant: '1 bolsa', cuenta: '2 rebanadas × 7 = 14 rebanadas' },
      { n: 'Tortillas de maíz', cant: '1/2 kg', cuenta: '1 × 7 = 7 tortillas' },
      { n: 'Arroz', cant: '500 g crudo', cuenta: '1 taza cocida × 7 = 7 tazas cocidas' },
    ],
  },
  {
    nombre: 'Verdura y fruta',
    items: [
      { n: 'Verdura', lista: ['jitomate', 'cebolla', 'espinaca', 'lechuga', 'calabacita', 'brócoli', 'pepino'], cuenta: 'Verdura de la comida: 2 tazas × 7 = 14 tazas' },
      { n: 'Manzanas', cant: '7', cuenta: '1 × 7 = 7' },
      { n: 'Aguacate', cant: '2', cuenta: '1/4 × 7 = 1 3/4' },
    ],
  },
  {
    nombre: 'Básicos',
    items: [{ n: 'Aceite, mostaza, salsas, café, agua mineral', lista: ['aceite', 'mostaza', 'salsas', 'café', 'agua mineral'] }],
  },
]

export const DIETA_DEFAULT: DocDieta = {
  id: 'dieta',
  etiqueta: 'Dieta',
  titulo: 'Menú fijo',
  sub: 'Lunes a viernes y un día del fin, en cinco comidas. Es lo que ya comías, con más proteína y verdura. Pesos en crudo salvo que diga cocido: 220 g de carne cruda quedan en ~160–170 g ya cocida.',
  cifras: [
    { v: '~1,935', u: 'kcal', l: 'al día' },
    { v: '~185', u: 'g', l: 'de proteína al día' },
    { v: '5', l: 'comidas al día' },
    { v: 'Crudo', l: 'pesos en crudo salvo que diga cocido' },
  ],
  comidas,
  super: superGrupos,
  secciones: [
    {
      id: 'resumen', kicker: 'Resumen', titulo: 'Antes y ahora', tipo: 'bloques',
      bloques: [
        { k: 'texto', t: 'Es lo que ya comías, con más proteína y verdura. Tal como lo tenías son unas 1,300 kcal y ~105 g de proteína: poca proteína para cuidar músculo y tan poca comida que el hambre te la cobra el fin de semana. Así queda en ~1,935 kcal y ~185 g.' },
        { k: 'tabla', cols: ['', 'Antes', 'Ahora', 'Diferencia'], filas: [['Calorías al día', '~1,300 kcal', '~1,935 kcal', '+635 kcal'], ['Proteína al día', '~105 g', '~185 g', '+80 g']] },
        {
          k: 'tarjetas', cols: 2, items: [
            { titulo: 'Poca proteína para cuidar músculo', texto: 'Tal como lo tenías: ~105 g de proteína al día.', tono: 'rojo' },
            { titulo: 'Tan poca comida que el hambre te la cobra el fin de semana', texto: 'Tal como lo tenías: unas 1,300 kcal al día.', tono: 'rojo' },
          ],
        },
      ],
    },
    {
      id: 'dia', kicker: '1 · El menú', titulo: 'Tu día', tipo: 'comidas',
      intro: 'Cinco comidas, de las 9:00 a las 20:45. Cada tarjeta trae sus kcal, su proteína y lo que lleva. La barra de cada comida muestra qué parte de la proteína del día aporta.',
      bloques: [{ k: 'aviso', tono: 'tip', titulo: 'Tip', t: 'Pesos en crudo salvo que diga cocido: 220 g de carne cruda quedan en ~160–170 g ya cocida.' }],
    },
    {
      id: 'proteina', kicker: '2 · Tus opciones', titulo: 'Elige tu proteína', tipo: 'bloques',
      intro: 'En la comida eliges la proteína y en la cena eliges el relleno del sándwich. Debajo de cada elección ves lo que se queda igual.',
      bloques: [
        {
          k: 'tarjetas', cols: 3, items: [
            { etiqueta: '14:00 · ~655 kcal · 60 g de proteína', titulo: 'Comida: 220 g de res magra', texto: 'Bistec de bola o aguayón.', tono: 'oro' },
            { etiqueta: '14:00 · ~655 kcal · 60 g de proteína', titulo: 'Comida: 220 g de pechuga de pollo', tono: 'oro' },
            { etiqueta: '14:00 · ~655 kcal · 60 g de proteína', titulo: 'Comida: 250 g de pescado blanco', tono: 'oro' },
          ],
        },
        { k: 'aviso', tono: 'tip', titulo: 'Otra opción · salmón 180 g', t: 'Ese día sin aguacate ni aceite (llegas a ~170 g de proteína; bien 1–2 veces por semana). Res molida: solo 95/5 (la 90/10 suma ~110 kcal).' },
        { k: 'lista', titulo: 'Se queda igual (comida)', chips: true, items: ['1 taza de arroz cocido', '2 tazas de verdura o ensalada', '1 cdita de aceite (no el día del salmón)', '1/4 de aguacate (no el día del salmón)'] },
        { k: 'aviso', tono: 'revisar', titulo: 'Para revisar', t: 'El plan escribe «llegas a ~170 g de proteína» sin aclarar si se refiere a esa comida o al día completo. Aquí queda con su redacción literal.' },
        {
          k: 'tarjetas', cols: 2, items: [
            { etiqueta: '20:45 · En tu menú · máximo 4 noches', titulo: 'Cena: 120 g de pechuga de pavo', tono: 'azul' },
            { etiqueta: '20:45 · Máximo 4 noches', titulo: 'Cena: 100 g de salmón ahumado', tono: 'azul' },
            { etiqueta: '20:45 · Las demás noches', titulo: 'Cena: 1 lata de atún en agua, drenada', tono: 'gris' },
            { etiqueta: '20:45 · Las demás noches', titulo: 'Cena: 90 g de pechuga de pollo cocida', tono: 'gris' },
          ],
        },
        { k: 'aviso', tono: 'regla', titulo: 'Regla de sodio · una semana de cenas', t: 'Máximo 4 noches con pavo o salmón ahumado; las otras 3, atún o pollo (7 noches − 4 = 3). Coincide con tu lista del súper: 480 g de pavo ÷ 120 g = 4 noches y 3 latas de atún = 3 noches. El pavo y el salmón ahumado traen mucha sal. Compra «pechuga de pavo», no «jamón de pavo»: trae menos grasa.' },
        { k: 'lista', titulo: 'Se queda igual (cena)', chips: true, items: ['2 rebanadas de pan integral', '30 g de queso panela', 'jitomate, lechuga y mostaza'] },
        {
          k: 'tabla', titulo: 'Otros cambios (mismas calorías, aprox.)', cols: ['Si quieres cambiar…', 'Por esto'], filas: [
            ['Arroz (1 taza cocido)', '1 taza de pasta cocida · 250 g de papa · 3 tortillas de maíz'],
            ['Frijol (1 taza)', '1 taza de lentejas cocidas'],
          ],
        },
      ],
    },
    {
      id: 'totales', kicker: '3 · Las cuentas', titulo: 'Totales del día', tipo: 'totales',
      intro: 'Calorías y proteína de cada comida, tal como las da tu plan, y lo que suman. Se calculan solas con lo que tengas en «Tu día».',
      bloques: [
        { k: 'texto', grande: true, t: 'Día normal y día de comida libre. El menú de arriba es el día normal. Una vez a la semana hay un día de comida libre.' },
        {
          k: 'tabla', cols: ['Concepto', 'Día normal (lunes a viernes y un día del fin)', 'Día de comida libre (1 a la semana)'], filas: [
            ['Calorías', '~1,935 kcal', '~2,200 kcal'],
            ['Proteína', '~185 g', '170 g o más'],
            ['Carbohidratos', '~190 g', 'libre dentro de las kcal'],
            ['Grasa', '~50 g', 'libre dentro de las kcal'],
            ['Agua', '3 L', '3 L'],
            ['Pasos', '8,000 (10,000 desde la semana 5)', 'igual'],
          ],
          nota: 'El día de comida libre suma 2,200 − 1,935 = 265 kcal contra el día normal. Con 4 kcal por gramo de proteína y de carbohidratos y 9 por gramo de grasa: 740 + 760 + 450 = 1,950 kcal (15 más que los ~1,935; las cifras del plan son aproximadas, por eso el «~»).',
        },
      ],
    },
    {
      id: 'cambios', kicker: '4 · Contra lo que ya hacías', titulo: 'Lo que cambia contra lo que ya hacías', tipo: 'bloques',
      intro: 'Claras en el desayuno, verdura y un poco de aguacate en la comida, el yogurt y el whey alrededor del entreno, y más relleno (y queso) en el sándwich.',
      bloques: [
        {
          k: 'tarjetas', cols: 2, items: [
            { n: '1', etiqueta: 'Desayuno · 9:00', titulo: 'Claras en el desayuno', texto: '150 g de claras junto a los 2 huevos.' },
            { n: '2', etiqueta: 'Comida · 14:00', titulo: 'Verdura y un poco de aguacate', texto: '2 tazas de verdura o ensalada y 1/4 de aguacate.' },
            { n: '3', etiqueta: '17:30 y 20:15', titulo: 'El yogurt y el whey alrededor del entreno', texto: '200 g de yogurt griego natural 0 % de pre-entreno y 1 scoop de whey de post-entreno.' },
            { n: '4', etiqueta: 'Cena · 20:45', titulo: 'Más relleno (y queso) en el sándwich', texto: '120 g de pechuga de pavo (o su opción) y 30 g de queso panela.' },
          ],
        },
      ],
    },
    {
      id: 'reglas', kicker: '5 · Para que funcione', titulo: 'Reglas que sí importan', tipo: 'bloques',
      bloques: [
        {
          k: 'tarjetas', cols: 2, items: [
            { n: '1', etiqueta: 'Regla 1', titulo: 'Sodio', texto: 'El pavo y el salmón ahumado traen mucha sal. Ideal: máximo 4 noches a la semana con pavo o salmón; las demás, atún o pollo. Compra «pechuga de pavo», no «jamón de pavo». En 2024 tu sodio salió en 3.2 g al día; la meta es menos de 2.3 g (bajar más de 0.9 g al día, más de 28 %).', tono: 'rojo' },
            { n: '2', etiqueta: 'Regla 2', titulo: 'Café', texto: 'Americano sin azúcar, máximo 4 tazas y la última antes de las 4 pm para que no te quite sueño. En 2024 eran ~6 al día (2 tazas menos). Si es latte, con leche descremada.', tono: 'oro' },
            { n: '3', etiqueta: 'Regla 3', titulo: 'Agua', texto: '3 L repartidos: 1 L antes de la comida, 1 L en la tarde y 1 L con el entreno y la cena. En 2024 tomabas ~500 ml de agua sola al día: ahora son unas 6 veces más.', tono: 'azul' },
            { n: '4', etiqueta: 'Regla 4', titulo: 'Yogurt', texto: 'Que la etiqueta diga ~10 g de proteína por 100 g. Varios yogurts «griegos» en México traen la mitad: tu porción de 200 g daría 10 g en vez de 20 g.', tono: 'oro' },
            { n: '5', etiqueta: 'Regla 5', titulo: 'Libres sin contar', lista: ['agua mineral', 'refresco cero (máximo 1 al día)', 'salsas sin aceite', 'verdura verde'], tono: 'verde' },
            { n: '6', etiqueta: 'Regla 6', titulo: 'Hambre', lista: ['Primero más verdura y agua.', 'Si sigue, 100 g más de claras o pollo.', 'Nunca más pan o tortilla.'], tono: 'rojo' },
            { n: '7', etiqueta: 'Regla 7', titulo: 'Si un día no entrenas', texto: '~1,700 kcal: quita la manzana y el whey (1,935 − 1,700 = 235 kcal menos que el día completo).', tono: 'gris' },
          ],
        },
      ],
    },
    {
      id: 'super', kicker: '6 · Para ir al súper', titulo: 'Lista del súper semanal (tu porción)', tipo: 'super',
      intro: 'Es lo tuyo para 7 días con el menú fijo. Las casillas son para marcar a mano (se guardan en este dispositivo). La línea pequeña de cada renglón («2 × 7 = 14») es la cantidad del menú por 7 días.',
      bloques: [
        {
          k: 'tabla', titulo: 'Si cocinas para 3 (multiplica por 3 lo que dice la comida)', cols: ['Qué', 'Cuenta'], filas: [
            ['Proteína de la comida', '1.6 kg × 3 = 4.8 kg'],
            ['Arroz', '500 g × 3 = 1.5 kg crudo'],
            ['Verdura de la comida', '14 tazas × 3 = 42 tazas (2 tazas por día × 7 días × 3)'],
          ],
        },
      ],
    },
  ],
}
