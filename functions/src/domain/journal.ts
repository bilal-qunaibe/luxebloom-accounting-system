import { COL, fail, iso, round2, type Ctx } from './core.js'
import type { Reader, Tx } from '../store.js'

// القيود المحاسبية (قيد مزدوج)
// شكل السطر متوافق مع القيود القديمة: debitAccountId / creditAccountId

export interface Line {
  accountId: string
  debit?: number
  credit?: number
  description?: string
}

export interface EntryInput {
  description: string
  reference?: string
  date?: string
  source?: { type: string; id: string }
  lines: Line[]
}

// رقم تسلسلي لكل نوع مستند: INV-2026-0001
export async function reserveNumber(tx: Reader, key: string, prefix: string, year: number, pad = 4) {
  const id = `${key}_${year}`
  const snap = await tx.get(COL.counters, id)
  const next = (Number(snap.data.value) || 0) + 1
  return {
    value: `${prefix}-${year}-${String(next).padStart(pad, '0')}`,
    commit: (w: Tx) => w.set(COL.counters, id, { value: next }),
  }
}

export function buildItems(lines: Line[]) {
  const items = lines
    .map(l => ({ ...l, debit: round2(l.debit || 0), credit: round2(l.credit || 0) }))
    .filter(l => l.debit > 0 || l.credit > 0)
    .map(l => {
      if (l.debit > 0 && l.credit > 0) fail('سطر القيد لا يمكن أن يكون مدين ودائن بنفس الوقت')
      if (l.debit < 0 || l.credit < 0) fail('مبالغ القيد لا يمكن أن تكون سالبة')
      return l.debit > 0
        ? { debitAccountId: l.accountId, debit: l.debit, credit: 0, description: l.description || '' }
        : { creditAccountId: l.accountId, debit: 0, credit: l.credit, description: l.description || '' }
    })
  const totalDebit = round2(items.reduce((s, i) => s + i.debit, 0))
  const totalCredit = round2(items.reduce((s, i) => s + i.credit, 0))
  if (items.length < 2) fail('القيد لازم يحتوي على طرفين على الأقل')
  if (Math.abs(totalDebit - totalCredit) > 0.009) fail(`القيد غير متوازن (مدين ${totalDebit} / دائن ${totalCredit})`)
  return { items, totalDebit, totalCredit }
}

export const hasAmounts = (lines: Line[]) => lines.some(l => round2(l.debit || 0) > 0 || round2(l.credit || 0) > 0)

// تاريخ المستند: لو انبعت تاريخ يوم سابق بنثبته الظهر، غير هيك الوقت الحالي
export function docDate(ctx: Ctx, date?: string) {
  if (!date) return iso(ctx.now)
  const day = date.slice(0, 10)
  if (day === iso(ctx.now).slice(0, 10)) return iso(ctx.now)
  const d = new Date(`${day}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) fail('التاريخ غير صحيح')
  if (d.getTime() > ctx.now.getTime() + 86_400_000) fail('ما بصير تسجل عملية بتاريخ مستقبلي')
  return iso(d)
}

export function writeEntry(tx: Tx, ctx: Ctx, entryNo: string, input: EntryInput): string | null {
  if (!hasAmounts(input.lines)) return null
  const { items, totalDebit, totalCredit } = buildItems(input.lines)
  const id = tx.newId(COL.journal)
  tx.set(COL.journal, id, {
    entryNo,
    description: input.description,
    reference: input.reference || '',
    items,
    totalDebit,
    totalCredit,
    date: input.date || iso(ctx.now),
    createdAt: iso(ctx.now),
    status: 'POSTED',
    source: input.source || null,
    origin: ctx.origin,
    createdBy: ctx.uid,
  })
  return id
}

// قيد عكسي: نفس الأسطر بس المدين صار دائن والعكس
export function reverseLines(entry: Record<string, any>): Line[] {
  return (entry.items || []).map((i: any) =>
    i.debitAccountId
      ? { accountId: i.debitAccountId, credit: Number(i.debit) || 0, description: i.description }
      : { accountId: i.creditAccountId, debit: Number(i.credit) || 0, description: i.description },
  )
}
