import { z } from 'zod'
import { AppError } from './core.js'

// التحقق من كل البيانات اللي بتوصل للسيرفر (من الواجهة أو من المساعد)

const money = z.number().finite().min(0).max(100_000_000)
const qty = z.number().int().min(1).max(100_000)
const id = z.string().trim().min(1).max(128)
const text = (max = 300) => z.string().trim().max(max)
const optText = (max = 300) => text(max).optional().default('')
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'صيغة التاريخ غير صحيحة')
  .optional()

export const currency = z.enum(['ILS', 'USD', 'JOD']).default('ILS')
export const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD']).default('CASH')

export const variantSchema = z.object({
  size: text(40),
  quantity: z.number().int().min(0).max(100_000),
})

export const productSave = z.object({
  id: id.optional(),
  code: text(60).min(1, 'الكود مطلوب'),
  name: text(200).min(1, 'اسم المنتج مطلوب'),
  nameEn: optText(200),
  categoryId: optText(60),
  itemType: z.enum(['SILVER', 'STEEL', 'OTHER']).default('SILVER'),
  quantity: z.number().int().min(0).max(1_000_000).default(0),
  variants: z.array(variantSchema).max(100).default([]),
  weightGram: money.default(0),
  minQuantity: z.number().int().min(0).default(5),
  minWeight: money.default(0),
  purchasePrice: money.default(0),
  salePrice: money.default(0),
  wholesalePrice: money.default(0),
  purity: optText(20),
  isActive: z.boolean().default(true),
})

export const productDelete = z.object({ id })

export const saleItem = z.object({
  productId: id,
  size: optText(40),
  quantity: qty,
  unitPrice: money,
})

export const saleCreate = z.object({
  items: z.array(saleItem).min(1, 'الفاتورة فاضية').max(100),
  customerId: id.optional(),
  paid: money.optional(),
  paymentMethod,
  notes: optText(500),
  date,
})

export const purchaseItem = z.object({
  productId: id,
  size: optText(40),
  quantity: qty,
  unitCost: money,
})

export const purchaseCreate = z.object({
  items: z.array(purchaseItem).min(1, 'الفاتورة فاضية').max(100),
  supplierId: id.optional(),
  supplierName: optText(200),
  paid: money.optional(),
  currency,
  rate: z.number().positive().optional(),
  paymentMethod,
  notes: optText(500),
  date,
})

export const expenseCreate = z.object({
  title: text(200).min(1, 'وصف المصروف مطلوب'),
  amount: money.refine(v => v > 0, 'المبلغ لازم يكون أكبر من صفر'),
  currency,
  rate: z.number().positive().optional(),
  category: optText(100),
  paymentMethod,
  notes: optText(500),
  date,
})

export const customerSave = z.object({
  id: id.optional(),
  name: text(200).min(1, 'اسم العميل مطلوب'),
  phone: optText(40),
  address: optText(300),
  notes: optText(500),
  openingDebt: money.default(0),
})

export const supplierSave = z.object({
  id: id.optional(),
  name: text(200).min(1, 'اسم المورد مطلوب'),
  company: optText(200),
  phone: optText(40),
  notes: optText(500),
  openingDebt: money.default(0),
})

export const partyPayment = z.object({
  partyId: id,
  amount: money.refine(v => v > 0, 'المبلغ لازم يكون أكبر من صفر'),
  paymentMethod,
  notes: optText(500),
  date,
})

export const partnerSave = z.object({
  id: id.optional(),
  name: text(200).min(1, 'اسم الشريك مطلوب'),
  phone: optText(40),
  sharePercent: z.number().min(0).max(100).default(0),
  notes: optText(500),
})

export const partnerTx = z.object({
  partnerId: id,
  kind: z.enum(['CONTRIBUTION', 'WITHDRAWAL']),
  amount: money.refine(v => v > 0, 'المبلغ لازم يكون أكبر من صفر'),
  currency,
  rate: z.number().positive().optional(),
  paymentMethod,
  notes: optText(500),
  date,
})

export const accountCreate = z.object({
  code: text(20).min(1, 'كود الحساب مطلوب'),
  name: text(200).min(1, 'اسم الحساب مطلوب'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  openingBalance: z.number().finite().default(0),
})

export const journalCreate = z.object({
  entryNo: optText(40),
  description: text(300).min(1, 'البيان مطلوب'),
  reference: optText(100),
  items: z
    .array(
      z.object({
        debitAccountId: z.string().optional(),
        creditAccountId: z.string().optional(),
        debit: money.default(0),
        credit: money.default(0),
      }),
    )
    .min(1)
    .max(50),
})

export const reverseDoc = z.object({
  kind: z.enum(['sale', 'purchase', 'expense', 'partnerTx', 'customerPayment', 'supplierPayment', 'journal']),
  id,
  reason: optText(300),
})

export const settingsUpdate = z.object({
  general: z
    .object({
      storeName: optText(100),
      phone: optText(40),
      email: optText(100),
      address: optText(300),
      currency: optText(10),
      dateFormat: optText(20),
    })
    .partial()
    .optional(),
  appearance: z.object({ theme: z.enum(['dark', 'light']) }).partial().optional(),
  notifications: z.record(z.string(), z.boolean()).optional(),
  rates: z.object({ USD: z.number().positive(), JOD: z.number().positive() }).partial().optional(),
})

export const migrationRun = z.object({ dryRun: z.boolean().default(true) })

export type SaleCreate = z.infer<typeof saleCreate>
export type PurchaseCreate = z.infer<typeof purchaseCreate>
export type ExpenseCreate = z.infer<typeof expenseCreate>
export type PartnerTx = z.infer<typeof partnerTx>
export type PartyPayment = z.infer<typeof partyPayment>

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const res = schema.safeParse(input)
  if (!res.success) {
    const first = res.error.issues[0]
    const where = first?.path?.length ? ` (${first.path.join('.')})` : ''
    throw new AppError('invalid', `${first?.message || 'بيانات غير صحيحة'}${where}`)
  }
  return res.data
}
