'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, KeyRound, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/surface';

// ReferenceCard — PRD §12: يُعرض لصاحب الإرسال فور الإنشاء فقط. الرمز لا يُحفظ في أي مكان ولا يُعاد من قاعدة البيانات.
// مشاركة واتساب (§8.1): رابط wa.me يضغطه المستخدم — بالرقم المرجعي وحده، لا بالرمز أبدًا.

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={`نسخ ${label}`}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? 'نُسخ' : 'نسخ'}
    </Button>
  );
}

export function ReferenceCard({
  reference,
  accessCode,
  trackUrl,
  message,
  children,
}: {
  reference: string;
  accessCode: string;
  trackUrl: string;
  message?: string;
  children?: React.ReactNode;
}) {
  const share = `https://wa.me/?text=${encodeURIComponent(`رقم شكواي في منصة نبض رفح: ${reference}\nالتتبّع: ${trackUrl}?ref=${reference}`)}`;
  return (
    <Card className="border-brand/40">
      <CardHeader>
        <CardTitle>وصلت شكواك</CardTitle>
        <CardDescription>{message ?? 'احفظ الرقم والرمز الآن. تحتاجهما معًا لمتابعة شكواك من صفحة التتبّع.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg bg-muted p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">الرقم المرجعي</p>
              <p className="font-mono text-lg font-semibold" dir="ltr" data-testid="complaint-reference">
                {reference}
              </p>
            </div>
            <CopyButton value={reference} label="الرقم المرجعي" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <KeyRound className="size-3" aria-hidden />
                رمز المتابعة
              </p>
              <p className="font-mono text-lg font-semibold tracking-widest" dir="ltr" data-testid="complaint-access-code">
                {accessCode}
              </p>
            </div>
            <CopyButton value={accessCode} label="رمز المتابعة" />
          </div>
        </div>

        <Alert tone="warning">
          احفظ الرمز — لن يظهر مجددًا. لا يمكن لأحد، ولا لفريق المجلس، استرجاعه إن فقدته. لا تشاركه مع أحد.
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={share} target="_blank" rel="noopener noreferrer">
              <Share2 aria-hidden />
              مشاركة الرقم عبر واتساب
            </a>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/track">صفحة التتبّع</Link>
          </Button>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
