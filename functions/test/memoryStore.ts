import type { Doc, Reader, Snap, Store, Tx, Where } from '../src/store.js'

// قاعدة بيانات بالذاكرة للاختبارات، بتلتزم بقاعدة Firestore: كل القراءات قبل الكتابات

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

// Firestore بيرفض أي قيمة undefined، فبنفحصها هون كمان
function assertNoUndefined(v: unknown, path: string) {
  if (v === undefined) throw new Error(`undefined value at ${path}`)
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) assertNoUndefined(x, `${path}.${k}`)
  }
}
let seq = 0
const genId = () => `id${(++seq).toString().padStart(5, '0')}`

export class MemoryStore implements Store {
  data = new Map<string, Map<string, Doc>>()

  col(name: string) {
    if (!this.data.has(name)) this.data.set(name, new Map())
    return this.data.get(name)!
  }

  seed(col: string, id: string, doc: Doc) {
    this.col(col).set(id, clone(doc))
  }

  all(col: string) {
    return [...this.col(col).entries()].map(([id, d]) => ({ id, ...clone(d) }))
  }

  doc(col: string, id: string) {
    const d = this.col(col).get(id)
    return d ? clone(d) : undefined
  }

  async get(col: string, id: string): Promise<Snap> {
    const d = this.col(col).get(id)
    return { id, exists: !!d, data: clone(d) || {} }
  }

  async getMany(col: string, ids: string[]) {
    return Promise.all(ids.map(id => this.get(col, id)))
  }

  async query(col: string, where: Where[], limit?: number) {
    const rows = [...this.col(col).entries()]
      .filter(([, d]) => where.every(([f, , v]) => d[f] === v))
      .map(([id, d]) => ({ id, exists: true, data: clone(d) }))
    return limit ? rows.slice(0, limit) : rows
  }

  async list(col: string) {
    return this.query(col, [])
  }

  newId() {
    return genId()
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = []
    let wrote = false
    const read = <K extends keyof Reader>(k: K) =>
      ((...args: any[]) => {
        if (wrote) throw new Error(`Firestore rule broken: read (${String(k)}) after write in transaction`)
        return (this[k] as any)(...args)
      }) as Reader[K]
    const tx: Tx = {
      get: read('get'),
      getMany: read('getMany'),
      query: read('query'),
      set: (col, id, data) => {
        assertNoUndefined(data, `${col}/${id}`)
        wrote = true
        writes.push(() => this.col(col).set(id, clone(data)))
      },
      update: (col, id, data) => {
        assertNoUndefined(data, `${col}/${id}`)
        wrote = true
        writes.push(() => {
          const cur = this.col(col).get(id)
          if (!cur) throw new Error(`update on missing doc ${col}/${id}`)
          this.col(col).set(id, { ...cur, ...clone(data) })
        })
      },
      delete: (col, id) => {
        wrote = true
        writes.push(() => this.col(col).delete(id))
      },
      newId: () => genId(),
    }
    const result = await fn(tx)
    for (const w of writes) w()
    return result
  }

  async batchWrite(writes: Array<{ col: string; id: string; data: Doc; merge?: boolean }>) {
    for (const w of writes) {
      assertNoUndefined(w.data, `${w.col}/${w.id}`)
      const cur = this.col(w.col).get(w.id)
      this.col(w.col).set(w.id, w.merge && cur ? deepMerge(cur, clone(w.data)) : clone(w.data))
    }
  }

  async createIfMissing(col: string, id: string, data: Doc) {
    assertNoUndefined(data, `${col}/${id}`)
    if (this.col(col).has(id)) return false
    this.col(col).set(id, clone(data))
    return true
  }
}

function deepMerge(a: Doc, b: Doc): Doc {
  const out: Doc = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v
  }
  return out
}
