import TiempoClient from './TiempoClient'

// Sección "Margen": todo el estado vive en el cliente (localStorage 'margen.v1'),
// tal como el prototipo del handoff. Sin backend, offline-first.
export default function TiempoPage() {
  return <TiempoClient />
}
