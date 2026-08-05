'use client'

import { useEffect } from 'react'

/* Registra el service worker (PWA instalable + offline básico). Silencioso si falla. */
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (document.readyState === 'complete') reg()
    else window.addEventListener('load', reg, { once: true })
  }, [])
  return null
}
