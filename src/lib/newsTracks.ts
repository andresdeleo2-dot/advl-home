/* Un "track" = un tema + un foco específico dentro de él (ej. tema "Videojuegos", foco "GTA VI").
 * `query` arma un feed de Google News por búsqueda (gratis, sin API key, sin límite — para lo
 * específico: un juego, una empresa, un país…). `feedUrl` es un RSS directo de un medio (para lo
 * general/amplio del tema). Se guardan en Supabase (news_config) para poder agregar/quitar desde
 * el Panel sin tocar código; si la tabla no existe o está vacía, se usa esta lista por defecto. */
export type NewsTrack = { topic: string; label: string; query?: string; feedUrl?: string }

export const DEFAULT_TRACKS: NewsTrack[] = [
  // Videojuegos
  { topic: 'Videojuegos', label: 'GTA VI', query: 'GTA 6 OR "GTA VI" OR "Grand Theft Auto VI"' },
  { topic: 'Videojuegos', label: 'Wolverine', query: '"Marvel\'s Wolverine" juego OR videojuego' },
  { topic: 'Videojuegos', label: 'Más lanzamientos', feedUrl: 'https://es.ign.com/feed.xml' },
  // Finanzas y economía
  { topic: 'Finanzas y economía', label: 'Microsoft', query: 'Microsoft empresa OR acciones OR Nasdaq' },
  { topic: 'Finanzas y economía', label: 'Mercado Libre', query: '"Mercado Libre" empresa OR acciones OR MELI' },
  { topic: 'Finanzas y economía', label: 'Economía general', feedUrl: 'https://expansion.mx/rss' },
  // Política
  { topic: 'Política', label: 'México', query: 'política México' },
  { topic: 'Política', label: 'Reino Unido', query: 'política "Reino Unido" OR UK politics' },
  { topic: 'Política', label: 'Estados Unidos', query: 'política "Estados Unidos"' },
  // Series y TV
  { topic: 'Series y TV', label: 'Series y TV', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/television/portada' },
]
