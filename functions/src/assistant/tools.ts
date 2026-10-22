import type Anthropic from '@anthropic-ai/sdk'

// أدوات المساعد: أدوات قراءة بتتنفذ فوراً، وأدوات "اقتراح" بتطلع بطاقة تأكيد للمستخدم

const str = (description: string) => ({ type: 'string', description })
const num = (description: string) => ({ type: 'number', description })
const paymentMethod = {
  type: 'string',
  enum: ['CASH', 'BANK_TRANSFER', 'CREDIT_CARD'],
  description: 'طريقة الدفع. الافتراضي CASH (نقدي)',
}
const currency = { type: 'string', enum: ['ILS', 'USD', 'JOD'], description: 'العملة. الافتراضي ILS (شيكل)' }
const date = str('تاريخ العملية YYYY-MM-DD، فقط إذا المستخدم ذكر يوم غير اليوم')

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description: 'البحث عن منتجات المخزون بالاسم أو الكود. استخدمها قبل أي بيع أو شراء عشان تجيب id المنتج الحقيقي وسعره وكميته ومقاساته.',
    input_schema: { type: 'object', properties: { query: str('كلمة البحث، مثلاً: خاتم فضة') }, required: ['query'] },
  },
  {
    name: 'find_customers',
    description: 'البحث عن عميل بالاسم أو رقم الهاتف. بترجع الدين المسجل عليه.',
    input_schema: { type: 'object', properties: { query: str('اسم العميل أو رقمه') }, required: ['query'] },
  },
  {
    name: 'find_suppliers',
    description: 'البحث عن مورد بالاسم أو رقم الهاتف. بترجع الدين المسجل له.',
    input_schema: { type: 'object', properties: { query: str('اسم المورد أو رقمه') }, required: ['query'] },
  },
  {
    name: 'list_partners',
    description: 'قائمة شركاء المشروع.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_report',
    description: 'أرقام فعلية من النظام: المبيعات، الأرباح، المصاريف، المشتريات، الأكثر مبيعاً، المخزون المنخفض، الديون، رصيد الصندوق والبنك.',
    input_schema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'yesterday', 'week', 'month', 'year', 'all'] } },
      required: ['period'],
    },
  },
  {
    name: 'recent_operations',
    description: 'آخر العمليات المسجلة (بيع، شراء، مصاريف، شركاء).',
    input_schema: { type: 'object', properties: { limit: num('عدد العمليات، الافتراضي 10') } },
  },
  {
    name: 'propose_sale',
    description: 'تجهيز طلبية بيع وعرضها على المستخدم للتأكيد. ما بتنحفظ إلا لما يضغط تأكيد.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: str('id المنتج من search_products'),
              size: str('المقاس، إلزامي إذا المنتج إله مقاسات'),
              quantity: num('الكمية'),
              unitPrice: num('سعر بيع القطعة بالشيكل. 0 إذا هدية مجانية'),
            },
            required: ['productId', 'quantity', 'unitPrice'],
          },
        },
        customerId: str('id العميل، إلزامي إذا في مبلغ متبقي (دين)'),
        paid: num('المبلغ المدفوع. إذا مش مذكور يعني دفع كامل'),
        paymentMethod,
        notes: str('ملاحظات'),
        date,
      },
      required: ['items'],
    },
  },
  {
    name: 'propose_purchase',
    description: 'تجهيز فاتورة شراء بضاعة للمخزون (بتزيد الكمية) وعرضها للتأكيد.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: str('id المنتج من search_products'),
              size: str('المقاس إذا المنتج إله مقاسات'),
              quantity: num('الكمية'),
              unitCost: num('تكلفة القطعة بعملة الفاتورة'),
            },
            required: ['productId', 'quantity', 'unitCost'],
          },
        },
        supplierId: str('id المورد، إلزامي إذا في مبلغ متبقي'),
        supplierName: str('اسم المورد إذا مش مسجل'),
        paid: num('المدفوع بعملة الفاتورة. إذا مش مذكور يعني دفع كامل'),
        currency,
        paymentMethod,
        notes: str('ملاحظات'),
        date,
      },
      required: ['items'],
    },
  },
  {
    name: 'propose_expense',
    description: 'تجهيز مصروف وعرضه للتأكيد.',
    input_schema: {
      type: 'object',
      properties: {
        title: str('وصف المصروف بكلام المستخدم'),
        amount: num('المبلغ'),
        currency,
        category: str('التصنيف من قائمة التصنيفات بالضبط'),
        paymentMethod,
        notes: str('ملاحظات'),
        date,
      },
      required: ['title', 'amount', 'category'],
    },
  },
  {
    name: 'propose_partner_transaction',
    description:
      'تجهيز حركة مالية مع شريك وعرضها للتأكيد. WITHDRAWAL = فلوس طالعة من المشروع للشريك (دفعنا للشريك/سحب/حصة أرباح). CONTRIBUTION = فلوس داخلة من الشريك للمشروع (الشريك حط/دفع رأس مال).',
    input_schema: {
      type: 'object',
      properties: {
        partnerId: str('id الشريك من list_partners'),
        kind: { type: 'string', enum: ['WITHDRAWAL', 'CONTRIBUTION'] },
        amount: num('المبلغ'),
        currency,
        paymentMethod,
        notes: str('ملاحظات'),
        date,
      },
      required: ['partnerId', 'kind', 'amount'],
    },
  },
  {
    name: 'propose_customer_payment',
    description: 'تسجيل دفعة استلمناها من عميل عليه دين.',
    input_schema: {
      type: 'object',
      properties: { customerId: str('id العميل'), amount: num('المبلغ بالشيكل'), paymentMethod, notes: str('ملاحظات'), date },
      required: ['customerId', 'amount'],
    },
  },
  {
    name: 'propose_supplier_payment',
    description: 'تسجيل دفعة دفعناها لمورد إله دين علينا.',
    input_schema: {
      type: 'object',
      properties: { supplierId: str('id المورد'), amount: num('المبلغ بالشيكل'), paymentMethod, notes: str('ملاحظات'), date },
      required: ['supplierId', 'amount'],
    },
  },
]

// تحويل أداة الاقتراح لعملية النظام المقابلة
export const PROPOSALS: Record<string, { action: string; map?: (input: any) => any }> = {
  propose_sale: { action: 'sale.create' },
  propose_purchase: { action: 'purchase.create' },
  propose_expense: { action: 'expense.create' },
  propose_partner_transaction: { action: 'partner.transaction' },
  propose_customer_payment: {
    action: 'customer.payment',
    map: ({ customerId, ...rest }) => ({ partyId: customerId, ...rest }),
  },
  propose_supplier_payment: {
    action: 'supplier.payment',
    map: ({ supplierId, ...rest }) => ({ partyId: supplierId, ...rest }),
  },
}
