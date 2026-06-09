// Branding / config (equivalente al Sheet2 del GAS original)
export const CONFIG = {
  siteName: 'Panel Andres',
  logoText: 'ADVL',
  maxFavorites: 20,
  // Acciones rápidas del header (links globales)
  quickLinks: {
    excel: 'https://docs.google.com/spreadsheets/',
    codigo: 'https://script.google.com/',
  },
  // Calendarios de Google
  calendars: {
    primary: 'andres@a-dvl.com',
    secondary: 'c_9a0b9f82cd2e9bd6c41a225430841a69e1435c5989659c9d70d9040b9bc629cb@group.calendar.google.com',
  },
  // Zonas horarias para los relojes del header
  clocks: [
    { label: 'México', tz: 'America/Mexico_City', short: 'MX' },
    { label: 'San Francisco', tz: 'America/Los_Angeles', short: 'SF' },
  ],
}
