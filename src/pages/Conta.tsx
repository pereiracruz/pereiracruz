import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Check, Smartphone } from 'lucide-react'
import { aoMudarInstalacao, appInstalada, eIOS, instalar, podeInstalar } from '../lib/app'
import { useDb } from '../store/db'
import { Botao, Cabecalho, Campo, Cartao, Entrada, aviso } from '../components/ui'

export default function Conta() {
  const { nomeUtilizador, mudarPass, sessao } = useDb()
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
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <Cartao className="p-6 flex items-center gap-4">
          <div className="size-14 rounded-full bg-tinta text-white grid place-items-center text-[18px] font-semibold">{nomeUtilizador.charAt(0)}</div>
          <div><p className="font-semibold text-[16px]">{nomeUtilizador}</p><p className="text-[13px] text-suave">Administrador · {sessao}</p></div>
        </Cartao>
        <Cartao className="p-6">
          <h3 className="font-semibold mb-4">Palavra-passe</h3>
          <form className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-6 md:gap-8" onSubmit={async (e) => {
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
        </Cartao>
        <AppTelemovel />
      </div>
    </>
  )
}

/** Instalar a aplicação no telemóvel (ícone no ecrã principal, abre em ecrã inteiro). */
function AppTelemovel() {
  const [, atualizar] = useState(0)
  useEffect(() => aoMudarInstalacao(() => atualizar((n) => n + 1)), [])
  const instalada = appInstalada()
  return (
    <Cartao className="p-6 lg:col-span-2">
      <h3 className="font-semibold mb-1 flex items-center gap-2"><Smartphone size={17} />App no telemóvel</h3>
      {instalada ? <p className="text-[14px] text-verde">Está a usar a app instalada.</p> : <>
        <p className="text-[14px] text-suave mb-3">Instale a aplicação no telemóvel: fica um ícone da Pereira & Cruz no ecrã principal e abre em ecrã inteiro, com os mesmos dados e o mesmo login.</p>
        {podeInstalar() && <Botao variante="primario" icone={<Smartphone size={15} />} onClick={async () => { if (await instalar()) aviso('App instalada.') }}>Instalar a app</Botao>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13.5px] mt-3">
          <div className={clsx('rounded-controlo border border-linha p-3', eIOS() && 'border-tinta-2')}>
            <p className="font-semibold mb-1">iPhone (Safari)</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-tinta-2"><li>Abrir o site no <b>Safari</b>.</li><li>Tocar em <b>Partilhar</b> (quadrado com seta para cima).</li><li><b>Adicionar ao ecrã principal</b> → <b>Adicionar</b>.</li></ol>
          </div>
          <div className={clsx('rounded-controlo border border-linha p-3', !eIOS() && 'border-tinta-2')}>
            <p className="font-semibold mb-1">Android (Chrome)</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-tinta-2"><li>Abrir o site no <b>Chrome</b>.</li><li>Menu <b>⋮</b> → <b>Instalar app</b> (ou <b>Adicionar ao ecrã principal</b>).</li><li>Confirmar <b>Instalar</b>.</li></ol>
          </div>
        </div>
      </>}
    </Cartao>
  )
}
