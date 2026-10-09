import { redirect } from 'next/navigation';

export default function admin_craft_page() {
  redirect('/admin/menu?craft=1');
}
