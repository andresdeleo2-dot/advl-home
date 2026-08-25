import PanelClient from './PanelClient'

// Sección "Panel": centro del día (actividades de hoy, rutinas, por vencer, calendario y
// fechas a recordar). Datos en el cliente (/api/epicas + margen.v1 + widgets propios).
export default function PanelPage() {
  return <PanelClient />
}
