import RoadmapClient from './RoadmapClient'

// Sección "Roadmap": línea de tiempo (Gantt) + lista priorizada de épicas/features con fechas
// objetivo (ver sql/epicas-17-roadmap.sql). Datos en el cliente (/api/epicas, mismo endpoint
// que Épicas — reusa roadmap_start/roadmap_end en epicas y roadmapStart/End en features).
export default function RoadmapPage() {
  return <RoadmapClient />
}
