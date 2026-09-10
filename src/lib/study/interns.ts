export const intern_statuses = ['new', 'called', 'came', 'hired', 'rejected'] as const;
export type intern_status = (typeof intern_statuses)[number];

export type intern = {
  id: string;
  name: string;
  phone: string;
  city: string;
  schedule: string[];
  intern_date: string;
  intern_time: string;
  urgent: string;
  medbook: string;
  guest: string;
  shift: string;
  cook: string;
  status: intern_status;
  created_at: string;
  updated_at: string;
};

export const intern_status_label: Record<intern_status, string> = {
  new: 'новая',
  called: 'позвонили',
  came: 'пришёл',
  hired: 'взяли',
  rejected: 'отказ',
};
