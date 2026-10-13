'use server';

import { requireUser } from '@/lib/auth';
import { formToObject, runAction, type ActionState } from '@/lib/action';
import { submitOffer, decideOffer } from '@/lib/offers/actions';

// غلاف Server Action فقط: الهوية من الكوكي، والمنطق كله في lib/offers/actions.ts (مشترك مع واجهة الجوّال)

export async function submitOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => submitOffer(await requireUser(), { ...formToObject(form), types: form.getAll('types') }));
}

export async function decideOfferAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => decideOffer(await requireUser(), formToObject(form)));
}
