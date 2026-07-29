'use client';

// Клик по УЖЕ активной вкладке навигации = «odśwież dane tej zakładki».
//
// Навигация на тот же href — no-op для роутера (Next не перемонтирует
// страницу, данные берутся из кеша TanStack Query), поэтому клик по активной
// вкладке выглядел как «ничего не произошло». Вместо перезагрузки страницы
// (`router.refresh()` / полный запрос документа — лишний RTT, потеря
// скролла и состояния форм) мы инвалидируем именно то, что сейчас на экране:
//
//   queryClient.invalidateQueries({ type: 'active' })
//
// `type: 'active'` = только запросы с живыми наблюдателями, т.е. ровно те,
// что рендерит текущая страница (+ бейджи шапки/сайдбара). Кеш соседних
// вкладок не трогаем — переключение на них останется мгновенным.
// Инвалидация в v5 сама дёргает refetch активных запросов, так что каждый
// хук поднимет свой `isFetching` и страница покажет привычные скелетоны.
//
// Все страницы приложения — тонкие server-shell'ы, данные тянут клиентские
// хуки, поэтому RSC-рефреш здесь не нужен.
//
// Возвращает `{ isRefreshing, onActiveNavClick }`:
//   * `onActiveNavClick` вешается на <Link> ТОЛЬКО когда он активный —
//     гасит переход и запускает инвалидацию. Модифицированные клики
//     (Ctrl/Cmd/Shift/Alt, средняя кнопка) пропускаются в браузер: «открыть
//     в новой вкладке» должно работать как обычно.
//   * `isRefreshing` крутит иконку активной вкладки — единственный фидбек
//     (успех молчит, ошибку покажет сама страница).

import { useQueryClient } from '@tanstack/react-query';
import type { MouseEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Минимальное время спиннера — иначе тёплый кеш моргает и клик «не читается». */
const MIN_SPIN_MS = 350;

export function useActiveNavRefresh(): {
  isRefreshing: boolean;
  onActiveNavClick: (e: MouseEvent<HTMLAnchorElement>) => void;
} {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ type: 'active' }),
        new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS)),
      ]);
    } catch {
      // Ошибку рефетча владеет сам запрос (его `isError` + error-state в UI),
      // навигации тут показывать нечего.
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [queryClient]);

  const onActiveNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented) return;
      // Ctrl/Cmd/Shift/Alt + не-левая кнопка → отдаём браузеру (новая вкладка).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      void refresh();
    },
    [refresh],
  );

  return { isRefreshing, onActiveNavClick };
}
