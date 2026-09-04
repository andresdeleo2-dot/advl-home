import IdeasClient from './IdeasClient'

// Sección "Ideas": libreta de captura rápida sin estructura (ver sql/ideas.sql). Datos en
// el cliente (/api/ideas + /api/epicas para el picker de "convertir en tarea").
export default function IdeasPage() {
  return <IdeasClient />
}
