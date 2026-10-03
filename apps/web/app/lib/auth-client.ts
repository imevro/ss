/** Клиент входа. Адрес не задаём: вход живёт на том же адресе, откуда открыта страница. */
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();
