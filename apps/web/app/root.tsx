import { TooltipProvider } from '@workspace/ui/components/tooltip';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

import type { Route } from './+types/root';
import '@workspace/ui/globals.css';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

type ErrorView = { readonly message: string; readonly details: string; readonly stack?: string };

const errorView = (error: unknown): ErrorView => {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return { message: '404', details: 'Страницы нет.' };
    }
    return { message: 'Ошибка', details: error.statusText };
  }
  if (import.meta.env.DEV && error instanceof Error) {
    return { message: 'Ошибка', details: error.message, stack: error.stack };
  }
  return { message: 'Ошибка', details: 'Что-то пошло не так.' };
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { message, details, stack } = errorView(error);

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
