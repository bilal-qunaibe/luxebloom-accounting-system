import type Anthropic from '@anthropic-ai/sdk'
import { EXPENSE_CATEGORIES } from '../domain/accounts.js'
import { previewAction, type Preview } from '../domain/actions.js'
import { type Ctx } from '../domain/core.js'
import { readRates } from '../domain/inventory.js'
import { findParties, recentOperations, report, searchProducts, type Period } from '../domain/queries.js'
import type { Store } from '../store.js'
import { PROPOSALS, TOOLS } from './tools.js'

// حلقة المساعد: Claude بيقرأ من النظام بالأدوات، وأي عملية كتابة بترجع كاقتراح للمستخدم

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Proposal {
  id: string
  action: string
  payload: unknown
  preview: Preview
}

type Client = Pick<Anthropic, 'messages'>

const MAX_STEPS = 8

function systemPrompt(now: Date, rates: { USD: number; JOD: number }, partnersCount: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron' }).format(now)
  const weekday = new Intl.DateTimeFormat('ar', { timeZone: 'Asia/Hebron', weekday: 'long' }).format(now)
  return `أنت مساعد إدارة داخل نظام محاسبة LuxeBloom (متجر إكسسوارات: فضة 925، ستانليس، ساعات، هدايا). صاحب المتجر بيحكيلك بالعامية الفلسطينية شو صار، وإنت بتجهز العملية بالنظام.

اليوم: ${weekday} ${today} (توقيت الخليل). العملة الأساسية شيكل.
أسعار الصرف بالنظام: الدولار = ${rates.USD} شيكل، الدينار = ${rates.JOD} شيكل.
تصنيفات المصاريف: ${EXPENSE_CATEGORIES.join(' | ')}
عدد الشركاء المسجلين: ${partnersCount}

القواعد:
1. إنت ما بتحفظ إشي بنفسك. أي عملية (بيع، شراء، مصروف، حركة شريك، دفعة) بتجهزها بأداة propose_ المناسبة، والنظام بيعرضها كبطاقة والمستخدم بيأكد. بعد الاقتراح احكي جملة قصيرة زي "راجع البطاقة وأكد". ممنوع تقول "تم الحفظ" أو "سجلتها".
2. قبل أي بيع أو شراء، دوّر على المنتج بـ search_products واستخدم الـ id اللي رجع. إذا ما لقيت المنتج، أو لقيت أكثر من منتج قريب ومش واضح أي واحد، اسأل المستخدم وما تخمّن.
3. إذا المنتج إله مقاسات والمستخدم ما حدد، اسأل عن المقاس.
4. إذا ذكر سعر واحد لطلبية فيها منتج أساسي ومعه إضافة (دب، علبة، وردة، كيس...) بدون سعر خاص، حط السعر كامل على المنتج الأساسي والإضافة بسعر 0، ووضّح هالشي بردك. إذا الإضافة مش موجودة بالمخزون اسأل إذا بدها تنسجل.
5. إذا ما ذكر سعر البيع، استخدم سعر البيع المسجل للمنتج ووضح ذلك.
6. البيع بالدين (دفع جزء أو ما دفع) لازم يكون على عميل مسجل: دوّر عليه بـ find_customers، وإذا مش موجود اطلب منه يضيفه من صفحة العملاء.
7. الشركاء: "دفعت/حولت للشريك" أو "سحب الشريك" = WITHDRAWAL. "الشريك حط/دفع للمحل/رأس مال" = CONTRIBUTION. إذا مش واضح اسأل. إذا في أكثر من شريك والاسم مش مذكور اسأل. جيب الشركاء بـ list_partners.
8. العملة: شيكل/ش = ILS، دولار/$ = USD، دينار = JOD. إذا ما انذكرت فهي شيكل.
9. طريقة الدفع: نقدي/كاش افتراضياً. تحويل/بنك = BANK_TRANSFER. فيزا/بطاقة = CREDIT_CARD.
10. المصروف: اختار التصنيف الأقرب من القائمة بالضبط. الوصف بكلام المستخدم.
11. التاريخ: إذا قال "مبارح" أو يوم معين احسب التاريخ وحطه، غير هيك لا تحط تاريخ.
12. أي سؤال عن أرقام (مبيعات، أرباح، ديون، مخزون، الصندوق) جاوبه من get_report أو الأدوات، وممنوع تخترع رقم.
13. إذا الطلب فيه أكثر من عملية، اقترح كل وحدة بأداة منفصلة.
14. ردودك قصيرة وواضحة بالعامية الفلسطينية، بدون جداول، والمبالغ بالشيكل ₪.
15. إنت مساعد لهاد النظام بس. أي طلب برا إدارة المتجر اعتذر بلطف.`
}

function sanitize(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const clean = (Array.isArray(messages) ? messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
  const merged: Anthropic.MessageParam[] = []
  for (const m of clean) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) last.content = `${last.content}\n${m.content}`
    else merged.push({ ...m })
  }
  while (merged.length && merged[0].role !== 'user') merged.shift()
  return merged
}

export async function runAssistant(opts: {
  store: Store
  ctx: Ctx
  client: Client
  model: string
  messages: ChatMessage[]
}) {
  const { store, ctx, client, model } = opts
  const messages = sanitize(opts.messages)
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { reply: 'شو بتحب أسجلك؟', proposals: [] as Proposal[] }
  }

  const [rates, partners] = await Promise.all([readRates(store), store.list('partners')])
  const system = systemPrompt(ctx.now, rates, partners.length)
  const proposals: Proposal[] = []

  async function runTool(name: string, input: any) {
    switch (name) {
      case 'search_products':
        return searchProducts(store, String(input.query || ''))
      case 'find_customers':
        return findParties(store, 'customers', String(input.query || ''))
      case 'find_suppliers':
        return findParties(store, 'suppliers', String(input.query || ''))
      case 'list_partners':
        return findParties(store, 'partners', '', 50)
      case 'get_report':
        return report(store, (input.period || 'today') as Period, ctx.now)
      case 'recent_operations':
        return recentOperations(store, Math.min(Number(input.limit) || 10, 30))
    }
    const proposal = PROPOSALS[name]
    if (!proposal) throw new Error(`أداة غير معروفة: ${name}`)
    const payload = proposal.map ? proposal.map(input) : input
    const { payload: valid, preview } = await previewAction(store, proposal.action, payload)
    const id = `p${proposals.length + 1}_${Date.now().toString(36)}`
    proposals.push({ id, action: proposal.action, payload: valid, preview })
    return { status: 'عُرضت البطاقة على المستخدم بانتظار تأكيده. لم تُحفظ بعد.', summary: preview }
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model,
      max_tokens: 1500,
      system,
      tools: TOOLS,
      messages,
    })
    messages.push({ role: 'assistant', content: res.content })

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || uses.length === 0) {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
      return { reply: reply || (proposals.length ? 'راجع البطاقة وأكد.' : 'ما فهمت عليك، وضّح أكثر؟'), proposals }
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const u of uses) {
      try {
        const out = await runTool(u.name, u.input)
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) })
      } catch (err: any) {
        results.push({ type: 'tool_result', tool_use_id: u.id, content: String(err?.message || err), is_error: true })
      }
    }
    messages.push({ role: 'user', content: results })
  }

  return {
    reply: proposals.length ? 'راجع البطاقة وأكد.' : 'الطلب طوّل معي، جرب تكتبه بشكل أبسط.',
    proposals,
  }
}
