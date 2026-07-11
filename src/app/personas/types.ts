export type Persona = {
  id: string
  nombre: string
  categoria: string | null
  importancia: number | null
  excepcional: boolean
  significado: string | null
  conocimos: string | null
  gusta: string | null
  notas: string | null
  ultima_vez: string | null
  cumple: string | null
  celular: string | null
  email: string | null
  direccion_actual: string | null
  direcciones_previas: string[] | null
  links: { label: string; url: string }[] | null
  created_at?: string
}

export type Categoria = {
  id: string
  name: string
  locked: boolean
  password: string | null
  orden: number | null
}

// Escala de importancia de una persona (5 = la más cercana)
export const IMP_PERSONA: Record<number, string> = {
  1: 'Distante', 2: 'Ocasional', 3: 'Presente', 4: 'Cercano', 5: 'Núcleo',
}
