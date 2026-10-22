import { COL, DEFAULT_RATES, fail, iso, type Ctx, type Rates } from './core.js'
import type { Doc, Reader, Tx } from '../store.js'

// حركات المخزون على مستوى المنتج والمقاس

export interface Variant {
  size: string
  quantity: number
}

export interface StockState {
  id: string
  name: string
  quantity: number
  variants: Variant[]
  purchasePrice: number
  data: Doc
}

export function stockState(id: string, data: Doc): StockState {
  const variants: Variant[] = Array.isArray(data.variants)
    ? data.variants
        .filter((v: any) => v && String(v.size ?? '').trim() !== '')
        .map((v: any) => ({ size: String(v.size).trim(), quantity: Number(v.quantity) || 0 }))
    : []
  return {
    id,
    name: String(data.name || ''),
    quantity: variants.length ? variants.reduce((s, v) => s + v.quantity, 0) : Number(data.quantity) || 0,
    variants,
    purchasePrice: Number(data.purchasePrice) || 0,
    data,
  }
}

// تعديل الكمية (موجب = إدخال، سالب = إخراج)
export function moveStock(p: StockState, size: string, delta: number, opts: { allowNewSize?: boolean } = {}) {
  const s = (size || '').trim()
  if (p.variants.length) {
    if (!s) fail(`المنتج "${p.name}" إله مقاسات، حدد المقاس`)
    let v = p.variants.find(x => x.size === s)
    if (!v) {
      if (delta > 0 && opts.allowNewSize) {
        v = { size: s, quantity: 0 }
        p.variants.push(v)
      } else {
        fail(`المقاس ${s} غير موجود للمنتج "${p.name}"`)
      }
    }
    if (v!.quantity + delta < 0) fail(`الكمية غير كافية من "${p.name}" مقاس ${s}، المتوفر: ${v!.quantity}`)
    v!.quantity += delta
    p.quantity = p.variants.reduce((sum, x) => sum + x.quantity, 0)
  } else {
    if (s) fail(`المنتج "${p.name}" ما إله مقاسات`)
    if (p.quantity + delta < 0) fail(`الكمية غير كافية من "${p.name}"، المتوفر: ${p.quantity}`)
    p.quantity += delta
  }
}

export async function loadStock(r: Reader, ids: string[], opts: { skipMissing?: boolean } = {}) {
  const unique = [...new Set(ids)]
  const snaps = await r.getMany(COL.products, unique)
  const map = new Map<string, StockState>()
  for (const s of snaps) {
    if (!s.exists) {
      if (opts.skipMissing) continue
      fail('أحد المنتجات غير موجود في المخزون')
    }
    map.set(s.id, stockState(s.id, s.data))
  }
  return map
}

export function writeStock(tx: Tx, p: StockState, extra: Doc = {}) {
  tx.update(COL.products, p.id, {
    quantity: p.quantity,
    ...(p.variants.length ? { variants: p.variants } : {}),
    ...extra,
  })
}

export function logStock(
  tx: Tx,
  ctx: Ctx,
  productId: string,
  type: string,
  quantity: number,
  size: string,
  ref: { type: string; id: string },
) {
  tx.set(COL.inventoryLogs, tx.newId(COL.inventoryLogs), {
    productId,
    type,
    quantity,
    size: size || '',
    referenceType: ref.type,
    referenceId: ref.id,
    createdAt: iso(ctx.now),
    createdBy: ctx.uid,
  })
}

export async function readRates(r: Reader): Promise<Rates> {
  const s = await r.get(COL.settings, 'system')
  const rates = s.data.rates || {}
  return {
    USD: Number(rates.USD) > 0 ? Number(rates.USD) : DEFAULT_RATES.USD,
    JOD: Number(rates.JOD) > 0 ? Number(rates.JOD) : DEFAULT_RATES.JOD,
  }
}
