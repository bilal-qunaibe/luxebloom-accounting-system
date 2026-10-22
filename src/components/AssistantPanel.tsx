import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Mic, Check, X, Undo2, AlertTriangle, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { askAssistant, callAction, notifyDataChanged, type Proposal } from '@/lib/db'

// المساعد: بتحكيله شو صار، بيجهز العملية كبطاقة، وإنت بتأكد

type Item =
  | { type: 'user'; text: string }
  | { type: 'assistant'; text: string }
  | {
      type: 'proposal'
      proposal: Proposal
      status: 'pending' | 'saving' | 'saved' | 'dismissed' | 'undone'
      result?: { id: string; number?: string }
      error?: string
    }

const REVERSE_KIND: Record<string, string> = {
  'sale.create': 'sale',
  'purchase.create': 'purchase',
  'expense.create': 'expense',
  'partner.transaction': 'partnerTx',
  'customer.payment': 'customerPayment',
  'supplier.payment': 'supplierPayment',
}

const STORAGE_KEY = 'luxe-assistant-chat'

const EXAMPLES = [
  'سجل مصروف 40 شيكل اشتريت بضاعة',
  'بعت خاتم فضة بـ 200 شيكل مع دب',
  'ضيف دفعة 500 دولار للشريك',
  'قديش بعت اليوم وقديش الربح؟',
]

function loadItems(): Item[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// تحويل المحادثة لرسائل نصية للمساعد (البطاقات بتتحول لجمل عن نتيجتها)
function toHistory(items: Item[]) {
  return items.flatMap(i => {
    if (i.type === 'user' || i.type === 'assistant') return [{ role: i.type, content: i.text }]
    const t = i.proposal.preview.title
    if (i.status === 'saved') return [{ role: 'assistant' as const, content: `[تم حفظ "${t}" برقم ${i.result?.number || ''}]` }]
    if (i.status === 'dismissed') return [{ role: 'assistant' as const, content: `[المستخدم لغى بطاقة "${t}"]` }]
    if (i.status === 'undone') return [{ role: 'assistant' as const, content: `[انحفظت "${t}" وبعدين انلغت]` }]
    return [{ role: 'assistant' as const, content: `[بطاقة "${t}" بانتظار التأكيد]` }]
  }) as Array<{ role: 'user' | 'assistant'; content: string }>
}

export default function AssistantPanel() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>(loadItems)
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-60))) } catch { /* التخزين مش متاح */ }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items, isThinking])

  const SpeechRecognition = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || isThinking) return
    const next: Item[] = [...items, { type: 'user', text: msg }]
    setItems(next)
    setInput('')
    setIsThinking(true)
    try {
      const res = await askAssistant(toHistory(next))
      setItems(cur => [
        ...cur,
        ...(res.reply ? [{ type: 'assistant' as const, text: res.reply }] : []),
        ...res.proposals.map(p => ({ type: 'proposal' as const, proposal: p, status: 'pending' as const })),
      ])
    } catch (err: any) {
      setItems(cur => [...cur, { type: 'assistant', text: `⚠️ ${err.message}` }])
    } finally {
      setIsThinking(false)
    }
  }

  const update = (id: string, patch: Partial<Extract<Item, { type: 'proposal' }>>) =>
    setItems(cur => cur.map(i => (i.type === 'proposal' && i.proposal.id === id ? { ...i, ...patch } : i)))

  const confirm = async (p: Proposal) => {
    update(p.id, { status: 'saving', error: undefined })
    try {
      const result = await callAction(p.action, p.payload, 'assistant')
      update(p.id, { status: 'saved', result })
      notifyDataChanged()
    } catch (err: any) {
      update(p.id, { status: 'pending', error: err.message })
    }
  }

  const undo = async (item: Extract<Item, { type: 'proposal' }>) => {
    if (!item.result?.id) return
    if (!window.confirm('إلغاء هاي العملية؟ رح ينعمل قيد عكسي وترجع الكميات/الديون.')) return
    try {
      await callAction('document.reverse', { kind: REVERSE_KIND[item.proposal.action], id: item.result.id, reason: 'تراجع من المساعد' })
      update(item.proposal.id, { status: 'undone' })
      notifyDataChanged()
    } catch (err: any) {
      update(item.proposal.id, { error: err.message })
    }
  }

  const toggleMic = () => {
    if (!SpeechRecognition) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'ar-PS'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e: any) => setInput(Array.from(e.results).map((r: any) => r[0].transcript).join(' '))
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  const pending = items.filter(i => i.type === 'proposal' && i.status === 'pending').length

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-[#C5CBAF] text-[#2B3A32] font-bold shadow-2xl shadow-black/40 hover:scale-105 transition-transform"
        title="المساعد"
      >
        <Sparkles className="w-5 h-5" />
        <span className="hidden sm:inline">المساعد</span>
        {pending > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">{pending}</span>}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col bg-[#1c2620] border-[#C5CBAF]/10 [&>button:last-child]:hidden" dir="rtl">
          <SheetHeader className="p-4 border-b border-[#C5CBAF]/10 flex-row items-center justify-between space-y-0">
            <div className="text-right">
              <SheetTitle className="text-[#C5CBAF] flex items-center gap-2"><Sparkles className="w-4 h-4" /> المساعد</SheetTitle>
              <SheetDescription className="text-white/40 text-xs">احكيلي شو صار وأنا بجهزلك العملية، وما بينحفظ إشي إلا بعد تأكيدك</SheetDescription>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button onClick={() => setItems([])} title="محادثة جديدة" className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} title="إغلاق" className="p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {items.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-white/50 mb-3">جرب تحكي:</p>
                {EXAMPLES.map(e => (
                  <button key={e} onClick={() => send(e)} className="block w-full text-right text-sm px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/80">
                    {e}
                  </button>
                ))}
              </div>
            )}

            {items.map((item, idx) => {
              if (item.type === 'user') {
                return <div key={idx} className="mr-auto max-w-[85%] w-fit bg-[#C5CBAF] text-[#2B3A32] px-3 py-2 rounded-2xl rounded-bl-sm text-sm whitespace-pre-wrap">{item.text}</div>
              }
              if (item.type === 'assistant') {
                return <div key={idx} className="ml-auto max-w-[90%] w-fit bg-white/[0.06] text-white/90 px-3 py-2 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap">{item.text}</div>
              }
              const { proposal: p, status } = item
              return (
                <div key={p.id} className={`rounded-xl border p-3 space-y-2 ${status === 'saved' ? 'border-emerald-500/30 bg-emerald-500/5' : status === 'dismissed' || status === 'undone' ? 'border-white/10 opacity-50' : 'border-[#C5CBAF]/30 bg-[#C5CBAF]/5'}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-white">{p.preview.title}</p>
                    {p.preview.total && <p className="font-bold text-[#C5CBAF]">{p.preview.total}</p>}
                  </div>
                  <ul className="space-y-1">
                    {p.preview.lines.map((l, i) => <li key={i} className="text-xs text-white/70">• {l}</li>)}
                  </ul>
                  {p.preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {w}</p>
                  ))}
                  {item.error && <p className="text-xs text-red-400">{item.error}</p>}

                  {status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => confirm(p)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">
                        <Check className="w-4 h-4" /> تأكيد
                      </button>
                      <button onClick={() => update(p.id, { status: 'dismissed' })} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-sm">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {status === 'saving' && <p className="text-xs text-white/60">جاري الحفظ...</p>}
                  {status === 'saved' && (
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-emerald-400">✓ انحفظت {item.result?.number ? `(${item.result.number})` : ''}</p>
                      <button onClick={() => undo(item)} className="text-xs flex items-center gap-1 text-white/50 hover:text-red-400">
                        <Undo2 className="w-3 h-3" /> تراجع
                      </button>
                    </div>
                  )}
                  {status === 'dismissed' && <p className="text-xs text-white/40">انلغت البطاقة</p>}
                  {status === 'undone' && <p className="text-xs text-white/40">انحفظت وبعدين انلغت</p>}
                </div>
              )
            })}

            {isThinking && <div className="ml-auto w-fit bg-white/[0.06] text-white/50 px-3 py-2 rounded-2xl text-sm animate-pulse">بفكر...</div>}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-3 border-t border-[#C5CBAF]/10 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              rows={1}
              placeholder="مثلاً: بعت سنسال ستانليس بـ 60"
              className="glass-input flex-1 resize-none max-h-32 text-sm"
              disabled={isThinking}
            />
            {SpeechRecognition && (
              <button type="button" onClick={toggleMic} title="تسجيل صوتي" className={`p-2.5 rounded-lg ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
                <Mic className="w-4 h-4" />
              </button>
            )}
            <button type="submit" disabled={isThinking || !input.trim()} className="p-2.5 rounded-lg bg-[#C5CBAF] text-[#2B3A32] disabled:opacity-40">
              <Send className="w-4 h-4 rotate-180" />
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
