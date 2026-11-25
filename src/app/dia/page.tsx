import DiaClient from './DiaClient'

// «Mi día»: lo arma solo el cierre de las 3:00 (Claude en la Mac, desde tu diario de Obsidian y tus
// épicas). Aquí se ve, se decide y se cierra el día. Datos en el cliente (/api/dia + /api/epicas).
export default function DiaPage() {
  return <DiaClient />
}
