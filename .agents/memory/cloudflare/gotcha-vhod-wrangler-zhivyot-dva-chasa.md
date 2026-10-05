# Вход в Cloudflare живёт два часа

Ключ, который `wrangler login` кладёт в `~/Library/Preferences/.wrangler/config/default.toml`
(`oauth_token`), годен около двух часов. Замер: обновлён в 17:42, к 19:38 платформа отвечала
`401 Authentication error`, код `10000`. Прокси при этом работает верно — фильтр пропускает запрос, а
отвечает уже Cloudflare.

Пополняется без браузера, пока жив `refresh_token` в том же файле:

```sh
wrangler whoami                       # сам продлевает и перезаписывает oauth_token
grep -o 'oauth_token = "[^"]*"' ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2   # новый ключ
```

Дальше ключ надо переложить в `.env` (`CLOUDFLARE_API_TOKEN`) и перезапустить API: настройки
читаются при запуске. Если `whoami` отвечает `Invalid access token [code: 9109]`, refresh не спас —
нужен `wrangler login` заново (открывает браузер).

Для боя так нельзя: там ключ аккаунта — отдельный ключ из кабинета Cloudflare (My Profile → API Tokens)
с нужными правами, а не наш вход в `wrangler`.
