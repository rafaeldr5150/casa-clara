import { useRef, useState } from 'react'
import { Camera, Upload, RotateCcw, Loader2, Zap } from 'lucide-react'
import { scanTicket, type ExtractedTicket } from '../lib/gemini'
import ExpenseForm from './ExpenseForm'
import QuickPay from './QuickPay'

interface Props {
  onSaved: () => void
}

type State = 'idle' | 'loading' | 'form' | 'quickpay' | 'error'

export default function Scanner({ onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>('idle')
  const [extracted, setExtracted] = useState<ExtractedTicket | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleFile = async (file: File) => {
    setState('loading')
    setErrorMsg('')
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const mimeType = file.type || 'image/jpeg'
      try {
        const data = await scanTicket(base64, mimeType)
        setExtracted(data)
        setState('form')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro desconhecido')
        setState('error')
      }
    }
    reader.readAsDataURL(file)
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const reset = () => { setState('idle'); setExtracted(null) }

  return (
    <div className="p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-gray-900">Adicionar Despesa</h1>
        <p className="text-gray-500 text-sm mt-1">Scan de ticket ou registo rápido</p>
      </div>

      {state === 'idle' && (
        <div className="space-y-3 pt-2">
          {/* Quick Pay — destaque */}
          <button
            onClick={() => setState('quickpay')}
            className="w-full py-5 rounded-2xl flex items-center justify-center gap-3 text-white font-semibold text-lg shadow-lg transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            <Zap size={26} strokeWidth={1.8} />
            Acabei de Pagar
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                inputRef.current?.setAttribute('capture', 'environment')
                inputRef.current?.click()
              }}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center gap-2 text-gray-700 font-medium border-2 border-gray-200 bg-white transition-colors active:bg-gray-50"
            >
              <Camera size={28} strokeWidth={1.5} />
              <span className="text-sm">Scan Ticket</span>
            </button>

            <button
              onClick={() => {
                inputRef.current?.removeAttribute('capture')
                inputRef.current?.click()
              }}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center gap-2 text-gray-700 font-medium border-2 border-gray-200 bg-white transition-colors active:bg-gray-50"
            >
              <Upload size={28} strokeWidth={1.5} />
              <span className="text-sm">Galeria</span>
            </button>
          </div>

          <button
            onClick={() => setState('form')}
            className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 font-medium text-sm"
          >
            + Despesa detalhada (manual)
          </button>
        </div>
      )}

      {state === 'quickpay' && (
        <QuickPay
          onSaved={onSaved}
          onCancel={reset}
        />
      )}

      {state === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#d1fae5' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: '#10b981' }} />
          </div>
          <p className="text-gray-600 font-medium">A analisar o ticket...</p>
          <p className="text-gray-400 text-sm">A IA está a ler os dados</p>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p className="text-red-700 font-medium">{errorMsg}</p>
          </div>
          <button onClick={reset} className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-gray-600 border border-gray-200">
            <RotateCcw size={18} /> Tentar novamente
          </button>
        </div>
      )}

      {state === 'form' && (
        <div className="space-y-3">
          {extracted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="text-emerald-600 text-sm font-medium">✓ Ticket lido — confirma os dados</span>
            </div>
          )}
          <ExpenseForm initial={extracted ?? {}} onSaved={onSaved} onCancel={reset} />
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleInput} />
    </div>
  )
}
