'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Empty, ErrorBox, Loading } from '@/components/ui';

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTodos(await api<Todo[]>('/todos'));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || saving) return;

    setSaving(true);
    try {
      await api('/todos', { method: 'POST', body: { text: value } });
      setText('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(todo: Todo) {
    try {
      await api(`/todos/${todo.id}`, { method: 'PATCH', body: { done: !todo.done } });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/todos/${id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const left = todos.filter((t) => !t.done).length;

  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="text-xl font-semibold">Eslatmalar</h1>
      <p className="muted mt-0.5 mb-5 text-sm">
        {todos.length === 0 ? 'Ro‘yxat bo‘sh' : `Bajarilmagan: ${left} / ${todos.length}`}
      </p>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          className="input"
          placeholder="Yangi eslatma…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!text.trim() || saving}>
          Qo‘shish
        </button>
      </form>

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {loading ? (
        <Loading />
      ) : todos.length === 0 ? (
        <Empty text="Hozircha eslatma yo‘q" />
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => (
            <li key={todo.id} className="card flex items-center gap-3">
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggle(todo)}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <span className={`flex-1 text-sm ${todo.done ? 'muted line-through' : ''}`}>
                {todo.text}
              </span>
              <button
                onClick={() => remove(todo.id)}
                className="muted rounded-full p-1.5 hover:bg-black/5"
                aria-label="O‘chirish"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
