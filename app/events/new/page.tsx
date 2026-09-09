import { redirect } from 'next/navigation';

/** @deprecated use /create */
export default function NewEventRedirect() {
  redirect('/create');
}
