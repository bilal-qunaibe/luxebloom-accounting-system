import { ensureSystemAccounts, normalizeExpenseCategory } from './accounts.js'
import { AppError, COL, CURRENCY_LABEL, PAYMENT_LABEL, iso, round2, type Ctx } from './core.js'
import { createAccount, createManualEntry, deleteProduct, saveParty, savePartner, saveProduct } from './masterdata.js'
import { runMigration } from './migration.js'
import {
  createExpense,
  createPartnerTx,
  createPartyPayment,
  prepareExpense,
  preparePartnerTx,
  preparePartyPayment,
} from './money.js'
import { createPurchase, preparePurchase } from './purchases.js'
import { reverseDocument } from './reverse.js'
import { createSale, prepareSale } from './sales.js'
import * as S from './schemas.js'
import type { Store } from '../store.js'

// نقطة الدخول الوحيدة لأي عملية كتابة بالنظام

type Runner = (store: Store, ctx: Ctx, payload: any) => Promise<any>

const ACTIONS: Record<string, { schema: any; run: Runner; ownerOnly?: boolean }> = {
  'product.save': { schema: S.productSave, run: saveProduct },
  'product.delete': { schema: S.productDelete, run: deleteProduct },
  'sale.create': { schema: S.saleCreate, run: createSale },
  'purchase.create': { schema: S.purchaseCreate, run: createPurchase },
  'expense.create': { schema: S.expenseCreate, run: createExpense },
  'customer.save': { schema: S.customerSave, run: (s, c, p) => saveParty(s, c, 'customer', p) },
  'supplier.save': { schema: S.supplierSave, run: (s, c, p) => saveParty(s, c, 'supplier', p) },
  'customer.payment': { schema: S.partyPayment, run: (s, c, p) => createPartyPayment(s, c, 'customer', p) },
  'supplier.payment': { schema: S.partyPayment, run: (s, c, p) => createPartyPayment(s, c, 'supplier', p) },
  'partner.save': { schema: S.partnerSave, run: savePartner },
  'partner.transaction': { schema: S.partnerTx, run: createPartnerTx },
  'account.create': { schema: S.accountCreate, run: createAccount },
  'journal.create': { schema: S.journalCreate, run: createManualEntry },
  'document.reverse': { schema: S.reverseDoc, run: reverseDocument },
  'settings.update': { schema: S.settingsUpdate, run: updateSettings, ownerOnly: true },
  'migration.run': { schema: S.migrationRun, run: (s, c, p) => runMigration(s, c, p.dryRun), ownerOnly: true },
}

export const ACTION_TYPES = Object.keys(ACTIONS)

export async function runAction(store: Store, ctx: Ctx, type: string, payload: unknown) {
  const action = ACTIONS[type]
  if (!action) throw new AppError('invalid', `عملية غير معروفة: ${type}`)
  if (action.ownerOnly && ctx.role !== 'owner') throw new AppError('denied', 'هاي العملية لصاحب الحساب فقط')
  const input = S.parse(action.schema, payload)
  await ensureSystemAccounts(store, ctx.now)
  return action.run(store, ctx, input)
}

async function updateSettings(store: Store, ctx: Ctx, input: any) {
  await store.batchWrite([
    {
      col: COL.settings,
      id: 'system',
      data: { ...input, updatedAt: iso(ctx.now), updatedBy: ctx.uid },
      merge: true,
    },
  ])
  return { ok: true }
}

// ---------- الصلاحيات ----------

export async function resolveMember(
  store: Store,
  auth: { uid: string; email?: string } | undefined,
  ownerEmails: string[],
  now = new Date(),
): Promise<Ctx> {
  if (!auth?.uid) throw new AppError('denied', 'لازم تسجل دخول')
  const email = (auth.email || '').toLowerCase()
  const member = await store.get(COL.members, auth.uid)
  if (member.exists && member.data.active !== false) {
    return { uid: auth.uid, email, role: member.data.role === 'owner' ? 'owner' : 'staff', origin: 'ui', now }
  }
  if (email && ownerEmails.includes(email)) {
    await store.batchWrite([
      { col: COL.members, id: auth.uid, data: { email, role: 'owner', active: true, createdAt: iso(now) }, merge: true },
    ])
    return { uid: auth.uid, email, role: 'owner', origin: 'ui', now }
  }
  throw new AppError('denied', 'هذا الحساب غير مصرح له باستخدام نظام LuxeBloom')
}

// ---------- معاينة العمليات قبل التأكيد (للمساعد) ----------

export interface Preview {
  title: string
  lines: string[]
  total?: string
  warnings: string[]
}

const fmt = (n: number, cur = '₪') => `${round2(n).toLocaleString('en-US')} ${cur}`

export async function previewAction(store: Store, type: string, payload: unknown): Promise<{ payload: any; preview: Preview }> {
  const action = ACTIONS[type]
  if (!action) throw new AppError('invalid', `عملية غير معروفة: ${type}`)
  const input = S.parse(action.schema, payload)
  const warnings: string[] = []

  switch (type) {
    case 'sale.create': {
      const p = await prepareSale(store, input)
      for (const i of p.items) if (i.unitPrice < i.purchasePrice) warnings.push(`سعر بيع "${i.name}" أقل من التكلفة (${fmt(i.purchasePrice)})`)
      return {
        payload: input,
        preview: {
          title: 'طلبية بيع جديدة',
          lines: [
            ...p.items.map(
              i => `${i.name}${i.size ? ` (مقاس ${i.size})` : ''} × ${i.quantity} — ${i.unitPrice === 0 ? 'مجاناً' : fmt(i.total)}`,
            ),
            `العميل: ${p.customer?.name || 'عميل نقدي'}`,
            `الدفع: ${PAYMENT_LABEL[input.paymentMethod as keyof typeof PAYMENT_LABEL]} — المدفوع ${fmt(p.paid)}${p.remaining > 0 ? ` | المتبقي ${fmt(p.remaining)}` : ''}`,
            `الربح المتوقع: ${fmt(p.netProfit)}`,
            ...(input.notes ? [`ملاحظات: ${input.notes}`] : []),
          ],
          total: fmt(p.totalRevenue),
          warnings,
        },
      }
    }
    case 'purchase.create': {
      const p = await preparePurchase(store, input)
      const cur = CURRENCY_LABEL[input.currency as keyof typeof CURRENCY_LABEL]
      return {
        payload: input,
        preview: {
          title: 'فاتورة شراء جديدة',
          lines: [
            ...p.items.map(i => `${i.name}${i.size ? ` (مقاس ${i.size})` : ''} × ${i.quantity} — ${fmt(i.unitCostOriginal * i.quantity, cur)}`),
            `المورد: ${p.supplier?.name || input.supplierName || 'مورد عام'}`,
            `المدفوع: ${fmt(p.paidOriginal, cur)}${p.remaining > 0 ? ` | المتبقي ${fmt(p.remaining)}` : ''}`,
            ...(input.currency !== 'ILS' ? [`سعر الصرف: ${p.rate} — الإجمالي بالشيكل ${fmt(p.totalCost)}`] : []),
          ],
          total: fmt(p.totalOriginal, cur),
          warnings,
        },
      }
    }
    case 'expense.create': {
      const p = await prepareExpense(store, input)
      const cur = CURRENCY_LABEL[input.currency as keyof typeof CURRENCY_LABEL]
      if (normalizeExpenseCategory(input.category) !== input.category && input.category) warnings.push(`التصنيف "${input.category}" غير معروف، رح ينسجل تحت "مصاريف أخرى"`)
      return {
        payload: input,
        preview: {
          title: 'مصروف جديد',
          lines: [
            `الوصف: ${input.title}`,
            `التصنيف: ${p.category}`,
            `الدفع: ${PAYMENT_LABEL[input.paymentMethod as keyof typeof PAYMENT_LABEL]}`,
            ...(input.currency !== 'ILS' ? [`بالشيكل: ${fmt(p.amount)} (سعر ${p.rate})`] : []),
            ...(input.date ? [`التاريخ: ${input.date}`] : []),
          ],
          total: fmt(input.amount, cur),
          warnings,
        },
      }
    }
    case 'partner.transaction': {
      const p = await preparePartnerTx(store, input)
      const cur = CURRENCY_LABEL[input.currency as keyof typeof CURRENCY_LABEL]
      return {
        payload: input,
        preview: {
          title: input.kind === 'WITHDRAWAL' ? `دفعة للشريك ${p.partner.name}` : `إيداع من الشريك ${p.partner.name}`,
          lines: [
            input.kind === 'WITHDRAWAL' ? 'طالعة من الصندوق للشريك' : 'داخلة على الصندوق من الشريك',
            `الدفع: ${PAYMENT_LABEL[input.paymentMethod as keyof typeof PAYMENT_LABEL]}`,
            ...(input.currency !== 'ILS' ? [`بالشيكل: ${fmt(p.amount)} (سعر ${p.rate})`] : []),
            ...(input.notes ? [`ملاحظات: ${input.notes}`] : []),
          ],
          total: fmt(input.amount, cur),
          warnings,
        },
      }
    }
    case 'customer.payment':
    case 'supplier.payment': {
      const kind = type === 'customer.payment' ? 'customer' : 'supplier'
      const p = await preparePartyPayment(store, kind, input)
      return {
        payload: input,
        preview: {
          title: kind === 'customer' ? `قبض من العميل ${p.party.name}` : `دفع للمورد ${p.party.name}`,
          lines: [`الدين قبل: ${fmt(p.party.debt)}`, `الدين بعد: ${fmt(p.party.debt - p.amount)}`],
          total: fmt(p.amount),
          warnings,
        },
      }
    }
    default:
      throw new AppError('invalid', 'المساعد ما بقدر يقترح هاي العملية')
  }
}

