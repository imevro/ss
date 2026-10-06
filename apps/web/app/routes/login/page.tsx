import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { useState } from 'react';

import { errorText } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { noindexMeta } from '@/lib/page-title';

export const meta = () => noindexMeta(['Вход'], 'Вход в панель компании.');

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = async (): Promise<void> => {
    setBusy(true);
    setProblem('');
    const signedIn = await authClient.signIn.email({ email, password });
    if (signedIn.error === null) {
      globalThis.location.assign('/onboarding');
      return;
    }
    const created = await authClient.signUp.email({ email, password, name: email });
    setBusy(false);
    if (created.error === null) {
      globalThis.location.assign('/onboarding');
      return;
    }
    const text = errorText(created.error);
    if (text === undefined) {
      setProblem('не вышло');
      return;
    }
    setProblem(text);
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 p-6">
      <h1 className="font-heading font-medium text-2xl">Вход</h1>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Почта</Label>
          <Input id="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>
        {problem !== '' && <p className="text-destructive">{problem}</p>}
        <Button disabled={busy || email === '' || password === ''} onClick={() => void enter()}>
          {busy ? 'Вхожу…' : 'Войти'}
        </Button>
      </div>
    </main>
  );
}
