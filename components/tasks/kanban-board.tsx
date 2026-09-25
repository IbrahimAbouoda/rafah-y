'use client';

import { startTransition, useOptimistic, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Clock, MessageSquare } from 'lucide-react';
import type { TaskPriority, TaskStatus } from '@/lib/generated/prisma/enums';
import { TASK_COLUMNS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, taskTransitionPermission } from '@/lib/tasks/workflow';
import { cn, formatDate } from '@/lib/utils';
import { approveTaskAction, commentTaskAction, moveTaskAction } from '@/server/actions/tasks';
import { ActionForm, SubmitButton } from '@/components/shared/action-form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form-controls';
import { Alert, Card } from '@/components/ui/surface';

// KanbanBoard — PRD §12. الخادم يحسب لكل بطاقة ما يحق للمستخدم فعله (can() بنطاق المهمة)،
// ثم يفحص من جديد عند كل نقل. سحب وإفلات على الحاسوب، أزرار على الجوّال. النقل المرفوض يعيد البطاقة مع الرسالة.

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  assignee: string | null;
  mine: boolean;
  complaint: { id: string; reference: string } | null;
  comments: { id: string; author: string; body: string; at: string }[];
  /** ما يسمح به الخادم: تحريك حتى «مراجعة» · اعتماد · تعليق */
  canMove: boolean;
  canApprove: boolean;
  canComment: boolean;
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-info-soft text-info',
  HIGH: 'bg-warning-soft text-warning',
  URGENT: 'bg-danger-soft text-danger',
};

export function KanbanBoard({ tasks }: { tasks: BoardTask[] }) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (all, move: { id: string; to: TaskStatus }) =>
    all.map((t) => (t.id === move.id ? { ...t, status: move.to } : t)),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function move(task: BoardTask, to: TaskStatus) {
    const needed = taskTransitionPermission(task.status, to);
    if (!needed) return;
    const action = needed === 'tasks:approve' ? approveTaskAction : moveTaskAction;
    const data = new FormData();
    data.set('taskId', task.id);
    data.set('toStatus', to);
    startTransition(async () => {
      setOptimistic({ id: task.id, to });
      const res = await action(null, data);
      // الفشل: التحديث المتفائل يزول وحده مع انتهاء الانتقال، فتعود البطاقة لمكانها
      setMessage(res?.message ? { ok: res.ok, text: res.message } : null);
    });
  }

  const allowedTargets = (t: BoardTask) =>
    TASK_COLUMNS.filter((to) => {
      const needed = taskTransitionPermission(t.status, to);
      return needed === 'tasks:approve' ? t.canApprove : needed === 'tasks:update' ? t.canMove : false;
    });

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <Alert key={message.text} tone={message.ok ? 'success' : 'danger'}>
          {message.text}
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_COLUMNS.map((column) => {
          const cards = optimistic.filter((t) => t.status === column);
          const dragged = optimistic.find((t) => t.id === dragging);
          const droppable = !!dragged && allowedTargets(dragged).includes(column);
          return (
            <section
              key={column}
              aria-label={TASK_STATUS_LABELS[column]}
              onDragOver={(e) => droppable && e.preventDefault()}
              onDrop={() => {
                if (dragged && droppable) move(dragged, column);
                setDragging(null);
              }}
              className={cn('flex min-h-40 flex-col gap-2 rounded-xl bg-muted/50 p-2', droppable && 'ring-2 ring-brand/50')}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                {TASK_STATUS_LABELS[column]}
                <span className="text-xs font-normal text-muted-foreground">{cards.length}</span>
              </h2>
              {cards.length === 0 ? <p className="px-1 py-4 text-center text-xs text-muted-foreground">لا مهام</p> : null}
              {cards.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  targets={allowedTargets(t)}
                  onMove={(to) => move(t, to)}
                  onDragStart={() => setDragging(t.id)}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  targets,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  targets: TaskStatus[];
  onMove: (to: TaskStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = task.dueAt && task.status !== 'DONE' && new Date(task.dueAt) < new Date();
  const forward = TASK_COLUMNS.indexOf.bind(TASK_COLUMNS);
  return (
    <Card
      draggable={targets.length > 0}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn('flex flex-col gap-2 p-3 text-sm', targets.length > 0 && 'cursor-grab', task.mine && 'border-brand/50')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{task.title}</p>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', PRIORITY_TONE[task.priority])}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{task.mine ? 'مسندة إليك' : (task.assignee ?? 'غير مسندة')}</span>
        {task.dueAt ? (
          <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
            <Clock className="size-3" aria-hidden />
            {formatDate(new Date(task.dueAt))}
            {overdue ? ' — متأخرة' : ''}
          </span>
        ) : null}
        {task.complaint ? (
          <Link href={`/admin/complaints/${task.complaint.id}`} className="font-mono text-brand hover:underline" dir="ltr">
            {task.complaint.reference}
          </Link>
        ) : null}
      </div>

      {targets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((to) => {
            const isApprove = to === 'DONE';
            const back = forward(to) < forward(task.status);
            return (
              <Button key={to} type="button" size="sm" variant={isApprove ? 'default' : 'outline'} onClick={() => onMove(to)}>
                {isApprove ? <Check aria-hidden /> : back ? <ArrowRight className="flip-rtl" aria-hidden /> : <ArrowLeft className="flip-rtl" aria-hidden />}
                {isApprove ? 'اعتماد' : TASK_STATUS_LABELS[to]}
              </Button>
            );
          })}
        </div>
      ) : null}

      {task.canComment || task.comments.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 self-start text-xs text-brand hover:underline"
          aria-expanded={open}
        >
          <MessageSquare className="size-3" aria-hidden />
          الملاحظات ({task.comments.length})
        </button>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-2 border-t pt-2">
          {task.comments.map((c) => (
            <div key={c.id} className="text-xs">
              <p className="whitespace-pre-line">{c.body}</p>
              <p className="text-muted-foreground">
                {c.author} · {formatDate(new Date(c.at))}
              </p>
            </div>
          ))}
          {task.canComment ? (
            <ActionForm action={commentTaskAction} resetOnSuccess hideSuccess className="gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <Textarea name="body" rows={2} maxLength={2000} aria-label="ملاحظة متابعة" className="min-h-16 text-xs" />
              <SubmitButton size="sm" variant="outline">
                إضافة ملاحظة
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
