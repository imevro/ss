# Инженерные правила

Как мы пишем и что решаем заново.

- [`do-maksimum-steka-ne-svoyo`](do-maksimum-steka-ne-svoyo.md) — берём максимум выбранного стека; своё пишем только там, где готового нет.
- [`how-kompanii-na-plaginy-organizacij`](how-kompanii-na-plaginy-organizacij.md) — компании, членства и приглашения ведёт плагин организаций better-auth.
- [`gotcha-priglashenie-trebuet-podtverzhdeniya-pochty`](gotcha-priglashenie-trebuet-podtverzhdeniya-pochty.md) — приглашение принимается только с подтверждённой почтой; у нас настройка выключена.
- [`gotcha-polya-organizacij-sveryayutsya-po-imenam`](gotcha-polya-organizacij-sveryayutsya-po-imenam.md) — таблицы и поля организаций обязаны носить имена плагина.
- [`do-storozh-vhoda-do-zaprosov`](do-storozh-vhoda-do-zaprosov.md) — загрузчик спрашивает «кто вошёл» до запроса данных, иначе увод на вход не срабатывает.
- [`do-vremya-naruzhu-v-iso`](do-vremya-naruzhu-v-iso.md) — время наружу приводится к ISO один раз, на выходе из API.
- [`do-otrezok-sessions-odin-na-chaty-i-miniappy`](do-otrezok-sessions-odin-na-chaty-i-miniappy.md) — чаты и миниаппы открываются одним отрезком адреса `sessions`.
- [`do-onboarding-three-questions`](do-onboarding-three-questions.md) — онбординг: три вопроса без модели, база без таблиц.
- [`do-obyazatelnyi-shag-proveryaetsya-v-api`](do-obyazatelnyi-shag-proveryaetsya-v-api.md) — обязательный вопрос шага обязателен и на входе API, иначе компания заводится без ответа.
- [`do-stroka-agenta-ne-lomaet-otvet`](do-stroka-agenta-ne-lomaet-otvet.md) — строка агента из потока ошибок идёт кадром `log`; `failed` закрывает ход и не годится для замечания.
