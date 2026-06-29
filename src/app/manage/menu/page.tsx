import { redirect } from 'next/navigation';

export default function manage_redirect() {
  redirect('/admin/login');
}
