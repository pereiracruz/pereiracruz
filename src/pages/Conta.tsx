import { useState } from 'react'
import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useDb } from '../store/db'
import { Botao, Cabecalho, Campo, Cartao, Entrada, aviso } from '../components/ui'

export default function Conta() {
  const { nomeUtilizador, mudarPass } = useDb()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [rep, setRep] = useState('')
  const [erro, setErro] = useState('')
  const regras = [
    { ok: nova.length >= 8, t: '8 caracteres ou mais' },
    { ok: /[A-Z]/.test(nova), t: 'Uma letra maiúscula' },
    { ok: !!nova && nova === rep, t: 'As duas iguais' },
  ]
  const valida = regras.every((r) => r.ok) && atual

  return (
    <>
      <Cabecalho titulo="A minha conta" />
      <div className="grid grid-cols-[320px_1fr] gap-5 items-start">
        <Cartao className="p-6 flex items-center gap-4">
          <div className="size-14 rounded-full bg-tinta text-white grid place-items-center text-[18px] font-semibold">{nomeUtilizador.charAt(0)}</div>
          <div><p className="font-semibold text-[16px]">{nomeUtilizador}</p><p className="text-[13px] text-suave">Administrador · utilizador: admin</p></div>
        </Cartao>
        <Cartao className="p-6">
          <h3 className="font-semibold mb-4">Palavra-passe</h3>
          <form className="grid grid-cols-[1fr_240px] gap-8" onSubmit={async (e) => {
            e.preventDefault(); setErro('')
            if (!(await mudarPass(atual, nova))) { setErro('A palavra-passe atual não está certa.'); return }
            setAtual(''); setNova(''); setRep(''); aviso('Palavra-passe alterada.')
          }}>
            <div className="space-y-4">
              <Campo rotulo="Palavra-passe atual"><Entrada type="password" value={atual} onChange={(e) => setAtual(e.target.value)} /></Campo>
              <Campo rotulo="Nova palavra-passe"><Entrada type="password" value={nova} onChange={(e) => setNova(e.target.value)} /></Campo>
              <Campo rotulo="Repetir a nova palavra-passe"><Entrada type="password" value={rep} onChange={(e) => setRep(e.target.value)} /></Campo>
              {erro && <p className="text-[13px] text-vermelho">{erro}</p>}
              <Botao variante="primario" disabled={!valida}>Alterar palavra-passe</Botao>
            </div>
            <ul className="space-y-2 pt-7">
              {regras.map((r) => (
                <li key={r.t} className={clsx('flex items-center gap-2 text-[13px]', r.ok ? 'text-verde' : 'text-suave')}>
                  <span className={clsx('size-4 rounded-full grid place-items-center', r.ok ? 'bg-verde text-white' : 'border border-linha-forte')}>{r.ok && <Check size={10} strokeWidth={3} />}</span>{r.t}
                </li>
              ))}
            </ul>
          </form>
          <p className="text-[12px] text-tenue mt-6">Nesta fase a conta fica guardada neste browser. Com o servidor passa a ter autenticação segura e cópias de segurança.</p>
        </Cartao>
      </div>
    </>
  )
}
