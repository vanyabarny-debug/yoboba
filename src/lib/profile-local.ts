/** локальные данные профиля (не в нашей БД): почта, ДР, подписки, карты */

export type linked_card = {
  id: string;
  brand: string;
  last4: string;
  expires?: string;
  created_at: string;
};

export type profile_local = {
  email: string;
  birthday: string; // YYYY-MM-DD
  birthday_locked: boolean;
  marketing_opt_in: boolean;
  cards: linked_card[];
};

const key = (user_id: string) => `yoboba_profile_local_v1_${user_id}`;

const empty: profile_local = {
  email: '',
  birthday: '',
  birthday_locked: false,
  marketing_opt_in: true,
  cards: [],
};

export function get_profile_local(user_id: string): profile_local {
  if (typeof window === 'undefined') return { ...empty, cards: [] };
  try {
    const raw = localStorage.getItem(key(user_id));
    if (!raw) return { ...empty, cards: [] };
    const parsed = JSON.parse(raw) as Partial<profile_local>;
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      birthday: typeof parsed.birthday === 'string' ? parsed.birthday : '',
      birthday_locked: parsed.birthday_locked === true,
      marketing_opt_in:
        typeof parsed.marketing_opt_in === 'boolean' ? parsed.marketing_opt_in : true,
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    };
  } catch {
    return { ...empty, cards: [] };
  }
}

export function save_profile_local(user_id: string, data: profile_local) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key(user_id), JSON.stringify(data));
}

export function format_card_expiry_input(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalize_card_expiry(raw?: string) {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (!digits) return undefined;
  if (digits.length !== 4) throw new Error('укажите срок как мм/гг');
  const month = Number(digits.slice(0, 2));
  if (month < 1 || month > 12) throw new Error('укажите срок как мм/гг');
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function add_linked_card(
  user_id: string,
  input: { brand: string; last4: string; expires?: string }
) {
  const current = get_profile_local(user_id);
  const last4 = input.last4.replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) throw new Error('укажите 4 последние цифры');
  const expires = normalize_card_expiry(input.expires);
  const card: linked_card = {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    brand: (input.brand || 'карта').trim() || 'карта',
    last4,
    expires,
    created_at: new Date().toISOString(),
  };
  const next = { ...current, cards: [...current.cards, card] };
  save_profile_local(user_id, next);
  return next;
}

export function remove_linked_card(user_id: string, card_id: string) {
  const current = get_profile_local(user_id);
  const next = { ...current, cards: current.cards.filter((c) => c.id !== card_id) };
  save_profile_local(user_id, next);
  return next;
}

export function clear_profile_local(user_id: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key(user_id));
}
