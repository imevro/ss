import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home/page.tsx'),
  route('login', 'routes/login/page.tsx'),
  route('onboarding', 'routes/onboarding/page.tsx'),
  // Открытый чат — часть адреса, а не пометка в строке запроса: ссылку можно
  // переслать, а кнопка «назад» возвращает к прежнему чату.
  route('c/:companyId/:openId?', 'routes/company/page.tsx'),
] satisfies RouteConfig;
