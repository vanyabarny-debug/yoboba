/**
 * Онлайн-оплата подарков.
 *
 * Сейчас работает заглушка (`stub`): после выбора напитка гость подтверждает
 * оплату в приложении. Когда подключим кассу (юkassa / cloudpayments / атолл),
 * реализуйте `create_live_kassa_payment` и webhook `/api/gifts/pay/webhook`.
 */

export type kassa_provider = 'stub' | 'kassa';

export type kassa_checkout = {
  payment_id: string;
  provider: kassa_provider;
  status: 'pending' | 'paid' | 'failed';
  checkout_url: string | null;
};

export type kassa_create_input = {
  amount: number;
  description: string;
  gift_id: string;
  return_url?: string;
};

export function kassa_is_live() {
  return Boolean(
    process.env.KASSA_SECRET_KEY ||
      process.env.YOOKASSA_SECRET_KEY ||
      process.env.CLOUDPAYMENTS_SECRET ||
      process.env.YOOKASSA_SHOP_ID
  );
}

/** сюда позже: создание платежа в кассе и ссылка на оплату */
async function create_live_kassa_payment(
  _input: kassa_create_input
): Promise<kassa_checkout | null> {
  return null;
}

export async function create_kassa_payment(
  input: kassa_create_input
): Promise<kassa_checkout> {
  const live = await create_live_kassa_payment(input);
  if (live) return live;

  return {
    payment_id: `stub-${input.gift_id}-${Date.now()}`,
    provider: 'stub',
    status: 'pending',
    checkout_url: null,
  };
}
