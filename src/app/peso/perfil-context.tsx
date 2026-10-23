'use client'

// El perfil de Andrés (estatura, edad, sexo, actividad...) para los componentes de /peso. PesoClient lo provee con
// el que llega del servidor; fuera de un proveedor (pruebas, páginas de carga) se usa PERFIL_DEFAULT, que es lo
// que valía antes de que existiera el perfil. Hidratación: el valor viene en las props del servidor, así que el
// primer render del cliente es idéntico al del servidor.

import { createContext, useContext, type ReactNode } from 'react'
import { PERFIL_DEFAULT, type PesoPerfil } from '@/lib/peso-perfil'

const PerfilContext = createContext<PesoPerfil>(PERFIL_DEFAULT)

export function PerfilProvider({ perfil, children }: { perfil: PesoPerfil; children: ReactNode }) {
  return <PerfilContext.Provider value={perfil}>{children}</PerfilContext.Provider>
}

/** El perfil vigente. */
export const usePerfil = () => useContext(PerfilContext)
