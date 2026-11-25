import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { useDb } from '../store/db'
import { Campo, Entrada } from '../components/ui'

export default function Login() {
  const entrar = useDb((s) => s.entrar)
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [erro, setErro] = useState('')
  const [aEntrar, setAEntrar] = useState(false)

  const submeter = async (e: FormEvent) => {
    e.preventDefault()
    setAEntrar(true); setErro('')
    const ok = await entrar(u, p)
    setAEntrar(false)
    if (!ok) setErro('Utilizador ou palavra-passe incorretos.')
  }

  return (
    <div className="min-h-full grid place-items-center p-4">
      <div className="w-full max-w-[400px]">
        <form onSubmit={submeter} className="bg-papel rounded-painel border border-linha shadow-[0_20px_60px_-20px_rgba(29,28,26,0.18)] border-t-[3px] border-t-ouro px-10 pt-10 pb-10">
          <img src="/logo-mark.png" alt="Pereira & Cruz" className="h-16 mx-auto" />
          <h1 className="text-center text-[20px] font-semibold mt-7 mb-8">Iniciar sessão</h1>
          <div className="space-y-5">
            <Campo rotulo="Utilizador"><Entrada autoFocus value={u} onChange={(e) => setU(e.target.value)} placeholder="admin" autoComplete="username" /></Campo>
            <Campo rotulo="Palavra-passe"><Entrada type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" autoComplete="current-password" /></Campo>
          </div>
          {erro && <p className="text-[13px] text-vermelho mt-4">{erro}</p>}
          <button disabled={aEntrar} className="mt-8 w-full h-11 rounded-controlo bg-tinta text-white font-medium flex items-center justify-center gap-2 hover:bg-tinta-2 disabled:opacity-60">
            Entrar <ArrowRight size={16} />
          </button>
        </form>
        <p className="text-center text-[12px] text-tenue mt-6">© {new Date().getFullYear()} Pereira & Cruz</p>
      </div>
    </div>
  )
}
