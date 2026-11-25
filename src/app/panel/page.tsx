import { redirect } from 'next/navigation'

// El Panel se juntó con «Mi día» (2026-11-25): lo que solo tenía el Panel (Pregúntale a tu cerebro, salud,
// personas sin verse y las gráficas de la semana) ahora vive en /dia. Se deja la ruta para no romper favoritos.
export default function PanelPage() {
  redirect('/dia')
}
