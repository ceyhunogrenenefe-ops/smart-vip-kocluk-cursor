import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/constants';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  redirect(token ? '/dashboard' : '/login');
}
