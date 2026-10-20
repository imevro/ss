import { redirect } from 'react-router';

/**
 * Корень панели: своего экрана у него нет. Список компаний живёт по своему адресу,
 * чтобы на него можно было зайти напрямую и не зависеть от онбординга.
 */
export function loader() {
  return redirect('/companies');
}
