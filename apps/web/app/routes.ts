import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('onboarding', 'routes/onboarding.tsx'),
  // Открытый чат — часть адреса, а не пометка в строке запроса: ссылку можно
  // переслать, а кнопка «назад» возвращает к прежнему чату.
  route('c/:companyId/:openId?', 'routes/company.tsx'),
] satisfies RouteConfig;
