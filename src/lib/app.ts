/** App instalável (PWA): regista o service worker e guarda o pedido de instalação do Android/Chrome. */
type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pedido: PedidoInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function prepararApp() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch((e) => console.error('service worker', e)) })
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e as PedidoInstalacao; avisar() })
  window.addEventListener('appinstalled', () => { pedido = null; avisar() })
}

export const appInstalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
export const podeInstalar = () => !!pedido
export const eIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export async function instalar() {
  if (!pedido) return false
  await pedido.prompt()
  const { outcome } = await pedido.userChoice
  pedido = null; avisar()
  return outcome === 'accepted'
}
export function aoMudarInstalacao(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
