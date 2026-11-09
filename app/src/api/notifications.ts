import { api } from '@/api/client';

export type NotificationKind = 'results' | 'gallery' | 'dates' | 'starts' | 'entries' | 'news' | 'berth' | 'quote';

export type AppNotification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Slug de la regata, para abrirla al tocar el aviso. */
  event: string | null;
  /** Slug de la noticia (en los avisos de noticias nuevas). */
  article: string | null;
  created_at: string;
  read: boolean;
};

type Page<T> = { count: number; next: string | null; results: T[] };

export const getNotifications = (page = 1) => api<Page<AppNotification>>(`/notifications/?page=${page}`);
export const getUnreadCount = () => api<{ unread: number }>('/notifications/unread/');
export const markRead = (id?: number) =>
  api<{ marked: number; unread: number }>(id ? `/notifications/${id}/read/` : '/notifications/read/', { method: 'POST' });
