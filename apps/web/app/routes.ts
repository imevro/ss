import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home/page.tsx'),
  route('login', 'routes/login/page.tsx'),
  route('onboarding', 'routes/onboarding/page.tsx'),
  // Открытый разговор — часть адреса, а не пометка в строке запроса: ссылку можно
  // переслать, а кнопка «назад» возвращает к прежнему разговору. Не открыт никто —
  // номера в адресе нет.
  route(':company/sessions/:session?', 'routes/[company]/sessions/[session]/page.tsx'),
] satisfies RouteConfig;
